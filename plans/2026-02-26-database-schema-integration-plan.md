# Database Schema Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse the MyEvaluations SQL Server schema export (2,284 tables, 6,169 SPs), reconcile SPs bidirectionally with code-side data, AI-enrich per module, and generate interactive documentation pages with D3 visualizations and Mermaid ER diagrams.

**Architecture:** 5-stage pipeline (Parse → Reconcile → Enrich → Generate → Build) following the established `parse:dotnet:*` + `enrich:pages` conventions. New scripts in `scripts/`, generated JSON in `generated/db-schema/`, new pages in `docs/database/`, 4 new React components in `src/components/`.

**Tech Stack:** TypeScript (tsx), xlsx npm package for Excel parsing, D3.js v7 (already installed), Mermaid (already enabled), Docusaurus 3.7, Claude CLI task agents for AI enrichment.

**Design Document:** `docs/plans/2026-02-26-database-schema-integration-design.md`

---

## Task 1: Install xlsx dependency and add npm scripts

**Files:**
- Modify: `package.json` (add dependency + 5 new scripts)

**Step 1: Install xlsx package**

Run: `npm install xlsx --legacy-peer-deps`

Expected: `xlsx` added to `dependencies` in package.json.

**Step 2: Add npm scripts to package.json**

Add these scripts after the existing `enrich:build` line (around line 35):

```json
"parse:db:schema": "tsx scripts/parse-db-schema.ts",
"parse:db:reconcile": "tsx scripts/reconcile-sprocs.ts",
"ai:enrich:db": "tsx scripts/ai-enrich-db-schema.ts",
"generate:db:pages": "tsx scripts/generate-db-pages.ts",
"db:full": "npm run parse:db:schema && npm run parse:db:reconcile && npm run generate:db:pages"
```

Note: `db:full` does NOT include `ai:enrich:db` because that's a manual multi-hour process run separately.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xlsx dependency and database schema pipeline scripts"
```

---

## Task 2: Create `scripts/parse-db-schema.ts` — Excel parser (Stage 1)

**Files:**
- Create: `scripts/parse-db-schema.ts`
- Create: `generated/db-schema/` directory (git-ignored, created at runtime)

**Step 1: Write the parser script**

Follow the established pattern from `scripts/parse-dotnet-sprocs.ts`:
- Use `import * as path from 'path'` and `import * as fs from 'fs/promises'` for file I/O
- Use `import * as XLSX from 'xlsx'` for Excel parsing
- Set `PROJECT_ROOT = path.resolve(__dirname, '..')`
- Set `INPUT_FILE = path.join(PROJECT_ROOT, 'input', 'MyEvaluationsDatabaseSchema_20260226.xlsx')`
- Set `OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema')`

**The script must parse all 8 sheets:**

| Sheet | Output File | Key Fields |
|-------|-------------|------------|
| `ObjectsCountByType` | `summary.json` | ObjectType, CountOfObjects |
| `Programable Objects` | `tables.json` (User Tables), `sprocs-db.json` (SPs), `functions.json`, `views.json` | ObjectType, SchemaName, ObjectName |
| `ConstraintsAndKeys` | `constraints.json` | ObjectType, SchemaName, ObjectName, ParentSchemaName, ParentObjectName |
| `Triggers` | `triggers.json` | ObjectType, SchemaName, ObjectName, ParentSchemaName, ParentObjectName, IsTriggerDisabled, IsInsteadOfTrigger |
| `UserDefined_DataTypes` | `types.json` | Type, SchemaName, UserDefinedTypeName, SystemTypeName, max_length, precision, scale |
| `UserDefined_TypeTables` | `types.json` (appended) | Type, SchemaName, UserDefinedTypeName |
| `Indexes` | `indexes.json` | SchemaName, TableName, IndexName, IndexType, IsPrimaryKey, IsUniqueIndex, IsIndexDisabled, KeyColumns, IncludedColumns |
| `TablePartition` | `summary.json` (appended) | TableName, PartitionScheme, PartitionFunction |

**Module prefix detection logic:**

```typescript
function detectModulePrefix(tableName: string): string {
  // Handle _DEL_ prefix (soft-deleted tables)
  if (tableName.startsWith('_DEL_')) return '_DEL_';

  // Known prefixes in priority order (longest match first)
  const knownPrefixes = [
    'MYEVAL', 'MYEval', 'MyEvals', 'MyEval', 'MyGME',
    'ACGME', 'EVAL', 'Eval', 'SEC', 'Sec', 'sec',
    'DH', 'PRC', 'prc', 'APE2', 'APE', 'BSN', 'ACT',
    'PF', 'OBC', 'CME', 'Prep', 'PTL', 'RPT', 'QUIZ',
    'SCHE', 'SYS', 'POST', 'LA',
  ];

  for (const prefix of knownPrefixes) {
    if (tableName.startsWith(prefix + '_')) return prefix;
  }

  // Check perf schema
  // (handled by schema field, not prefix)

  return '(uncategorized)';
}

// Normalize similar prefixes to canonical form
function normalizePrefix(prefix: string): string {
  const map: Record<string, string> = {
    'Eval': 'EVAL', 'SEC': 'SEC', 'Sec': 'SEC', 'sec': 'SEC',
    'PRC': 'PRC', 'prc': 'PRC',
    'MYEval': 'MYEVAL', 'MyEval': 'MYEVAL', 'MyEvals': 'MYEVAL', 'MYEVAL': 'MYEVAL',
  };
  return map[prefix] || prefix;
}
```

**`tables.json` assembly logic:**

