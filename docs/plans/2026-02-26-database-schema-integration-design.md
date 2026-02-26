# Database Schema Integration — Design Document

**Date:** 2026-02-26
**Status:** Approved
**Scope:** Parse database schema export, reconcile stored procedures bidirectionally, AI-enrich per module, generate documentation pages with interactive visualizations.

## Goals

1. **Documentation enrichment** — Replace hand-crafted placeholder data in `docs/architecture/database-schema.mdx` with real schema data from SQL Server export (2,284 tables, 6,169 SPs, 3,703 indexes).
2. **Full cross-reference system** — Bidirectional SP reconciliation between 3,991 code-side SPs and 6,169 DB-side SPs. Build a 4-tier traceability chain: Table → SP → .NET class → Web page.
3. **AI-enriched table documentation** — Claude CLI agents enrich each module with business purpose, migration relevance, data sensitivity, and relationship descriptions.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data source | Excel one-time import | Schema changes are infrequent in a 17-year monolith; avoids credential management |
| Page organization | Hybrid — dedicated `docs/database/` section + enrichment of existing module pages | Big-picture views live in their own section; module pages stay self-contained |
| Table detail level | Module-level pages with expandable accordion detail | Keeps sidebar clean (~25 pages), full detail accessible via progressive disclosure |
| ER diagrams | Both Mermaid (per-module) + D3 interactive (global explorer) | Mermaid for quick orientation, D3 for cross-module exploration |
| Enrichment approach | SP reconciliation first, then AI enrichment with full context | Agents get both raw schema AND code-usage context for richer output |
| Pipeline pattern | Separate parse → reconcile → enrich → generate scripts | Mirrors existing `parse:dotnet:*` + `enrich:pages` conventions |

## Pipeline Architecture

```
Stage 1: PARSE EXCEL
  input/MyEvaluationsDatabaseSchema_20260226.xlsx
       ↓
  scripts/parse-db-schema.ts
       ↓
  generated/db-schema/
    ├── tables.json            (2,284 tables: columns, types, PKs, FKs, indexes)
    ├── constraints.json       (FKs, checks, defaults, uniques)
    ├── indexes.json           (3,703 indexes with key/included columns)
    ├── sprocs-db.json         (6,169 SPs from DB side)
    ├── functions.json         (456 scalar + 137 TVFs)
    ├── views.json             (112 views)
    ├── triggers.json          (17 triggers)
    ├── types.json             (18 UDTs + 261 table types)
    └── summary.json           (object counts, module groupings)

Stage 2: RECONCILE SPs
  generated/db-schema/sprocs-db.json
  + generated/dotnet-metadata/stored-procedures.json  (existing 3,991)
       ↓
  scripts/reconcile-sprocs.ts
       ↓
  generated/db-schema/
    ├── sproc-reconciliation.json    (matched, orphan-db, orphan-code)
    └── table-sproc-mapping.json     (which SPs touch which tables)

Stage 3: AI ENRICHMENT
  generated/db-schema/*.json
  + generated/ai-enriched/dotnet/per-file/**
       ↓
  scripts/ai-enrich-db-schema.ts  (Claude CLI agents, one per module)
       ↓
  generated/ai-enriched/db-schema/per-module/
    ├── SEC.json
    ├── EVAL.json
    └── ... (~23 module files)

Stage 4: GENERATE PAGES
  generated/ai-enriched/db-schema/per-module/*.json
  + generated/db-schema/sproc-reconciliation.json
       ↓
  scripts/generate-db-pages.ts
       ↓
  docs/database/*.mdx  (new pages)
  + updates to existing module pages and architecture page

Stage 5: BUILD & VERIFY
  npm run build
```

### npm Scripts

```
npm run parse:db:schema        → Stage 1
npm run parse:db:reconcile     → Stage 2
npm run ai:enrich:db           → Stage 3
npm run generate:db:pages      → Stage 4
npm run db:full                → All stages sequentially
```

## Data Models

### tables.json

```json
{
  "exportDate": "2026-02-26",
  "source": "MyEvaluationsDatabaseSchema_20260226.xlsx",
  "totalTables": 2284,
  "schemas": ["dbo", "perf"],
  "modules": [
    {
      "prefix": "SEC",
      "schema": "dbo",
      "tableCount": 328,
      "tables": [
        {
          "name": "SEC_Users",
          "schema": "dbo",
          "fullName": "dbo.SEC_Users",
          "hasPrimaryKey": true,
          "primaryKeyColumns": ["UserID"],
          "foreignKeys": [
            {
              "constraintName": "FK_SEC_Users_DeptID",
              "columns": ["DepartmentID"],
              "referencedTable": "dbo.SEC_Departments",
              "referencedColumns": ["DepartmentID"]
            }
          ],
          "indexes": [
            {
              "name": "PK_SEC_Users",
              "type": "CLUSTERED",
              "isPrimaryKey": true,
              "isUnique": true,
              "isDisabled": false,
              "keyColumns": ["UserID"],
              "includedColumns": []
            }
          ],
          "checkConstraints": [],
          "defaultConstraints": 12,
          "triggers": ["MDT_SecUsers"]
        }
      ]
    }
  ]
}
```

