/**
 * ai-enrich-db-schema.ts
 *
 * Stage 3 of the database schema pipeline: AI enrichment.
 * Uses the Anthropic SDK to enrich each module with business context,
 * table-level annotations, workflow descriptions, and health observations.
 *
 * Follows the same caching/rate-limiting pattern as ai-enrich-dotnet.ts.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts --module SEC
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts --force
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts --dry-run
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_SCHEMA_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');
const FILE_ENRICHMENT_DIR = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file');
const ENRICHED_DIR = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'db-schema', 'per-module');
const CACHE_FILE = path.join(ENRICHED_DIR, '.db-cache-manifest.json');

const API_DELAY_MS = 2000;
const MAX_CONTEXT_CHARS = 90_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheManifest {
  lastRun: string;
  entries: Record<string, CacheEntry>;
}

interface CacheEntry {
  sha256: string;
  enrichedAt: string;
  tableCount: number;
}

interface Table {
  name: string;
  schema: string;
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  foreignKeys: { constraintName: string; referencedTable: string }[];
  indexes: {
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    isDisabled: boolean;
    keyColumns: string[];
    includedColumns: string[];
  }[];
  checkConstraints: string[];
  defaultConstraints: number;
  uniqueConstraints: string[];
  triggers: string[];
}

interface Module {
  prefix: string;
  displayName: string;
  tableCount: number;
  tables: Table[];
}

interface TablesData {
  exportDate: string;
  source: string;
  totalTables: number;
  schemas: string[];
  modules: Module[];
}

interface CrossReference {
  sprocName: string;
  dbSchema: string;
  dbSchemas: string[];
  matchType: string;
  calledFromFiles: string[];
  calledFromMethods: string[];
  calledFromProjects: string[];
  module: string;
}

interface SprocReconciliation {
  totalDbSprocs: number;
  totalCodeSprocs: number;
  matchedExact: number;
  orphanDbCount: number;
  orphanCodeCount: number;
  orphanDb: { name: string; schema: string }[];
  crossReference: CrossReference[];
}

interface FileEnrichmentEntry {
  filePath: string;
  fileName: string;
  className?: string;
  summary?: string;
  businessPurpose?: string;
  storedProcedures?: string[];
  businessManagersUsed?: string[];
}

interface FileEnrichmentFile {
  directory: string;
  layer: string;
  fileCount: number;
  files: FileEnrichmentEntry[];
  directoryOverview?: string;
  keyWorkflows?: string[];
}

/** Output format — must match ModuleEnrichment in generate-db-pages.ts */
interface ModuleEnrichmentOutput {
  module: string;
  displayName: string;
  generatedAt: string;
  overview: string;
  keyWorkflows: string[];
  schemaHealthNotes: string[];
  tableAnnotations: Record<string, {
    purpose?: string;
    migrationNote?: string;
  }>;
}

/** What Claude returns (superset of what we persist) */
interface ClaudeModuleResponse {
  moduleOverview: string;
  keyWorkflows: string[];
  schemaHealthNotes: string[];
  tables: Array<{
    name: string;
    summary: string;
    businessPurpose: string;
    dataSensitivity: string;
    migrationRelevance: string;
    migrationNote: string;
    complexity: string;
  }>;
}

// ---------------------------------------------------------------------------
// Claude API
// ---------------------------------------------------------------------------

let anthropicClient: any = null;

async function getAnthropicClient(): Promise<any> {
  if (anthropicClient) return anthropicClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Set it before running: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts'
    );
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

