# Stored Procedure Documentation — Design

**Date:** 2026-02-27
**Status:** Approved
**Scope:** All 6,169 stored procedures across 23 modules
**Approach:** Full SP Body Parser (Approach 1) — extend `parse-sql-schema.ts`

---

## Requirements

1. **Comprehensive coverage** — all 6,169 SPs in the database (dbo + perf schemas)
2. **Full analysis per SP** — name, parameters, summary, business purpose, tables read/written, optimization recommendations, complexity rating, module mapping, cross-references to .NET code
3. **Per-module SP reference pages** — 23 MDX pages (one per module), linked from module overview pages
4. **AI enrichment** — via Claude CLI Task agents (free, batch), processed one module at a time
5. **Cross-linking** — SPs ↔ tables, SPs ↔ .NET code files, module pages ↔ SP reference pages

---

## Architecture

### Data Flow

```
input/MyEvaluations_Schema_20260226.sql (147MB, UTF-16LE)
    │
    ▼
parse-sql-schema.ts (enhanced Phase 4)
    │
    ├─► generated/db-schema/stored-procedures-full.json  (SP metadata + body preview)
    ├─► generated/db-schema/sp-bodies/<MODULE>.json      (full bodies for AI enrichment)
    └─► generated/db-schema/summary.json                 (updated SP stats)
    │
    ▼
reconcile-sprocs.ts (existing, enhanced)
    │
    └─► generated/db-schema/sproc-reconciliation.json    (updated with parameter data)
    │
    ▼
AI enrichment (Claude CLI agents, per-module)
    │
    └─► generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json
    │
    ▼
generate-db-pages.ts (enhanced)
    │
    ├─► docs/database/modules/sprocs/<module-slug>-sprocs.mdx  (23 SP reference pages)
    ├─► static/sproc-detail-data/<module-slug>.json            (static data for components)
    └─► docs/database/modules/<module-slug>.mdx                (updated with SP section link)
```

### Output JSON Schema

**`stored-procedures-full.json`** — Main SP metadata file:

```json
{
  "exportDate": "2026-02-26",
  "source": "MyEvaluations_Schema_20260226.sql",
  "totalProcedures": 6169,
  "stats": {
    "bySchema": { "dbo": 6030, "perf": 139 },
    "byCrudType": { "get": 2100, "insert": 800, "update": 900, "delete": 400, "report": 200, "mixed": 769 },
    "antiPatternCounts": {
      "cursors": 13,
      "selectStar": 80,
      "dynamicSql": 18,
      "nolockUsage": 88,
      "missingSetNocountOn": 125,
      "tableVariables": 96
    }
  },
  "modules": [
    {
      "prefix": "EVAL",
      "displayName": "Evaluations",
      "procedureCount": 332,
      "procedures": [
        {
          "name": "EVAL_GetPendingEvaluations",
          "schema": "dbo",
          "parameters": [
            {
              "name": "@UserID",
              "dataType": "int",
              "direction": "IN",
              "defaultValue": null
            },
            {
              "name": "@TotalCount",
              "dataType": "int",
              "direction": "OUTPUT",
              "defaultValue": null
            }
          ],
          "lineCount": 187,
          "bodyPreview": "First ~200 lines of the SP body",
          "tablesReferenced": ["EVAL_Evaluations", "EVAL_EvaluationAssignments", "SEC_Users"],
          "sprocsCalledFromBody": ["EVAL_GetEvaluationStatus"],
          "crudType": "get",
          "antiPatterns": {
            "hasCursor": false,
            "hasSelectStar": true,
            "hasDynamicSql": false,
            "hasNolock": true,
            "nolockCount": 12,
            "missingSetNocountOn": false,
            "hasTableVariable": true,
            "hasTempTable": false
          },
          "calledFromCode": [
            "EvaluationsManager.GetPendingEvaluations",
            "EvalBusiness.LoadPending"
          ],
          "complexity": "moderate",
          "aiEnrichment": null
        }
      ]
    }
  ]
}
```