### sproc-reconciliation.json

```json
{
  "generatedAt": "ISO-timestamp",
  "totalDbSprocs": 6169,
  "totalCodeSprocs": 3991,
  "matched": 3200,
  "orphanDb": [
    {
      "name": "dbo.GetArchivedEvaluations",
      "schema": "dbo",
      "possibleReason": "dead-code | archive-only | called-dynamically"
    }
  ],
  "orphanCode": [
    {
      "name": "sp_GetUserRoles",
      "calledFrom": ["SecurityManager.cs:GetRoles"],
      "possibleReason": "renamed | deleted-from-db | different-database"
    }
  ],
  "crossReference": [
    {
      "sprocName": "dbo.GetUsersByDepartment",
      "calledFromFiles": ["SecurityManager.cs", "UserSearch.aspx.cs"],
      "calledFromMethods": ["GetUsersByDepartment", "BindGrid"],
      "module": "Security"
    }
  ]
}
```

### AI Enrichment JSON (per-module)

```json
{
  "module": "Security",
  "prefix": "SEC",
  "layer": "database",
  "generatedAt": "ISO-timestamp",
  "tableCount": 328,
  "tables": [
    {
      "tableName": "SEC_Users",
      "schema": "dbo",
      "summary": "Core user identity table...",
      "businessPurpose": "Central authentication and authorization record...",
      "dataSensitivity": "phi",
      "migrationRelevance": "high",
      "migrationNote": "Must be migrated first — nearly every other table has a FK dependency",
      "complexity": "complex",
      "relatedSprocs": ["GetUsersByDepartment", "AuthenticateUser"],
      "relatedFiles": ["SecurityManager.cs", "Login.aspx.cs"],
      "keyRelationships": [
        "SEC_UsersExt - extended profile fields (1:1)",
        "SEC_UserRoles - role assignments (1:many)",
        "SEC_Departments - organizational unit (many:1)"
      ],
      "keyColumns": [
        "UserID - primary key, bigint identity",
        "Username - login credential",
        "DepartmentID - FK to SEC_Departments"
      ]
    }
  ],
  "moduleOverview": "The Security module manages authentication, authorization...",
  "keyWorkflows": [
    "User authentication via SEC_Users → SEC_UserRoles → SEC_Privileges"
  ],
  "schemaHealthNotes": [
    "142 of 328 tables lack primary keys"
  ]
}
```

**Valid values:**
- `complexity`: `trivial` | `simple` | `moderate` | `complex` | `very-complex`
- `migrationRelevance`: `high` | `medium` | `low` | `none`
- `dataSensitivity`: `phi` | `pii` | `financial` | `internal` | `public`

## Generated Pages & Components

### New Pages — `docs/database/`

| Page | Type | Content |
|------|------|---------|
| `overview.mdx` | Dashboard | Object counts, PK/index coverage %, module breakdown, top FK-referenced tables |
| `explorer.mdx` | Interactive | D3 force-directed graph — tables as nodes (colored by module), FKs as edges |
| `sproc-reconciliation.mdx` | Generated | Three tabs: matched SPs (4-tier chain), DB-only orphans, code-only orphans |
| `health.mdx` | Generated | Tables without PKs (813), without indexes (709), disabled indexes (196), naming inconsistencies |
| `modules/<module>.mdx` | Generated | ~25 pages, one per module. AI-enriched descriptions, expandable table detail, Mermaid ER diagram |

### New React Components

| Component | Purpose |
|-----------|---------|
| `DatabaseExplorer.tsx` | D3 force-directed graph of tables + FKs. Filter by module, search, click for detail. |
| `SchemaHealth.tsx` | Dashboard cards + charts for PK/index coverage, module health scores. |
| `TableDetail.tsx` | Expandable accordion for a single table: columns, FKs, indexes, related SPs, related files. Reused across all module pages. |
| `SprocReconciliation.tsx` | Three-tab view (matched/orphan-db/orphan-code) with search and sort. |

### Updates to Existing Pages