For each table from the `Programable Objects` sheet where `ObjectType === 'User Tables'`:
1. Detect module prefix
2. Look up FK constraints from `ConstraintsAndKeys` sheet where `ObjectType === 'Foreign Key Constraints'` and `ParentObjectName === tableName`
3. Look up indexes from `Indexes` sheet where `TableName === tableName`
4. Look up triggers from `Triggers` sheet where `ParentObjectName === tableName`
5. Look up PK from `ConstraintsAndKeys` where `ObjectType === 'Primary Key Constraints'` and `ParentObjectName === tableName`
6. Count default constraints from `ConstraintsAndKeys` where `ObjectType === 'Default Constraints'` and `ParentObjectName === tableName`
7. Look up check constraints from `ConstraintsAndKeys` where `ObjectType === 'Check Constraints'` and `ParentObjectName === tableName`

Group tables by normalized module prefix into the `modules[]` array.

**Console output** (following existing script patterns):
```
Parsing database schema from input/MyEvaluationsDatabaseSchema_20260226.xlsx...
  Sheet 'ObjectsCountByType': 13 object types
  Sheet 'Programable Objects': 9,160 objects
  Sheet 'ConstraintsAndKeys': 4,566 constraints
  ...
Grouped 2,284 tables into 21 modules
Written: generated/db-schema/tables.json (2,284 tables)
Written: generated/db-schema/sprocs-db.json (6,169 stored procedures)
Written: generated/db-schema/constraints.json (4,566 constraints)
Written: generated/db-schema/indexes.json (3,703 indexes)
Written: generated/db-schema/functions.json (593 functions)
Written: generated/db-schema/views.json (112 views)
Written: generated/db-schema/triggers.json (17 triggers)
Written: generated/db-schema/types.json (279 types)
Written: generated/db-schema/summary.json
Done in 1.2s
```

**Step 2: Run the parser**

Run: `npm run parse:db:schema`

Expected: All 9 JSON files created in `generated/db-schema/`. Verify `tables.json` has 2,284 tables grouped into ~21 modules. Verify `sprocs-db.json` has 6,169 SPs. Verify `summary.json` has correct object counts matching the `ObjectsCountByType` sheet.

**Step 3: Spot-check the output**

Run: `node -e "const d = require('./generated/db-schema/tables.json'); console.log('Modules:', d.modules.length, 'Tables:', d.totalTables); d.modules.forEach(m => console.log('  ' + m.prefix + ': ' + m.tableCount))"`

Expected: ~21 modules, 2,284 total tables. SEC should have ~343 (SEC + Sec + sec combined), EVAL should have ~333 (EVAL + Eval combined).

**Step 4: Commit**

```bash
git add scripts/parse-db-schema.ts
git commit -m "feat: add Excel database schema parser (Stage 1)

Parses all 8 sheets from the MyEvaluations schema export into
structured JSON. Groups 2,284 tables into 21 modules by prefix,
cross-references with FK constraints, indexes, and triggers."
```

---

## Task 3: Create `scripts/reconcile-sprocs.ts` — SP reconciliation (Stage 2)

**Files:**
- Create: `scripts/reconcile-sprocs.ts`

**Step 1: Write the reconciliation script**

Inputs:
- `generated/db-schema/sprocs-db.json` — 6,169 SPs from DB (from Task 2)
- `generated/dotnet-metadata/stored-procedures.json` — 3,991 SPs from code (existing)

The existing code-side JSON has this structure (from `stored-procedures.json`):
```json
{
  "procedures": [{
    "procedureName": "GetUsersListByType",
    "callCount": 26,
    "calledBy": [{ "className": "ListItem", "methodName": "GetUsersListByType", "filePath": "MyEvaluations.Business.DutyHours/DutyHoursManager.cs" }]
  }]
}
```

**Matching logic:**

```typescript
function normalizeSprocName(name: string): string {
  // Remove schema prefix (dbo., perf.)
  const bare = name.replace(/^(dbo|perf)\./, '');
  return bare.toLowerCase();
}
```

Match steps:
1. Build a map of DB-side sprocs: `Map<normalizedName, dbSproc>`
2. Build a map of code-side sprocs: `Map<normalizedName, codeSproc>`
3. For each code-side sproc, look up in DB-side map (exact normalized match)
4. If no exact match, try fuzzy: strip `usp_`, `sp_` prefixes and re-match
5. Track matched, orphan-db, orphan-code

**Output `sproc-reconciliation.json`:** (schema per design doc)

**Output `table-sproc-mapping.json`:**

This is trickier — the Excel export doesn't directly say which SPs touch which tables. Two approaches:
1. **Name-based heuristic:** Match SP names containing table prefixes (e.g., `GetUsersByDepartment` → likely touches `SEC_Users`, `SEC_Departments`)
2. **Module-level mapping:** Group SPs by their detected module prefix and map to the same-prefix tables

Use approach 2 (module-level mapping) as the primary strategy, with approach 1 as a supplementary signal. The AI enrichment in Stage 3 will refine these mappings.

```json
{
  "generatedAt": "ISO-timestamp",
  "mappings": [
    {
      "module": "SEC",
      "tables": ["SEC_Users", "SEC_UsersExt", "..."],
      "sprocs": {
        "matched": ["GetUsersByDepartment", "AuthenticateUser", "..."],
        "dbOnly": ["GetArchivedUsers", "..."],
        "codeOnly": []
      },
      "tableCount": 328,
      "sprocCount": { "matched": 450, "dbOnly": 120, "codeOnly": 5 }
    }
  ]
}
```

