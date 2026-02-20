/**
 * ai-enrich.ts
 *
 * Claude API enrichment orchestrator.
 * Reads generated JSON metadata files and sends context to Claude to produce
 * narrative documentation, design pattern analysis, business logic explanations,
 * and Mermaid diagrams for complex flows.
 *
 * Caches results by file content SHA in generated/ai-enriched/.
 * Runs incrementally -- only processes files that have changed since last run.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich.ts
 *   ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich.ts --force   # re-process all
 *
 * Usage: tsx scripts/ai-enrich.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated');
const ENRICHED_DIR = path.join(GENERATED_DIR, 'ai-enriched');
const CACHE_FILE = path.join(ENRICHED_DIR, '.cache-manifest.json');

// Rate limit: delay between Claude API calls (in ms)
const API_DELAY_MS = 1500;
const MAX_CONTEXT_CHARS = 80_000; // Stay within context window limits

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
}

interface EnrichmentResult {
  sourceFile: string;
  module: string;
  generatedAt: string;
  overview: string;
  designPatterns: string[];
  businessLogic: string;
  mermaidDiagram: string | null;
  keyFindings: string[];
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// Claude API client (minimal, using @anthropic-ai/sdk)
// ---------------------------------------------------------------------------

let anthropicClient: any = null;

async function getAnthropicClient(): Promise<any> {
  if (anthropicClient) return anthropicClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Set it before running: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich.ts'
    );
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey });
    return anthropicClient;
  } catch (err) {
    throw new Error(
      `Failed to load @anthropic-ai/sdk: ${err instanceof Error ? err.message : String(err)}\n` +
      'Ensure it is installed: npm install @anthropic-ai/sdk'
    );
  }
}

async function callClaude(prompt: string, systemPrompt: string): Promise<string> {
  const client = await getAnthropicClient();

  const response: AnthropicResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
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

/**
 * Collect all JSON metadata files from the generated directory.
 */
async function collectMetadataFiles(): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip the ai-enriched output directory
          if (fullPath === ENRICHED_DIR) continue;
          await walk(fullPath);
        } else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory may not exist
    }
  }

  await walk(GENERATED_DIR);
  return files;
}

/**
 * Parse the Claude response into structured enrichment data.
 */
