/**
 * generate-db-pages.ts
 *
 * Generates MDX documentation pages and static JSON files from the parsed
 * database schema and SP reconciliation data.
 *
 * Inputs (all in generated/db-schema/):
 *   - tables.json       — 2,284 tables grouped into ~23 modules
 *   - sproc-reconciliation.json — SP matching data
 *   - table-sproc-mapping.json  — Module-level SP mappings
 *   - summary.json      — Object counts
 *   - indexes.json      — All indexes
 *   - triggers.json     — All triggers
 *
 * Optional:
 *   - generated/ai-enriched/db-schema/per-module/*.json — AI enrichment
 *
 * Outputs:
 *   - docs/database/overview.mdx
 *   - docs/database/explorer.mdx
 *   - docs/database/sproc-reconciliation.mdx
 *   - docs/database/health.mdx
 *   - docs/database/modules/<slug>.mdx  (one per module)
 *   - static/db-explorer-data.json
 *   - static/sproc-reconciliation-data.json
 *   - static/schema-health-data.json
 *
 * Usage: tsx scripts/generate-db-pages.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_SCHEMA_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');
const ENRICHED_DIR = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'db-schema', 'per-module');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'database');
const MODULES_DIR = path.join(DOCS_DIR, 'modules');
const STATIC_DIR = path.join(PROJECT_ROOT, 'static');

// ── Types ────────────────────────────────────────────────────────────────────

interface ForeignKey {
  constraintName: string;
  referencedTable: string;
  columns?: string[];
  referencedColumns?: string[];
}

interface ColumnDef {
  name: string;
  dataType: string;
  rawType: string;
  maxLength: string | null;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}

interface Index {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  keyColumns: string[];
  includedColumns: string[];
}

interface Table {
  name: string;
  schema: string;
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  columns?: ColumnDef[];
  foreignKeys: ForeignKey[];
  indexes: Index[];
  checkConstraints: any[];
  defaultConstraints: number;
  uniqueConstraints: any[];
  triggers: any[];
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

interface SprocReconciliation {
  generatedAt: string;
  totalDbSprocs: number;
  totalCodeSprocs: number;
  matched: number;
  matchedExact: number;
  matchedFuzzy: number;
  multiSchemaMatches: number;
  orphanDbCount: number;
  orphanCodeCount: number;
  orphanDb: { name: string; schema: string }[];
  orphanCode: { name: string; calledFrom: string[] }[];
  crossReference: {
    sprocName: string;
    dbSchema: string;
    dbSchemas: string[];
    matchType: string;
    calledFromFiles: string[];
    calledFromMethods: string[];
    calledFromProjects: string[];
    module: string;
  }[];
}

interface SummaryData {
  exportDate: string;
  source: string;
  objectCounts?: Record<string, number>;
  // New flat-key format from SQL parser
  totalStoredProcedures?: number;
  totalFunctions?: number;
  totalViews?: number;
  totalColumns?: number;
  totalForeignKeys?: number;
  totalIndexes?: number;
  totalTriggers?: number;
  totalDefaultConstraints?: number;
  schemas: string[];
  moduleCount: number;
  modules: { prefix: string; displayName: string; tableCount: number }[];
  partitions?: { tableName: string; partitionScheme: string; partitionFunction: string }[];
}

interface IndexesData {
  exportDate: string;
  totalIndexes: number;
  byType: Record<string, number>;
  stats: {
    totalPrimaryKeys: number;
    totalUniqueIndexes: number;
    totalDisabledIndexes: number;
    totalWithIncludedColumns: number;
  };
  indexes: {
    schema: string;
    tableName: string;
    fullTableName: string;
    indexName: string;
    indexType: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    isDisabled: boolean;
    keyColumns: string[];
    includedColumns: string[];
  }[];
}

interface TriggersData {
  exportDate: string;
  totalTriggers: number;
  disabledCount: number;
  insteadOfCount: number;
  triggers: {
    name: string;
    schema: string;
    parentTable: string;
    parentSchema: string;
    fullParentTable: string;
    isDisabled: boolean;
    isInsteadOf: boolean;
  }[];
}

interface TableEnrichmentDetail {
  name: string;
  summary?: string;
  businessPurpose?: string;
  dataSensitivity?: string;
  migrationRelevance?: string;
  migrationNote?: string;
  complexity?: string;
}

interface ModuleEnrichment {
  module: string;
  displayName: string;
  generatedAt: string;
  overview?: string;
  keyWorkflows?: string[];
  schemaHealthNotes?: string[];
  tableAnnotations?: Record<string, { purpose?: string; migrationNote?: string }>;
  tableDetail?: TableEnrichmentDetail[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Sanitize a name for use as a Mermaid entity identifier. */
function mermaidSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
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

function pct(part: number, total: number): string {
  if (total === 0) return '0';
  return ((part / total) * 100).toFixed(1);
}

/**
 * Determine the referenced parent table name from an FK constraint.
 *
 * The parsed data has a `referencedTable` field that is sometimes:
 *   - An actual table name (e.g. "SEC_Departments")
 *   - "(system-named)" for system-generated constraints
 *   - The FK constraint name itself (a parsing artifact)
 *
 * We try to extract a valid table name. If it looks like a constraint name
 * or is "(system-named)", we attempt to parse it from the constraintName
 * using the common pattern FK_ChildTable_ParentTable.
 */
function resolveReferencedTable(fk: ForeignKey, childTableName: string): string | null {
  let ref = fk.referencedTable;

  // Clearly not a table name
  if (ref === '(system-named)' || !ref) {
    return parseTableFromConstraintName(fk.constraintName, childTableName);
  }

  // If it starts with "FK_" or "fkey_", it's likely a constraint name, not a table
  if (/^(FK_|fkey_)/i.test(ref)) {
    return parseTableFromConstraintName(fk.constraintName, childTableName);
  }

  // Strip schema prefix if present (e.g., "dbo.SEC_Users" → "SEC_Users")
  if (ref.includes('.')) {
    ref = ref.split('.').pop()!;
  }

  return ref;
}

/**
 * Try to extract a parent table name from a constraint name.
 * Common patterns:
 *   FK_ChildTable_ParentTable_...
 *   FK_ParentTable_ChildTable_FK1
 *   FK__ChildTable__col__hash
 */
function parseTableFromConstraintName(constraintName: string, childTableName: string): string | null {
  // Pattern: FK_ChildTable_ParentTable... (common)
  const fkMatch = constraintName.match(/^FK_([^_]+(?:_[^_]+)*)_([^_]+(?:_[^_]+)*?)(?:_FK\d*)?$/i);
  if (fkMatch) {
    const part1 = fkMatch[1];
    const part2 = fkMatch[2];
    // One of these should be the child, the other the parent
    if (part1 === childTableName) return part2;
    if (part2 === childTableName) return part1;
    // Return part2 as a guess (common: FK_Child_Parent)
    return part2;
  }

  // Pattern: FK__tableName__col__hash (system-generated)
  // These rarely give us useful parent info
  return null;
}

// ── Static JSON generators ──────────────────────────────────────────────────

function generateExplorerData(tablesData: TablesData): { nodes: any[]; links: any[] } {
  const nodes: any[] = [];
  const links: any[] = [];
  const allTableNames = new Set<string>();

  // Collect all table fullNames for link validation
  for (const mod of tablesData.modules) {
    for (const t of mod.tables) {
      allTableNames.add(t.fullName);
    }
  }

  for (const mod of tablesData.modules) {
    for (const t of mod.tables) {
      nodes.push({
        id: t.fullName,
        name: t.name,
        module: mod.prefix,
        hasPK: t.hasPrimaryKey,
        columnCount: t.columns?.length ?? 0,
        fkCount: t.foreignKeys.length,
        indexCount: t.indexes.length,
      });

      for (const fk of t.foreignKeys) {
        const parentTable = resolveReferencedTable(fk, t.name);
        if (!parentTable) continue;

        // Resolve the parent table's fullName by searching in the schema
        const parentFullName = `${t.schema}.${parentTable}`;
        if (allTableNames.has(parentFullName)) {
          links.push({
            source: t.fullName,
            target: parentFullName,
            constraintName: fk.constraintName,
            sourceColumns: fk.columns ?? [],
            targetColumns: fk.referencedColumns ?? [],
          });
        }
      }
    }
  }

  return { nodes, links };
}

