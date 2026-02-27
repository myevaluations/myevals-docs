# SQL Schema Parser Replacement + Column Documentation

**Date:** 2026-02-27
**Status:** Approved
**Goal:** Replace Excel-based parser with AST-based SQL parser; add full column-level documentation

## Context

The MyEvaluations documentation site documents a 2,284-table SQL Server database. The current data source is an Excel export (`MyEvaluationsDatabaseSchema_20260226.xlsx`) parsed by `scripts/parse-db-schema.ts`. This has two critical limitations:

1. **No column definitions** — tables list names and constraints but zero column data
2. **Wrong FK references** — heuristic parsing from constraint names produces incorrect referenced table names

A complete SSMS schema export (`input/MyEvaluations_Schema_20260226.sql`, 147MB, 1.49M lines) is now available with full DDL for all objects.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parser strategy | AST-based (`node-sql-parser`) | User preference; structured parsing over regex fragility |
| Column scope | All 2,285 tables, full column definitions | "Full column documentation" |
| FK handling | Parse from SQL for accurate data | Fix wrong heuristic-based references |
| Column UI | Inline expandable sub-table in TableDetail | Columns visible within table row expansion |
| Excel parser | Replace entirely | SQL file is strictly superior data source |

## Architecture

### Parser Pipeline (`scripts/parse-sql-schema.ts`)

```
Read SQL file (UTF-16LE → UTF-8)
  ↓
Split into individual statements (GO delimiter)
  ↓
Phase 1: Extract UDTs via regex → build UDT lookup map (18 types)
  ↓
Phase 2: Pre-process CREATE TABLE statements
  - Replace [dbo].[UdtName] column types with base SQL types
  - Feed to node-sql-parser (TransactSQL dialect) → extract columns, PKs
  ↓
Phase 3: Extract FK constraints via regex
  - ALTER TABLE...ADD CONSTRAINT...FOREIGN KEY...REFERENCES
  - Exact: parent table, parent columns, referenced table, referenced columns
  ↓
Phase 4: Extract SPs, functions, views, triggers via regex (name + body)
  ↓
Phase 5: Merge all data → assign module prefixes → write tables.json
```

**Why hybrid AST+regex:**
- `node-sql-parser` reliably parses CREATE TABLE column definitions
- It fails on UDTs (`[dbo].[CounterNumber]`) — pre-process to replace with base types
- It fails on TSQL FK syntax — FKs are ALTER TABLE statements parsed separately
- SP/function bodies don't need AST — regex is sufficient

### UDT Resolution Map

18 scalar UDTs discovered in schema (e.g., `BigNumber` → `int`, `CounterNumber` → `bigint`, `ShortText` → `varchar(100)`, `LargeDate` → `datetime`). Parser builds this map from `CREATE TYPE` statements and applies it during column type resolution.

### Updated tables.json Schema

New fields per table:

```typescript
columns: {
  name: string;            // "UserID"
  dataType: string;        // "int" (resolved from UDT)
  rawType: string;         // "CounterNumber" (original, or same as dataType)
  maxLength: string | null; // "100", "max", null
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}[];

// Improved FK structure:
foreignKeys: {
  constraintName: string;
  columns: string[];           // Source columns
  referencedTable: string;     // Accurate (not heuristic)
  referencedColumns: string[]; // Referenced columns
}[];
```

### TableDetail Component Changes

- Add `columns` to `TableEntry` interface
- Show column count in summary row: "12 cols"
- Render column sub-table inside expanded row (sortable by ordinal)
- PK columns: key icon; identity columns: auto-increment badge
- UDT columns: tooltip showing `"CounterNumber (bigint)"`
- FK column mappings: `ProgramID → SEC_Programs.ProgramID`

### ER Diagram Improvements

- Include top 3-5 columns per table (PK + FK columns)
- Label relationships with actual column names instead of generic "FK"
- Keep existing limit of top 20 most-connected tables per module

## What Changes

| File | Action |
|------|--------|
| `scripts/parse-sql-schema.ts` | **CREATE** — new AST-based SQL parser |
| `scripts/parse-db-schema.ts` | **DEPRECATE** — replaced by SQL parser |
| `src/components/TableDetail.tsx` | **MODIFY** — add column sub-table |
| `scripts/generate-db-pages.ts` | **MODIFY** — pass columns, improve ER diagrams |
| `package.json` | **MODIFY** — add node-sql-parser, update script |
| `CLAUDE.md` | **MODIFY** — update references |

## What Stays the Same

- `generated/db-schema/tables.json` output path (additive schema changes)
- All downstream consumers (`ai-enrich-db-schema.ts`, etc.)
- Module prefix assignment logic
- Component props interface (additive only)

## Implementation Sequence

1. Install `node-sql-parser`, create parser script
2. Run parser, verify tables.json output
3. Update TableDetail component with column sub-table
4. Update generate-db-pages for columns + ER improvements
5. Update package.json scripts
6. Build and verify
