# SQL Schema Parser Replacement — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Excel-based `parse-db-schema.ts` with AST-based SQL parser using `node-sql-parser`, adding full column definitions to all 2,285 tables and fixing FK references.

**Architecture:** Hybrid AST+regex parser reads 147MB SSMS export (`input/MyEvaluations_Schema_20260226.sql`), pre-processes UDTs, uses `node-sql-parser` with `"TransactSQL"` dialect for CREATE TABLE AST parsing, and regex for FKs/SPs/defaults. Output is backward-compatible `tables.json` with additive `columns` field.

**Tech Stack:** TypeScript (tsx), node-sql-parser v5.4.0, Docusaurus 3.7, React (TableDetail component)

**Design doc:** `docs/plans/2026-02-27-sql-parser-column-docs-design.md`

---

### Task 1: Install node-sql-parser and create parser scaffold

**Files:**
- Modify: `package.json` (add dependency + script)
- Create: `scripts/parse-sql-schema.ts`

**Step 1: Install node-sql-parser**

Run: `cd /home/skonudula/projects/myevaluations/myevals-docs && npm install node-sql-parser --legacy-peer-deps`
Expected: Added to dependencies in package.json

**Step 2: Add npm script**

In `package.json`, update the `parse:db:schema` script (line 37) to point to the new parser:

```json
"parse:db:schema": "tsx scripts/parse-sql-schema.ts",
```

Keep old script available as `parse:db:schema:excel`:

```json
"parse:db:schema:excel": "tsx scripts/parse-db-schema.ts",
```

**Step 3: Create parser scaffold**

Create `scripts/parse-sql-schema.ts` with:

1. **File reading** — `fs.readFileSync` with `utf16le` encoding, convert to UTF-8 string
2. **Statement splitting** — Split on `\nGO\n` (case-insensitive, handle `\r\n`)
3. **Output interfaces** matching existing `tables.json` schema + new `columns` field:

```typescript
interface ColumnDef {
  name: string;
  dataType: string;      // Resolved from UDT
  rawType: string;       // Original type (UDT name or same as dataType)
  maxLength: string | null;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}

interface ForeignKeyDef {
  constraintName: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

interface TableDef {
  name: string;
  schema: string;
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  columns: ColumnDef[];
  foreignKeys: ForeignKeyDef[];
  indexes: IndexDef[];
  checkConstraints: string[];
  defaultConstraints: number;
  uniqueConstraints: string[];
  triggers: TriggerDef[];
}
```

4. **Stub functions** for each phase (returning empty arrays)
5. **Output writing** — write to `generated/db-schema/tables.json` (same path as current parser)
6. **Copy MODULE_MAP** — Copy `PREFIX_NORMALIZE` (lines 182-196) and `DISPLAY_NAMES` (lines 198-224) from `scripts/parse-db-schema.ts` exactly

**Step 4: Verify scaffold runs**

Run: `npm run parse:db:schema`
Expected: Creates `generated/db-schema/tables.json` with empty modules array, prints phase stubs

**Step 5: Commit**

```bash
git add package.json package-lock.json scripts/parse-sql-schema.ts
git commit -m "feat: scaffold AST-based SQL parser with node-sql-parser"
```

---

### Task 2: Phase 1 — UDT extraction

**Files:**
- Modify: `scripts/parse-sql-schema.ts`

**Step 1: Implement UDT extraction**

Parse `CREATE TYPE [dbo].[Name] FROM [baseType] NULL` statements. There are exactly 18 scalar UDTs (lines 757-808 in the SQL file). The regex:

```typescript
const UDT_REGEX = /CREATE\s+TYPE\s+\[(\w+)\]\.\[(\w+)\]\s+FROM\s+\[(\w+)\](?:\(([^)]+)\))?\s*(NULL)?/gi;
```

Build a `Map<string, { baseType: string; maxLength: string | null }>`:

| UDT Name | Base Type | MaxLength |
|----------|-----------|-----------|
| BigNumber | int | null |
| CharacterFlag | char | 1 |
| CounterNumber | bigint | null |
| Currency | money | null |
| FloatingNumber | float | null |
| FreeText | varchar | max |
| LargeDate | datetime | null |
| LargeFile | varbinary | max |
| LargeNumber | bigint | null |
| LargeText | varchar | 8000 |
| LongText | varchar | 250 |
| ScoreNumber | decimal | 10,2 |
| ShortCounterNumber | int | null |
| ShortText | varchar | 100 |
| SmallDate | smalldatetime | null |
| SmallNumber | smallint | null |
| VeryShortText | varchar | 10 |
| VerySmallNumber | tinyint | null |

Also extract table-valued types (lines 811+, `CREATE TYPE...AS TABLE`) — store names in a Set for reference but don't deep-parse.

**Step 2: Add UDT resolution helper**

```typescript
function resolveUdt(rawType: string): { dataType: string; maxLength: string | null } {
  const udt = udtMap.get(rawType);
  if (udt) return { dataType: udt.baseType, maxLength: udt.maxLength };
  return { dataType: rawType, maxLength: null };
}
```

**Step 3: Verify UDT extraction**

Run: `npm run parse:db:schema`
Expected: Prints `Phase 1: Extracted 18 scalar UDTs, N table-valued types`

**Step 4: Commit**

```bash
git add scripts/parse-sql-schema.ts
git commit -m "feat(parser): Phase 1 — extract 18 scalar UDTs with base type resolution"
```

---

### Task 3: Phase 2 — CREATE TABLE parsing with node-sql-parser

**Files:**
- Modify: `scripts/parse-sql-schema.ts`

**Step 1: Extract CREATE TABLE statements**

Find all `CREATE TABLE [schema].[name](...) ON [PRIMARY]` blocks. These span multiple lines from `CREATE TABLE` to the closing `) ON [PRIMARY]` (or `TEXTIMAGE_ON`). Use regex to extract the full statement body.

```typescript
const CREATE_TABLE_REGEX = /CREATE\s+TABLE\s+\[(\w+)\]\.\[(\w+)\]\s*\(([\s\S]*?)\)\s*ON\s+\[PRIMARY\]/gi;
```

**Step 2: Pre-process UDTs before AST parsing**

For each CREATE TABLE body, replace all `[dbo].[UdtName]` references with their base SQL types:

```typescript
function preprocessUdts(sql: string): string {
  // Replace [dbo].[UdtName] with [baseType](maxLength) or just [baseType]
  return sql.replace(/\[dbo\]\.\[(\w+)\]/g, (match, name) => {
    const udt = udtMap.get(name);
    if (!udt) return match; // Not a UDT, leave as-is (could be table ref)
    if (udt.maxLength) return `[${udt.baseType}](${udt.maxLength})`;
    return `[${udt.baseType}]`;
  });
}
```

**Step 3: Parse with node-sql-parser**

```typescript
import { Parser } from 'node-sql-parser';
const parser = new Parser();

function parseCreateTable(preprocessedSql: string): any {
  try {
    const ast = parser.astify(preprocessedSql, { database: 'TransactSQL' });
    return ast;
  } catch (e) {
    return null; // Fallback needed
  }
}
```

Extract from AST:
- Column names: `ast.create_definitions` where `resource === 'column'`
- Column types: `definition.dataType` with length/precision
- Nullable: `definition.nullable` (look for `NOT NULL` constraint)
- Identity: presence of `auto_increment` or identity syntax
- PK constraint: `resource === 'constraint'` with `constraint_type === 'primary key'`
- Unique constraints: same with `constraint_type === 'unique'`

**Step 4: Implement regex fallback**

Some tables may fail AST parsing (edge cases). Implement regex fallback to extract columns:

```typescript
const COLUMN_REGEX = /^\s*\[(\w+)\]\s+\[(\w+)\](?:\(([^)]+)\))?\s*(IDENTITY\(\d+,\d+\))?\s*(NOT\s+NULL|NULL)?/gm;
```

Track success rate. Target: >95% AST success (2,160+ tables).

**Step 5: Build table objects**

For each parsed table, build `TableDef` with columns populated. Cross-reference PK constraint columns with column list to set `isPrimaryKey` on each column.

**Step 6: Verify table parsing**

