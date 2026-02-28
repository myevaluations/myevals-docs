# Documentation Revision Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize statistics, fix cross-linking gaps, add database references to landing/onboarding pages, clean up unused components, and add enrichment summary data to the database overview.

**Architecture:** Manual MDX edits for static pages (Tasks 1–7, 10–11), generator script modifications for auto-generated pages (Tasks 8–9), final build verification (Task 12). All changes are documentation-only — no runtime code changes.

**Tech Stack:** Docusaurus 3.7 (MDX), TypeScript generator scripts, React components

**Design Doc:** `plans/2026-02-27-docs-revision-design.md`

---

## Phase 1: Data Consistency (Tasks 1–3)

### Task 1: Update statistics in `architecture/database-schema.mdx`

**Files:**
- Modify: `docs/architecture/database-schema.mdx`

**Step 1: Update table count on line 81**

Replace line 81:
```
The SQL Server database is the primary data store, shared between the .NET and Node.js backends. It has evolved over 17+ years and contains **2,284 tables** across 2 schemas (`dbo`, `perf`), organized into 23 modules by naming prefix.
```
With:
```
The SQL Server database is the primary data store, shared between the .NET and Node.js backends. It has evolved over 17+ years and contains **2,242 tables** across 2 schemas (`dbo`, `perf`), organized into 23 modules by naming prefix.
```

**Step 2: Update the "Real counts" callout on line 85**

Replace line 85:
```
> **Real counts from schema analysis (Feb 2026):** 2,284 tables · 6,169 stored procedures · 3,703 indexes · 1,359 foreign keys · 17 triggers
```
With:
```
> **Real counts from schema analysis (Feb 2026):** 2,242 tables · 5,028 stored procedures · 3,703 indexes · 1,029 foreign keys · 17 triggers
```

Note: 3,703 indexes is the correct number from parser output. FK count updated to 1,029 (from `tables.json`).

**Step 3: Update SP count on line 228**

Replace:
```
The .NET backend uses **6,169 stored procedures** for all data access. These are the primary API contract between the application and database. Of these, **3,894 are confirmed called from .NET code** (matched via [SP Reconciliation](/docs/database/sproc-reconciliation)), while 2,234 exist only in the database (potential dead code or archive-only).
```
With:
```
The .NET backend uses **5,028 stored procedures** for all data access. These are the primary API contract between the application and database. Of these, **3,894 are confirmed called from .NET code** (matched via [SP Reconciliation](/docs/database/sproc-reconciliation)), while 1,134 exist only in the database (potential dead code or archive-only).
```

Note: 5,028 - 3,894 = 1,134 unmatched.

**Step 4: Update SP category table (lines 234–241)**

Replace lines 234–241:
```
| Category | SP Count (DB) | Matched to Code | Key Examples |
|----------|:------------:|:---------------:|--------------|
| Security (`SEC_`) | ~1,492 | ~1,200 | `GetUsersByDepartment`, `AuthenticateUser` |
| Evaluations (`EVAL_`) | ~1,008 | ~850 | `GetEvaluationsByTemplate`, `SaveEvaluation` |
| Duty Hours (`DH_`) | ~562 | ~470 | `GetDutyHoursForUser`, `SaveDutyHourEntry` |
| Procedures (`PRC_`) | ~350 | ~280 | `GetProceduresByUser`, `SaveProcedureLog` |
| CME (`CME_`) | ~250 | ~200 | `GetCMECredits`, `SaveCMEActivity` |
| Other modules | ~2,507 | ~894 | Various across 18+ modules |
```
With actual counts from `stored-procedures-full.json` (verify exact per-module counts at runtime by reading the JSON):
```
| Category | SP Count | Key Examples |
|----------|:--------:|--------------|
| Security (`SEC_`) | 1,261 | `GetUsersByDepartment`, `AuthenticateUser` |
| Evaluations (`EVAL_`) | 960 | `GetEvaluationsByTemplate`, `SaveEvaluation` |
| Duty Hours (`DH_`) | 611 | `GetDutyHoursForUser`, `SaveDutyHourEntry` |
| Portfolio (`PF_`) | 388 | `GetPortfolioByUser`, `SavePortfolioEntry` |
| Procedures (`PRC_`) | 321 | `GetProceduresByUser`, `SaveProcedureLog` |
| CME (`CME_`) | 289 | `GetCMECredits`, `SaveCMEActivity` |
| Other 15 modules | 1,198 | Various across scheduling, quizzes, patient logs, etc. |
```