function generateSchemaHealthData(
  tablesData: TablesData,
  indexesData: IndexesData,
  triggersData: TriggersData,
  summaryData: SummaryData,
): any {
  const allTables = tablesData.modules.flatMap((m) => m.tables);

  // Tables without primary keys
  const tablesNoPK = allTables
    .filter((t) => !t.hasPrimaryKey)
    .map((t) => ({ name: t.name, fullName: t.fullName, schema: t.schema }));

  // Tables without any indexes
  const tablesNoIndex = allTables
    .filter((t) => t.indexes.length === 0)
    .map((t) => ({ name: t.name, fullName: t.fullName, schema: t.schema }));

  // Disabled indexes
  const disabledIndexes = indexesData.indexes
    .filter((i: any) => i.isDisabled)
    .map((i: any) => ({
      indexName: i.indexName,
      tableName: i.tableName,
      fullTableName: i.fullTableName,
      type: i.indexType ?? (i.isClustered ? 'CLUSTERED' : 'NONCLUSTERED'),
    }));

  // Naming convention issues: tables not following ModulePrefix_ pattern
  const knownPrefixes = tablesData.modules
    .map((m) => m.prefix)
    .filter((p) => p !== '(uncategorized)');
  const namingIssues = allTables
    .filter((t) => {
      const name = t.name;
      // Skip if the table matches a known prefix
      return !knownPrefixes.some((p) => name.startsWith(`${p}_`));
    })
    .map((t) => ({ name: t.name, fullName: t.fullName }));

  // Tables with triggers (handle both old and new trigger formats)
  const tablesWithTriggers = triggersData.triggers.map((tr: any) => ({
    triggerName: tr.name,
    tableName: tr.parentTable ?? tr.tableName,
    fullTableName: tr.fullParentTable,
    isDisabled: tr.isDisabled ?? false,
    isInsteadOf: tr.isInsteadOf ?? false,
  }));

  // Module-level health summary
  const moduleHealth = tablesData.modules.map((mod) => {
    const withPK = mod.tables.filter((t) => t.hasPrimaryKey).length;
    const totalFKs = mod.tables.reduce((s, t) => s + t.foreignKeys.length, 0);
    const totalIndexes = mod.tables.reduce((s, t) => s + t.indexes.length, 0);
    const withIndex = mod.tables.filter((t) => t.indexes.length > 0).length;
    const avgIndexesPerTable = mod.tableCount > 0 ? totalIndexes / mod.tableCount : 0;
    return {
      module: `${mod.displayName} (${mod.prefix}_)`,
      tableCount: mod.tableCount,
      pkCoverage: parseFloat(pct(withPK, mod.tableCount)),
      indexCoverage: parseFloat(pct(withIndex, mod.tableCount)),
      avgIndexesPerTable,
      fkCount: totalFKs,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalTables: tablesData.totalTables,
    objectCounts: summaryData.objectCounts ?? {},
    tablesNoPK,
    tablesNoIndex,
    disabledIndexes,
    namingIssues: namingIssues.slice(0, 100), // Cap for size
    tablesWithTriggers,
    moduleHealth,
    stats: {
      tablesWithPK: allTables.filter((t) => t.hasPrimaryKey).length,
      tablesWithIndex: allTables.filter((t) => t.indexes.length > 0).length,
      totalFKs: summaryData.totalForeignKeys ?? (summaryData.objectCounts ?? {})['Foreign Key Constraints'] ?? 0,
      totalDisabledIndexes: indexesData.stats?.totalDisabledIndexes ?? 0,
      totalTriggers: summaryData.totalTriggers ?? triggersData.totalTriggers,
      totalIndexes: indexesData.totalIndexes ?? 0,
    },
  };
}

function generateSprocReconciliationData(sprocData: SprocReconciliation): any {
  return {
    generatedAt: sprocData.generatedAt,
    totalDbSprocs: sprocData.totalDbSprocs,
    totalCodeSprocs: sprocData.totalCodeSprocs,
    matched: sprocData.matched,
    matchedExact: sprocData.matchedExact,
    matchedFuzzy: sprocData.matchedFuzzy,
    multiSchemaMatches: sprocData.multiSchemaMatches,
    orphanDbCount: sprocData.orphanDbCount,
    orphanCodeCount: sprocData.orphanCodeCount,
    orphanDb: sprocData.orphanDb,
    orphanCode: sprocData.orphanCode,
    crossReference: sprocData.crossReference,
  };
}

// ── Mermaid ER Diagram ──────────────────────────────────────────────────────

function generateMermaidER(tables: Table[], maxTables: number = 20): string {
  // Build a set of all table names in this module
  const tableNames = new Set(tables.map((t) => t.name));

  // Count FK connections per table (as parent or child)
  const connectionCount = new Map<string, number>();
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      const parent = resolveReferencedTable(fk, t.name);
      if (parent && tableNames.has(parent)) {
        connectionCount.set(t.name, (connectionCount.get(t.name) || 0) + 1);
        connectionCount.set(parent, (connectionCount.get(parent) || 0) + 1);
      }
    }
  }

  if (connectionCount.size === 0) {
    return '    %% No FK relationships in this module';
  }

  // Sort by connection count descending, take top maxTables
  const topTables = [...connectionCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTables)
    .map(([name]) => name);
  const topSet = new Set(topTables);

  // Build entity attribute blocks (PK + FK columns, max 5 per table)
  const entityLines: string[] = [];
  for (const t of tables) {
    if (!topSet.has(t.name)) continue;
    if (!t.columns || t.columns.length === 0) continue;
    const fkColNames = new Set(t.foreignKeys.flatMap((fk) => fk.columns ?? []));
    const keyColumns = t.columns
      .filter((c) => c.isPrimaryKey || fkColNames.has(c.name))
      .slice(0, 5);
    if (keyColumns.length > 0) {
      const safe = mermaidSafe(t.name);
      entityLines.push(`    ${safe} {`);
      for (const col of keyColumns) {
        const marker = col.isPrimaryKey ? 'PK' : 'FK';
        const typeSafe = col.dataType.replace(/[^a-zA-Z0-9]/g, '');
        entityLines.push(`        ${typeSafe} ${col.name} ${marker}`);
      }
      entityLines.push(`    }`);
    }
  }

  // Build relationship lines
  const relLines: string[] = [];
  const seen = new Set<string>();

  for (const t of tables) {
    if (!topSet.has(t.name)) continue;
    for (const fk of t.foreignKeys) {
      const parent = resolveReferencedTable(fk, t.name);
      if (!parent || !topSet.has(parent)) continue;

      // Deduplicate
      const key = `${t.name}|${parent}|${fk.constraintName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const childSafe = mermaidSafe(t.name);
      const parentSafe = mermaidSafe(parent);

      // Use FK column name as label when available, fall back to constraint name
      let label = fk.columns ? fk.columns.join(',') : fk.constraintName;
      if (label.length > 30) {
        label = label.slice(0, 27) + '...';
      }
      label = label.replace(/"/g, "'");

      relLines.push(`    ${parentSafe} ||--o{ ${childSafe} : "${label}"`);
    }
  }

  if (relLines.length === 0) {
    return '    %% No FK relationships in this module';
  }

  return [...entityLines, ...relLines].join('\n');
}

// ── MDX Page Generators ─────────────────────────────────────────────────────

function generateOverviewMdx(
  tablesData: TablesData,
  summaryData: SummaryData,
  indexesData: IndexesData,
  triggersData: TriggersData,
): string {
  const allTables = tablesData.modules.flatMap((m) => m.tables);
  const totalTables = tablesData.totalTables;
  const oc = summaryData.objectCounts ?? {};
  const totalSprocs = summaryData.totalStoredProcedures ?? oc['Stored Procedures'] ?? 0;
  const totalFunctions = summaryData.totalFunctions ??
    ((oc['Scalar Functions'] ?? 0) +
    (oc['Inline Table Valued Functions'] ?? 0) +
    (oc['Table Valued Functions'] ?? 0) +
    (oc['CLR Scalar Functions'] ?? 0));
  const totalViews = summaryData.totalViews ?? oc['Views'] ?? 0;
  const totalTriggers = summaryData.totalTriggers ?? triggersData.totalTriggers;
  const totalColumns = summaryData.totalColumns ?? allTables.reduce((s, t) => s + (t.columns?.length ?? 0), 0);

  const tablesWithPK = allTables.filter((t) => t.hasPrimaryKey).length;
  const tablesWithIndex = allTables.filter((t) => t.indexes.length > 0).length;
  const fkCount = summaryData.totalForeignKeys ?? oc['Foreign Key Constraints'] ?? 0;
  const disabledIndexes = indexesData.stats?.totalDisabledIndexes ?? 0;

  // Module breakdown table rows
  const moduleRows = tablesData.modules
    .map((mod) => {
      const withPK = mod.tables.filter((t) => t.hasPrimaryKey).length;
      const totalFKs = mod.tables.reduce((s, t) => s + t.foreignKeys.length, 0);
      const totalIdx = mod.tables.reduce((s, t) => s + t.indexes.length, 0);
      const slug = slugify(mod.displayName);
      return `| [${mod.displayName}](./modules/${slug}) | ${mod.tableCount} | ${withPK}/${mod.tableCount} (${pct(withPK, mod.tableCount)}%) | ${totalFKs} | ${totalIdx} |`;
    })
    .join('\n');

  return `---
title: "Database Schema Overview"
sidebar_label: "Overview"
sidebar_position: 1
description: "MyEvaluations database schema overview — ${totalTables.toLocaleString()} tables, ${totalSprocs.toLocaleString()} stored procedures"
---

import SchemaHealth from '@site/src/components/SchemaHealth';

# Database Schema Overview

The MyEvaluations database contains **${totalTables.toLocaleString()} tables** with **${totalColumns.toLocaleString()} columns**, **${totalSprocs.toLocaleString()} stored procedures**, **${totalFunctions.toLocaleString()} functions**, **${totalViews.toLocaleString()} views**, and **${totalTriggers} triggers** across ${tablesData.schemas.length} schemas (\`${tablesData.schemas.join('`, `')}\`).

## Schema Health Dashboard

<SchemaHealth />

## Module Breakdown

| Module | Tables | PK Coverage | FKs | Indexes |
|--------|-------:|:-----------:|----:|--------:|
${moduleRows}

## Key Statistics

- **${tablesWithPK}** of ${totalTables} tables (${pct(tablesWithPK, totalTables)}%) have a primary key
- **${tablesWithIndex}** of ${totalTables} tables (${pct(tablesWithIndex, totalTables)}%) have at least one index
- **${disabledIndexes}** indexes are currently disabled
- **${fkCount.toLocaleString()}** foreign key relationships connect the schema${summaryData.partitions && summaryData.partitions.length > 0 ? `\n- **${summaryData.partitions.length}** tables use monthly partitioning (\`${summaryData.partitions.map((p) => p.tableName).join('`, `')}\`)` : ''}

## Explore Further

- [**Schema Explorer**](./explorer) — Interactive D3 graph of tables and FK relationships
- [**SP Reconciliation**](./sproc-reconciliation) — Gap analysis between DB and code-side SPs
- [**Schema Health**](./health) — Tables without PKs, disabled indexes, naming issues
`;
}

function generateExplorerMdx(): string {
  return `---
title: "Schema Explorer"
sidebar_label: "Schema Explorer"
sidebar_position: 2
description: "Interactive D3 graph of database tables and FK relationships"
---

import DatabaseExplorer from '@site/src/components/DatabaseExplorer';

# Schema Explorer

Explore the MyEvaluations database schema as an interactive force-directed graph. Tables are nodes (colored by module), foreign keys are edges.

**Controls:** Filter by module, search by table name, click a node for details. Scroll to zoom, drag to pan.

<DatabaseExplorer />
`;
}

function generateSprocReconciliationMdx(sprocData: SprocReconciliation): string {
  return `---
title: "Stored Procedure Reconciliation"
sidebar_label: "SP Reconciliation"
sidebar_position: 3
description: "Bidirectional analysis of ${sprocData.totalDbSprocs.toLocaleString()} DB-side vs ${sprocData.totalCodeSprocs.toLocaleString()} code-side stored procedures"
---

import SprocReconciliation from '@site/src/components/SprocReconciliation';

# Stored Procedure Reconciliation

This analysis compares **${sprocData.totalDbSprocs.toLocaleString()} stored procedures** found in the SQL Server schema with **${sprocData.totalCodeSprocs.toLocaleString()} stored procedures** referenced in the .NET application code.

<SprocReconciliation
  totalDbSprocs={${sprocData.totalDbSprocs}}
  totalCodeSprocs={${sprocData.totalCodeSprocs}}
/>
`;
}

function generateHealthMdx(totalTables: number): string {
  return `---
title: "Schema Health"
sidebar_label: "Schema Health"
sidebar_position: 4
description: "Database schema health analysis — PK coverage, index coverage, naming issues"
---

import SchemaHealth from '@site/src/components/SchemaHealth';

# Schema Health Analysis

Comprehensive analysis of database schema quality across ${totalTables.toLocaleString()} tables.

<SchemaHealth />
`;
}

function generateModuleMdx(
  mod: Module,
  position: number,
  enrichment: ModuleEnrichment | null,
  timestamp: string,
): string {
  const pkCount = mod.tables.filter((t) => t.hasPrimaryKey).length;
  const fkCount = mod.tables.reduce((s, t) => s + t.foreignKeys.length, 0);
  const indexCount = mod.tables.reduce((s, t) => s + t.indexes.length, 0);

  // Generate Mermaid ER diagram
  const mermaidER = generateMermaidER(mod.tables);

  // Build enrichment sections
  let overviewSection = '';
  if (enrichment?.overview) {
    overviewSection = `\n${enrichment.overview}\n`;
  }

  let workflowsSection = '';
  if (enrichment?.keyWorkflows && enrichment.keyWorkflows.length > 0) {
    const items = enrichment.keyWorkflows.map((w) => `- ${w}`).join('\n');
    workflowsSection = `\n## Key Workflows\n\n${items}\n`;
  }

  let healthNotesSection = '';
  if (enrichment?.schemaHealthNotes && enrichment.schemaHealthNotes.length > 0) {
    const items = enrichment.schemaHealthNotes.map((n) => `- ${n}`).join('\n');
    healthNotesSection = `\n## Schema Health Notes\n\n${items}\n`;
  }

  // Prepare tables data for the TableDetail component.
  // Include only the fields the component needs to keep MDX size manageable.
  // Merge per-table AI enrichment when available.
  const enrichmentByName = new Map<string, TableEnrichmentDetail>();
  if (enrichment?.tableDetail) {
    for (const td of enrichment.tableDetail) {
      enrichmentByName.set(td.name, td);
    }
  }

  const tablesForComponent = mod.tables.map((t) => {
    const te = enrichmentByName.get(t.name);
    return {
      name: t.name,
      schema: t.schema,
      fullName: t.fullName,
      hasPrimaryKey: t.hasPrimaryKey,
      primaryKeyColumns: t.primaryKeyColumns,
      columns: t.columns ?? [],
      foreignKeys: t.foreignKeys,
      indexes: t.indexes,
      checkConstraints: t.checkConstraints,
      defaultConstraints: t.defaultConstraints,
      triggers: (t.triggers ?? []).map((tr: any) => typeof tr === 'string' ? tr : tr.name),
      // AI-enriched fields (optional)
      ...(te?.summary && { summary: te.summary }),
      ...(te?.businessPurpose && { businessPurpose: te.businessPurpose }),
      ...(te?.dataSensitivity && { dataSensitivity: te.dataSensitivity }),
      ...(te?.migrationRelevance && { migrationRelevance: te.migrationRelevance }),
      ...(te?.migrationNote && { migrationNote: te.migrationNote }),
      ...(te?.complexity && { complexity: te.complexity }),
    };
  });

  // Size check: if serialized JSON exceeds 1.5MB, trim columns from large tables
  let tablesJson = JSON.stringify(tablesForComponent);
  if (tablesJson.length > 1_500_000) {
    let trimmed = 0;
    const trimmedTables = tablesForComponent.map((t: any) => {
      if (t.columns && t.columns.length > 80) {
        trimmed++;
        return { ...t, columns: t.columns.slice(0, 80) };
      }
      return t;
    });
    tablesJson = JSON.stringify(trimmedTables);
    if (trimmed > 0) {
      console.log(`    (trimmed columns for ${trimmed} large tables in ${mod.displayName} to keep MDX < 1.5MB)`);
    }
  }

  // Mermaid ER section
  const hasFKRelationships = !mermaidER.includes('No FK relationships');
  const mermaidSection = hasFKRelationships
    ? `## Entity Relationships

\`\`\`mermaid
erDiagram
${mermaidER}
\`\`\`
`
    : `## Entity Relationships

*No foreign key relationships found between tables in this module.*
`;

  return `---
title: "${mod.displayName} Tables"
sidebar_label: "${mod.displayName} (${mod.prefix}_)"
sidebar_position: ${position}
description: "Database tables for the ${mod.displayName} module (${mod.tableCount} tables)"
---

import TableDetail from '@site/src/components/TableDetail';

# ${mod.displayName} Database Tables

**${mod.tableCount} tables** · **${pkCount} with PK** (${pct(pkCount, mod.tableCount)}%) · **${fkCount} FKs** · **${indexCount} indexes**
${overviewSection}
${mermaidSection}
${workflowsSection}${healthNotesSection}
## Table Reference

<TableDetail
  tables={${tablesJson}}
  generatedAt="${timestamp}"
/>
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('Generating database documentation pages...');

  // ── Load input data ──────────────────────────────────────────────────────

  const tablesPath = path.join(DB_SCHEMA_DIR, 'tables.json');
  const sprocPath = path.join(DB_SCHEMA_DIR, 'sproc-reconciliation.json');
  const summaryPath = path.join(DB_SCHEMA_DIR, 'summary.json');
  const indexesPath = path.join(DB_SCHEMA_DIR, 'indexes.json');
  const triggersPath = path.join(DB_SCHEMA_DIR, 'triggers.json');

  if (!(await fileExists(tablesPath))) {
    console.error('Error: tables.json not found. Run parse:db:schema first.');
    process.exit(1);
  }
  if (!(await fileExists(sprocPath))) {
    console.error('Error: sproc-reconciliation.json not found. Run parse:db:reconcile first.');
    process.exit(1);
  }

  const tablesData = await readJson<TablesData>(tablesPath);
  console.log(`  Loading tables.json (${tablesData.totalTables.toLocaleString()} tables, ${tablesData.modules.length} modules)...`);

  const sprocData = await readJson<SprocReconciliation>(sprocPath);
  console.log(`  Loading sproc-reconciliation.json (${sprocData.matched.toLocaleString()} matched)...`);

  const summaryData = await readJson<SummaryData>(summaryPath);
  const indexesData = await readJson<IndexesData>(indexesPath);
  const triggersData = await readJson<TriggersData>(triggersPath);

  // Load optional AI enrichment data
  const enrichmentMap = new Map<string, ModuleEnrichment>();
  if (await fileExists(ENRICHED_DIR)) {
    const enrichFiles = (await fs.readdir(ENRICHED_DIR)).filter((f) => f.endsWith('.json'));
    for (const file of enrichFiles) {
      try {
        const data = await readJson<ModuleEnrichment>(path.join(ENRICHED_DIR, file));
        if (data.module) {
          enrichmentMap.set(data.module, data);
        }
      } catch {
        // Skip malformed enrichment files
      }
    }
    if (enrichmentMap.size > 0) {
      console.log(`  Loaded AI enrichment for ${enrichmentMap.size} modules`);
    }
  }

  // ── Create output directories ────────────────────────────────────────────

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.mkdir(MODULES_DIR, { recursive: true });

  const timestamp = new Date().toISOString();

  // ── Generate top-level pages ─────────────────────────────────────────────

  // 1. Overview page
  const overviewMdx = generateOverviewMdx(tablesData, summaryData, indexesData, triggersData);
  await fs.writeFile(path.join(DOCS_DIR, 'overview.mdx'), overviewMdx, 'utf-8');
  console.log('  Generating docs/database/overview.mdx');

  // 2. Explorer page
  const explorerMdx = generateExplorerMdx();
  await fs.writeFile(path.join(DOCS_DIR, 'explorer.mdx'), explorerMdx, 'utf-8');
  console.log('  Generating docs/database/explorer.mdx');

  // 3. SP Reconciliation page
  const sprocMdx = generateSprocReconciliationMdx(sprocData);
  await fs.writeFile(path.join(DOCS_DIR, 'sproc-reconciliation.mdx'), sprocMdx, 'utf-8');
  console.log('  Generating docs/database/sproc-reconciliation.mdx');

  // 4. Health page
  const healthMdx = generateHealthMdx(tablesData.totalTables);
  await fs.writeFile(path.join(DOCS_DIR, 'health.mdx'), healthMdx, 'utf-8');
  console.log('  Generating docs/database/health.mdx');

  // ── Generate module pages ────────────────────────────────────────────────

  console.log(`  Generating ${tablesData.modules.length} module pages in docs/database/modules/`);

  for (let i = 0; i < tablesData.modules.length; i++) {
    const mod = tablesData.modules[i];
    const slug = slugify(mod.displayName);
    const enrichment = enrichmentMap.get(mod.prefix) || null;
    const position = i + 1;

    const moduleMdx = generateModuleMdx(mod, position, enrichment, timestamp);
    await fs.writeFile(path.join(MODULES_DIR, `${slug}.mdx`), moduleMdx, 'utf-8');

    // Count FK relationships in the ER diagram
    const fkInDiagram = mod.tables.reduce((count, t) => {
      return count + t.foreignKeys.filter((fk) => {
        const parent = resolveReferencedTable(fk, t.name);
        return parent && mod.tables.some((other) => other.name === parent);
      }).length;
    }, 0);

    console.log(`    ${slug}.mdx (${mod.tableCount} tables, ${fkInDiagram} FK relationships in ER diagram)`);
  }

  // ── Generate static JSON files ───────────────────────────────────────────

  // 1. DB Explorer data
  const explorerData = generateExplorerData(tablesData);
  await fs.writeFile(
    path.join(STATIC_DIR, 'db-explorer-data.json'),
    JSON.stringify(explorerData),
    'utf-8',
  );
  console.log(`  Generating static/db-explorer-data.json (${explorerData.nodes.length.toLocaleString()} nodes, ${explorerData.links.length.toLocaleString()} links)`);

  // 2. SP Reconciliation data
  const sprocStaticData = generateSprocReconciliationData(sprocData);
  await fs.writeFile(
    path.join(STATIC_DIR, 'sproc-reconciliation-data.json'),
    JSON.stringify(sprocStaticData),
    'utf-8',
  );
  console.log('  Generating static/sproc-reconciliation-data.json');

  // 3. Schema Health data
  const healthData = generateSchemaHealthData(tablesData, indexesData, triggersData, summaryData);
  await fs.writeFile(
    path.join(STATIC_DIR, 'schema-health-data.json'),
    JSON.stringify(healthData),
    'utf-8',
  );
  console.log('  Generating static/schema-health-data.json');

  // ── Done ─────────────────────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal error generating database pages:', err);
  process.exit(1);
});