**Console output:**
```
Reconciling stored procedures...
  DB-side: 6,169 SPs
  Code-side: 3,991 SPs
  Exact matches: 3,150
  Fuzzy matches: 180
  DB-only orphans: 2,839
  Code-only orphans: 661
Written: generated/db-schema/sproc-reconciliation.json
Written: generated/db-schema/table-sproc-mapping.json
Done in 0.8s
```

**Step 2: Run the reconciliation**

Run: `npm run parse:db:reconcile`

Expected: Two JSON files created. The matched count should be reasonable (>2,500). Orphan counts should be plausible.

**Step 3: Review the orphans**

Run: `node -e "const d = require('./generated/db-schema/sproc-reconciliation.json'); console.log('Matched:', d.matched, 'DB-only:', d.orphanDb.length, 'Code-only:', d.orphanCode.length); console.log('Sample DB-only:', d.orphanDb.slice(0,5).map(o => o.name)); console.log('Sample Code-only:', d.orphanCode.slice(0,5).map(o => o.name))"`

Expected: Sample orphans should make sense — DB-only might be archive/admin SPs, code-only might be renamed/deleted SPs.

**Step 4: Commit**

```bash
git add scripts/reconcile-sprocs.ts
git commit -m "feat: add SP reconciliation script (Stage 2)

Bidirectional matching of 6,169 DB-side SPs with 3,991 code-side SPs.
Case-insensitive exact match plus fuzzy matching for prefix variations.
Generates cross-reference and module-level table-to-SP mappings."
```

---

## Task 4: Create `src/components/TableDetail.tsx` — Expandable table detail component

**Files:**
- Create: `src/components/TableDetail.tsx`

**Step 1: Write the component**

Follow the `FileReference.tsx` pattern (570 lines). The new component should:

**Props interface:**
```typescript
interface TableEntry {
  name: string;
  schema: string;
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  foreignKeys: Array<{
    constraintName: string;
    columns: string[];
    referencedTable: string;
  }>;
  indexes: Array<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    isDisabled: boolean;
    keyColumns: string[];
    includedColumns: string[];
  }>;
  checkConstraints: string[];
  defaultConstraints: number;
  triggers: string[];
  // AI-enriched fields (optional — present after enrichment)
  summary?: string;
  businessPurpose?: string;
  dataSensitivity?: string;
  migrationRelevance?: string;
  migrationNote?: string;
  complexity?: string;
  relatedSprocs?: string[];
  relatedFiles?: string[];
  keyRelationships?: string[];
  keyColumns?: string[];
}

interface TableDetailProps {
  tables: TableEntry[];
  moduleOverview?: string;
  keyWorkflows?: string[];
  schemaHealthNotes?: string[];
  generatedAt?: string;
}
```

**Features (mirroring FileReference.tsx):**

1. **Stats cards at top:** Total tables, PK coverage %, FK count, index count, avg indexes/table
2. **Filter controls:** Search box (filters table name, summary), dropdowns for:
   - Migration relevance (all / high / medium / low / none)
   - Complexity (all / trivial / simple / moderate / complex / very-complex)
   - Has PK (all / yes / no)
3. **Sortable table columns:** Name, PK, FKs, Indexes, Complexity, Migration
4. **Expandable rows:** Click a table row to expand a detail panel showing:
   - Left column: Summary, Business Purpose, Migration Note, Data Sensitivity badge
   - Right column: Primary Key, Foreign Keys (with linked table names), Indexes, Triggers, Related SPs, Related Files
5. **Color constants** (reuse from FileReference.tsx):
   ```typescript
   const COMPLEXITY_COLORS = { 'trivial': '#22c55e', 'simple': '#84cc16', 'moderate': '#eab308', 'complex': '#f97316', 'very-complex': '#ef4444' };
   const MIGRATION_COLORS = { 'high': '#ef4444', 'medium': '#f97316', 'low': '#eab308', 'none': '#6b7280' };
   const SENSITIVITY_COLORS = { 'phi': '#ef4444', 'pii': '#f97316', 'financial': '#eab308', 'internal': '#3b82f6', 'public': '#22c55e' };
   ```
6. **Export to clipboard** button (JSON of filtered tables)

**Styling:** Use inline styles matching `FileReference.tsx` conventions. Dark background cards (`#1e1e1e`), hover states on rows, colored badges.

**Step 2: Verify it compiles**

Run: `npm run build 2>&1 | head -20`

Expected: Build should succeed (component not imported anywhere yet, so no errors). If TypeScript errors appear, fix them.

**Step 3: Commit**

```bash
git add src/components/TableDetail.tsx
git commit -m "feat: add TableDetail component for expandable database table views

Reusable component for module-level database pages. Features stats cards,
search/filter/sort, and expandable detail rows showing FKs, indexes,
triggers, and AI-enriched business context."
```

---

## Task 5: Create `src/components/SprocReconciliation.tsx` — SP gap analysis component

**Files:**
- Create: `src/components/SprocReconciliation.tsx`

**Step 1: Write the component**

**Props interface:**
```typescript
interface SprocMatch {
  sprocName: string;
  calledFromFiles: string[];
  calledFromMethods: string[];
  module: string;
}

interface SprocOrphanDb {
  name: string;
  schema: string;
}

interface SprocOrphanCode {
  name: string;
  calledFrom: string[];
}

interface SprocReconciliationProps {
  totalDbSprocs: number;
  totalCodeSprocs: number;
  matched: SprocMatch[];
  orphanDb: SprocOrphanDb[];
  orphanCode: SprocOrphanCode[];
}
```