**Important:** Before writing, read `static/sproc-detail-data/*.json` to get the actual `procedureCount` per module for accurate numbers. The numbers above are from the enrichment agents; double-check against the source JSON files.

**Step 5: Update index stats (lines 366–368)**

Line 366: Keep `**3,703 indexes**` (matches parser output).
Line 368: Verify `**813 tables (35.6%) lack a primary key**` against the database health page. Update the percentage: 813/2,242 = 36.3%.

Replace:
```
- **813 tables (35.6%) lack a primary key** — see [Schema Health](/docs/database/health) for the full list
```
With:
```
- **813 tables (36.3%) lack a primary key** — see [Schema Health](/docs/database/health) for the full list
```

**Step 6: Verify the edit and build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

**Step 7: Commit**

```bash
git add docs/architecture/database-schema.mdx
git commit -m "fix: standardize database statistics to parser output numbers

Update table count (2,284→2,242), SP count (6,169→5,028), FK count
(1,359→1,029), and SP category table with actual per-module counts."
```

---

### Task 2: Add enrichment summary to `database/overview.mdx`

**Files:**
- Modify: `docs/database/overview.mdx`

**Step 1: Add "AI Enrichment Summary" section after "Stored Procedure Analysis"**

After line 65 (`Browse stored procedures by module in the **Stored Procedures** section of the sidebar.`), add:

```mdx

## AI Enrichment Summary

All 5,028 stored procedures have been analyzed using Claude AI enrichment, providing:
- **Plain-language summary** and **business purpose** for every SP
- **Optimization recommendations** with specific SQL Server improvements
- **Migration relevance** scoring for the .NET → Node.js transition

### Complexity Distribution

| Complexity | Count | Percentage |
|-----------|------:|----------:|
| Trivial | 1,672 | 33.3% |
| Simple | 1,353 | 26.9% |
| Moderate | 886 | 17.6% |
| Complex | 654 | 13.0% |
| Very Complex | 461 | 9.2% |

### Migration Relevance

| Relevance | Count | Percentage |
|-----------|------:|----------:|
| High | 1,387 | 27.6% |
| Medium | 2,736 | 54.4% |
| Low | 859 | 17.1% |
| None | 46 | 0.9% |

Browse enriched SP details in the **Stored Procedures** sidebar section — each module page includes AI-generated summaries, business purpose descriptions, and optimization recommendations for every procedure.
```

**Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add docs/database/overview.mdx
git commit -m "feat: add AI enrichment summary section to database overview

