# Run Source Sync & Generate Pipeline Against Actual Repos

## Context

The `myevals-docs` Docusaurus site is deployed at [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com) with 50 .NET backend doc pages (11,242 lines) — but all content is **hand-crafted approximations**. The 10 build scripts and 5 React components have never been run against real source code because `.repos/` was never populated. This plan runs the full sync + parse + generate pipeline to populate docs with verified data from the 4 actual MyEvaluations repos.

## Environment Status (Verified 2026-02-20)

| Prerequisite | Status |
|-------------|--------|
| `GITHUB_TOKEN` | Not in env — used `gh auth token` inline to supply it at clone time |
| `ANTHROPIC_API_KEY` | Set |
| SSH to GitHub | FAILS (no SSH key) — scripts use HTTPS with token |
| tree-sitter + C# grammar | Native module loads successfully (some large files fall back to regex) |
| All 4 source repos accessible | Cloned successfully (blobless clone for .NET) |
| .NET backend repo size | 453 MB full / ~40K files with `--filter=blob:none --depth 1` |

## Component ↔ Script Data Mismatches (RESOLVED)

All mismatches were fixed by adding normalizer functions in the components:

| Component | Resolution |
|-----------|-----------|
| **SchedulerCatalog** | Added `RawScheduler` interface + `normalizeScheduler()` that maps `schedulePattern`→`frequency`, `serviceType`→`type`, defaults `status: 'Active'` |
| **SprocMap** | Added `RawSprocProcedure` interface + `normalizeSprocMapping()` that maps `procedureName`→`sproc`, extracts project from `filePath` |
| **DependencyGraph** | MDX exports `graphData` computed from `solution-map.json` (`projects`→`nodes`, `dependencies`→`links`). Added group colors for Infrastructure, WindowsServices, Common. |
| **MigrationTracker** | Added optional `features` prop with `SAMPLE_DATA` fallback (no parse script produces this data yet) |
| **ArchitectureDiagram** | No fix needed — unused (raw mermaid blocks used instead) |

---

## Implementation Plan

### Task 1: Clone source repos (`sync-repos`)
**Run:** `npm run sync-repos` from `/home/skonudula/projects/myevaluations/myevals-docs/`

- Clones 4 repos to `.repos/` via HTTPS with `GITHUB_TOKEN`
- Shallow clone (`--depth 1`): `myevals-dotnet-backend` (master), `myevals-nodejs-backend` (main), `myevals-react-frontend` (main), `myevals-xamarin-app` (main)
- **Potential issues:** Token format, network timeout (120s default per repo), 453MB .NET repo
- **Verify:** `.repos/` has 4 subdirectories with actual source files

### Task 2: Run parse/generate pipeline (`generate:all`)
**Run:** `npm run generate:all` (runs 7 scripts sequentially)

Scripts and expected output:

| Script | Output File(s) | What It Produces |
|--------|----------------|------------------|
| `parse:dotnet:solution` | `generated/dotnet-metadata/solution-map.json`, `dependency-graph.mmd` | Project list, dependencies, Mermaid graph |
| `parse:dotnet:classes` | `generated/dotnet-metadata/classes/{Project}.json` (one per Business.* project) | Classes, methods, properties, stored proc calls via tree-sitter AST |
| `parse:dotnet:schedulers` | `generated/dotnet-metadata/schedulers.json` | Scheduler catalog: name, domain, schedule, description |
| `parse:dotnet:sprocs` | `generated/dotnet-metadata/stored-procedures.json` | Stored procedure references mapped to calling classes/methods |
| `generate:nodejs` | `static/openapi/nodejs-api.json`, `generated/nodejs-api/nodejs-summary.json` | NestJS module catalog, OpenAPI spec copy |
| `generate:react` | `generated/nodejs-api/react-components.json` | React component catalog with Plasmic detection |
| `generate:maui` | `generated/dotnet-metadata/maui-catalog.json` | MAUI ViewModels, Services, Pages catalog |

- **Potential issues:** .sln path mismatch, tree-sitter parse errors on complex C# syntax, no OpenAPI spec in Node.js repo, directory naming differences
- **Debug strategy:** Run each script individually if `generate:all` fails, fix per-script issues
- **Verify:** All 7 output files exist with non-empty JSON content

### Task 3: Fix component ↔ script field mismatches
Update the 3 interactive components to accept the actual parse script output format:

**3a. SchedulerCatalog.tsx** (`src/components/SchedulerCatalog.tsx`)
- Remap incoming props: `schedulePattern` → display as `frequency`, `serviceType` → display as `type`
- Add default `status: 'Active'` (script doesn't detect status)
- Keep existing placeholder fallback for when no props are passed

**3b. SprocMap.tsx** (`src/components/SprocMap.tsx`)
- Remap incoming props: `procedureName` → `sproc`, `className` → `class`, `methodName` → `method`
- Extract project name from `filePath` (script provides filePath but not project)
- Uncomment SprocMap in `docs/dotnet-backend/data-access/stored-procedures.mdx`

**3c. DependencyGraph data in project-map.mdx** (`docs/dotnet-backend/project-map.mdx`)
- After parse runs, update the hardcoded inline `data` prop with real data from `solution-map.json`
- Transform `projects` → `nodes` (map `name`→`id`/`label`, `group`→`group`) and `dependencies` → `links` (map `from`/`to` → `source`/`target`)

**3d. MigrationTracker.tsx** (`src/components/MigrationTracker.tsx`)
- Add optional `features` prop: `MigrationTrackerProps { features?: MigrationFeature[] }`
- Fall back to existing `SAMPLE_DATA` when prop not provided
- No parse script changes needed — sample data is fine for now

### Task 4: Wire generated data into MDX pages
Update the key MDX pages to pass real data to components:

- **`schedulers/index.mdx`** — Import schedulers JSON, pass as prop to `<SchedulerCatalog schedulers={data} />`
- **`data-access/stored-procedures.mdx`** — Uncomment SprocMap import, pass data from stored-procedures.json
- **`project-map.mdx`** — Replace hardcoded graph with data from solution-map.json (or generate a new inline version from the JSON)

### Task 5: Rebuild and verify
```bash
npm run build          # Rebuild with real generated data
npm run serve          # Preview locally on port 3700
```
- Verify interactive components render real data (not placeholders)
- Verify Docusaurus build has zero errors
- Check key pages: project-map, schedulers/index, stored-procedures

### Task 6: Commit, push, and redeploy
```bash
git add -A
git commit -m "Populate docs with real source data from parse pipeline"
git push origin main
```
- Coolify auto-deploys on push to main
- After deploy: `docker network connect web <container>` for Traefik routing
- Verify live site at myevalsdocs.i95dev.com

### Task 7 (Optional): Run AI enrichment
If desired after the core pipeline succeeds:
```bash
npm run ai:enrich:dotnet   # .NET-focused enrichment (~$8, priority modules get 6000 tokens)
npm run ai:enrich          # All repos enrichment
```
- Requires ANTHROPIC_API_KEY (already set)
- Rate-limited at 2s/call — may take 30-60 min for full run
- Outputs to `generated/ai-enriched/` (cached by SHA)

---

## Key Files to Modify

| File | Change |
|------|--------|
| `scripts/sync-repos.ts` | May need fixes if clone URL format or auth fails |
| `scripts/parse-dotnet-*.ts` | May need path fixes based on actual repo structure |
| `src/components/SchedulerCatalog.tsx` | Remap `schedulePattern`→`frequency`, `serviceType`→`type` |
| `src/components/SprocMap.tsx` | Remap `procedureName`→`sproc`, `className`→`class`, `methodName`→`method` |
| `src/components/MigrationTracker.tsx` | Add optional `features` prop |
| `docs/dotnet-backend/schedulers/index.mdx` | Import and pass real scheduler data |
| `docs/dotnet-backend/data-access/stored-procedures.mdx` | Uncomment SprocMap, pass real data |
| `docs/dotnet-backend/project-map.mdx` | Update graph with real solution data |

## Verification (ALL PASSED 2026-02-20)

1. `.repos/` has 4 directories with real source files — **PASS** (myevals-dotnet-backend, myevals-nodejs-backend, myevals-react-frontend, myevals-xamarin-app)
2. `generated/dotnet-metadata/` has all expected files — **PASS** (solution-map.json 21KB, 22 class JSONs, schedulers.json 7KB, stored-procedures.json 5MB, maui-catalog.json 495KB, dependency-graph.mmd 9KB)
3. `generated/nodejs-api/` has expected files — **PASS** (nodejs-summary.json 2KB, react-components.json 1.8MB)
4. `npm run build` succeeds with zero errors — **PASS** (1 non-critical webpack warning)
5. SchedulerCatalog renders real scheduler names — **PASS** (8 schedulers: FileUploadComponentWeb, SYS_NotificationServices, etc.)
6. SprocMap renders real stored procedure mappings — **PASS** (top 50 of 3,991 sprocs with expand/collapse callers)
7. DependencyGraph loads real solution data — **PASS** (31 nodes, 96 edges from solution-map.json)
8. Live site shows real data after deploy — **PASS** (Coolify deploy succeeded, container healthy, verified via wget inside container)

---

## Progress Tracking

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Clone source repos (`sync-repos`) | **DONE** | 4 repos cloned via HTTPS + `gh auth token`. Blobless clone for .NET (453MB). Timeout increased to 10 min. |
| 2 | Run parse/generate pipeline (`generate:all`) | **DONE** | 663 classes, 3,991 sprocs (9,669 refs), 8 schedulers, 31 projects (96 deps), 2,550 React components, 655 MAUI classes. Fixed `Business.*` → `MyEvaluations.Business.*` path patterns in 3 scripts. |
| 3 | Fix component ↔ script field mismatches | **DONE** | Added `normalizeScheduler()` in SchedulerCatalog, `normalizeSprocMapping()` in SprocMap, `features` prop in MigrationTracker, group colors in DependencyGraph. |
| 4 | Wire generated data into MDX pages | **DONE** | schedulers/index.mdx imports schedulers.json, stored-procedures.mdx imports top 50 sprocs, project-map.mdx transforms solution-map.json to nodes/links. |
| 5 | Rebuild and verify | **DONE** | `npm run build` succeeds with zero errors. All 3 pages verified in browser with real data. |
| 6 | Commit, push, and redeploy | **DONE** | 3 commits pushed (code changes, generated data, .dockerignore fix). Coolify deploy succeeded. Live at myevalsdocs.i95dev.com. |
| 7 | AI enrichment (optional) | **DONE** | Generated via Claude CLI instead of API (credits insufficient). 22 modules enriched: 44 files (22 MDX + 22 JSON), 412KB total. 3 priority modules (Security, Evaluations, DutyHours) with detailed architecture docs, Mermaid diagrams, and migration guides. Cache manifest written for all 22 modules. |
