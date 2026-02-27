/**
 * enrich-sprocs.ts
 *
 * Merges AI enrichment JSONs for stored procedures into the SP documentation
 * pipeline. Supports batch files from Claude CLI agents (e.g., EVAL-batch1.json,
 * EVAL-batch2.json) and merges them into final per-module enrichment files.
 *
 * Also generates:
 *   - sproc-enrichment-index.json (master index of all enriched SPs)
 *   - .sproc-cache-manifest.json (SHA-based cache for incremental re-runs)
 *
 * After running this script, run:
 *   npm run generate:db:sproc-pages   (to regenerate MDX with enrichment)
 *
 * Inputs:
 *   - generated/ai-enriched/db-schema/per-module-sprocs/*.json (enrichment from agents)
 *   - generated/db-schema/stored-procedures-full.json (for validation)
 *
 * Outputs:
 *   - generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json (merged)
 *   - generated/ai-enriched/db-schema/per-module-sprocs/sproc-enrichment-index.json
 *   - generated/ai-enriched/db-schema/per-module-sprocs/.sproc-cache-manifest.json
 *
 * Usage: tsx scripts/enrich-sprocs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// ── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENRICHED_DIR = path.join(
  PROJECT_ROOT,
  'generated',
  'ai-enriched',
  'db-schema',
  'per-module-sprocs',
);
const SPROC_FULL_PATH = path.join(
  PROJECT_ROOT,
  'generated',
  'db-schema',
  'stored-procedures-full.json',
);

// ── Interfaces ───────────────────────────────────────────────────────────────

interface SprocEnrichmentDetail {
  name: string;
  summary?: string;
  businessPurpose?: string;
  optimizationRecommendations?: string[];
  complexity?: string;
  migrationRelevance?: string;
}

interface ModuleSprocEnrichment {
  module: string;
  generatedAt?: string;
  procedureCount?: number;
  batchInfo?: string;
  procedures: SprocEnrichmentDetail[];
  moduleOverview?: string;
  topOptimizationPriorities?: string[];
}

interface IndexEntry {
  name: string;
  module: string;
  complexity?: string;
  migrationRelevance?: string;
  hasOptimizations: boolean;
  hasSummary: boolean;
}

interface EnrichmentIndex {
  generatedAt: string;
  totalEnrichedProcedures: number;
  totalModules: number;
  byComplexity: Record<string, number>;
  byMigrationRelevance: Record<string, number>;
  withOptimizations: number;
  withSummary: number;
  procedures: IndexEntry[];
}

// Valid values per CLAUDE.md
const VALID_COMPLEXITY = ['trivial', 'simple', 'moderate', 'complex', 'very-complex'];
const VALID_MIGRATION = ['high', 'medium', 'low', 'none'];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T> {
  const content = await fs.readFile(p, 'utf8');
  return JSON.parse(content) as T;
}

function sha256Short(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function validateProcedure(proc: SprocEnrichmentDetail, module: string): string[] {
  const warnings: string[] = [];

  if (!proc.name) {
    warnings.push(`[${module}] Procedure missing name`);
  }

  if (proc.complexity && !VALID_COMPLEXITY.includes(proc.complexity)) {
    warnings.push(
      `[${module}/${proc.name}] Invalid complexity "${proc.complexity}" — must be one of: ${VALID_COMPLEXITY.join(', ')}`,
    );
  }

  if (proc.migrationRelevance && !VALID_MIGRATION.includes(proc.migrationRelevance)) {
    warnings.push(
      `[${module}/${proc.name}] Invalid migrationRelevance "${proc.migrationRelevance}" — must be one of: ${VALID_MIGRATION.join(', ')}`,
    );
  }

  if (
    proc.optimizationRecommendations &&
    !Array.isArray(proc.optimizationRecommendations)
  ) {
    warnings.push(
      `[${module}/${proc.name}] optimizationRecommendations must be string array`,
    );
  }

  if (
    proc.optimizationRecommendations &&
    Array.isArray(proc.optimizationRecommendations)
  ) {
    for (const rec of proc.optimizationRecommendations) {
      if (typeof rec !== 'string') {
        warnings.push(
          `[${module}/${proc.name}] optimizationRecommendations entries must be strings`,
        );
        break;
      }
    }
  }

  return warnings;
}

// ── Batch Detection & Merging ────────────────────────────────────────────────

interface BatchGroup {
  module: string;
  files: string[];
  isBatched: boolean;
}

function groupBatchFiles(fileNames: string[]): BatchGroup[] {
  const groups = new Map<string, string[]>();

  for (const f of fileNames) {
    if (f.startsWith('.') || f === 'sproc-enrichment-index.json') continue;

    // Match: MODULE-batch1.json, MODULE-batch2.json, or MODULE.json
    const batchMatch = f.match(/^(.+)-batch\d+\.json$/);
    const directMatch = f.match(/^(.+)\.json$/);

    const module = batchMatch ? batchMatch[1] : directMatch ? directMatch[1] : null;
    if (!module) continue;

    if (!groups.has(module)) {
      groups.set(module, []);
    }
    groups.get(module)!.push(f);
  }

  return Array.from(groups.entries()).map(([module, files]) => ({
    module,
    files: files.sort(),
    isBatched: files.some((f) => f.includes('-batch')),
  }));
}

async function mergeBatches(
  group: BatchGroup,
): Promise<{ merged: ModuleSprocEnrichment; warnings: string[] }> {
  const warnings: string[] = [];
  const allProcedures = new Map<string, SprocEnrichmentDetail>();
  let moduleOverview: string | undefined;
  let topOptimizationPriorities: string[] | undefined;
  let latestTimestamp = '';

  for (const file of group.files) {
    const filePath = path.join(ENRICHED_DIR, file);
    try {
      const data = await readJson<ModuleSprocEnrichment>(filePath);

      if (data.generatedAt && data.generatedAt > latestTimestamp) {
        latestTimestamp = data.generatedAt;
      }

      if (data.moduleOverview) {
        moduleOverview = data.moduleOverview;
      }

      if (data.topOptimizationPriorities) {
        topOptimizationPriorities = data.topOptimizationPriorities;
      }

      if (data.procedures) {
        for (const proc of data.procedures) {
          const procWarnings = validateProcedure(proc, group.module);
          warnings.push(...procWarnings);

          if (proc.name) {
            // Later batches override earlier ones (dedup by name)
            allProcedures.set(proc.name, proc);
          }
        }
      }
    } catch (err) {
      warnings.push(`[${group.module}] Failed to parse ${file}: ${err}`);
    }
  }

  const procedures = Array.from(allProcedures.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const merged: ModuleSprocEnrichment = {
    module: group.module,
    generatedAt: latestTimestamp || new Date().toISOString(),
    procedureCount: procedures.length,
    procedures,
    ...(moduleOverview && { moduleOverview }),
    ...(topOptimizationPriorities && { topOptimizationPriorities }),
  };

  if (group.isBatched) {
    merged.batchInfo = `Merged from ${group.files.length} batch files`;
  }

  return { merged, warnings };
}

// ── Index Generation ─────────────────────────────────────────────────────────

function generateIndex(
  modules: ModuleSprocEnrichment[],
): EnrichmentIndex {
  const entries: IndexEntry[] = [];
  const byComplexity: Record<string, number> = {};
  const byMigrationRelevance: Record<string, number> = {};
  let withOptimizations = 0;
  let withSummary = 0;

  for (const mod of modules) {
    for (const proc of mod.procedures) {
      entries.push({
        name: proc.name,
        module: mod.module,
        complexity: proc.complexity,
        migrationRelevance: proc.migrationRelevance,
        hasOptimizations:
          !!proc.optimizationRecommendations &&
          proc.optimizationRecommendations.length > 0,
        hasSummary: !!proc.summary,
      });

      if (proc.complexity) {
        byComplexity[proc.complexity] = (byComplexity[proc.complexity] || 0) + 1;
      }
      if (proc.migrationRelevance) {
        byMigrationRelevance[proc.migrationRelevance] =
          (byMigrationRelevance[proc.migrationRelevance] || 0) + 1;
      }
      if (proc.optimizationRecommendations?.length) withOptimizations++;
      if (proc.summary) withSummary++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalEnrichedProcedures: entries.length,
    totalModules: modules.length,
    byComplexity,
    byMigrationRelevance,
    withOptimizations,
    withSummary,
    procedures: entries,
  };
}

// ── Cache Manifest ───────────────────────────────────────────────────────────

async function loadCacheManifest(): Promise<Record<string, string>> {
  const manifestPath = path.join(ENRICHED_DIR, '.sproc-cache-manifest.json');
  if (await fileExists(manifestPath)) {
    try {
      return await readJson<Record<string, string>>(manifestPath);
    } catch {
      return {};
    }
  }
  return {};
}

async function saveCacheManifest(manifest: Record<string, string>): Promise<void> {
  const manifestPath = path.join(ENRICHED_DIR, '.sproc-cache-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('Merging stored procedure AI enrichment...');

  // Verify enrichment directory exists
  if (!(await fileExists(ENRICHED_DIR))) {
    console.log('  No enrichment directory found. Creating it...');
    await fs.mkdir(ENRICHED_DIR, { recursive: true });
    console.log(`  Created ${path.relative(PROJECT_ROOT, ENRICHED_DIR)}/`);
    console.log('  No enrichment files to process. Run Claude CLI agents first.');
    console.log('');
    console.log('  Agent workflow:');
    console.log('    1. Input: generated/db-schema/sp-bodies/<MODULE>.json');
    console.log('    2. Output: generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json');
    console.log('    3. Then re-run: npm run enrich:sprocs');
    return;
  }

  // List enrichment files
  const allFiles = await fs.readdir(ENRICHED_DIR);
  const jsonFiles = allFiles.filter(
    (f) =>
      f.endsWith('.json') &&
      !f.startsWith('.') &&
      f !== 'sproc-enrichment-index.json',
  );

  if (jsonFiles.length === 0) {
    console.log('  No enrichment JSON files found in:');
    console.log(`  ${path.relative(PROJECT_ROOT, ENRICHED_DIR)}/`);
    console.log('');
    console.log('  Run Claude CLI agents to generate enrichment files first.');
    return;
  }

  console.log(`  Found ${jsonFiles.length} enrichment file(s)`);

  // Load known SP names for cross-validation
  let knownSpNames: Set<string> | null = null;
  if (await fileExists(SPROC_FULL_PATH)) {
    try {
      const sprocData = await readJson<{
        modules: Array<{ procedures: Array<{ name: string }> }>;
      }>(SPROC_FULL_PATH);
      knownSpNames = new Set<string>();
      for (const mod of sprocData.modules) {
        for (const p of mod.procedures) {
          knownSpNames.add(p.name);
        }
      }
      console.log(`  Loaded ${knownSpNames.size} known SP names for validation`);
    } catch {
      console.log('  Warning: Could not load stored-procedures-full.json for validation');
    }
  }

  // Load cache manifest
  const oldManifest = await loadCacheManifest();
  const newManifest: Record<string, string> = {};

  // Group and merge batch files
  const groups = groupBatchFiles(jsonFiles);
  console.log(`  Detected ${groups.length} module(s): ${groups.map((g) => g.module).join(', ')}`);

  const allWarnings: string[] = [];
  const mergedModules: ModuleSprocEnrichment[] = [];
  let skippedUnchanged = 0;

  for (const group of groups) {
    // Check cache — skip if unchanged
    const fileContents: string[] = [];
    for (const f of group.files) {
      const content = await fs.readFile(path.join(ENRICHED_DIR, f), 'utf8');
      fileContents.push(content);
    }
    const combinedHash = sha256Short(fileContents.join('|'));
    const cacheKey = group.module;

    if (oldManifest[cacheKey] === combinedHash) {
      // Load the existing merged file instead of re-merging
      const mergedPath = path.join(ENRICHED_DIR, `${group.module}.json`);
      if (await fileExists(mergedPath)) {
        try {
          const existing = await readJson<ModuleSprocEnrichment>(mergedPath);
          mergedModules.push(existing);
          newManifest[cacheKey] = combinedHash;
          skippedUnchanged++;
          continue;
        } catch {
          // Fall through to re-merge
        }
      }
    }

    const { merged, warnings } = await mergeBatches(group);
    allWarnings.push(...warnings);

    // Cross-validate SP names against known SPs
    if (knownSpNames) {
      let unknownCount = 0;
      for (const proc of merged.procedures) {
        if (!knownSpNames.has(proc.name)) {
          unknownCount++;
          if (unknownCount <= 3) {
            allWarnings.push(
              `[${group.module}] SP "${proc.name}" not found in stored-procedures-full.json`,
            );
          }
        }
      }
      if (unknownCount > 3) {
        allWarnings.push(
          `[${group.module}] ...and ${unknownCount - 3} more unknown SP names`,
        );
      }
    }

    // Write merged file (for batched groups, write final merged; for single files, write validated copy)
    if (group.isBatched) {
      const mergedPath = path.join(ENRICHED_DIR, `${group.module}.json`);
      await fs.writeFile(mergedPath, JSON.stringify(merged, null, 2));
      console.log(
        `  Merged ${group.files.length} batches → ${group.module}.json (${merged.procedures.length} SPs)`,
      );
    } else {
      console.log(
        `  Validated ${group.module}.json (${merged.procedures.length} SPs)`,
      );
    }

    mergedModules.push(merged);
    newManifest[cacheKey] = combinedHash;
  }

  if (skippedUnchanged > 0) {
    console.log(`  Skipped ${skippedUnchanged} unchanged module(s) (cached)`);
  }

  // Print warnings
  if (allWarnings.length > 0) {
    console.log('');
    console.log(`  Warnings (${allWarnings.length}):`);
    for (const w of allWarnings.slice(0, 20)) {
      console.log(`    ⚠ ${w}`);
    }
    if (allWarnings.length > 20) {
      console.log(`    ...and ${allWarnings.length - 20} more`);
    }
  }

  // Generate index
  const index = generateIndex(mergedModules);
  const indexPath = path.join(ENRICHED_DIR, 'sproc-enrichment-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log('');
  console.log(`  Generated sproc-enrichment-index.json:`);
  console.log(`    ${index.totalEnrichedProcedures} enriched SPs across ${index.totalModules} modules`);
  console.log(`    ${index.withSummary} with summaries, ${index.withOptimizations} with optimization recommendations`);

  if (Object.keys(index.byComplexity).length > 0) {
    console.log(`    Complexity: ${JSON.stringify(index.byComplexity)}`);
  }
  if (Object.keys(index.byMigrationRelevance).length > 0) {
    console.log(`    Migration: ${JSON.stringify(index.byMigrationRelevance)}`);
  }

  // Save cache manifest
  await saveCacheManifest(newManifest);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(
    `Done in ${elapsed}s — ${mergedModules.length} module(s), ${index.totalEnrichedProcedures} enriched SPs`,
  );
  console.log('');
  console.log('Next step: npm run generate:db:sproc-pages');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
