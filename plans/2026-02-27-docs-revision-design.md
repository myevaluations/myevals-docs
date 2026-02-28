# Documentation Revision Design — Post-Enrichment Cleanup

**Goal:** Standardize statistics, fix cross-linking gaps, add database references to landing/onboarding pages, clean up unused components, and add enrichment summary data to the database overview.

**Context:** After completing the SP documentation system (5,028 SPs across 21 modules with AI enrichment), several pages contain inconsistent statistics and the new database/SP sections are not yet cross-linked from landing pages, onboarding, or the architecture section.

**Approach:** Standardize all statistics to the parser output numbers (2,242 tables, 5,028 SPs). Update all pages that reference these numbers. Add the database section to navigation touchpoints (intro, onboarding, homepage, footer). Add bidirectional cross-links between database and code pages. Remove unused components.

---

## Audit Findings

| Category | Status | Details |
|----------|--------|---------|
| Directory structure (194 files) | Good | Well-organized, all sidebar links valid |
| Internal links (120+ verified) | Good | No broken links found |
| Statistics consistency | **Fix needed** | 2,242 vs 2,284 tables, 5,028 vs 6,169 SPs across pages |
| Database in navigation | **Fix needed** | Missing from intro, onboarding, homepage quick links, footer |
| Back-links (DB → code) | **Fix needed** | .NET pages link to DB but DB pages don't link back |
| Unused components | **Cleanup** | 3 components built but never imported |
| Node.js/React/MAUI sections | Good | Already comprehensive (200+ line overviews, full getting-started) |

---

## Decision: Statistics Standardization

Standardize to parser output numbers everywhere:
- **Tables:** 2,242 (from `tables.json` — what the interactive explorer shows)
- **SPs:** 5,028 categorized (from `stored-procedures-full.json`)
- **Columns:** 24,282
- **Indexes:** per parser output
- **FKs:** 1,029

The architecture page's "2,284 tables, 6,169 SPs" numbers come from a different analysis pass. Replacing them with parser numbers ensures consistency with what users see in interactive components.

---

## Revision Items (12 tasks)

### Phase 1: Data Consistency (3 tasks)

**Task 1: Update `architecture/database-schema.mdx`**
- Line 10: Change "2,284 tables across 23 modules" → "2,242 tables across 23 modules"
- Line 81: Change "2,284 tables across 2 schemas" → "2,242 tables across 2 schemas"
- Line 85: Update "Real counts" callout to match parser output
- Line 228: Update SP count "6,169 stored procedures" → "5,028 stored procedures"
- Line 234-241: Update SP category count table to match actual module counts
- Line 366-368: Update index/PK stats to match parser output

**Task 2: Update `database/overview.mdx` with enrichment summary**
- Add new "AI Enrichment Summary" section after "Stored Procedure Analysis"
- Include complexity distribution (1,672 trivial, 1,353 simple, 886 moderate, 654 complex, 461 very-complex)
- Include migration relevance breakdown (1,387 high, 2,736 medium, 859 low)
- Add link to enrichment index: "Browse enriched SP details in the Stored Procedures sidebar section"

**Task 3: Update `_category_.json` and verify SP count**
- Investigate 5,028 vs 5,026 variance (enrich:sprocs reported 5,026)
- Update description to match verified count

### Phase 2: Navigation & Cross-linking (6 tasks)

**Task 4: Update `intro.md`**
- Add "Database Schema" row to Documentation Structure table
- Description: "Interactive schema explorer, 2,242 tables, 5,028 stored procedures with anti-pattern analysis"
- Add Database quick link: "Understanding the database? See [Database Schema](/docs/database/overview)"

**Task 5: Update `onboarding-path.mdx`**
- Add 3 new Week 2 items to the ReadingProgress component:
  1. "Database Schema Overview" → `/docs/database/overview` (tag: database)
  2. "Stored Procedure Documentation" → `/docs/database/modules/sprocs/` (tag: database)
  3. "SP Reconciliation" → `/docs/database/sproc-reconciliation` (tag: database)
- Update "After Onboarding" table: add "Explore database tables" → Database Explorer link

**Task 6: Update `src/pages/index.tsx`**
- Add "Database Schema" to QuickLinks array → `/docs/database/overview`
- Consider adding "SP Documentation" → `/docs/database/modules/sprocs/`

**Task 7: Fix footer in `docusaurus.config.ts`**
- Change "Business Modules" link from `/docs/dotnet-backend/business/security` to a more general entry point
- Options: first business module alphabetically, or the sidebar auto-generated index

**Task 8: Add back-links from database module pages → .NET business pages**
- For each of the 21 database module pages (`docs/database/modules/*.mdx`):
  - Add "Related Code Documentation" section at the bottom
  - Link to the corresponding `.NET business module` page
  - Only where a clear 1:1 mapping exists (11 of 21 modules have direct counterparts)
- This is done in the generator script (`generate-db-pages.ts`) not manually

**Task 9: Add cross-links from SP module pages → database table pages**
- For each of the 21 SP pages (`docs/database/modules/sprocs/*-sprocs.mdx`):
  - Add "Related Tables" link to the parent database module page at the top
  - E.g., `security-sprocs.mdx` links to `../security` (the table page)
- This is done in the generator script (`generate-db-sproc-pages.ts`)

### Phase 3: Component Cleanup (1 task)

**Task 10: Remove or document unused components**
- `ArchitectureDiagram.tsx` — check git history for why it was created; remove if truly dead
- `ReadingProgress.tsx` — ACTUALLY USED in `onboarding-path.mdx` (audit was wrong). Keep.
- `SchedulerCatalog.tsx` — check if referenced anywhere; remove if dead

### Phase 4: Content Polish (2 tasks)

**Task 11: Add database cross-references to Node.js overview**
- `nodejs-backend/overview.mdx` mentions "MSSQL stored procs" for auth (line 28)
- Add a note/link: "See [SP Reconciliation](/docs/database/sproc-reconciliation) for the full list of stored procedures shared between .NET and Node.js"
- In the Authentication Flow section: link the SP names to the database section

**Task 12: Final build verification and PR**
- Run `npm run build` to verify zero errors
- Check all new links resolve correctly
- Commit, create PR, merge

---

## Files Modified

| File | Change Type |
|------|-------------|
| `docs/architecture/database-schema.mdx` | Update statistics |
| `docs/database/overview.mdx` | Add enrichment summary section |
| `docs/database/modules/sprocs/_category_.json` | Update SP count |
| `docs/intro.md` | Add database section |
| `docs/onboarding-path.mdx` | Add database reading items |
| `src/pages/index.tsx` | Add database quick link |
| `docusaurus.config.ts` | Fix footer link |
| `scripts/generate-db-pages.ts` | Add back-link generation |
| `scripts/generate-db-sproc-pages.ts` | Add cross-link to table pages |
| `docs/nodejs-backend/overview.mdx` | Add SP cross-reference |
| `src/components/ArchitectureDiagram.tsx` | Delete if unused |
| `src/components/SchedulerCatalog.tsx` | Delete if unused |

---

## Risks

- **Generator changes** (Tasks 8-9) require re-running `npm run generate:db:pages` and `npm run generate:db:sproc-pages`, which will touch all 42+ generated files
- **Unused component removal** should be verified by build — Docusaurus will error on broken imports
- **SP count variance** (5,028 vs 5,026) needs investigation before updating numbers