**Features:**
1. **Summary stats bar:** Total DB, Total Code, Matched count + %, DB-only count, Code-only count
2. **Three tabs:**
   - **Matched** — Sortable table: SP name, Module, Called From (files), Methods. Search filter.
   - **DB-Only Orphans** — Sortable table: SP name, Schema. Search filter. Grouped by probable module prefix.
   - **Code-Only Orphans** — Sortable table: SP name, Called From. Search filter.
3. **Tab badges** showing count per tab
4. **Search** filters across the active tab

Follow `SprocMap.tsx` styling conventions. Use `useState` for active tab, search term, sort column/direction.

**Step 2: Verify it compiles**

Run: `npm run build 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/SprocReconciliation.tsx
git commit -m "feat: add SprocReconciliation component for SP gap analysis

Three-tab view showing matched SPs with 4-tier traceability chain,
DB-only orphans (potential dead code), and code-only orphans
(potentially renamed or deleted from DB)."
```

---

## Task 6: Create `src/components/DatabaseExplorer.tsx` — D3 interactive graph

**Files:**
- Create: `src/components/DatabaseExplorer.tsx`

**Step 1: Write the component**

Follow `DependencyGraph.tsx` pattern (290 lines). Key differences:

**Props interface:**
```typescript
interface DBGraphNode {
  id: string;          // fullName e.g. "dbo.SEC_Users"
  name: string;        // short name e.g. "SEC_Users"
  module: string;      // normalized prefix e.g. "SEC"
  hasPK: boolean;
  fkCount: number;
  indexCount: number;
}

interface DBGraphLink {
  source: string;      // FK child table fullName
  target: string;      // FK parent table fullName
  constraintName: string;
}

interface DatabaseExplorerProps {
  nodes: DBGraphNode[];
  links: DBGraphLink[];
}
```

**Key implementation details from DependencyGraph.tsx to replicate:**
- Dynamic D3 import inside `useEffect`: `const d3 = await import('d3');` (line 56 of DependencyGraph.tsx — required for Docusaurus SSR)
- `useRef<HTMLDivElement>` for container (line 41)
- `cancelled` flag to prevent state updates after unmount (line 52)
- Cleanup: `simulation.stop()`, tooltip + SVG removal (lines 218-237)
- Zoom/pan via `d3.zoom()` (lines 84-91)

**New features beyond DependencyGraph.tsx:**
1. **Module filter dropdown** — Show/hide tables by module. Default: show all.
2. **Search box** — Highlights matching nodes, dims others.
3. **Node coloring by module** — Use a color palette with 21+ distinct colors.
4. **Node sizing by FK count** — Tables with more FK references appear larger.
5. **Click handler** — Clicking a node shows a detail popover with table name, module, PK status, FK list, index count.
6. **No-PK indicator** — Nodes without a PK get a dashed border.

**Force simulation tuning for 2,284 nodes + 1,359 edges:**
```typescript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(60))
  .force('charge', d3.forceManyBody().strength(-150))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collide', d3.forceCollide().radius(15))
  .alphaDecay(0.02);  // slower decay for large graph to settle better
```

Important: With 2,284 nodes the full graph will be slow. The component should default to showing only the selected module's tables (filter), not all tables at once.

**Step 2: Verify it compiles**

Run: `npm run build 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/DatabaseExplorer.tsx
git commit -m "feat: add DatabaseExplorer D3 component for interactive schema graph

Force-directed graph of tables and FK relationships. Module filter,
search, node sizing by FK count, click-to-detail popover. Defaults to
filtered view for performance with 2,284 tables."
```

---

## Task 7: Create `src/components/SchemaHealth.tsx` — Health dashboard component

**Files:**
- Create: `src/components/SchemaHealth.tsx`

**Step 1: Write the component**

**Props interface:**
```typescript
interface SchemaHealthProps {
  totalTables: number;
  tablesWithPK: number;
  tablesWithIndex: number;
  disabledIndexes: number;
  totalIndexes: number;
  totalFKs: number;
  namingInconsistencies: Array<{
    canonical: string;
    variants: string[];
    counts: Record<string, number>;
  }>;
  tablesWithoutPK: Array<{ name: string; module: string }>;
  tablesWithoutIndex: Array<{ name: string; module: string }>;
  moduleHealth: Array<{
    module: string;
    tableCount: number;
    pkCoverage: number;     // 0-100
    indexCoverage: number;  // 0-100
    avgIndexesPerTable: number;
    fkCount: number;
  }>;
}
```

**Features:**
1. **Top stats cards:** PK Coverage (% with badge color), Index Coverage (%), Disabled Indexes, Total FKs
2. **Module health table:** Sortable table with one row per module showing coverage metrics. Color-coded cells (green >80%, yellow >50%, red <50%).
3. **Naming inconsistencies section:** Collapsible list of prefix variants (e.g., EVAL/Eval, SEC/Sec/sec)
4. **Tables without PK list:** Grouped by module, collapsible. Shows count badge per module.
5. **Tables without indexes list:** Same pattern.

Style: Follow `TechDebtRadar.tsx` dashboard conventions. Stats cards with icons, colored borders.

**Step 2: Verify it compiles**

Run: `npm run build 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/components/SchemaHealth.tsx
git commit -m "feat: add SchemaHealth dashboard component

Dashboard cards for PK/index coverage, module-level health table,
naming inconsistency report, and collapsible lists of tables
missing PKs or indexes."
```

---

## Task 8: Create `scripts/generate-db-pages.ts` — Page generator (Stage 4)

**Files:**
- Create: `scripts/generate-db-pages.ts`
- Create: `docs/database/` directory structure

**Step 1: Write the page generator**

Follow `scripts/generate-file-reference-pages.ts` pattern (220 lines).