Show complexity distribution and migration relevance breakdown for all
5,028 enriched stored procedures."
```

---

### Task 3: Verify SP count in `_category_.json`

**Files:**
- Read: `docs/database/modules/sprocs/_category_.json`

**Step 1: Read and verify**

Read `docs/database/modules/sprocs/_category_.json`. It currently says:
```json
{
  "label": "Stored Procedures",
  "position": 50,
  "link": {
    "type": "generated-index",
    "description": "5,028 stored procedures across 21 modules, with anti-pattern analysis and optimization priorities."
  }
}
```

**Step 2: Verify count**

Run: `node -e "const d = require('./generated/db-schema/stored-procedures-full.json'); console.log(d.procedures.length)"`
Expected: `5028`

If the count is 5,028, no change needed. If different, update the description.

**Step 3: Commit (only if changed)**

If a change was made:
```bash
git add docs/database/modules/sprocs/_category_.json
git commit -m "fix: update SP count in category description"
```

---

## Phase 2: Navigation & Cross-linking (Tasks 4–9)

### Task 4: Add database section to `intro.md`

**Files:**
- Modify: `docs/intro.md`

**Step 1: Add Database Schema row to Documentation Structure table**

In the Documentation Structure table (lines 60–68), add a new row after the Architecture row (line 62):

Replace lines 60–68:
```markdown
| Section | Description |
|---------|-------------|
| [Architecture](/docs/architecture/overview) | System-wide architecture, data flow, deployment, auth, and database schema |
| [.NET Backend](/docs/dotnet-backend/overview) | Comprehensive docs for the legacy monolith (primary focus) |
| [Node.js Backend](/docs/nodejs-backend/overview) | NestJS backend documentation |
| [React Frontend](/docs/react-frontend/overview) | Next.js + Plasmic frontend docs |
| [MAUI App](/docs/maui-app/overview) | Mobile application docs |
| [Cross-Cutting](/docs/cross-cutting/migration-status) | Migration status, feature matrix, coding standards |
| [Guides](/docs/guides/debugging) | Practical guides for debugging, adding features, and common bugs |
```
With:
```markdown
| Section | Description |
|---------|-------------|
| [Architecture](/docs/architecture/overview) | System-wide architecture, data flow, deployment, auth, and database schema |
| [Database Schema](/docs/database/overview) | Interactive schema explorer — 2,242 tables, 5,028 stored procedures with AI enrichment |
| [.NET Backend](/docs/dotnet-backend/overview) | Comprehensive docs for the legacy monolith (primary focus) |
| [Node.js Backend](/docs/nodejs-backend/overview) | NestJS backend documentation |
| [React Frontend](/docs/react-frontend/overview) | Next.js + Plasmic frontend docs |
| [MAUI App](/docs/maui-app/overview) | Mobile application docs |
| [Cross-Cutting](/docs/cross-cutting/migration-status) | Migration status, feature matrix, coding standards |
| [Guides](/docs/guides/debugging) | Practical guides for debugging, adding features, and common bugs |
```

**Step 2: Add database quick link**

In the Quick Links section (lines 85–91), add a new line after the data flow link:

Replace lines 85–91:
```markdown
## Quick Links

- **New developer?** Start with [.NET Getting Started](/docs/dotnet-backend/getting-started)
- **Need architecture context?** See [Architecture Overview](/docs/architecture/overview)
- **Debugging an issue?** Check [Debugging Guide](/docs/guides/debugging)
- **Understanding data flow?** See [Data Flow](/docs/architecture/data-flow)
```
With:
```markdown
## Quick Links

- **New developer?** Start with [.NET Getting Started](/docs/dotnet-backend/getting-started)
- **Need architecture context?** See [Architecture Overview](/docs/architecture/overview)
- **Understanding the database?** See [Database Schema](/docs/database/overview)
- **Debugging an issue?** Check [Debugging Guide](/docs/guides/debugging)
- **Understanding data flow?** See [Data Flow](/docs/architecture/data-flow)
```

**Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add docs/intro.md
git commit -m "feat: add database schema section to intro page

Add Database Schema row to Documentation Structure table and database
quick link for discoverability."
```

---

### Task 5: Add database items to `onboarding-path.mdx`

**Files:**
- Modify: `docs/onboarding-path.mdx`

**Step 1: Add 3 database reading items to Week 2**

After the `file-index` item (line 137, closing `}`), add 3 new items before the closing `]}`:

Insert before line 139 (`  ]}`):
```jsx
    ,
    {
      id: "db-overview",
      week: 2,
      label: "Database Schema Overview",
      href: "/docs/database/overview",
      description: "2,242 tables and 5,028 stored procedures — the shared SQL Server schema that both backends use.",
      tag: "database"
    },
    {
      id: "db-sprocs",
      week: 2,
      label: "Stored Procedure Documentation",
      href: "/docs/database/modules/sprocs/",
      description: "AI-enriched documentation for all 5,028 SPs — summaries, anti-patterns, and optimization recommendations.",
      tag: "database"
    },
    {
      id: "db-reconciliation",
      week: 2,
      label: "SP Reconciliation",
      href: "/docs/database/sproc-reconciliation",
      description: "Gap analysis: which SPs are called from code vs. only in the database.",
      tag: "database"
    }
```

**Step 2: Add database row to "After Onboarding" table**

In the After Onboarding table (lines 148–155), add a new row:

After:
```
| Check Node.js backend | [Node.js Backend](./nodejs-backend/overview) |
```
Add:
```
| Explore database tables | [Database Schema Explorer](./database/overview) |
```

**Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add docs/onboarding-path.mdx
git commit -m "feat: add database reading items to onboarding path

