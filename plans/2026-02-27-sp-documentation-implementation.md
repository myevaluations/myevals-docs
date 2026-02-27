# Stored Procedure Documentation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Parse all 6,169 stored procedures from the SQL export and generate 23 per-module SP reference pages with interactive browsing, anti-pattern analysis, and cross-linking.

**Architecture:** A new `parse-sql-sprocs.ts` script reads the same 147MB UTF-16LE SQL file, splits by GO blocks, extracts SP name/schema/parameters/body/anti-patterns, and outputs `stored-procedures-full.json` + per-module body files. A new `generate-db-sproc-pages.ts` script reads the JSON and produces 23 MDX pages using a new `SprocDetail.tsx` React component (modeled after `TableDetail.tsx`). Cross-linking merges reconciliation data (code callers) into SP metadata.

**Tech Stack:** TypeScript (tsx), node-sql-parser, Docusaurus 3.7 MDX, React 18, Mermaid diagrams

**Design doc:** `plans/2026-02-27-sp-documentation-design.md`

---

## Phase 1: SP Parser

### Task 1: Create parse-sql-sprocs.ts — File reading and GO-block extraction

**Files:**
- Create: `scripts/parse-sql-sprocs.ts`

**Step 1: Create the script with file reading and block splitting**

Create `scripts/parse-sql-sprocs.ts` with these elements:

1. **Imports and constants** — mirror `parse-sql-schema.ts` patterns:
   - `import * as fs from 'fs'` and `import * as path from 'path'`
   - Constants: `PROJECT_ROOT`, `INPUT_FILE` (same SQL file), `OUTPUT_DIR`, `BODIES_DIR`

2. **Type interfaces** — define all output types per the design doc:
   - `SpParameter` — name, dataType, direction (IN/OUTPUT), defaultValue
   - `AntiPatterns` — boolean flags for cursors, SELECT *, dynamic SQL, NOLOCK (with count), missing SET NOCOUNT ON, table variables, temp tables, WHILE loops, no TRY/CATCH
   - `CrudType` — 'get' | 'insert' | 'update' | 'delete' | 'report' | 'mixed'
   - `Complexity` — 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex'
   - `SprocOutput` — full SP record with name, schema, parameters, lineCount, bodyPreview, tablesReferenced, sprocsCalledFromBody, crudType, antiPatterns, calledFromCode, complexity, module
   - `SprocModuleOutput` — prefix, displayName, procedureCount, procedures array
   - `SprocFullJson` — exportDate, source, totalProcedures, stats, modules array

3. **Module prefix detection** — copy `PREFIX_PATTERNS`, `PREFIX_NORMALIZE`, `DISPLAY_NAMES`, and `detectPrefix()` from `parse-sql-schema.ts` (lines 146-227). Adapt `detectPrefix` to work on SP names using `_` separator (e.g., `EVAL_GetPending` -> EVAL module).

4. **Main function** — read the UTF-16LE file and split by GO blocks:
   - `fs.readFileSync(INPUT_FILE, 'utf16le')`
   - `content.split(/\nGO\r?\n/)`
   - Filter blocks matching SP regex: `/^(?:\/\*[\s\S]*?\*\/\s*)?(?:SET\s+\w+\s+\w+\s*\r?\n)*\s*CREATE\s+PROC(?:EDURE)?\s/i`
   - Log: file size, total GO blocks, SP blocks found

**Step 2: Run the script to verify block splitting works**

Run: `npx tsx scripts/parse-sql-sprocs.ts`
Expected: Output showing ~5,000-6,000+ SP blocks found.

**Step 3: Commit**

Message: `feat(sp-parser): scaffold parse-sql-sprocs.ts with block splitting`

---

### Task 2: SP header parsing — name, schema, parameters

**Files:**
- Modify: `scripts/parse-sql-sprocs.ts`

**Step 1: Add the header parsing function**

Add `parseSprocHeader(block)` that extracts:
1. **Schema and name** via regex: `CREATE PROC[EDURE] [schema].[name]`
2. **Parameters** from the text between the name and `AS` keyword:
   - Regex: `@(\w+)\s+([\w]+(?:\s*\([^)]*\))?)\s*(?:=\s*([^,\r\n]+?))?\s*(?:\b(OUT(?:PUT)?)\b)?`
   - Each param becomes `{ name, dataType, direction, defaultValue }`