Inputs:
- `generated/db-schema/tables.json`
- `generated/db-schema/sproc-reconciliation.json`
- `generated/db-schema/table-sproc-mapping.json`
- `generated/db-schema/indexes.json`
- `generated/db-schema/triggers.json`
- `generated/db-schema/summary.json`
- `generated/ai-enriched/db-schema/per-module/*.json` (optional — may not exist yet)

**Output files:**

1. **`docs/database/overview.mdx`** — Schema dashboard page
2. **`docs/database/explorer.mdx`** — D3 interactive explorer page
3. **`docs/database/sproc-reconciliation.mdx`** — SP gap analysis page
4. **`docs/database/health.mdx`** — Schema health page
5. **`docs/database/modules/<slug>.mdx`** — One per module (~21 pages)

**Slugify helper** (reuse from generate-file-reference-pages.ts):
```typescript
function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}
```

**Module page name mapping:**
```typescript
const MODULE_LABELS: Record<string, string> = {
  'SEC': 'Security', 'EVAL': 'Evaluations', 'DH': 'Duty Hours',
  'PRC': 'Procedures', 'APE': 'Annual Program Evaluation', 'APE2': 'APE v2',
  'BSN': 'Nursing', 'ACT': 'Activity Logs', 'PF': 'Portfolio',
  'OBC': 'Clinical Assessment', 'CME': 'CME Credits', 'Prep': 'Prep/Onboarding',
  'PTL': 'Patient Logs', 'RPT': 'Reports', 'QUIZ': 'Quizzes',
  'SCHE': 'Scheduling', 'SYS': 'System', 'MYEVAL': 'MyEval Platform',
  'POST': 'Post-Graduation', 'MyGME': 'MyGME Integration', 'LA': 'Learning Activities',
  'perf': 'Performance Schema', '_DEL_': 'Soft-Deleted Tables',
  '(uncategorized)': 'Uncategorized',
};
```

**Module page MDX template:**

```mdx
---
title: "${label} Tables"
sidebar_label: "${label} (${prefix}_)"
description: "Database tables for the ${label} module (${count} tables)"
---

import TableDetail from '@site/src/components/TableDetail';

# ${label} Database Tables

**${count} tables** · **${pkCount} with PK** · **${fkCount} FKs** · **${indexCount} indexes**

${moduleOverview || ''}

## Entity Relationships

\`\`\`mermaid
erDiagram
${mermaidER}
\`\`\`

${keyWorkflows ? '## Key Workflows\n\n' + keyWorkflows.map(w => '- ' + w).join('\n') : ''}

${schemaHealthNotes ? '## Schema Health Notes\n\n' + schemaHealthNotes.map(n => '- ' + n).join('\n') : ''}

## Table Reference

<TableDetail
  tables={${JSON.stringify(tables)}}
  generatedAt="${generatedAt}"
/>
```

**Mermaid ER diagram generation logic:**

```typescript
function generateMermaidER(tables: TableEntry[], maxTables: number = 20): string {
  // Sort tables by FK connection count (most connected first)
  // Take top maxTables
  // For each FK relationship where both sides are in the set:
  //   ParentTable ||--o{ ChildTable : "FK_name"
  // For cross-module FKs (one side outside the set):
  //   ExternalTable }o--|| LocalTable : "FK_name"
  // Return the mermaid lines joined by \n
}
```

**Overview page:** Imports `SchemaHealth` component, passes props from `summary.json` + computed stats.

**Explorer page:** Imports `DatabaseExplorer` component, passes all table nodes and FK link data.

**SP Reconciliation page:** Imports `SprocReconciliation` component, passes data from `sproc-reconciliation.json`.

**Health page:** Imports `SchemaHealth` component with the full tables-without-PK and tables-without-index lists.

**Step 2: Run the generator (without AI enrichment data)**

Run: `npm run generate:db:pages`

Expected: All pages created in `docs/database/`. The pages will work without AI enrichment — they just won't have `summary`, `businessPurpose`, etc. fields populated.

**Step 3: Verify pages build**

Run: `npm run build 2>&1 | tail -20`

Expected: Docusaurus build succeeds. Some warnings about large JSON inline props are OK.

**Step 4: Commit**

```bash
git add scripts/generate-db-pages.ts docs/database/
git commit -m "feat: add database page generator and initial pages (Stage 4)

Generates overview, explorer, SP reconciliation, health, and ~21
module pages from parsed schema data. Pages work with or without
AI enrichment. Includes Mermaid ER diagrams per module."
```

---

## Task 9: Update `sidebars.ts` — Add Database Schema section

**Files:**
- Modify: `sidebars.ts`

**Step 1: Add the Database Schema category**

Add after the `.NET Backend` section (around line 110) and before any subsequent top-level category:

```typescript
{
  type: 'category',
  label: 'Database Schema',
  collapsed: false,
  items: [
    'database/overview',
    'database/explorer',
    'database/sproc-reconciliation',
    'database/health',
    {
      type: 'category',
      label: 'Tables by Module',
      collapsed: true,
      items: [{
        type: 'autogenerated',
        dirName: 'database/modules',
      }],
    },
  ],
},
```

This uses `autogenerated` for the module pages (same pattern as `dotnet-backend/business/files`), so new module pages are automatically picked up.

**Step 2: Verify the sidebar renders**

Run: `npm run build 2>&1 | tail -10`

Expected: Build succeeds. No broken link warnings for the new pages.

**Step 3: Commit**

```bash
git add sidebars.ts
git commit -m "feat: add Database Schema section to sidebar

New top-level section with overview, explorer, SP reconciliation,
health dashboard, and autogenerated module pages."
```