Run: `npm run parse:db:schema`
Expected: Prints `Phase 2: Parsed 2,285 tables (N via AST, M via regex fallback)` with column counts

Spot-check: `SEC_Users` should have 93 columns, `SEC_UserTypes` should have 9 columns.

**Step 7: Commit**

```bash
git add scripts/parse-sql-schema.ts
git commit -m "feat(parser): Phase 2 — parse CREATE TABLE with node-sql-parser AST + regex fallback"
```

---

### Task 4: Phase 3 — FK constraint extraction

**Files:**
- Modify: `scripts/parse-sql-schema.ts`

**Step 1: Parse ALTER TABLE...FOREIGN KEY...REFERENCES**

The SQL file has FK constraints as:
```sql
ALTER TABLE [dbo].[ACT_ActivityLog]  WITH CHECK ADD  CONSTRAINT [FK_ACT_ActivityLog_CourseInstructorID] FOREIGN KEY([CourseInstructorID])
REFERENCES [dbo].[ACT_Instructor] ([CourseInstructorID])
```

These are multi-line. Regex:

```typescript
const FK_REGEX = /ALTER\s+TABLE\s+\[(\w+)\]\.\[(\w+)\]\s+WITH\s+(?:NO)?CHECK\s+ADD\s+CONSTRAINT\s+\[([^\]]+)\]\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*\nREFERENCES\s+\[(\w+)\]\.\[(\w+)\]\s*\(([^)]+)\)/gi;
```

Extract:
- Group 1-2: parent schema.table
- Group 3: constraint name
- Group 4: source column(s) — parse `[col1], [col2]` format
- Group 5-6: referenced schema.table
- Group 7: referenced column(s)

**Step 2: Merge FKs into table objects**

After Phase 2 builds the table map, iterate FK results and push into each table's `foreignKeys` array.

**Step 3: Verify FK parsing**

Run: `npm run parse:db:schema`
Expected: `Phase 3: Extracted ~1,068 FK constraints across N tables`

Spot-check: `ACT_ActivityLog` should have FKs referencing `ACT_Instructor`, `ACT_Course`, `ACT_CourseSessions`, `PRC_ProcedureCategories`, `PRC_Procedures`, `ACT_DNPPrograms`.

**Step 4: Commit**

```bash
git add scripts/parse-sql-schema.ts
git commit -m "feat(parser): Phase 3 — extract accurate FK constraints with column mappings"
```

---

### Task 5: Phase 4 — SPs, functions, views, triggers, indexes, defaults

**Files:**
- Modify: `scripts/parse-sql-schema.ts`

**Step 1: Extract stored procedures**

```typescript
const SP_REGEX = /CREATE\s+(?:OR\s+ALTER\s+)?PROC(?:EDURE)?\s+\[(\w+)\]\.\[(\w+)\]/gi;
```

Count only — we don't need SP bodies in tables.json (SP reconciliation is separate).

**Step 2: Extract functions and views**

```typescript
const FUNC_REGEX = /CREATE\s+FUNCTION\s+\[(\w+)\]\.\[(\w+)\]/gi;
const VIEW_REGEX = /CREATE\s+VIEW\s+\[(\w+)\]\.\[(\w+)\]/gi;
```

**Step 3: Extract indexes from CREATE INDEX statements**

Indexes appear as:
```sql
CREATE NONCLUSTERED INDEX [IX_Name] ON [dbo].[Table]([Col] ASC) INCLUDE ([Col2]) ...
```

Also inline PK/UNIQUE constraints from CREATE TABLE (already captured in Phase 2).

Regex for standalone indexes:
```typescript
const INDEX_REGEX = /CREATE\s+(UNIQUE\s+)?(?:CLUSTERED|NONCLUSTERED)\s+INDEX\s+\[([^\]]+)\]\s+ON\s+\[(\w+)\]\.\[(\w+)\]\s*\(([^)]+)\)(?:\s*INCLUDE\s*\(([^)]+)\))?/gi;
```

**Step 4: Extract DEFAULT constraints**

```sql
ALTER TABLE [dbo].[Table] ADD CONSTRAINT [DF_Name] DEFAULT (value) FOR [Column]
```