| Page | Change |
|------|--------|
| `docs/architecture/database-schema.mdx` | Replace `<!-- AUTO-GENERATED -->` placeholders with real data. Link to `docs/database/`. |
| 20 business module overview pages | Add `## Database Tables` section at bottom with summary table + link to module detail page. |
| `docs/dotnet-backend/data-access/stored-procedures.mdx` | Link to SP reconciliation page. Badge orphan SPs. |

### Sidebar Structure

```
Database Schema
├── Overview
├── Schema Explorer
├── SP Reconciliation
├── Schema Health
└── Tables by Module
    ├── Security (SEC_)              328 tables
    ├── Evaluations (EVAL_)          333 tables
    ├── Duty Hours (DH_)             184 tables
    ├── Procedures (PRC_)            179 tables
    ├── Annual Program Eval (APE_)   166 tables
    ├── Nursing (BSN_)               111 tables
    ├── Activity Logs (ACT_)          80 tables
    ├── Portfolio (PF_)               67 tables
    ├── Clinical Assessment (OBC_)    65 tables
    ├── CME (CME_)                    61 tables
    ├── Prep (Prep_)                  54 tables
    ├── Patient Logs (PTL_)           45 tables
    ├── Reports (RPT_)                32 tables
    ├── Quizzes (QUIZ_)               22 tables
    ├── Scheduling (SCHE_)            19 tables
    ├── System (SYS_)                 18 tables
    ├── MyEval Platform (MYEVAL_)     46 tables
    ├── Post-Graduation (POST_)       11 tables
    ├── MyGME (MyGME_)                 9 tables
    ├── Performance (perf.*)         341 objects
    └── Uncategorized                306 tables
```

### Mermaid ER Diagrams

Each module page gets an auto-generated Mermaid `erDiagram` showing tables and FK relationships. For modules >30 tables, show only the top 20 most-connected tables. Cross-module FKs shown as dashed lines.

## AI Enrichment Strategy

### Agent Design

Each module gets one Claude CLI agent run. Agent input:
1. Parsed table data (schema, columns, PKs, FKs, indexes)
2. SP reconciliation data (matched SPs, calling files/methods)
3. Existing file enrichment data for the matching business module
4. System prompt with JSON schema and valid values

### Module Batching (~23 agent runs)

| Batch | Modules | Tables | Runs |
|-------|---------|--------|------|
| 1 Core | SEC, EVAL, DH | 845 | 3 |
| 2 Clinical | PRC, PTL, ACT, OBC | 371 | 4 |
| 3 Program | APE, APE2, BSN, PF | 344 | 4 |
| 4 Support | CME, QUIZ, RPT, SYS, SCHE | 152 | 5 |
| 5 Platform | MYEVAL, Prep, POST, MyGME, LA | 143 | 5 |
| 6 Performance | perf.* | 341 | 1 |
| 7 Uncategorized | No-prefix tables | 306 | 1 |

### Large Module Handling (>100 tables)

- Send table names, PK columns, and FK relationships for all tables (compact)
- Send full column details only for tables with SP cross-references or >5 FKs
- Split into sub-batches if context limits exceeded (e.g., SEC_User* vs SEC_Department*)

### Estimate

- ~23 agent runs, sequential (one at a time)
- ~2-3 hours total
- Uses Claude CLI task agents (no API credits)

## Schema Statistics (from Excel export)

| Category | Count |
|----------|------:|
| User Tables | 2,284 |
| Stored Procedures | 6,169 |
| Scalar Functions | 456 |
| Table-Valued Functions | 137 |
| Views | 112 |
| Triggers | 17 (all AFTER, all enabled) |
| Foreign Keys | 1,359 |
| Primary Keys | 1,471 |
| Indexes | 3,703 (196 disabled) |
| User-Defined Types | 18 |
| Table Types | 261 |
| Schemas | 2 (dbo, perf) |
| Partitioned Tables | 2 |
| Tables without PK | 813 (35.6%) |
| Tables without any index | 709 (31%) |

## Key Risks

1. **Large module context overflow** — SEC (328) and EVAL (333) may exceed agent context. Mitigation: compact representation + sub-batching.
2. **Uncategorized tables (306)** — No naming convention to group by. Mitigation: agent infers grouping from FK relationships; remainder stays in "Uncategorized".
3. **SP name matching** — Code-side may use different casing or partial names. Mitigation: case-insensitive matching + fuzzy match fallback.
4. **Excel column data missing** — The Excel export has table/constraint/index data but NO column-level detail (column names, types, nullability). Mitigation: enrichment agents will work with what's available; column detail can be added in a future schema export.