async function callClaude(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 8192,
): Promise<string> {
  const client = await getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find((c: any) => c.type === 'text');
  console.log(`    Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);
  return textContent?.text || '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCache(): Promise<CacheManifest> {
  if (await fileExists(CACHE_FILE)) {
    try {
      return JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8'));
    } catch {
      console.warn('  Warning: Cache manifest corrupted, starting fresh.');
    }
  }
  return { lastRun: '', entries: {} };
}

async function saveCache(cache: CacheManifest): Promise<void> {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Module-to-business-layer mapping for file enrichment lookup
// ---------------------------------------------------------------------------

const MODULE_TO_BUSINESS: Record<string, string[]> = {
  'SEC': ['Security'],
  'EVAL': ['Evaluations'],
  'DH': ['DutyHours'],
  'PRC': ['Procedures'],
  'APE': ['AnnualProgramEvaluation', 'APE'],
  'APE2': ['AnnualProgramEvaluation', 'APE'],
  'BSN': ['NurseNotify', 'Nursing'],
  'ACT': ['EssentialActivities', 'Activities'],
  'PF': ['Portfolio'],
  'OBC': ['ICC', 'ClinicalAssessment'],
  'CME': ['CMETracking'],
  'Prep': ['Common'],
  'PTL': ['PatientLog'],
  'QUIZ': ['Quiz'],
  'SCHE': ['Scheduling', 'Common'],
  'LA': ['LearningAssignment'],
  'POST': ['Common'],
  'MYEVAL': ['Common', 'Evaluations'],
  'MyGME': ['Common'],
  'SYS': ['Common', 'Utilities'],
  'perf': ['Common'],
  '_DEL_': [],
  '(uncategorized)': ['Common'],
};

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

async function loadFileEnrichmentForModule(prefix: string): Promise<FileEnrichmentEntry[]> {
  const businessNames = MODULE_TO_BUSINESS[prefix] || [];
  const results: FileEnrichmentEntry[] = [];

  for (const name of businessNames) {
    const filePath = path.join(FILE_ENRICHMENT_DIR, 'business', `${name}.json`);
    if (await fileExists(filePath)) {
      try {
        const data: FileEnrichmentFile = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        results.push(...data.files.filter((f) =>
          f.summary || f.storedProcedures?.length
        ));
      } catch {
        // Skip malformed files
      }
    }
  }

  return results;
}

function getModuleSprocs(prefix: string, reconciliation: SprocReconciliation): {
  matchedSprocs: CrossReference[];
  orphanDbSprocs: { name: string; schema: string }[];
} {
  // Matched SPs for this module (from cross-reference)
  const matchedSprocs = reconciliation.crossReference.filter(
    (cr) => cr.module === prefix
  );

  // DB-only orphan SPs that look like they belong to this module
  const prefixLower = prefix.toLowerCase();
  const orphanDbSprocs = reconciliation.orphanDb.filter((sp) => {
    const spLower = sp.name.toLowerCase();
    // Match SPs that start with the module prefix
    return spLower.startsWith(prefixLower + '_') ||
      spLower.startsWith(prefixLower);
  });

  return { matchedSprocs, orphanDbSprocs };
}

function buildModulePrompt(
  mod: Module,
  reconciliation: SprocReconciliation,
  fileEnrichment: FileEnrichmentEntry[],
): string {
  const parts: string[] = [];

  // Section 1: Table list with structural data
  parts.push(`## Module: ${mod.prefix} — ${mod.displayName} (${mod.tableCount} tables)\n`);

  parts.push(`### Tables\n`);
  for (const table of mod.tables) {
    parts.push(`\n**${table.name}** [schema: ${table.schema}]`);
    if (table.hasPrimaryKey) {
      parts.push(`  PK: ${table.primaryKeyColumns.join(', ')}`);
    } else {
      parts.push(`  ⚠ NO PRIMARY KEY`);
    }
    if (table.foreignKeys.length > 0) {
      const fks = table.foreignKeys
        .map((fk) => `${fk.constraintName} → ${fk.referencedTable}`)
        .join('; ');
      parts.push(`  FKs: ${fks}`);
    }
    if (table.indexes.length > 0) {
      const nonPK = table.indexes.filter((i) => !i.isPrimaryKey);
      if (nonPK.length > 0) {
        const idxs = nonPK
          .map((i) => `${i.name}(${i.keyColumns.join(',')})${i.isDisabled ? ' [DISABLED]' : ''}`)
          .join('; ');
        parts.push(`  Indexes: ${idxs}`);
      }
    }
    if (table.triggers.length > 0) {
      parts.push(`  Triggers: ${table.triggers.join(', ')}`);
    }
    if (table.checkConstraints.length > 0) {
      parts.push(`  Check constraints: ${table.checkConstraints.length}`);
    }
  }

  // Section 2: SP cross-reference
  const { matchedSprocs, orphanDbSprocs } = getModuleSprocs(mod.prefix, reconciliation);

  if (matchedSprocs.length > 0 || orphanDbSprocs.length > 0) {
    parts.push(`\n\n### Related Stored Procedures\n`);
    parts.push(`Matched (called from code): ${matchedSprocs.length}`);
    parts.push(`DB-only orphans: ${orphanDbSprocs.length}`);

    // Show top matched SPs with call-site context
    const showCount = Math.min(matchedSprocs.length, 40);
    for (const sp of matchedSprocs.slice(0, showCount)) {
      const files = sp.calledFromFiles.slice(0, 3).join(', ');
      parts.push(`- ${sp.sprocName} → ${files}`);
    }
    if (matchedSprocs.length > showCount) {
      parts.push(`... and ${matchedSprocs.length - showCount} more matched SPs`);
    }

    // Show some orphan SPs
    if (orphanDbSprocs.length > 0) {
      const orphanShow = Math.min(orphanDbSprocs.length, 20);
      parts.push(`\nDB-only (potential dead code):`);
      for (const sp of orphanDbSprocs.slice(0, orphanShow)) {
        parts.push(`- ${sp.name}`);
      }
      if (orphanDbSprocs.length > orphanShow) {
        parts.push(`... and ${orphanDbSprocs.length - orphanShow} more`);
      }
    }
  }

  // Section 3: File enrichment context
  if (fileEnrichment.length > 0) {
    parts.push(`\n\n### Code Context (from .NET file enrichment)\n`);
    const showFiles = fileEnrichment.slice(0, 25);
    for (const fe of showFiles) {
      let line = `- ${fe.fileName}`;
      if (fe.className) line += ` (${fe.className})`;
      if (fe.summary) line += `: ${fe.summary}`;
      if (fe.storedProcedures && fe.storedProcedures.length > 0) {
        line += ` [SPs: ${fe.storedProcedures.slice(0, 5).join(', ')}]`;
      }
      parts.push(line);
    }
    if (fileEnrichment.length > 25) {
      parts.push(`... and ${fileEnrichment.length - 25} more files`);
    }
  }

  // Section 4: Health observations to guide the AI
  const tablesNoPK = mod.tables.filter((t) => !t.hasPrimaryKey);
  const tablesNoIndex = mod.tables.filter((t) => t.indexes.length === 0);
  const disabledIndexes = mod.tables.reduce(
    (sum, t) => sum + t.indexes.filter((i) => i.isDisabled).length, 0
  );

  parts.push(`\n\n### Schema Health Context`);
  parts.push(`Tables without PK: ${tablesNoPK.length} of ${mod.tableCount}`);
  parts.push(`Tables without any index: ${tablesNoIndex.length}`);
  parts.push(`Disabled indexes: ${disabledIndexes}`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a database documentation expert analyzing a 17-year-old ASP.NET medical education platform called MyEvaluations. It manages Graduate Medical Education (GME), Continuing Medical Education (CME), duty hours, patient logs, clinical procedures, and related workflows for 900+ institutions and 10,000+ users.

The platform has a SQL Server database with 2,284 tables and 6,169 stored procedures. It is being incrementally migrated to a Node.js/NestJS backend via the Strangler Fig pattern.

For the module I provide, analyze the tables, foreign keys, indexes, stored procedure references, and .NET code context to produce a JSON response with:

1. **moduleOverview** (string): 2-3 paragraph overview explaining what this module does in the platform, how it fits into the larger system, and any notable characteristics. Write for a developer new to the codebase.

2. **keyWorkflows** (string[]): 3-8 key business workflows this module supports. Each should be a concise description like "Evaluation assignment and distribution to evaluators based on rotation schedules".

3. **schemaHealthNotes** (string[]): 2-5 observations about schema quality — missing PKs, naming inconsistencies, potential dead tables, disabled indexes, etc. Be specific and actionable.

4. **tables** (array): For EACH table in the module, provide:
   - name: exact table name as provided
   - summary: 1-sentence description of what the table stores
   - businessPurpose: 2-3 sentence explanation of how it's used in the platform
   - dataSensitivity: one of "phi" | "pii" | "financial" | "internal" | "public"
     - phi = Protected Health Information (patient data, diagnoses, clinical records)
     - pii = Personally Identifiable Information (names, emails, SSNs)
     - financial = Financial data (billing, payments)
     - internal = Internal system data (configs, logs, lookups)
     - public = Non-sensitive reference data
   - migrationRelevance: one of "high" | "medium" | "low" | "none"
     - high = Actively used by features being migrated to Node.js
     - medium = Referenced indirectly or may need migration later
     - low = Legacy/stable, unlikely to need migration
     - none = Archive or dead table
   - migrationNote: 1-sentence migration consideration (or empty string)
   - complexity: one of "trivial" | "simple" | "moderate" | "complex" | "very-complex"
     - Based on FK relationships, index count, trigger presence, and inferred business logic

IMPORTANT:
- You do NOT have column-level definitions. Infer likely columns from: table names, PK column names, FK constraint names and referenced tables, index key columns (these ARE real column names), and how the table is used in stored procedures.
- Use ONLY the allowed enum values listed above. Never use values like "high" for complexity or "critical" for migrationRelevance.
- Output valid JSON only. No markdown fences, no commentary outside the JSON.
- If a table's purpose is truly unclear, say so honestly rather than fabricating.`;

// ---------------------------------------------------------------------------
// Response parsing & validation
// ---------------------------------------------------------------------------

function extractJson(raw: string): string {
  // Strip markdown fences if present
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try to find JSON object
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1) return raw.substring(start, end + 1);
  return raw;
}

const VALID_SENSITIVITY = new Set(['phi', 'pii', 'financial', 'internal', 'public']);
const VALID_MIGRATION = new Set(['high', 'medium', 'low', 'none']);
const VALID_COMPLEXITY = new Set(['trivial', 'simple', 'moderate', 'complex', 'very-complex']);

function validateAndNormalize(
  response: ClaudeModuleResponse,
  mod: Module,
): ClaudeModuleResponse {
  // Normalize table-level enums
  for (const table of response.tables || []) {
    if (!VALID_SENSITIVITY.has(table.dataSensitivity)) {
      table.dataSensitivity = 'internal';
    }
    if (!VALID_MIGRATION.has(table.migrationRelevance)) {
      table.migrationRelevance = 'medium';
    }
    if (!VALID_COMPLEXITY.has(table.complexity)) {
      // Map common mistakes
      const c = table.complexity?.toLowerCase();
      if (c === 'high' || c === 'very complex') table.complexity = 'very-complex';
      else if (c === 'medium') table.complexity = 'moderate';
      else if (c === 'low') table.complexity = 'simple';
      else table.complexity = 'moderate';
    }
  }

  // Ensure arrays
  if (!Array.isArray(response.keyWorkflows)) response.keyWorkflows = [];
  if (!Array.isArray(response.schemaHealthNotes)) response.schemaHealthNotes = [];
  if (!Array.isArray(response.tables)) response.tables = [];

  return response;
}

// ---------------------------------------------------------------------------
// Enrichment for a single module
// ---------------------------------------------------------------------------

async function enrichModule(
  mod: Module,
  reconciliation: SprocReconciliation,
  cache: CacheManifest,
  options: { force: boolean; dryRun: boolean },
): Promise<boolean> {
  const contentForHash = JSON.stringify({
    prefix: mod.prefix,
    tableCount: mod.tableCount,
    tableNames: mod.tables.map((t) => t.name),
  });
  const contentHash = sha256(contentForHash);

  // Check cache
  const cached = cache.entries[mod.prefix];
  if (cached && cached.sha256 === contentHash && !options.force) {
    console.log(`  [cached] ${mod.prefix} — ${mod.displayName} (${mod.tableCount} tables)`);
    return false;
  }

  console.log(`  [enriching] ${mod.prefix} — ${mod.displayName} (${mod.tableCount} tables)`);

  // Load file enrichment context
  const fileEnrichment = await loadFileEnrichmentForModule(mod.prefix);
  if (fileEnrichment.length > 0) {
    console.log(`    File enrichment context: ${fileEnrichment.length} files`);
  }

  // Build prompt
  let prompt = buildModulePrompt(mod, reconciliation, fileEnrichment);

  // Truncate if too large
  if (prompt.length > MAX_CONTEXT_CHARS) {
    console.warn(`    WARNING: Prompt is ${prompt.length} chars, truncating to ${MAX_CONTEXT_CHARS}`);
    prompt = prompt.substring(0, MAX_CONTEXT_CHARS) + '\n\n... (truncated due to size)';
  }

  console.log(`    Prompt size: ${(prompt.length / 1024).toFixed(1)} KB`);

  if (options.dryRun) {
    console.log(`    [dry-run] Would call Claude API. Skipping.`);
    return false;
  }

  // Call Claude
  const rawResponse = await callClaude(prompt, SYSTEM_PROMPT, 8192);

  // Parse and validate
  let parsed: ClaudeModuleResponse;
  try {
    const jsonStr = extractJson(rawResponse);
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error(`    ERROR: Failed to parse Claude response as JSON`);
    console.error(`    Raw response (first 500 chars): ${rawResponse.substring(0, 500)}`);
    // Save raw response for debugging
    const debugPath = path.join(ENRICHED_DIR, `${mod.prefix}.raw-error.txt`);
    await fs.writeFile(debugPath, rawResponse, 'utf-8');
    console.error(`    Saved raw response to ${debugPath}`);
    return false;
  }

  parsed = validateAndNormalize(parsed, mod);

  // Build output matching ModuleEnrichment interface
  const tableAnnotations: Record<string, { purpose?: string; migrationNote?: string }> = {};
  for (const table of parsed.tables) {
    tableAnnotations[table.name] = {
      purpose: table.summary || table.businessPurpose || undefined,
      migrationNote: table.migrationNote || undefined,
    };
  }

  const output: ModuleEnrichmentOutput = {
    module: mod.prefix,
    displayName: mod.displayName,
    generatedAt: new Date().toISOString(),
    overview: parsed.moduleOverview || '',
    keyWorkflows: parsed.keyWorkflows,
    schemaHealthNotes: parsed.schemaHealthNotes,
    tableAnnotations,
  };

  // Also save the full enrichment with per-table detail for potential future use
  const fullOutput = {
    ...output,
    tableDetail: parsed.tables,
  };

  const outputPath = path.join(ENRICHED_DIR, `${mod.prefix}.json`);
  await fs.writeFile(outputPath, JSON.stringify(fullOutput, null, 2), 'utf-8');
  console.log(`    Wrote: ${outputPath}`);

  // Log summary
  const annotatedCount = Object.keys(tableAnnotations).length;
  console.log(`    Tables annotated: ${annotatedCount}/${mod.tableCount}, Workflows: ${parsed.keyWorkflows.length}, Health notes: ${parsed.schemaHealthNotes.length}`);

  // Update cache
  cache.entries[mod.prefix] = {
    sha256: contentHash,
    enrichedAt: new Date().toISOString(),
    tableCount: mod.tableCount,
  };
  await saveCache(cache);

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== AI Enrichment: Database Schema Modules ===\n');

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const moduleFlag = args.indexOf('--module');
  const targetModule = moduleFlag !== -1 ? args[moduleFlag + 1] : null;

  if (force) console.log('Force mode: re-processing all modules\n');
  if (dryRun) console.log('Dry-run mode: will not call Claude API\n');
  if (targetModule) console.log(`Target module: ${targetModule}\n`);

  // Verify API key (unless dry run)
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-db-schema.ts');
    console.error('       Add --dry-run to preview without API calls.');
    process.exit(1);
  }

  // Ensure output directory exists
  await fs.mkdir(ENRICHED_DIR, { recursive: true });

  // Load input data
  const tablesPath = path.join(DB_SCHEMA_DIR, 'tables.json');
  const reconciliationPath = path.join(DB_SCHEMA_DIR, 'sproc-reconciliation.json');

  if (!(await fileExists(tablesPath))) {
    console.error('Error: tables.json not found. Run `npm run parse:db:schema` first.');
    process.exit(1);
  }
  if (!(await fileExists(reconciliationPath))) {
    console.error('Error: sproc-reconciliation.json not found. Run `npm run parse:db:reconcile` first.');
    process.exit(1);
  }

  const tablesData: TablesData = JSON.parse(await fs.readFile(tablesPath, 'utf-8'));
  const reconciliation: SprocReconciliation = JSON.parse(await fs.readFile(reconciliationPath, 'utf-8'));

  console.log(`Loaded: ${tablesData.totalTables} tables in ${tablesData.modules.length} modules`);
  console.log(`Loaded: ${reconciliation.matchedExact} matched SPs, ${reconciliation.orphanDbCount} DB orphans\n`);

  // Load cache
  const cache = await loadCache();
  console.log(`Cache entries: ${Object.keys(cache.entries).length}\n`);

  // Filter modules
  let modules = tablesData.modules;
  if (targetModule) {
    modules = modules.filter((m) =>
      m.prefix.toLowerCase() === targetModule.toLowerCase()
    );
    if (modules.length === 0) {
      console.error(`Error: Module "${targetModule}" not found.`);
      console.error('Available modules:');
      tablesData.modules.forEach((m) =>
        console.error(`  ${m.prefix.padEnd(18)} ${m.displayName} (${m.tableCount} tables)`)
      );
      process.exit(1);
    }
  }

  // Sort: smaller modules first (faster iteration, catch errors early)
  modules.sort((a, b) => a.tableCount - b.tableCount);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const startTime = Date.now();

  for (const mod of modules) {
    try {
      const wasProcessed = await enrichModule(mod, reconciliation, cache, { force, dryRun });
      if (wasProcessed) {
        processed++;
        // Rate limit between API calls
        if (processed < modules.length) {
          await sleep(API_DELAY_MS);
        }
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR on ${mod.prefix}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Final cache save
  cache.lastRun = new Date().toISOString();
  await saveCache(cache);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Database Schema Enrichment Complete ===');
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${elapsed}s`);

  if (processed > 0) {
    console.log(`\nNext steps:`);
    console.log(`  1. npm run generate:db:pages   # Regenerate pages with enrichment`);
    console.log(`  2. npm run build               # Verify build`);
  }
}

main().catch((err) => {
  console.error('Fatal error during DB schema enrichment:', err);
  process.exit(1);
});
