/**
 * generate-db-sproc-pages.ts
 *
 * Generates per-module stored procedure reference MDX pages and static JSON
 * files from the parsed stored-procedures-full.json.
 *
 * Inputs:
 *   - generated/db-schema/stored-procedures-full.json — 5,028 SPs grouped by module
 *
 * Optional:
 *   - generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json — AI enrichment
 *
 * Outputs:
 *   - docs/database/modules/sprocs/<slug>-sprocs.mdx  (one per module)
 *   - static/sproc-detail-data/<slug>.json            (one per module)
 *
 * Usage: tsx scripts/generate-db-sproc-pages.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_SCHEMA_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');
const ENRICHED_DIR = path.join(
  PROJECT_ROOT,
  'generated',
  'ai-enriched',
  'db-schema',
  'per-module-sprocs',
);
const SPROCS_DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'database', 'modules', 'sprocs');
const STATIC_DIR = path.join(PROJECT_ROOT, 'static', 'sproc-detail-data');

// ── Types ────────────────────────────────────────────────────────────────────

interface Parameter {
  name: string;
  dataType: string;
  direction: string;
  defaultValue: string | null;
}

interface AntiPatterns {
  hasCursor: boolean;
  hasSelectStar: boolean;
  hasDynamicSql: boolean;
  hasNolock: boolean;
  nolockCount: number;
  missingSetNocountOn: boolean;
  hasTableVariable: boolean;
  hasTempTable: boolean;
  hasWhileLoop: boolean;
  hasNoTryCatch: boolean;
}

interface Procedure {
  name: string;
  schema: string;
  parameters: Parameter[];
  lineCount: number;
  bodyPreview: string;
  tablesReferenced: string[];
  sprocsCalledFromBody: string[];
  crudType: string;
  antiPatterns: AntiPatterns;
  calledFromCode: string[];
  complexity: string;
  aiEnrichment: any | null;
}

interface SprocModule {
  prefix: string;
  displayName: string;
  procedureCount: number;
  procedures: Procedure[];
}

interface SprocData {
  exportDate: string;
  source: string;
  totalProcedures: number;
  stats: {
    bySchema: Record<string, number>;
    byCrudType: Record<string, number>;
    byComplexity: Record<string, number>;
    antiPatternCounts: Record<string, number>;
  };
  modules: SprocModule[];
}

interface SprocEnrichmentDetail {
  name: string;
  summary?: string;
  businessPurpose?: string;
  optimizationRecommendations?: string[];
  migrationRelevance?: string;
}

interface ModuleSprocEnrichment {
  module: string;
  displayName: string;
  generatedAt: string;
  procedures?: SprocEnrichmentDetail[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

// ── Anti-pattern aggregation ─────────────────────────────────────────────────

interface AntiPatternSummary {
  cursors: number;
  selectStar: number;
  dynamicSql: number;
  nolock: number;
  nolockOccurrences: number;
  tableVariables: number;
  whileLoops: number;
  missingSetNocountOn: number;
  noTryCatch: number;
}

function aggregateAntiPatterns(procedures: Procedure[]): AntiPatternSummary {
  const summary: AntiPatternSummary = {
    cursors: 0,
    selectStar: 0,
    dynamicSql: 0,
    nolock: 0,
    nolockOccurrences: 0,
    tableVariables: 0,
    whileLoops: 0,
    missingSetNocountOn: 0,
    noTryCatch: 0,
  };

  for (const p of procedures) {
    const ap = p.antiPatterns;
    if (ap.hasCursor) summary.cursors++;
    if (ap.hasSelectStar) summary.selectStar++;
    if (ap.hasDynamicSql) summary.dynamicSql++;
    if (ap.hasNolock) {
      summary.nolock++;
      summary.nolockOccurrences += ap.nolockCount || 0;
    }
    if (ap.hasTableVariable) summary.tableVariables++;
    if (ap.hasWhileLoop) summary.whileLoops++;
    if (ap.missingSetNocountOn) summary.missingSetNocountOn++;
    if (ap.hasNoTryCatch) summary.noTryCatch++;
  }

  return summary;
}

// ── CRUD type aggregation ────────────────────────────────────────────────────

interface CrudCounts {
  get: number;
  insert: number;
  update: number;
  delete: number;
  report: number;
  mixed: number;
}

function aggregateCrudTypes(procedures: Procedure[]): CrudCounts {
  const counts: CrudCounts = { get: 0, insert: 0, update: 0, delete: 0, report: 0, mixed: 0 };
  for (const p of procedures) {
    const key = p.crudType as keyof CrudCounts;
    if (key in counts) {
      counts[key]++;
    } else {
      counts.mixed++;
    }
  }
  return counts;
}

// ── MDX generation ───────────────────────────────────────────────────────────

function generateSprocModuleMdx(
  mod: SprocModule,
  position: number,
  timestamp: string,
): string {
  const slug = slugify(mod.displayName);
  const crud = aggregateCrudTypes(mod.procedures);
  const ap = aggregateAntiPatterns(mod.procedures);

  // Anti-pattern table rows — only include non-zero counts
  const antiPatternRows: string[] = [];
  if (ap.cursors > 0) {
    antiPatternRows.push(`| Cursors | ${ap.cursors} | Critical |`);
  }
  if (ap.selectStar > 0) {
    antiPatternRows.push(`| SELECT * | ${ap.selectStar} | High |`);
  }
  if (ap.dynamicSql > 0) {
    antiPatternRows.push(`| Dynamic SQL | ${ap.dynamicSql} | High |`);
  }
  if (ap.nolock > 0) {
    antiPatternRows.push(
      `| NOLOCK usage | ${ap.nolock} (${ap.nolockOccurrences} occurrences) | Medium |`,
    );
  }
  if (ap.tableVariables > 0) {
    antiPatternRows.push(`| Table Variables | ${ap.tableVariables} | Medium |`);
  }
  if (ap.whileLoops > 0) {
    antiPatternRows.push(`| WHILE Loops | ${ap.whileLoops} | Medium |`);
  }
  if (ap.missingSetNocountOn > 0) {
    antiPatternRows.push(`| Missing SET NOCOUNT ON | ${ap.missingSetNocountOn} | Low |`);
  }
  if (ap.noTryCatch > 0) {
    antiPatternRows.push(`| No TRY/CATCH | ${ap.noTryCatch} | Low |`);
  }

  // Anti-pattern summary section
  let antiPatternSection = '';
  if (antiPatternRows.length > 0) {
    antiPatternSection = `## Anti-Pattern Summary

| Pattern | Count | Severity |
|---------|-------|----------|
${antiPatternRows.join('\n')}
`;
  }

  // Optimization priorities — grouped by severity, skip zero counts
  const optimizationSections: string[] = [];

  // Critical
  const criticalItems: string[] = [];
  if (ap.cursors > 0) {
    criticalItems.push(
      `- **${ap.cursors} procedure${ap.cursors !== 1 ? 's' : ''} use cursors** — replace with set-based operations`,
    );
  }
  if (ap.dynamicSql > 0) {
    criticalItems.push(
      `- **${ap.dynamicSql} procedure${ap.dynamicSql !== 1 ? 's' : ''} use dynamic SQL** — parameterize queries`,
    );
  }
  if (criticalItems.length > 0) {
    optimizationSections.push(`### Critical\n\n${criticalItems.join('\n')}`);
  }

  // High Priority
  const highItems: string[] = [];
  if (ap.selectStar > 0) {
    highItems.push(
      `- **${ap.selectStar} procedure${ap.selectStar !== 1 ? 's' : ''} use SELECT \\*** — specify column lists`,
    );
  }
  if (highItems.length > 0) {
    optimizationSections.push(`### High Priority\n\n${highItems.join('\n')}`);
  }

  // Medium Priority
  const mediumItems: string[] = [];
  if (ap.nolock > 0) {
    mediumItems.push(
      `- **${ap.nolock} procedure${ap.nolock !== 1 ? 's' : ''} use NOLOCK** (${ap.nolockOccurrences} total occurrences) — audit for data consistency risks`,
    );
  }
  if (ap.tableVariables > 0) {
    mediumItems.push(
      `- **${ap.tableVariables} procedure${ap.tableVariables !== 1 ? 's' : ''} use table variables** — consider temp tables for large datasets`,
    );
  }
  if (ap.whileLoops > 0) {
    mediumItems.push(
      `- **${ap.whileLoops} procedure${ap.whileLoops !== 1 ? 's' : ''} use WHILE loops** — evaluate for set-based alternatives`,
    );
  }
  if (mediumItems.length > 0) {
    optimizationSections.push(`### Medium Priority\n\n${mediumItems.join('\n')}`);
  }

  // Low Priority
  const lowItems: string[] = [];
  if (ap.missingSetNocountOn > 0) {
    lowItems.push(
      `- **${ap.missingSetNocountOn} procedure${ap.missingSetNocountOn !== 1 ? 's' : ''} missing SET NOCOUNT ON** — add for reduced network traffic`,
    );
  }
  if (ap.noTryCatch > 0) {
    lowItems.push(
      `- **${ap.noTryCatch} procedure${ap.noTryCatch !== 1 ? 's' : ''} ${ap.noTryCatch !== 1 ? 'lack' : 'lacks'} TRY/CATCH** — add structured error handling`,
    );
  }
  if (lowItems.length > 0) {
    optimizationSections.push(`### Low Priority\n\n${lowItems.join('\n')}`);
  }

  let optimizationSection = '';
  if (optimizationSections.length > 0) {
    optimizationSection = `## Optimization Priorities\n\n${optimizationSections.join('\n\n')}
`;
  }

  // Build CRUD summary line
  const crudParts: string[] = [];
  if (crud.get > 0) crudParts.push(`**${crud.get}** GET`);
  if (crud.insert > 0) crudParts.push(`**${crud.insert}** INSERT`);
  if (crud.update > 0) crudParts.push(`**${crud.update}** UPDATE`);
  if (crud.delete > 0) crudParts.push(`**${crud.delete}** DELETE`);
  if (crud.report > 0) crudParts.push(`**${crud.report}** Report`);
  if (crud.mixed > 0) crudParts.push(`**${crud.mixed}** Mixed`);
  const crudLine = crudParts.join(' | ');

  const tablePageSlug = slugify(mod.displayName);

  return `---
title: "${mod.displayName} — Stored Procedures"
sidebar_label: "${mod.displayName} (${mod.procedureCount})"
sidebar_position: ${position}
description: "${mod.procedureCount} stored procedure${mod.procedureCount !== 1 ? 's' : ''} in the ${mod.displayName} module"
---

import SprocDetail from '@site/src/components/SprocDetail';

# ${mod.displayName} — Stored Procedures

> **${mod.procedureCount}** stored procedure${mod.procedureCount !== 1 ? 's' : ''} | ${crudLine}

> Related: [${mod.displayName} Tables](../${tablePageSlug}) — view the database tables for this module

${antiPatternSection}
${optimizationSection}
## Stored Procedures

<SprocDetail
  dataUrl="/sproc-detail-data/${slug}.json"
  generatedAt="${timestamp}"
/>
`;
}

// ── Static JSON generation ───────────────────────────────────────────────────

function generateStaticJson(
  mod: SprocModule,
  enrichmentMap: Map<string, SprocEnrichmentDetail>,
): object {
  // Strip bodyPreview from procedures (too large for client-side loading)
  // and merge enrichment data when available
  const procedures = mod.procedures.map((p) => {
    const { bodyPreview, ...rest } = p;
    const base = { ...rest, module: mod.prefix };
    const enrichment = enrichmentMap.get(p.name);
    if (enrichment) {
      return {
        ...base,
        ...(enrichment.summary && { summary: enrichment.summary }),
        ...(enrichment.businessPurpose && { businessPurpose: enrichment.businessPurpose }),
        ...(enrichment.optimizationRecommendations && {
          optimizationRecommendations: enrichment.optimizationRecommendations,
        }),
        ...(enrichment.migrationRelevance && { migrationRelevance: enrichment.migrationRelevance }),
      };
    }
    return base;
  });

  return {
    module: mod.prefix,
    displayName: mod.displayName,
    procedureCount: mod.procedureCount,
    procedures,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('Generating stored procedure reference pages...');

  // ── Load input data ──────────────────────────────────────────────────────

  const sprocPath = path.join(DB_SCHEMA_DIR, 'stored-procedures-full.json');

  if (!(await fileExists(sprocPath))) {
    console.error(
      'Error: stored-procedures-full.json not found. Run the SP parser first.',
    );
    process.exit(1);
  }

  const sprocData = await readJson<SprocData>(sprocPath);
  console.log(
    `  Loaded stored-procedures-full.json (${sprocData.totalProcedures.toLocaleString()} procedures, ${sprocData.modules.length} modules)`,
  );

  // Load optional AI enrichment data
  const enrichmentByModule = new Map<string, Map<string, SprocEnrichmentDetail>>();
  if (await fileExists(ENRICHED_DIR)) {
    const enrichFiles = (await fs.readdir(ENRICHED_DIR)).filter((f) =>
      f.endsWith('.json'),
    );
    for (const file of enrichFiles) {
      try {
        const data = await readJson<ModuleSprocEnrichment>(
          path.join(ENRICHED_DIR, file),
        );
        if (data.module && data.procedures) {
          const procMap = new Map<string, SprocEnrichmentDetail>();
          for (const p of data.procedures) {
            procMap.set(p.name, p);
          }
          enrichmentByModule.set(data.module, procMap);
        }
      } catch {
        // Skip malformed enrichment files
      }
    }
    if (enrichmentByModule.size > 0) {
      console.log(
        `  Loaded AI enrichment for ${enrichmentByModule.size} modules`,
      );
    }
  }

  // ── Create output directories ──────────────────────────────────────────

  await fs.mkdir(SPROCS_DOCS_DIR, { recursive: true });
  await fs.mkdir(STATIC_DIR, { recursive: true });

  const timestamp = new Date().toISOString();
  let mdxCount = 0;
  let jsonCount = 0;

  // ── Generate per-module pages ──────────────────────────────────────────

  console.log(
    `  Generating ${sprocData.modules.length} module SP pages in docs/database/modules/sprocs/`,
  );

  for (let i = 0; i < sprocData.modules.length; i++) {
    const mod = sprocData.modules[i];
    const slug = slugify(mod.displayName);
    const position = i + 1;

    // Generate MDX page
    const mdx = generateSprocModuleMdx(mod, position, timestamp);
    await fs.writeFile(
      path.join(SPROCS_DOCS_DIR, `${slug}-sprocs.mdx`),
      mdx,
      'utf-8',
    );
    mdxCount++;

    // Generate static JSON
    const enrichment = enrichmentByModule.get(mod.prefix) || new Map();
    const staticJson = generateStaticJson(mod, enrichment);
    await fs.writeFile(
      path.join(STATIC_DIR, `${slug}.json`),
      JSON.stringify(staticJson),
      'utf-8',
    );
    jsonCount++;

    // Compute anti-pattern total for log
    const ap = aggregateAntiPatterns(mod.procedures);
    const apTotal =
      ap.cursors +
      ap.selectStar +
      ap.dynamicSql +
      ap.nolock +
      ap.tableVariables +
      ap.whileLoops +
      ap.missingSetNocountOn +
      ap.noTryCatch;

    console.log(
      `    ${slug}-sprocs.mdx (${mod.procedureCount} SPs, ${apTotal} anti-pattern findings)`,
    );
  }

  // ── Generate _category_.json for sidebar ───────────────────────────────

  const categoryJson = {
    label: 'Stored Procedures',
    position: 50,
    link: {
      type: 'generated-index',
      description:
        `${sprocData.totalProcedures.toLocaleString()} stored procedures across ${sprocData.modules.length} modules, with anti-pattern analysis and optimization priorities.`,
    },
  };
  await fs.writeFile(
    path.join(SPROCS_DOCS_DIR, '_category_.json'),
    JSON.stringify(categoryJson, null, 2),
    'utf-8',
  );
  console.log('  Generated docs/database/modules/sprocs/_category_.json');

  // ── Done ───────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s — ${mdxCount} MDX pages + ${jsonCount} JSON files generated`,
  );
}

main().catch((err) => {
  console.error('Fatal error generating SP reference pages:', err);
  process.exit(1);
});