3. **Body** — everything after the `AS` keyword

**Step 2: Wire into main loop**

Parse all SP blocks, collect results, log:
- Total parsed procedures
- Procedures with parameters vs. without
- Sample first 3 procedures (name, schema, param count)

**Step 3: Run and verify**

Run: `npx tsx scripts/parse-sql-sprocs.ts`
Expected: 5,000+ procedures parsed. Spot-check parameter counts look reasonable.

**Step 4: Commit**

Message: `feat(sp-parser): extract SP name, schema, and parameters`

---

### Task 3: Anti-pattern detection

**Files:**
- Modify: `scripts/parse-sql-sprocs.ts`

**Step 1: Add `detectAntiPatterns(body)` function**

Strip comments first (`--` and `/* */`), then detect:
- **Cursors:** `DECLARE ... CURSOR` or `OPEN ... CURSOR` or `FETCH NEXT`
- **SELECT *:** `SELECT * FROM` (not in comments)
- **Dynamic SQL:** `EXEC (` or `sp_executesql`
- **NOLOCK:** `WITH (NOLOCK)` with count
- **Missing SET NOCOUNT ON:** body doesn't contain it
- **Table variables:** `DECLARE @var TABLE`
- **Temp tables:** `CREATE TABLE #` or `INTO #`
- **WHILE loops:** `WHILE` keyword
- **No TRY/CATCH:** body doesn't contain `BEGIN TRY`

**Step 2: Wire into parsing loop, log aggregate stats**

Print: cursor count (~13), SELECT * (~80), dynamic SQL (~18), NOLOCK (~88), etc.

**Step 3: Run and verify counts are in expected ballpark**

**Step 4: Commit**

Message: `feat(sp-parser): detect anti-patterns (cursors, SELECT *, dynamic SQL, NOLOCK)`

---

### Task 4: Table reference extraction, CRUD type, and complexity

**Files:**
- Modify: `scripts/parse-sql-sprocs.ts`

**Step 1: Add `extractTableReferences(body, knownTables)` function**

- Load known table names from `generated/db-schema/tables.json` at startup
- Regex patterns on SP body: FROM, JOIN, INSERT INTO, UPDATE, DELETE FROM, MERGE INTO, TRUNCATE TABLE
- Filter results against known table names to avoid aliases and temp tables

**Step 2: Add `extractSprocCalls(body, selfName)` function**

- Detect `EXEC/EXECUTE [schema].[sprocName]` patterns
- Exclude system SPs (sp_executesql, sp_xml_preparedocument, etc.)
- Exclude self-calls

**Step 3: Add `detectCrudType(name, body)` function**

Priority order: name-based heuristics first, body-based as fallback.
- `rpt_` or `Report` prefix -> 'report'
- Name keywords: Get/Select/Find -> 'get', Insert/Add/Create -> 'insert', Update/Modify -> 'update', Delete/Remove -> 'delete'
- Multiple CRUD ops -> 'mixed'
- GROUP BY + multiple JOINs -> 'report'

**Step 4: Add `rateComplexity(lineCount, tableRefCount, antiPatterns)` function**

Based on line count, table reference count, and anti-pattern score.

**Step 5: Wire everything into main loop, log distribution stats**

**Step 6: Run and verify**

Expected: CRUD breakdown is plausible (more GETs than DELETEs). Top referenced tables printed.

**Step 7: Commit**

Message: `feat(sp-parser): table refs, CRUD type, complexity rating`

---

### Task 5: JSON output and code-caller merge

**Files:**
- Modify: `scripts/parse-sql-sprocs.ts`

**Step 1: Load reconciliation data and build code-caller lookup**

- Read `generated/db-schema/sproc-reconciliation.json`
- Build `Map<string, string[]>` from SP name to array of `"ClassName.MethodName"` strings
- Fall back gracefully if reconciliation file doesn't exist

**Step 2: Build the full JSON output grouped by module**

- Group procedures by detected module prefix
- Sort modules by procedure count (descending)
- Sort procedures within each module alphabetically
- Compute aggregate stats (bySchema, byCrudType, antiPatternCounts)
- Each procedure's `calledFromCode` populated from the reconciliation lookup