```typescript
const DEFAULT_REGEX = /ALTER\s+TABLE\s+\[(\w+)\]\.\[(\w+)\]\s+ADD\s+(?:CONSTRAINT\s+\[([^\]]+)\]\s+)?DEFAULT\s+\(([^)]+)\)\s+FOR\s+\[(\w+)\]/gi;
```

Merge default values into column definitions (set `column.defaultValue`). Also increment `table.defaultConstraints` count.

**Step 5: Extract triggers**

```typescript
const TRIGGER_REGEX = /CREATE\s+TRIGGER\s+\[(\w+)\]\.\[(\w+)\]\s+ON\s+\[(\w+)\]\.\[(\w+)\]\s+(AFTER|INSTEAD\s+OF)/gi;
```

**Step 6: Verify all extractions**

Run: `npm run parse:db:schema`
Expected output:
```
Phase 4: Extracted:
  ~4,830 stored procedures
  ~485 functions
  ~60 views
  ~11 triggers
  ~N standalone indexes
  ~738 default constraints
```

**Step 7: Commit**

```bash
git add scripts/parse-sql-schema.ts
git commit -m "feat(parser): Phase 4 — extract SPs, functions, views, triggers, indexes, defaults"
```

---

### Task 6: Phase 5 — Module assignment and tables.json output

**Files:**
- Modify: `scripts/parse-sql-schema.ts`

**Step 1: Copy module prefix logic from existing parser**

Copy `PREFIX_NORMALIZE` and `DISPLAY_NAMES` maps from `scripts/parse-db-schema.ts` (lines 182-224). These assign tables to modules by their name prefix (e.g., `SEC_Users` → Security, `EVAL_Forms` → Evaluations).

The module assignment algorithm:
1. Strip schema prefix
2. Extract prefix before first `_`
3. Normalize via `PREFIX_NORMALIZE` map
4. If prefix has a display name → assign to that module
5. If no match → assign to `"Uncategorized"` module
6. Special case: `perf` schema tables → `"Performance Schema"` module
7. Special case: `_DEL_` prefix → `"Soft-Deleted"` module

**Step 2: Build final output JSON**

```typescript
interface TablesJson {
  exportDate: string;        // '2026-02-26'
  source: string;            // 'MyEvaluations_Schema_20260226.sql'
  totalTables: number;       // 2285
  schemas: string[];         // ['dbo', 'perf']
  modules: ModuleEntry[];
}

interface ModuleEntry {
  prefix: string;            // 'SEC'
  displayName: string;       // 'Security'
  tableCount: number;
  tables: TableDef[];        // Full table definitions with columns
}
```

Also generate supplementary files:
- `summary.json` — total counts (tables, SPs, functions, views, triggers)
- `indexes.json` — all indexes by table
- `triggers.json` — all triggers by table

**Step 3: Run full parser and compare**

Run: `npm run parse:db:schema`

Compare table counts with Excel-based parser output:
- Total tables should be ~2,284-2,285 (may differ by 1 due to edge cases)
- Module counts should be close to Excel version

Print comparison: `Tables: 2,285 (was 2,284). Modules: 23.`

**Step 4: Verify tables.json structure**

Spot-check `generated/db-schema/tables.json`:
- `modules[].tables[].columns` array exists with correct column definitions
- `modules[].tables[].foreignKeys[].referencedTable` has real table names (not heuristic)
- PK columns have `isPrimaryKey: true`
- Identity columns have `isIdentity: true`
- UDT columns show resolved `dataType` and original `rawType`

**Step 5: Commit**

```bash
git add scripts/parse-sql-schema.ts
git commit -m "feat(parser): Phase 5 — module assignment and tables.json output with columns"
```

---

### Task 7: Update TableDetail component — column sub-table

**Files:**
- Modify: `src/components/TableDetail.tsx` (685 lines)

**Step 1: Add column interface to TableEntry**

At line 3-36 in `TableDetail.tsx`, add to the `TableEntry` interface:

```typescript
// After foreignKeys definition (around line 10):
columns?: Array<{
  name: string;
  dataType: string;
  rawType: string;
  maxLength: string | null;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}>;
```

Also update `foreignKeys` to include the new fields (keep backward compatible):