**`sp-bodies/<MODULE>.json`** — Full SP bodies for AI enrichment (git-ignored):

```json
{
  "module": "EVAL",
  "procedureCount": 332,
  "procedures": [
    {
      "name": "EVAL_GetPendingEvaluations",
      "fullBody": "Complete SP body text..."
    }
  ]
}
```

### SP Parameter Extraction

Parse the parameter block between procedure name and `AS` keyword:

```sql
CREATE PROCEDURE [dbo].[EVAL_GetPendingEvaluations]
    @UserID int,                    -- IN, no default
    @ProgramID int = 0,             -- IN, default = 0
    @TotalCount int OUTPUT          -- OUTPUT
AS
BEGIN
```

**Regex pattern:**
```
@(\w+)\s+(\w+(?:\([^)]+\))?)\s*(?:=\s*([^,\n]+?))?\s*(OUTPUT|OUT)?\s*[,)]
```

**Direction detection:**
- Contains `OUTPUT` or `OUT` keyword → `OUTPUT`
- Otherwise → `IN`

### Anti-Pattern Detection

| Anti-Pattern | Detection | Severity |
|-------------|-----------|----------|
| **Cursors** | `DECLARE.*CURSOR`, `OPEN.*CURSOR`, `FETCH NEXT` | Critical |
| **SELECT \*** | `SELECT\s+\*\s+FROM` (not in comments) | High |
| **Dynamic SQL** | `EXEC\s*\(`, `sp_executesql`, `@sql.*=.*'SELECT` | High |
| **NOLOCK** | `WITH\s*\(\s*NOLOCK\s*\)`, count occurrences | Medium |
| **Missing SET NOCOUNT ON** | Body doesn't contain `SET NOCOUNT ON` | Low |
| **Table variables** | `DECLARE\s+@\w+\s+TABLE` | Medium |
| **Temp tables** | `CREATE\s+TABLE\s+#` or `INTO\s+#` | Info |
| **WHILE loops** | `WHILE\s+` (row-by-row processing) | Medium |
| **No TRY/CATCH** | Body doesn't contain `BEGIN TRY` | Low |

### Table Reference Extraction

Regex patterns on SP body to find referenced tables:

```
FROM\s+\[?(\w+)\]?\.\[?(\w+)\]?        -- FROM [schema].[table]
JOIN\s+\[?(\w+)\]?\.\[?(\w+)\]?        -- JOIN [schema].[table]
INSERT\s+INTO\s+\[?(\w+)\]?\.\[?(\w+)\]?
UPDATE\s+\[?(\w+)\]?\.\[?(\w+)\]?
DELETE\s+FROM\s+\[?(\w+)\]?\.\[?(\w+)\]?
```

Cross-reference with known table names from `tables.json` to filter false positives.

### CRUD Type Detection

| Type | Detection Logic |
|------|-----------------|
| `get` | Name contains Get/Select/Find/Search/List/Load, or body is SELECT-dominant |
| `insert` | Name contains Insert/Add/Create/Save (new), or body has INSERT INTO |
| `update` | Name contains Update/Modify/Edit/Save (existing), or body has UPDATE SET |
| `delete` | Name contains Delete/Remove/Archive, or body has DELETE FROM |
| `report` | Name starts with `rpt_` or `Report`, or has multiple JOINs + GROUP BY |
| `mixed` | Multiple CRUD operations detected |

### Complexity Rating

| Rating | Criteria |
|--------|----------|
| `trivial` | <20 lines, single table, no joins |
| `simple` | 20-50 lines, 1-2 tables, simple logic |
| `moderate` | 50-150 lines, 3-5 tables, some conditionals |
| `complex` | 150-500 lines, 5+ tables, dynamic SQL or cursors |
| `very-complex` | 500+ lines, many tables, multiple anti-patterns |