Add Database Schema Overview, SP Documentation, and SP Reconciliation
to Week 2 reading list. Add database explorer to After Onboarding table."
```

---

### Task 6: Add database quick link to homepage (`index.tsx`)

**Files:**
- Modify: `src/pages/index.tsx`

**Step 1: Add "Database Schema" to QuickLinks array**

In the `QuickLinks` function (lines 107–113), add a new entry:

Replace:
```typescript
  const links = [
    { label: 'Architecture Overview', to: '/docs/architecture/overview' },
    { label: 'Migration Status', to: '/docs/cross-cutting/migration-status' },
    { label: 'Onboarding Guide', to: '/docs/cross-cutting/onboarding' },
    { label: 'Debugging Guide', to: '/docs/guides/debugging' },
    { label: '.NET Project Map', to: '/docs/dotnet-backend/project-map' },
    { label: 'Scheduler Catalog', to: '/docs/dotnet-backend/schedulers/' },
  ];
```
With:
```typescript
  const links = [
    { label: 'Architecture Overview', to: '/docs/architecture/overview' },
    { label: 'Database Schema', to: '/docs/database/overview' },
    { label: 'Migration Status', to: '/docs/cross-cutting/migration-status' },
    { label: 'Onboarding Guide', to: '/docs/cross-cutting/onboarding' },
    { label: 'Debugging Guide', to: '/docs/guides/debugging' },
    { label: '.NET Project Map', to: '/docs/dotnet-backend/project-map' },
    { label: 'Scheduler Catalog', to: '/docs/dotnet-backend/schedulers/' },
    { label: 'SP Documentation', to: '/docs/database/modules/sprocs/' },
  ];
```

Note: Added both "Database Schema" and "SP Documentation". The grid layout (col--4) will wrap to 3 columns, so 8 items = 3 rows which still looks fine.

**Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/pages/index.tsx
git commit -m "feat: add database schema and SP links to homepage quick links"
```

---

### Task 7: Fix footer link in `docusaurus.config.ts`

**Files:**
- Modify: `docusaurus.config.ts`

**Step 1: Update the hardcoded Business Modules link**

Replace line 132:
```typescript
            { label: 'Business Modules', to: '/docs/dotnet-backend/business/security' },
```
With:
```typescript
            { label: 'Business Modules', to: '/docs/dotnet-backend/business/' },
```

This points to the auto-generated sidebar index for the business directory, which Docusaurus creates from `_category_.json`.

**Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. The `/docs/dotnet-backend/business/` path should resolve to the auto-generated category index.

**Step 3: Commit**

```bash
git add docusaurus.config.ts
git commit -m "fix: point footer Business Modules link to category index

Was hardcoded to /security; now uses the auto-generated category index."
```

---

### Task 8: Add back-links from database module pages → .NET business pages

**Files:**
- Modify: `scripts/generate-db-pages.ts`

**Step 1: Add MODULE_TO_DOTNET_BUSINESS mapping**

Near the top of `generate-db-pages.ts` (after the imports, around line 20), add:

```typescript
/** Maps DB module prefix → .NET business module slug for cross-linking */
const MODULE_TO_DOTNET_BUSINESS: Record<string, { label: string; slug: string }[]> = {
  'SEC': [{ label: 'Security', slug: 'security' }],
  'EVAL': [{ label: 'Evaluations', slug: 'evaluations' }],
  'DH': [{ label: 'Duty Hours', slug: 'duty-hours' }],
  'PRC': [{ label: 'Procedures', slug: 'procedures' }],
  'CME': [{ label: 'CME Tracking', slug: 'cme-tracking' }],
  'PF': [{ label: 'Portfolio', slug: 'portfolio' }],
  'BSN': [{ label: 'Nursing / NurseNotify', slug: 'nurse-notify' }],
  'ACT': [{ label: 'Essential Activities', slug: 'essential-activities' }],
  'PTL': [{ label: 'Patient Log', slug: 'patient-log' }],
  'QUIZ': [{ label: 'Quiz', slug: 'quiz' }],
  'LA': [{ label: 'Learning Assignment', slug: 'learning-assignment' }],
};
```

**Important:** Before writing, verify these slugs by running:
```bash
ls docs/dotnet-backend/business/*.mdx | head -25
```
Match each slug to the actual filename (without `.mdx`). Only include modules with 1:1 mapping.

**Step 2: Generate the "Related Code Documentation" section in `generateModuleMdx()`**