**Step 3: Write output files**

- `stored-procedures-full.json` — main JSON with bodyPreview (first 200 lines)
- `sp-bodies/<MODULE>.json` — full bodies per module (for AI enrichment, git-ignored)

**Step 4: Run the full parser end-to-end**

Run: `npx tsx scripts/parse-sql-sprocs.ts`
Expected: JSON files written, summary stats match design expectations.

**Step 5: Verify JSON structure**

Check: total procedures, module count, first SP has all fields populated.

**Step 6: Commit**

Message: `feat(sp-parser): complete JSON output with code-caller merge`

---

### Task 6: Add npm scripts and update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Add npm scripts**

```json
"parse:db:sprocs": "tsx scripts/parse-sql-sprocs.ts",
"generate:db:sproc-pages": "tsx scripts/generate-db-sproc-pages.ts"
```

Update `db:full`:
```json
"db:full": "npm run parse:db:schema && npm run parse:db:sprocs && npm run parse:db:reconcile && npm run generate:db:pages && npm run generate:db:sproc-pages"
```

**Step 2: Add `generated/db-schema/sp-bodies/` to `.gitignore`**

**Step 3: Run `npm run parse:db:sprocs` to verify npm script works**

**Step 4: Commit**

Message: `chore: add SP parser npm scripts, gitignore sp-bodies`

---

## Phase 2: Page Generator + Component

### Task 7: Create SprocDetail.tsx component

**Files:**
- Create: `src/components/SprocDetail.tsx`

**Step 1: Create the component modeled after TableDetail.tsx**

Key elements (reference `src/components/TableDetail.tsx` for patterns):

1. **Props interface** — `SprocEntry` with all SP fields + optional AI enrichment, `SprocDetailProps` with `procedures` (inline) or `dataUrl` (fetch from static JSON).

2. **Data loading** — `useEffect` + `fetch(dataUrl)` pattern (same as `SprocReconciliation.tsx` line 63-76).

3. **State** — search, sort (field + direction), filters (crudType, complexity, hasIssues), expandedSet.

4. **Stats cards row** — total procedures, parameter distribution, CRUD breakdown (color-coded badges), complexity distribution, anti-pattern count.

5. **Filter bar** — search input, CRUD dropdown (all/get/insert/update/delete/report/mixed), complexity dropdown (all/trivial/simple/moderate/complex/very-complex), "Has Issues" dropdown (all/cursor/selectStar/dynamicSql/nolock).

6. **Main table** — sortable columns: SP Name, Params, Lines, CRUD, Tables, Issues, Complexity. Click to expand.

7. **Expanded detail** — parameter table, tables referenced (as module links), anti-pattern badges (color-coded by severity), called-from-code list, AI enrichment (summary, businessPurpose, optimizationRecommendations), other SPs called.

8. **Styling** — all inline CSSProperties using Docusaurus CSS variables. Copy color constants from TableDetail.tsx and add CRUD_COLORS and SEVERITY_COLORS.

**Step 2: Commit**

Message: `feat(component): create SprocDetail.tsx interactive SP browser`

---

### Task 8: Create generate-db-sproc-pages.ts

**Files:**
- Create: `scripts/generate-db-sproc-pages.ts`

**Step 1: Create the generator**

Structure (model after `generate-db-pages.ts`):

1. **Read inputs:** `stored-procedures-full.json`, optional enrichment JSONs from `generated/ai-enriched/db-schema/per-module-sprocs/`

2. **For each module, generate:**
   - `docs/database/modules/sprocs/<slug>-sprocs.mdx` — MDX page with:
     - Frontmatter (title, sidebar_label, sidebar_position, description)
     - Import SprocDetail component
     - Summary line (procedure count + CRUD breakdown)
     - Anti-pattern summary table
     - Optimization priorities section (grouped by severity)
     - SprocDetail component with `dataUrl` prop pointing to static JSON
   - `static/sproc-detail-data/<slug>.json` — procedure data without bodyPreview (for component loading)

3. **Ensure directories exist:** `docs/database/modules/sprocs/`, `static/sproc-detail-data/`