function parseEnrichmentResponse(
  response: string,
  sourceFile: string,
  moduleName: string
): EnrichmentResult {
  // Extract sections from the response
  const overviewMatch = response.match(/## Overview\s*\n([\s\S]*?)(?=\n## |$)/i);
  const patternsMatch = response.match(/## Design Patterns\s*\n([\s\S]*?)(?=\n## |$)/i);
  const businessMatch = response.match(/## Business Logic\s*\n([\s\S]*?)(?=\n## |$)/i);
  const mermaidMatch = response.match(/```mermaid\s*\n([\s\S]*?)```/i);
  const findingsMatch = response.match(/## Key Findings\s*\n([\s\S]*?)(?=\n## |$)/i);

  const designPatterns = patternsMatch
    ? patternsMatch[1]
        .split('\n')
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    : [];

  const keyFindings = findingsMatch
    ? findingsMatch[1]
        .split('\n')
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    : [];

  return {
    sourceFile,
    module: moduleName,
    generatedAt: new Date().toISOString(),
    overview: overviewMatch ? overviewMatch[1].trim() : response.substring(0, 500),
    designPatterns,
    businessLogic: businessMatch ? businessMatch[1].trim() : '',
    mermaidDiagram: mermaidMatch ? mermaidMatch[1].trim() : null,
    keyFindings,
  };
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior software architect documenting a large healthcare education platform called MyEvaluations.
The platform manages Graduate Medical Education (GME), Continuing Medical Education (CME), Nursing, and PA programs.
It has been in operation for 25+ years with 10,000+ users across 900+ institutions.

The codebase is being migrated from a .NET 4.6.1 WebForms monolith to a modern NestJS + React stack (Strangler Fig pattern).

When analyzing code metadata, produce documentation in this format:

## Overview
A narrative overview of what this module/component does in the context of healthcare education.

## Design Patterns
- List the key design patterns observed (e.g., Repository, Manager/Info, Service Layer)

## Business Logic
Explain the core business rules and workflows.

## Key Findings
- Notable aspects, potential issues, or migration considerations

If the code involves complex workflows, include a Mermaid diagram:
\`\`\`mermaid
graph TD
  A[Step 1] --> B[Step 2]
\`\`\`

Keep explanations practical and relevant to developers working on this codebase.`;

async function enrichFile(
  filePath: string,
  cache: CacheManifest,
  forceAll: boolean
): Promise<boolean> {
  const relativePath = path.relative(GENERATED_DIR, filePath);
  const moduleName = path.basename(filePath, '.json');

  // Read file content
  const content = await fs.readFile(filePath, 'utf-8');

  // Check cache
  const contentHash = sha256(content);
  const cached = cache.entries[relativePath];
  if (cached && cached.sha256 === contentHash && !forceAll) {
    console.log(`  [cached] ${relativePath}`);
    return false;
  }

  // Truncate if too large
  let contextContent = content;
  if (contextContent.length > MAX_CONTEXT_CHARS) {
    console.log(`  [truncating] ${relativePath} (${content.length} -> ${MAX_CONTEXT_CHARS} chars)`);
    contextContent = contextContent.substring(0, MAX_CONTEXT_CHARS) + '\n... (truncated)';
  }

  console.log(`  [enriching] ${relativePath}`);

  const prompt = `Analyze this metadata from the MyEvaluations platform and produce documentation.

Module: ${moduleName}
Source: ${relativePath}

Metadata JSON:
\`\`\`json
${contextContent}
\`\`\`

Please produce structured documentation following the format in your instructions.
Focus on what this module does in the healthcare education context and highlight anything notable for the migration effort.`;

  try {
    const response = await callClaude(prompt, SYSTEM_PROMPT);
    const enrichment = parseEnrichmentResponse(response, relativePath, moduleName);

    // Write enrichment output
    const outputFileName = relativePath.replace(/\//g, '--').replace('.json', '.enriched.json');
    const outputPath = path.join(ENRICHED_DIR, outputFileName);
    await fs.writeFile(outputPath, JSON.stringify(enrichment, null, 2), 'utf-8');

    // Also write a markdown version for easy reading
    const mdContent = generateMarkdown(enrichment, response);
    const mdPath = outputPath.replace('.enriched.json', '.enriched.md');
    await fs.writeFile(mdPath, mdContent, 'utf-8');

    // Update cache
    cache.entries[relativePath] = {
      sha256: contentHash,
      enrichedAt: new Date().toISOString(),
      outputFile: outputFileName,
    };

    return true;
  } catch (err) {
    console.error(`    Error enriching ${relativePath}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function generateMarkdown(enrichment: EnrichmentResult, rawResponse: string): string {
  const lines: string[] = [
    `---`,
    `# Auto-generated by ai-enrich.ts`,
    `# Source: ${enrichment.sourceFile}`,
    `# Generated: ${enrichment.generatedAt}`,
    `---`,
    '',
    `# ${enrichment.module}`,
    '',
    rawResponse,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== AI Enrichment Orchestrator ===\n');

  const forceAll = process.argv.includes('--force');
  if (forceAll) {
    console.log('Force mode: re-processing all files\n');
  }

  // Verify API key is set
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... tsx scripts/ai-enrich.ts');
    process.exit(1);
  }

  // Ensure output directory exists
  await fs.mkdir(ENRICHED_DIR, { recursive: true });

  // Load cache
  const cache = await loadCache();
  console.log(`Cache entries: ${Object.keys(cache.entries).length}`);

  // Collect metadata files
  const metadataFiles = await collectMetadataFiles();
  console.log(`Metadata files to process: ${metadataFiles.length}\n`);

  if (metadataFiles.length === 0) {
    console.log('No metadata files found. Run the parsing scripts first:');
    console.log('  npm run generate:all');
    return;
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of metadataFiles) {
    try {
      const wasProcessed = await enrichFile(file, cache, forceAll);
      if (wasProcessed) {
        processed++;
        // Rate limiting: wait between API calls
        await sleep(API_DELAY_MS);
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save updated cache
  cache.lastRun = new Date().toISOString();
  await saveCache(cache);

  console.log('\n=== Enrichment complete ===');
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Cache saved to: ${CACHE_FILE}`);
}

main().catch((err) => {
  console.error('Fatal error during AI enrichment:', err);
  process.exit(1);
});