In the `generateModuleMdx()` function, after the `sprocSection` variable (line 777), add:

```typescript
  // Related .NET business module cross-link
  const dotnetLinks = MODULE_TO_DOTNET_BUSINESS[mod.prefix] || [];
  const relatedCodeSection = dotnetLinks.length > 0
    ? `
## Related Code Documentation

${dotnetLinks.map(link => `- [${link.label} (.NET Business Module)](/docs/dotnet-backend/business/${link.slug})`).join('\n')}
`
    : '';
```

Then in the return template (line 815–816), append `${relatedCodeSection}` after `${sprocSection}`:

Replace:
```typescript
${sprocSection}
`;
```
With:
```typescript
${sprocSection}
${relatedCodeSection}
`;
```

**Step 3: Regenerate all database pages**

Run: `npx tsx scripts/generate-db-pages.ts`
Expected: 21+ MDX files regenerated. The 11 mapped modules should now have "Related Code Documentation" sections.

**Step 4: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no broken links.

**Step 5: Spot-check a generated page**

Run: `grep -A 3 "Related Code Documentation" docs/database/modules/security.mdx`
Expected: Shows the link to `/docs/dotnet-backend/business/security`.

**Step 6: Commit**

```bash
git add scripts/generate-db-pages.ts docs/database/modules/*.mdx
git commit -m "feat: add back-links from database module pages to .NET business modules

11 of 21 database module pages now link to their corresponding .NET
business module documentation. Generated via MODULE_TO_DOTNET_BUSINESS mapping."
```

---

### Task 9: Add cross-links from SP module pages → database table pages

**Files:**
- Modify: `scripts/generate-db-sproc-pages.ts`

**Step 1: Add "Related Tables" link in `generateSprocModuleMdx()`**

In the return template (line 347), add a "Related Tables" link after the summary badge line.

Find this section in the return template:
```typescript
> **${mod.procedureCount}** stored procedure${mod.procedureCount !== 1 ? 's' : ''} | ${crudLine}
```

After that line, add:
```typescript

> 📋 Related: [${mod.displayName} Tables](../${slug}) — view the database tables for this module
```

So the full return block becomes (lines 345–348):
```typescript
# ${mod.displayName} — Stored Procedures

> **${mod.procedureCount}** stored procedure${mod.procedureCount !== 1 ? 's' : ''} | ${crudLine}

> 📋 Related: [${mod.displayName} Tables](../${slug}) — view the database tables for this module
```

Wait — the `slug` variable is the SP slug (e.g., `security-sprocs`). We need the module page slug. The SP pages are at `docs/database/modules/sprocs/security-sprocs.mdx` and the table pages are at `docs/database/modules/security.mdx`. So the relative path from the SP page is `../security`.

Find how the module slug is derived. In `generate-db-sproc-pages.ts`, the module pages use `slugify(mod.displayName)`. Use the same function:

```typescript
  const tablePageSlug = slugify(mod.displayName);
```

Add this before the return statement, then in the template add:

```
> 📋 Related: [${mod.displayName} Tables](../${tablePageSlug}) — view the database tables for this module
```

**Step 2: Regenerate all SP pages**

Run: `npx tsx scripts/generate-db-sproc-pages.ts`
Expected: 21 MDX files + 21 JSON files regenerated.

**Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no broken links.

**Step 4: Spot-check a generated page**

Run: `grep "Related:" docs/database/modules/sprocs/security-sprocs.mdx`
Expected: Shows link to `../security`.

**Step 5: Commit**

```bash
git add scripts/generate-db-sproc-pages.ts docs/database/modules/sprocs/*.mdx
git commit -m "feat: add cross-links from SP pages to parent database module pages

Each of the 21 SP module pages now links to its corresponding table page
for easy navigation between stored procedures and their related tables."
```

---

## Phase 3: Component Cleanup (Task 10)

### Task 10: Remove unused `ArchitectureDiagram.tsx`

**Files:**
- Delete: `src/components/ArchitectureDiagram.tsx`
- Keep: `src/components/SchedulerCatalog.tsx` (actively used in `schedulers/index.mdx`)
- Keep: `src/components/ReadingProgress.tsx` (actively used in `onboarding-path.mdx`)

**Step 1: Verify ArchitectureDiagram is truly unused**