```typescript
foreignKeys: Array<{
  constraintName: string;
  referencedTable: string;
  columns?: string[];
  referencedColumns?: string[];
}>;
```

**Step 2: Add column count to summary row**

In the `TableDetailRow` component (around line 106), add column count badge next to the existing badges:

```tsx
{table.columns && table.columns.length > 0 && (
  <span style={{ ...badgeStyle, background: '#e6f7ff', color: '#1890ff' }}>
    {table.columns.length} cols
  </span>
)}
```

**Step 3: Add column sub-table to expanded section**

Inside the expanded detail section (around line 143-287), add a new section BEFORE the existing Foreign Keys section:

```tsx
{table.columns && table.columns.length > 0 && (
  <div style={{ marginTop: '8px' }}>
    <strong>Columns ({table.columns.length}):</strong>
    <div style={{ overflowX: 'auto', marginTop: '4px' }}>
      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e8e8e8', textAlign: 'left' }}>
            <th style={{ padding: '4px 8px' }}>#</th>
            <th style={{ padding: '4px 8px' }}>Column</th>
            <th style={{ padding: '4px 8px' }}>Type</th>
            <th style={{ padding: '4px 8px' }}>Null</th>
            <th style={{ padding: '4px 8px' }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {table.columns
            .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
            .map((col) => (
              <tr key={col.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '3px 8px', color: '#999', fontSize: '0.75rem' }}>
                  {col.ordinalPosition}
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {col.isPrimaryKey && <span title="Primary Key">🔑 </span>}
                  {col.isIdentity && <span title="Identity" style={{ color: '#722ed1' }}>⚡ </span>}
                  {col.name}
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {col.dataType}{col.maxLength ? `(${col.maxLength})` : ''}
                  {col.rawType !== col.dataType && (
                    <span style={{ color: '#999', marginLeft: '4px' }} title={`UDT: ${col.rawType}`}>
                      ← {col.rawType}
                    </span>
                  )}
                </td>
                <td style={{ padding: '3px 8px' }}>
                  {col.isNullable ? <span style={{ color: '#999' }}>yes</span> : <span style={{ fontWeight: 600 }}>NO</span>}
                </td>
                <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#595959' }}>
                  {col.defaultValue ?? ''}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

**Step 4: Update FK display for column mappings**

Replace the existing FK display (lines 208-224) to show column-level mappings:

```tsx
{table.foreignKeys.length > 0 && (
  <div style={{ marginTop: '4px' }}>
    <strong>Foreign Keys ({table.foreignKeys.length}):</strong>
    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
      {table.foreignKeys.slice(0, 10).map((fk, i) => (
        <li key={`${table.fullName}-fk-${i}`}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {fk.columns ? fk.columns.join(', ') : fk.constraintName}
          </span>
          {' → '}
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {fk.referencedTable}
            {fk.referencedColumns ? `.${fk.referencedColumns.join(', ')}` : ''}
          </span>
        </li>
      ))}
      {table.foreignKeys.length > 10 && (
        <li style={{ fontStyle: 'italic' }}>+{table.foreignKeys.length - 10} more</li>
      )}
    </ul>
  </div>
)}
```

**Step 5: Verify component compiles**

Run: `npm run build`
Expected: Build succeeds (component accepts new optional fields without breaking existing pages)

**Step 6: Commit**

```bash
git add src/components/TableDetail.tsx
git commit -m "feat(TableDetail): add inline column sub-table and FK column mappings"
```

---

### Task 8: Update generate-db-pages to pass column data + ER improvements

**Files:**
- Modify: `scripts/generate-db-pages.ts`

**Step 1: Pass column data in table component props**

In the `tablesForComponent` mapping (around line 660-681), add `columns` to the spread:

```typescript
const tablesForComponent = mod.tables.map((t) => {
  const te = enrichmentByName.get(t.name);
  return {
    name: t.name,
    schema: t.schema,
    fullName: t.fullName,
    hasPrimaryKey: t.hasPrimaryKey,
    primaryKeyColumns: t.primaryKeyColumns,
    columns: t.columns ?? [],  // NEW
    foreignKeys: t.foreignKeys,
    indexes: t.indexes,
    checkConstraints: t.checkConstraints,
    defaultConstraints: t.defaultConstraints,
    triggers: t.triggers,
    ...(te?.summary && { summary: te.summary }),
    ...(te?.businessPurpose && { businessPurpose: te.businessPurpose }),
    ...(te?.dataSensitivity && { dataSensitivity: te.dataSensitivity }),
    ...(te?.migrationRelevance && { migrationRelevance: te.migrationRelevance }),
    ...(te?.migrationNote && { migrationNote: te.migrationNote }),
    ...(te?.complexity && { complexity: te.complexity }),
  };
});
```

**Note:** For large modules (300+ tables), columns data could make the inline JSON very large. Add a size check — if the serialized JSON exceeds 500KB, omit columns for tables with >50 columns to keep page load reasonable. Track and log any tables where columns are trimmed.

**Step 2: Improve Mermaid ER diagram**

Update `generateMermaidER` function (lines 422-484) to include column annotations:

```typescript
// For each table in the ER diagram, show PK + FK columns
function generateMermaidER(tables: TableDef[], maxTables = 20): string {
  // ... existing table selection logic ...

  // Add entity attributes (PK and FK columns only, max 5 per table)
  for (const table of selectedTables) {
    const keyColumns = (table.columns ?? [])
      .filter(c => c.isPrimaryKey || table.foreignKeys.some(fk => fk.columns?.includes(c.name)))
      .slice(0, 5);

    if (keyColumns.length > 0) {
      lines.push(`    ${safeName(table.name)} {`);
      for (const col of keyColumns) {
        const marker = col.isPrimaryKey ? 'PK' : 'FK';
        lines.push(`        ${col.dataType} ${col.name} ${marker}`);
      }
      lines.push(`    }`);
    }
  }

  // Use FK column names as relationship labels
  // Change: label = fk.constraintName → label = fk.columns?.join(',') ?? 'FK'
}
```

**Step 3: Update DB explorer data**

The `static/db-explorer-data.json` (D3 force graph) should include FK column info for tooltips. In the explorer data generation, add `sourceColumns` and `targetColumns` to edge data.

**Step 4: Run full pipeline**

Run: `npm run parse:db:schema && npm run generate:db:pages`
Expected: All 23 module pages regenerated with column data in TableDetail props

**Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no errors

**Step 6: Commit**

```bash
git add scripts/generate-db-pages.ts
git commit -m "feat(generator): pass column data to TableDetail, improve ER diagrams"
```

---

### Task 9: Update package.json scripts and CLAUDE.md

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

**Step 1: Verify package.json scripts**

Ensure these scripts are correct:

```json
"parse:db:schema": "tsx scripts/parse-sql-schema.ts",
"parse:db:schema:excel": "tsx scripts/parse-db-schema.ts",
```

Verify `db:full` chain still works:

```json
"db:full": "npm run parse:db:schema && npm run parse:db:reconcile && npm run generate:db:pages",
```

**Step 2: Update CLAUDE.md**

Update the Commands section to reference new SQL parser. Update the Key Directories / Architecture section to note SQL is the primary data source. Add note that Excel parser is deprecated.

**Step 3: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "chore: update scripts and CLAUDE.md for SQL parser"
```

---

### Task 10: Full pipeline verification

**Files:**
- No new files — integration test

**Step 1: Run full pipeline end-to-end**

```bash
npm run parse:db:schema && npm run parse:db:reconcile && npm run generate:db:pages && npm run build
```

Expected: All steps succeed, Docusaurus builds without errors.

**Step 2: Verify output quality**

Check `generated/db-schema/tables.json`:
- Total tables: ~2,285
- All modules have tables with `columns` arrays
- FK `referencedTable` values are actual table names
- UDT columns show resolved types

**Step 3: Spot-check rendered pages**

Run: `npm run serve` (port 3700)

Check:
- `/database/overview` — module breakdown table renders
- `/database/modules/security` — TableDetail shows column counts, expand a row to see column sub-table
- `/database/explorer` — D3 graph loads with FK edges
- `/database/health` — SchemaHealth dashboard renders

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: complete SQL parser replacement with full column documentation"
git push origin main
```