---

## Task 10: Update existing pages — Architecture + module cross-links

**Files:**
- Modify: `docs/architecture/database-schema.mdx` (replace AUTO-GENERATED placeholders)
- Modify: `docs/dotnet-backend/data-access/stored-procedures.mdx` (add link to reconciliation)

**Step 1: Update `database-schema.mdx`**

Replace the 5 `<!-- AUTO-GENERATED -->` placeholder sections with real data from `summary.json`. Add a prominent link to the new `docs/database/overview` page at the top:

```mdx
:::tip Full Database Documentation
For interactive schema exploration, per-module table references, and SP reconciliation,
see the [Database Schema](/docs/database/overview) section.
:::
```

Replace the fabricated table counts in the "Core Entity Groups" section (line 81 area) with real counts from `summary.json`.

Replace the SP categories section (line 229 area) with real SP count from the reconciliation data.

**Step 2: Update `stored-procedures.mdx`**

Add a section at the bottom:

```mdx
## SP Reconciliation

The code-side parser found **3,991 unique stored procedures** called from .NET code.
The database contains **6,169 stored procedures** total.

See the full [SP Reconciliation analysis](/docs/database/sproc-reconciliation) for:
- **Matched SPs** — procedures confirmed in both code and database
- **DB-only orphans** — procedures in the database but never called from code (potential dead code)
- **Code-only orphans** — procedures called from code but not found in the database schema export
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`

**Step 4: Commit**

```bash
git add docs/architecture/database-schema.mdx docs/dotnet-backend/data-access/stored-procedures.mdx
git commit -m "feat: update architecture and SP pages with real schema data

Replace AUTO-GENERATED placeholders in database-schema.mdx with real
counts. Add SP reconciliation cross-link to stored-procedures.mdx."
```

---

## Task 11: Script to update business module overview pages

**Files:**
- Modify: `scripts/generate-db-pages.ts` (add function to inject `## Database Tables` sections)
- Modify: ~20 files in `docs/dotnet-backend/business/*.mdx`

**Step 1: Add module page injection to `generate-db-pages.ts`**

Add a function `injectDatabaseSections()` that:

1. Reads each business module overview page
2. Maps module names to DB prefixes: `security` → `SEC`, `evaluations` → `EVAL`, `duty-hours` → `DH`, etc.
3. If the page already has `## Database Tables`, replace that section
4. If not, insert `## Database Tables` after `## File Reference` (the last section per convention)
5. The injected section contains:

```mdx
## Database Tables

This module covers **${count} database tables** with the `${prefix}_` prefix.

| Metric | Value |
|--------|-------|
| Tables | ${count} |
| With Primary Key | ${pkCount} (${pkPct}%) |
| Foreign Keys | ${fkCount} |
| Indexes | ${indexCount} |

Browse the full table reference with expandable details:

- [**${label} Database Tables**](/docs/database/modules/${slug}) — ${count} tables with schema detail, FK relationships, and migration notes
```

**Step 2: Run the injection**

Run: `npm run generate:db:pages`

Expected: ~20 module overview pages updated with `## Database Tables` section.

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`

**Step 4: Spot-check one page**

Read `docs/dotnet-backend/business/security.mdx` and verify the `## Database Tables` section appears after `## File Reference`.

**Step 5: Commit**

```bash
git add scripts/generate-db-pages.ts docs/dotnet-backend/business/
git commit -m "feat: add Database Tables cross-links to business module pages

Each of the 20 module overview pages now has a Database Tables section
with summary stats and a link to the full module table reference page."
```

---

## Task 12: Create `scripts/ai-enrich-db-schema.ts` — AI enrichment (Stage 3)

**Files:**
- Create: `scripts/ai-enrich-db-schema.ts`

**Step 1: Write the enrichment script**

Follow `scripts/ai-enrich-dotnet.ts` pattern. This script uses the Anthropic SDK (`@anthropic-ai/sdk` already installed).

**Key elements:**

```typescript
const ENRICHED_DIR = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'db-schema', 'per-module');
const CACHE_FILE = path.join(ENRICHED_DIR, '.db-cache-manifest.json');
const API_DELAY_MS = 2000;
const MAX_CONTEXT_CHARS = 90_000;
```

**System prompt for the enrichment agent:**

```typescript
const SYSTEM_PROMPT = `You are a database documentation expert analyzing a 17-year-old ASP.NET medical education platform (MyEvaluations).

For each table in this module, provide:
- summary: 1-sentence description of what the table stores
- businessPurpose: 2-3 sentence explanation of how it's used in the platform
- dataSensitivity: phi | pii | financial | internal | public
- migrationRelevance: high | medium | low | none
- migrationNote: 1-sentence note about migration considerations (or empty)
- complexity: trivial | simple | moderate | complex | very-complex
- keyRelationships: array of "RelatedTable - description (cardinality)" strings
- keyColumns: array of "ColumnName - description" strings (infer from table name, FKs, indexes)

Also provide:
- moduleOverview: 2-3 paragraph overview of the entire module
- keyWorkflows: array of workflow description strings
- schemaHealthNotes: array of health observation strings

IMPORTANT: You do NOT have column-level data (column names/types). Infer likely columns from:
1. The table name itself
2. FK constraint names and referenced tables
3. Index key columns (these ARE real column names)
4. PK column names
5. How the table is used in code (from the SP and file cross-reference data provided)

Output valid JSON matching the schema exactly. Use only the allowed enum values.`;
```

**Per-module prompt assembly:**