### Module Classification

Reuse existing `PREFIX_PATTERNS` from `parse-sql-schema.ts` for table module detection, applied to SP names. SPs without a recognized prefix go to `uncategorized`.

---

## Page Generator

### Per-Module SP Reference Page Structure

Each `docs/database/modules/sprocs/<module-slug>-sprocs.mdx` page:

```
---
title: "Evaluations — Stored Procedures"
sidebar_label: "Stored Procedures"
sidebar_position: 2
---

# Evaluations Module — Stored Procedures

> 332 stored procedures | 187 GET | 45 INSERT | 52 UPDATE | 28 DELETE | 12 Report | 8 Mixed

## Summary

| Metric | Count |
|--------|-------|
| Total Procedures | 332 |
| With Cursors | 13 |
| Using SELECT * | 24 |
| Dynamic SQL | 8 |
| Missing SET NOCOUNT ON | 42 |
| NOLOCK Usage | 88 (2,361 occurrences) |

## Optimization Priorities

### Critical (Fix First)
- **13 procedures use cursors** — replace with set-based operations
- **8 procedures use dynamic SQL** — parameterize to prevent SQL injection and plan cache pollution

### High Priority
- **24 procedures use SELECT *** — specify column lists
- **42 missing SET NOCOUNT ON** — add to reduce network traffic

### Medium Priority
- **88 procedures use NOLOCK** — audit for data consistency risks

## Stored Procedures

<SprocDetail procedures={...} />
```

### New React Component: `SprocDetail.tsx`

Similar to `TableDetail.tsx`:
- Searchable, filterable list of SPs
- Filter by CRUD type, complexity, anti-patterns present
- Expandable rows showing:
  - Parameter table (name, type, direction, default)
  - Tables referenced (linked to table docs)
  - Anti-pattern badges (color-coded by severity)
  - Called-from code locations (linked to .NET file reference pages)
  - AI enrichment (summary, business purpose, optimization recommendations) when available
  - Body preview (collapsible, syntax-highlighted)

### Cross-linking Updates

1. **Module overview pages** (`docs/database/modules/<slug>.mdx`) — add a `## Stored Procedures` section at the bottom linking to the SP reference page
2. **SP reconciliation page** — update to link individual SPs to their module SP page
3. **Sidebar** — SP reference pages appear as children of their module in the sidebar

---

## AI Enrichment

### Enrichment JSON Schema

`generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json`:

```json
{
  "module": "EVAL",
  "generatedAt": "2026-02-27T...",
  "procedureCount": 332,
  "procedures": [
    {
      "name": "EVAL_GetPendingEvaluations",
      "summary": "Retrieves pending evaluation assignments for a user, optionally filtered by program.",
      "businessPurpose": "Core workflow SP used on the evaluations dashboard to show residents which evaluations they need to complete.",
      "optimizationRecommendations": [
        "Replace SELECT * with explicit column list to reduce I/O",
        "Add index on EVAL_EvaluationAssignments(UserID, Status) to support the WHERE clause",
        "Consider adding pagination parameters to limit result set size"
      ],
      "complexity": "moderate",
      "migrationRelevance": "high"
    }
  ],
  "moduleOverview": "The Evaluations module contains 332 stored procedures...",
  "topOptimizationPriorities": [
    "Convert cursor-based SPs to set-based operations (13 SPs)",
    "Add missing indexes for frequent JOIN patterns"
  ]
}
```

### Enrichment Process

1. Run `npm run parse:db:sprocs` to generate SP metadata + per-module body files
2. For each module, run a Claude CLI agent that:
   - Reads `sp-bodies/<MODULE>.json` (full SP bodies)
   - Reads `stored-procedures-full.json` (metadata for context)
   - Produces enrichment JSON at `generated/ai-enriched/db-schema/per-module-sprocs/<MODULE>.json`
3. Run `npm run enrich:build` to merge enrichment into generated pages
4. Run `npm run generate:db:sproc-pages` to regenerate MDX