Run: `grep -r "ArchitectureDiagram" docs/ src/ --include="*.mdx" --include="*.tsx" --include="*.ts" | grep -v "plans/" | grep -v "README"`

Expected: Only the component file itself appears. No imports from any MDX page or other component.

**Step 2: Delete the component**

```bash
rm src/components/ArchitectureDiagram.tsx
```

**Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. If any page imports it, the build will fail — which means we missed a reference and should NOT delete it.

**Step 4: Commit**

```bash
git add -A src/components/ArchitectureDiagram.tsx
git commit -m "chore: remove unused ArchitectureDiagram component

Component was created during initial planning but never imported into
any documentation page. SchedulerCatalog and ReadingProgress are kept
as they are actively used."
```

---

## Phase 4: Content Polish (Tasks 11–12)

### Task 11: Add database cross-references to Node.js overview

**Files:**
- Modify: `docs/nodejs-backend/overview.mdx`

**Step 1: Add SP Reconciliation cross-reference**

Find line 28 which contains:
```
| Auth | JWT + Shared MSSQL stored procs | -- |
```

After the tech stack table, find the Architecture section. Add a note after the "Auth" row in the table:

Actually, the better approach is to add a callout/admonition after the tech stack table (after line 35). Insert:

```mdx

:::tip Database Cross-Reference
The Node.js backend shares stored procedures with the .NET backend via the common MSSQL database. See [SP Reconciliation](/docs/database/sproc-reconciliation) for the full list of shared stored procedures and [Database Schema](/docs/database/overview) for the complete schema documentation.
:::
```

**Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add docs/nodejs-backend/overview.mdx
git commit -m "feat: add database cross-references to Node.js overview

Add callout linking to SP Reconciliation and Database Schema pages for
engineers navigating between Node.js and database documentation."
```

---

### Task 12: Final build verification and PR

**Files:**
- All files modified in Tasks 1–11

**Step 1: Full clean build**

```bash
npm run clear && npm run build
```
Expected: Build succeeds with zero errors and zero broken links.

**Step 2: Verify all new links resolve**

Run a spot-check of key links:
```bash
# Check that the generated build has the expected pages
ls build/docs/database/overview/index.html
ls build/docs/database/modules/sprocs/index.html
ls build/docs/dotnet-backend/business/index.html
```

**Step 3: Review all changes**

```bash
git diff --stat main
git log --oneline main..HEAD
```

Expected: ~50–60 files changed (21 generated DB pages + 21 generated SP pages + ~10 manual edits).

**Step 4: Create PR**

```bash
git push -u origin feat/docs-revision
gh pr create --title "docs: standardize statistics, add cross-links, cleanup components" --body "## Summary
- Standardize all statistics to parser output (2,242 tables, 5,028 SPs)
- Add AI enrichment summary to database overview
- Add database section to intro, onboarding, homepage, footer
- Add back-links: DB module pages → .NET business modules
- Add cross-links: SP pages → database table pages
- Add database cross-references to Node.js overview
- Remove unused ArchitectureDiagram component

## Design
See plans/2026-02-27-docs-revision-design.md

## Test Plan
- [ ] npm run build succeeds with zero errors
- [ ] All new cross-links resolve correctly
- [ ] Statistics consistent across all pages (2,242 tables, 5,028 SPs)
- [ ] Onboarding path shows 3 new database items
- [ ] Homepage shows Database Schema quick link
- [ ] Footer Business Modules link goes to category index
- [ ] ArchitectureDiagram.tsx removed, build still succeeds

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

**Step 5: Merge**

Follow the standard branch protection workflow (disable review requirement → merge → restore protection → sync main).

---

## Summary

| Phase | Tasks | Files Modified | Approach |
|-------|-------|---------------|----------|
| 1: Data Consistency | 1–3 | 2 MDX pages, 1 JSON | Manual edits |
| 2: Navigation | 4–9 | 5 MDX/TSX pages, 2 generator scripts, 42+ generated pages | Manual + generator |
| 3: Cleanup | 10 | 1 component deleted | Manual |
| 4: Polish | 11–12 | 1 MDX page, PR creation | Manual |

**Total estimated changes:** ~60 files (most are regenerated)
**Risk areas:** Generator changes (Tasks 8–9) touch all generated pages — verify with full build after each.