```typescript
function buildModulePrompt(module: ModuleData, reconciliation: ModuleReconciliation, fileEnrichment: FileEnrichment[]): string {
  let prompt = `## Module: ${module.prefix} (${module.tableCount} tables)\n\n`;

  // Section 1: Table list with structural data (compact)
  prompt += `### Tables\n`;
  for (const table of module.tables) {
    prompt += `\n**${table.name}**`;
    if (table.hasPrimaryKey) prompt += ` [PK: ${table.primaryKeyColumns.join(', ')}]`;
    if (table.foreignKeys.length) {
      prompt += `\n  FKs: ${table.foreignKeys.map(fk => `${fk.columns.join(',')} → ${fk.referencedTable}`).join('; ')}`;
    }
    if (table.indexes.length) {
      const nonPK = table.indexes.filter(i => !i.isPrimaryKey);
      if (nonPK.length) {
        prompt += `\n  Indexes: ${nonPK.map(i => `${i.name}(${i.keyColumns.join(',')})`).join('; ')}`;
      }
    }
    if (table.triggers.length) prompt += `\n  Triggers: ${table.triggers.join(', ')}`;
  }

  // Section 2: SP reconciliation data
  prompt += `\n\n### Related Stored Procedures\n`;
  prompt += `Matched: ${reconciliation.sprocs.matched.length}\n`;
  for (const sp of reconciliation.sprocs.matched.slice(0, 50)) {
    const xref = reconciliation.crossReference?.find(x => x.sprocName.includes(sp));
    if (xref) {
      prompt += `- ${sp} → called from ${xref.calledFromFiles.join(', ')}\n`;
    } else {
      prompt += `- ${sp}\n`;
    }
  }
  if (reconciliation.sprocs.matched.length > 50) {
    prompt += `... and ${reconciliation.sprocs.matched.length - 50} more\n`;
  }

  // Section 3: Related file enrichment context (if available)
  if (fileEnrichment.length > 0) {
    prompt += `\n### Code Context (from .NET file enrichment)\n`;
    for (const fe of fileEnrichment.slice(0, 20)) {
      prompt += `- ${fe.fileName}: ${fe.summary}\n`;
    }
  }

  return prompt;
}
```

**Main loop:**

```typescript
async function main() {
  const tables = JSON.parse(await fs.readFile(tablesPath, 'utf-8'));
  const reconciliation = JSON.parse(await fs.readFile(reconciliationPath, 'utf-8'));
  const cache = await loadCache();

  for (const module of tables.modules) {
    const cacheKey = `${module.prefix}_${sha256(JSON.stringify(module))}`;
    if (cache.entries[module.prefix]?.sha256 === cacheKey) {
      console.log(`  Skipping ${module.prefix} (cached)`);
      continue;
    }

    const moduleReconciliation = getModuleReconciliation(module.prefix, reconciliation);
    const fileEnrichment = await loadFileEnrichmentForModule(module.prefix);
    const prompt = buildModulePrompt(module, moduleReconciliation, fileEnrichment);

    // Check context size
    if (prompt.length > MAX_CONTEXT_CHARS) {
      console.warn(`  WARNING: ${module.prefix} prompt is ${prompt.length} chars, splitting...`);
      // Split into sub-batches and merge results
    }

    console.log(`  Enriching ${module.prefix} (${module.tableCount} tables, ${prompt.length} chars)...`);
    const response = await callClaude(prompt, SYSTEM_PROMPT, 8192);
    const enriched = JSON.parse(response);

    // Validate output
    validateEnrichmentOutput(enriched, module);

    const outputPath = path.join(ENRICHED_DIR, `${module.prefix}.json`);
    await fs.writeFile(outputPath, JSON.stringify(enriched, null, 2));

    // Update cache
    cache.entries[module.prefix] = { sha256: cacheKey, enrichedAt: new Date().toISOString(), outputFile: outputPath };
    await saveCache(cache);

    // Rate limit
    await sleep(API_DELAY_MS);
  }
}
```

**Step 2: Do a dry-run on one small module**

Run: `ANTHROPIC_API_KEY=<key> npm run ai:enrich:db -- --module SYS`

(Add `--module` flag support so you can enrich one module at a time for testing)

Expected: `generated/ai-enriched/db-schema/per-module/SYS.json` created with valid enrichment for 18 tables.

**Step 3: Validate the output**

Run: `node -e "const d = require('./generated/ai-enriched/db-schema/per-module/SYS.json'); console.log('Tables:', d.tableCount, 'Overview:', d.moduleOverview?.substring(0, 100))"`

Expected: 18 tables with enrichment fields populated.

**Step 4: Commit**

```bash
git add scripts/ai-enrich-db-schema.ts
git commit -m "feat: add AI enrichment script for database schema (Stage 3)

Claude API-based enrichment with per-module caching, context size
management, and rate limiting. Supports --module flag for single-module
runs. Merges table structure, SP reconciliation, and file enrichment
context for richer output."
```

---

## Task 13: Run full AI enrichment (all modules)

**Step 1: Run enrichment for all modules**

Run: `ANTHROPIC_API_KEY=<key> npm run ai:enrich:db`

Expected: ~23 JSON files created in `generated/ai-enriched/db-schema/per-module/`. Takes ~2-3 hours.

Monitor progress in console output. If a module fails, re-run with `--module <PREFIX>` to retry just that one.

**Step 2: Validate all outputs**

Run: `node -e "const fs = require('fs'); const dir = 'generated/ai-enriched/db-schema/per-module'; fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).forEach(f => { const d = JSON.parse(fs.readFileSync(dir + '/' + f)); console.log(f.padEnd(25), 'tables:', d.tableCount, 'overview:', (d.moduleOverview || '').substring(0,60)) })"`

Expected: All modules have valid data.

**Step 3: Regenerate pages with enrichment data**

Run: `npm run generate:db:pages`

Expected: Module pages now include AI-enriched summaries, business purposes, and migration notes.

**Step 4: Verify build**

Run: `npm run build`

Expected: Clean build.

**Step 5: Commit all generated pages**

```bash
git add docs/database/ docs/dotnet-backend/business/
git commit -m "feat: regenerate database pages with AI enrichment data

