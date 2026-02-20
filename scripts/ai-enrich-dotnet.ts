/**
 * ai-enrich-dotnet.ts
 *
 * Dedicated .NET enrichment with higher priority for Business.* modules.
 * Focuses on key modules (Security, Evaluations, DutyHours) and produces
 * richer MDX-compatible documentation that can be imported into Docusaurus pages.
 *
 * Uses the same caching mechanism as ai-enrich.ts (SHA-based, incremental).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-dotnet.ts
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-dotnet.ts --force
 *
 * Usage: tsx scripts/ai-enrich-dotnet.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');
const CLASSES_DIR = path.join(GENERATED_DIR, 'dotnet-metadata', 'classes');
const ENRICHED_DIR = path.join(GENERATED_DIR, 'ai-enriched');
const DOTNET_ENRICHED_DIR = path.join(ENRICHED_DIR, 'dotnet');
const CACHE_FILE = path.join(DOTNET_ENRICHED_DIR, '.dotnet-cache-manifest.json');

// Rate limit: delay between Claude API calls (in ms)
const API_DELAY_MS = 2000;
const MAX_CONTEXT_CHARS = 90_000;

// Priority modules get more detailed documentation
const PRIORITY_MODULES = [
  'Business.Security',
  'Business.Evaluations',
  'Business.DutyHours',
  'Business.Clinical',
  'Business.Learning',
  'Business.Scheduling',
  'Business.Communication',
  'Business.License',
  'Business.Reports',
  'Business.Users',
];

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
  outputFile: string;
  priority: boolean;
}

interface ClassData {
  projectName: string;
  classCount: number;
  classes: Array<{
    name: string;
    namespace: string;
    baseClass: string | null;
    interfaces: string[];
    methods: Array<{
      name: string;
      returnType: string;
      visibility: string;
      parameters: string[];
    }>;
    properties: Array<{
      name: string;
      type: string;
    }>;
    storedProcedureCalls: string[];
    filePath: string;
  }>;
  managerClasses: string[];
  infoCounterparts: Record<string, string>;
}

interface DotnetEnrichment {
  module: string;
  generatedAt: string;
  isPriority: boolean;
  overview: string;
  architecture: string;
  managerPattern: string;
  storedProcedures: string;
  keyClasses: Array<{
    name: string;
    purpose: string;
    keyMethods: string[];
  }>;
  businessRules: string[];
  migrationNotes: string[];
  mermaidDiagram: string | null;
  mdxContent: string;
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
      'Set it before running: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-dotnet.ts'
    );
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey });
    return anthropicClient;
  } catch (err) {
    throw new Error(
      `Failed to load @anthropic-ai/sdk: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function callClaude(
  prompt: string,
  systemPrompt: string,
  maxTokens: number = 4096
): Promise<string> {
  const client = await getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt },
    ],
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
      const content = await fs.readFile(CACHE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      console.warn('  Warning: Cache manifest is corrupted, starting fresh.');
    }
  }
  return { lastRun: '', entries: {} };
}

async function saveCache(cache: CacheManifest): Promise<void> {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_PRIORITY = `You are a senior software architect creating detailed technical documentation for MyEvaluations, a healthcare education platform managing GME, CME, Nursing, and PA programs (25+ years, 10,000+ users, 900+ institutions).

This is a PRIORITY module in the .NET 4.6.1 backend (currently being migrated to NestJS via Strangler Fig pattern). Produce comprehensive documentation.

The .NET codebase uses a Manager/Info pattern:
- Manager classes contain business logic and orchestrate operations
- Info classes are data transfer objects (DTOs)
- DataAccess classes handle stored procedure calls to SQL Server

Format your response as follows:

## Architecture Overview
Detailed explanation of the module's architecture and role in the platform.

## Manager Classes
For each key Manager class, explain:
- Its responsibility
- Key methods and what they do
- Stored procedures it calls

## Business Rules
- List concrete business rules this module enforces

## Data Flow
\`\`\`mermaid
graph TD
  A[Component] --> B[Component]
\`\`\`

## Stored Procedure Analysis
Map stored procedures to their business purpose.

## Migration Considerations
- Specific recommendations for migrating this module to NestJS
- Potential pitfalls and dependencies

## Key Classes Reference
| Class | Purpose | Key Methods |
|-------|---------|-------------|
| ClassName | Purpose | method1, method2 |`;

const SYSTEM_PROMPT_STANDARD = `You are a senior software architect documenting a .NET backend module for MyEvaluations, a healthcare education platform. Keep documentation concise but informative.

Format:

## Overview
Brief module overview.

## Key Classes
Notable classes and their purpose.

## Patterns
Design patterns used.

## Notes
Migration or maintenance notes.`;

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

function buildPrompt(classData: ClassData, isPriority: boolean): string {
  const classesJson = JSON.stringify(classData, null, 2);
  let context = classesJson;

  if (context.length > MAX_CONTEXT_CHARS) {
    // For large modules, summarize instead of truncating
    const summary = {
      projectName: classData.projectName,
      classCount: classData.classCount,
      managerClasses: classData.managerClasses,
      infoCounterparts: classData.infoCounterparts,
      // Include only public methods for each class
      classSummaries: classData.classes.map((c) => ({
        name: c.name,
        namespace: c.namespace,
        baseClass: c.baseClass,
        interfaces: c.interfaces,
        publicMethods: c.methods
          .filter((m) => m.visibility === 'public')
          .map((m) => `${m.returnType} ${m.name}(${m.parameters.join(', ')})`),
        propertyCount: c.properties.length,
        storedProcedureCalls: c.storedProcedureCalls,
      })),
    };
    context = JSON.stringify(summary, null, 2);

    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.substring(0, MAX_CONTEXT_CHARS) + '\n... (truncated)';
    }
  }

  if (isPriority) {
    return `Analyze this PRIORITY .NET Business module and produce comprehensive documentation.

Module: ${classData.projectName}
Total Classes: ${classData.classCount}
Manager Classes: ${classData.managerClasses.join(', ') || 'None identified'}
Info Counterparts: ${JSON.stringify(classData.infoCounterparts)}

Full metadata:
\`\`\`json
${context}
\`\`\`

Produce detailed documentation following the format in your instructions.
Focus on business rules, data flows, and migration considerations.
Include a Mermaid diagram showing the main data/process flow.`;
  }

  return `Analyze this .NET Business module and produce documentation.

Module: ${classData.projectName}
Classes: ${classData.classCount}
Managers: ${classData.managerClasses.join(', ') || 'None'}

\`\`\`json
${context}
\`\`\`

Produce concise documentation following the format in your instructions.`;
}

function generateMdxContent(
  moduleName: string,
  rawResponse: string,
  isPriority: boolean
): string {
  const lines: string[] = [
    '---',
    `title: "${moduleName}"`,
    `description: "Auto-generated documentation for the ${moduleName} module"`,
    `sidebar_label: "${moduleName.replace('Business.', '')}"`,
    `tags: [dotnet, business-layer${isPriority ? ', priority' : ''}]`,
    '---',
    '',
    `{/* Auto-generated by ai-enrich-dotnet.ts on ${new Date().toISOString()} */}`,
    '',
    rawResponse,
    '',
    '---',
    '',
    `*This documentation was auto-generated from source code analysis. Last updated: ${new Date().toISOString()}*`,
  ];

  return lines.join('\n');
}

async function enrichModule(
  filePath: string,
  cache: CacheManifest,
  forceAll: boolean
): Promise<boolean> {
  const content = await fs.readFile(filePath, 'utf-8');
  const classData: ClassData = JSON.parse(content);
  const moduleName = classData.projectName;
  const isPriority = PRIORITY_MODULES.some(
    (p) => moduleName.toLowerCase() === p.toLowerCase() || moduleName.toLowerCase().startsWith(p.toLowerCase())
  );

  // Check cache
  const contentHash = sha256(content);
  const cacheKey = moduleName;
  const cached = cache.entries[cacheKey];
  if (cached && cached.sha256 === contentHash && !forceAll) {
    console.log(`  [cached] ${moduleName}${isPriority ? ' (priority)' : ''}`);
    return false;
  }

  console.log(`  [enriching] ${moduleName}${isPriority ? ' (PRIORITY)' : ''}`);

  const systemPrompt = isPriority ? SYSTEM_PROMPT_PRIORITY : SYSTEM_PROMPT_STANDARD;
  const prompt = buildPrompt(classData, isPriority);
  const maxTokens = isPriority ? 6000 : 3000;

  try {
    const response = await callClaude(prompt, systemPrompt, maxTokens);

    // Generate MDX content
    const mdxContent = generateMdxContent(moduleName, response, isPriority);

    // Parse key information from the response
    const keyClassesMatch = response.match(/\|[^|]+\|[^|]+\|[^|]+\|/g);
    const keyClasses: Array<{ name: string; purpose: string; keyMethods: string[] }> = [];
    if (keyClassesMatch) {
      for (const row of keyClassesMatch.slice(1)) {
        // Skip header separator row
        const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
        if (cells.length >= 3 && !cells[0].includes('---')) {
          keyClasses.push({
            name: cells[0],
            purpose: cells[1],
            keyMethods: cells[2].split(',').map((m) => m.trim()),
          });
        }
      }
    }

    const businessRulesMatch = response.match(/## Business Rules\s*\n([\s\S]*?)(?=\n## |$)/i);
    const businessRules = businessRulesMatch
      ? businessRulesMatch[1]
          .split('\n')
          .map((line) => line.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
      : [];

    const migrationMatch = response.match(/## Migration (?:Considerations|Notes)\s*\n([\s\S]*?)(?=\n## |$)/i);
    const migrationNotes = migrationMatch
      ? migrationMatch[1]
          .split('\n')
          .map((line) => line.replace(/^[-*]\s*/, '').trim())
          .filter(Boolean)
      : [];

    const mermaidMatch = response.match(/```mermaid\s*\n([\s\S]*?)```/);
    const mermaidDiagram = mermaidMatch ? mermaidMatch[1].trim() : null;

    const enrichment: DotnetEnrichment = {
      module: moduleName,
      generatedAt: new Date().toISOString(),
      isPriority,
      overview: response.substring(0, 500),
      architecture: response,
      managerPattern: classData.managerClasses.length > 0 ? 'Manager/Info pattern detected' : 'No Manager pattern',
      storedProcedures: classData.classes
        .flatMap((c) => c.storedProcedureCalls)
        .filter(Boolean)
        .join(', '),
      keyClasses,
      businessRules,
      migrationNotes,
      mermaidDiagram,
      mdxContent,
    };

    // Write JSON enrichment
    const jsonPath = path.join(DOTNET_ENRICHED_DIR, `${moduleName}.enriched.json`);
    await fs.writeFile(jsonPath, JSON.stringify(enrichment, null, 2), 'utf-8');

    // Write MDX file (can be imported into Docusaurus pages)
    const mdxPath = path.join(DOTNET_ENRICHED_DIR, `${moduleName}.mdx`);
    await fs.writeFile(mdxPath, mdxContent, 'utf-8');

    // Update cache
    cache.entries[cacheKey] = {
      sha256: contentHash,
      enrichedAt: new Date().toISOString(),
      outputFile: `${moduleName}.enriched.json`,
      priority: isPriority,
    };

    console.log(`    Wrote: ${jsonPath}`);
    console.log(`    Wrote: ${mdxPath}`);

    return true;
  } catch (err) {
    console.error(`    Error enriching ${moduleName}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== AI Enrichment: .NET Business Modules ===\n');

  const forceAll = process.argv.includes('--force');
  if (forceAll) {
    console.log('Force mode: re-processing all modules\n');
  }

  // Verify API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich-dotnet.ts');
    process.exit(1);
  }

  // Ensure output directories exist
  await fs.mkdir(DOTNET_ENRICHED_DIR, { recursive: true });

  // Load cache
  const cache = await loadCache();
  console.log(`Cache entries: ${Object.keys(cache.entries).length}`);

  // Find class metadata files
  if (!(await fileExists(CLASSES_DIR))) {
    console.warn('Warning: No class metadata found at ' + CLASSES_DIR);
    console.warn('Run "npm run parse:dotnet:classes" first.');
    return;
  }

  const entries = await fs.readdir(CLASSES_DIR);
  const jsonFiles = entries
    .filter((e) => e.endsWith('.json'))
    .map((e) => path.join(CLASSES_DIR, e));

  if (jsonFiles.length === 0) {
    console.warn('No class metadata files found. Run "npm run parse:dotnet:classes" first.');
    return;
  }

  console.log(`Found ${jsonFiles.length} module metadata files\n`);

  // Sort: priority modules first
  jsonFiles.sort((a, b) => {
    const aName = path.basename(a, '.json');
    const bName = path.basename(b, '.json');
    const aIsPriority = PRIORITY_MODULES.some((p) => aName.toLowerCase().startsWith(p.toLowerCase()));
    const bIsPriority = PRIORITY_MODULES.some((p) => bName.toLowerCase().startsWith(p.toLowerCase()));
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    return aName.localeCompare(bName);
  });

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of jsonFiles) {
    try {
      const wasProcessed = await enrichModule(file, cache, forceAll);
      if (wasProcessed) {
        processed++;
        await sleep(API_DELAY_MS);
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save cache
  cache.lastRun = new Date().toISOString();
  await saveCache(cache);

  console.log('\n=== .NET Enrichment Complete ===');
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  // List generated MDX files
  try {
    const enrichedEntries = await fs.readdir(DOTNET_ENRICHED_DIR);
    const mdxFiles = enrichedEntries.filter((e) => e.endsWith('.mdx'));
    if (mdxFiles.length > 0) {
      console.log(`\nGenerated MDX files (${mdxFiles.length}):`);
      for (const mdx of mdxFiles) {
        console.log(`  ${path.join(DOTNET_ENRICHED_DIR, mdx)}`);
      }
    }
  } catch {
    // Skip listing
  }
}

main().catch((err) => {
  console.error('Fatal error during .NET enrichment:', err);
  process.exit(1);
});