---

## Pipeline Integration

### New npm Scripts

```json
{
  "parse:db:sprocs": "tsx scripts/parse-sql-sprocs.ts",
  "generate:db:sproc-pages": "tsx scripts/generate-db-sproc-pages.ts",
  "db:full": "npm run parse:db:schema && npm run parse:db:sprocs && npm run parse:db:reconcile && npm run generate:db:pages && npm run generate:db:sproc-pages"
}
```

**Note:** While Approach 1 said "extend Phase 4", the actual implementation will be a **separate script** (`parse-sql-sprocs.ts`) because:
- The SP parsing logic is substantial enough to warrant its own file (~500-800 lines)
- It reuses the same GO-block splitting and UTF-16LE reading
- Avoids bloating the 1,325-line table parser further
- Can be iterated independently

The script still reads from the same SQL file — it's Approach 1 conceptually (single source of truth) with Approach 2's code organization.

### Memory Management

The 147MB SQL file parsed for SP bodies could generate large output. Strategy:
- **Main JSON** (`stored-procedures-full.json`): Contains metadata + `bodyPreview` (first 200 lines). ~20-30MB.
- **Per-module body files** (`sp-bodies/<MODULE>.json`): Full bodies for AI enrichment. ~5-15MB each, git-ignored.
- **Static JSON for components** (`static/sproc-detail-data/<slug>.json`): Metadata only (no body), ~1-2MB per module. Loaded by SprocDetail component.

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `scripts/parse-sql-sprocs.ts` | SP body parser (~600-800 lines) |
| `scripts/generate-db-sproc-pages.ts` | SP reference page generator (~400-500 lines) |
| `src/components/SprocDetail.tsx` | Interactive SP catalog component (~500-600 lines) |
| `docs/database/modules/sprocs/*.mdx` | 23 per-module SP reference pages (generated) |
| `static/sproc-detail-data/*.json` | Static data for SprocDetail component (generated) |
| `generated/db-schema/stored-procedures-full.json` | Main SP metadata (generated) |
| `generated/db-schema/sp-bodies/*.json` | Full SP bodies (generated, git-ignored) |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | Add `parse:db:sprocs`, `generate:db:sproc-pages`, update `db:full` |
| `scripts/generate-db-pages.ts` | Add SP section link to module pages |
| `sidebars.ts` | Add SP reference pages to sidebar |
| `CLAUDE.md` | Update pipeline docs |

---

## Implementation Phases

### Phase 1: SP Parser (Core)
- Parse SP blocks from SQL file
- Extract name, schema, parameters, body
- Detect anti-patterns
- Extract table references
- Classify CRUD type and complexity
- Output `stored-procedures-full.json` and `sp-bodies/*.json`

### Phase 2: Page Generator + Component
- Build `SprocDetail.tsx` component
- Build `generate-db-sproc-pages.ts` generator
- Generate 23 module SP reference pages
- Update module overview pages with SP section links
- Update sidebar configuration

### Phase 3: Cross-linking
- Link SPs to code callers (from existing reconciliation data)
- Link SPs to table documentation pages
- Link SP reference pages from reconciliation page
- Update navigation and overview page stats

### Phase 4: AI Enrichment
- Create enrichment script/process for Claude CLI agents
- Process modules in priority order (EVAL first, then SEC, DH, etc.)
- Merge enrichment into SP pages
- Regenerate and verify

---

## Success Criteria

1. All 6,169 SPs parsed with parameters, anti-patterns, table references
2. 23 per-module SP reference pages generated and building successfully
3. SprocDetail component renders with search, filter, expand functionality
4. Anti-pattern analysis matches or exceeds manual analysis findings
5. Cross-links work between SP pages ↔ table pages ↔ .NET code pages
6. `npm run build` passes with no errors
7. AI enrichment produces meaningful summaries for at least the EVAL module