All 21 module pages now include AI-generated table summaries,
business purpose descriptions, migration notes, data sensitivity
flags, and schema health observations."
```

---

## Task 14: Generate static JSON files for D3 components

**Files:**
- Modify: `scripts/generate-db-pages.ts` (add static JSON generation)
- Create: `static/db-explorer-data.json` (for DatabaseExplorer component)
- Create: `static/sproc-reconciliation-data.json` (for SprocReconciliation component)
- Create: `static/schema-health-data.json` (for SchemaHealth component)

**Step 1: Add static JSON generation to `generate-db-pages.ts`**

The D3 components need data at runtime. Following the `SprocMap.tsx` pattern which lazily fetches `/sproc-web-callers.json` from the static folder, generate static JSON files that components fetch at runtime rather than inlining large JSON as props.

For `DatabaseExplorer`:
```json
{
  "nodes": [{ "id": "dbo.SEC_Users", "name": "SEC_Users", "module": "SEC", "hasPK": true, "fkCount": 3, "indexCount": 5 }, ...],
  "links": [{ "source": "dbo.SEC_UserRoles", "target": "dbo.SEC_Users", "constraintName": "FK_..." }, ...]
}
```

For `SprocReconciliation`:
```json
{
  "totalDbSprocs": 6169,
  "totalCodeSprocs": 3991,
  "matched": [...],
  "orphanDb": [...],
  "orphanCode": [...]
}
```

For `SchemaHealth`:
```json
{
  "totalTables": 2284,
  "tablesWithPK": 1471,
  "tablesWithIndex": 1575,
  "disabledIndexes": 196,
  "moduleHealth": [...],
  "namingInconsistencies": [...],
  "tablesWithoutPK": [...],
  "tablesWithoutIndex": [...]
}
```

**Step 2: Update components to fetch data**

Update `DatabaseExplorer.tsx`, `SprocReconciliation.tsx`, and `SchemaHealth.tsx` to accept either inline props OR fetch from static JSON if no props provided:

```typescript
useEffect(() => {
  if (!props.nodes) {
    fetch('/db-explorer-data.json')
      .then(r => r.json())
      .then(setData);
  }
}, []);
```

**Step 3: Run the generator**

Run: `npm run generate:db:pages`

Expected: 3 new JSON files in `static/`.

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add scripts/generate-db-pages.ts static/db-explorer-data.json static/sproc-reconciliation-data.json static/schema-health-data.json src/components/DatabaseExplorer.tsx src/components/SprocReconciliation.tsx src/components/SchemaHealth.tsx
git commit -m "feat: generate static JSON for interactive components

D3 components now lazy-load data from static JSON files instead of
inlining large JSON as MDX props. Better build performance and
smaller page bundles."
```

---

## Task 15: Final integration test and build verification

**Step 1: Run the full pipeline**

Run: `npm run db:full`

Expected: Stages 1, 2, and 4 run sequentially. All generated files are up to date.

**Step 2: Full build**

Run: `npm run build`

Expected: Clean build with no errors. Warnings about large pages are acceptable.

**Step 3: Local serve and smoke test**

Run: `npm run serve`

Then verify in browser:
1. `/docs/database/overview` — Dashboard renders with correct stats
2. `/docs/database/explorer` — D3 graph loads, module filter works
3. `/docs/database/sproc-reconciliation` — Three tabs show data
4. `/docs/database/health` — Health dashboard renders
5. `/docs/database/modules/security` — SEC_ tables with Mermaid ER diagram
6. `/docs/dotnet-backend/business/security` — Has `## Database Tables` section
7. `/docs/architecture/database-schema` — Placeholders replaced with real data

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: integration fixes from smoke testing"
```

---

## Task Summary

| Task | Description | Depends On | Est. Time |
|------|-------------|------------|-----------|
| 1 | Install xlsx + add npm scripts | — | 2 min |
| 2 | Excel parser script (Stage 1) | 1 | 30 min |
| 3 | SP reconciliation script (Stage 2) | 2 | 20 min |
| 4 | TableDetail component | — | 25 min |
| 5 | SprocReconciliation component | — | 20 min |
| 6 | DatabaseExplorer D3 component | — | 30 min |
| 7 | SchemaHealth component | — | 20 min |
| 8 | Page generator script (Stage 4) | 2, 3, 4, 5, 6, 7 | 30 min |
| 9 | Sidebar update | 8 | 5 min |
| 10 | Update architecture + SP pages | 2, 3 | 10 min |
| 11 | Business module cross-links | 8 | 15 min |
| 12 | AI enrichment script (Stage 3) | 2, 3 | 30 min |
| 13 | Run full AI enrichment | 12 | 2-3 hrs |
| 14 | Static JSON for components | 8 | 15 min |
| 15 | Integration test + build | All | 15 min |

**Parallelizable:** Tasks 4, 5, 6, 7 (components) can run in parallel with Tasks 2, 3 (scripts). Task 12 can be written in parallel with Tasks 8-11.

**Critical path:** 1 → 2 → 3 → 8 → 9 → 15