4. **Log output:** number of pages generated, total procedures covered

**Step 2: Run the generator**

Run: `npx tsx scripts/generate-db-sproc-pages.ts`
Expected: 23 MDX files + 23 JSON files created.

**Step 3: Commit**

Message: `feat(generator): create SP reference page generator`

---

### Task 9: Update sidebar and module page cross-links

**Files:**
- Modify: `sidebars.ts`
- Modify: `scripts/generate-db-pages.ts`

**Step 1: Add SP category to sidebar**

In the `Database Schema` category, add after `Tables by Module`:
```typescript
{
  type: 'category',
  label: 'Stored Procedures by Module',
  collapsed: true,
  items: [{
    type: 'autogenerated',
    dirName: 'database/modules/sprocs',
  }],
},
```

**Step 2: Add SP section link to module overview pages**

In `generateModuleMdx()`, append a `## Stored Procedures` section at the bottom with a link to `./sprocs/<slug>-sprocs`.

**Step 3: Build the site**

Run: `npm run generate:db:pages && npx tsx scripts/generate-db-sproc-pages.ts && npm run build`
Expected: Build succeeds. SP reference pages accessible in sidebar.

**Step 4: Commit**

Message: `feat: add SP sidebar category and cross-link from module pages`

---

## Phase 3: Cross-linking and Polish

### Task 10: Update overview page stats and SP reconciliation links

**Files:**
- Modify: `scripts/generate-db-pages.ts`

**Step 1: Add SP stats to overview page**

Load `stored-procedures-full.json` in the generator. Add to overview MDX:
- Total stored procedures
- Anti-pattern summary (aggregate)
- Link to SP reconciliation page

**Step 2: Build and verify**

Run: `npm run generate:db:pages && npx tsx scripts/generate-db-sproc-pages.ts && npm run build`
Expected: Build succeeds. Overview page shows SP stats.

**Step 3: Commit**

Message: `feat: update overview stats with SP data`

---

### Task 11: Update CLAUDE.md and full pipeline test

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md**

Add new scripts, directories, and SP pipeline documentation.

**Step 2: Run `npm run db:full` end-to-end**

Expected: All steps succeed — schema parse, SP parse, reconcile, generate table pages, generate SP pages.

**Step 3: Run `npm run build`**

Expected: Clean build, zero errors.

**Step 4: Commit**

Message: `docs: update CLAUDE.md with SP pipeline documentation`

---

## Phase 4: AI Enrichment (Deferred — separate sessions)

### Task 12: Create AI enrichment merge script

**Files:**
- Create: `scripts/enrich-sprocs.ts`

**Step 1: Create enrichment merge script**

Reads enrichment JSONs from `generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json`, merges enrichment fields (summary, businessPurpose, optimizationRecommendations, complexity, migrationRelevance) into SP reference pages.

**Step 2: Document enrichment process in CLAUDE.md**

**Step 3: Commit**

Message: `feat: add SP enrichment merge script and process docs`

---

## Summary

| Task | Phase | Description | Key Files |
|------|-------|-------------|-----------|
| 1 | Parser | Script scaffold + block splitting | `parse-sql-sprocs.ts` |
| 2 | Parser | Header parsing (name, schema, params) | `parse-sql-sprocs.ts` |
| 3 | Parser | Anti-pattern detection | `parse-sql-sprocs.ts` |
| 4 | Parser | Table refs, CRUD type, complexity | `parse-sql-sprocs.ts` |
| 5 | Parser | JSON output + code-caller merge | `parse-sql-sprocs.ts` |
| 6 | Parser | npm scripts + .gitignore | `package.json`, `.gitignore` |
| 7 | UI | SprocDetail.tsx component | `SprocDetail.tsx` |
| 8 | Generator | SP reference page generator | `generate-db-sproc-pages.ts` |
| 9 | Integration | Sidebar + module cross-links | `sidebars.ts`, `generate-db-pages.ts` |
| 10 | Cross-link | Overview stats | `generate-db-pages.ts` |
| 11 | Polish | CLAUDE.md + full pipeline test | `CLAUDE.md` |
| 12 | AI | Enrichment script (deferred) | `enrich-sprocs.ts` |
