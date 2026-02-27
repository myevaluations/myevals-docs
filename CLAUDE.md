# CLAUDE.md - MyEvaluations Documentation Site

## Overview
Interactive code documentation for the MyEvaluations platform. Built with Docusaurus 3.7.

**Live site:** [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com) (basic auth: `i95dev` / `i95DevTe@m`)

## Commands

```bash
npm run dev          # Dev server on port 3700
npm run build        # Production build
npm run serve        # Serve production build on port 3700
npm run clear        # Clear Docusaurus cache

# Source repo sync & parsing
npm run sync-repos              # Clone source repos into .repos/
npm run parse:dotnet:solution   # Parse .sln → project map and dependencies
npm run parse:dotnet:classes    # Extract classes/methods via tree-sitter C#
npm run parse:dotnet:schedulers # Catalog schedulers from Schedulers/
npm run parse:dotnet:sprocs     # Extract stored procedure references
npm run parse:dotnet:web-files  # Parse all Web/ .cs files by subdirectory
npm run parse:dotnet:all-files  # Parse Schedulers/ and supporting project .cs files
npm run parse:dotnet:full       # Run all 6 dotnet parsers sequentially
npm run generate:all            # Run all parsers + generators

# Database schema pipeline
npm run parse:db:schema         # Parse SQL schema → tables.json (AST-based, node-sql-parser)
npm run parse:db:sprocs         # Parse SQL stored procedures → stored-procedures-full.json
npm run parse:db:schema:excel   # Legacy: parse Excel schema (deprecated)
npm run parse:db:reconcile      # SP reconciliation between DB and code
npm run generate:db:pages       # Generate database MDX pages from tables.json
npm run generate:db:sproc-pages # Generate per-module SP reference MDX pages
npm run db:full                 # Full DB pipeline: parse schema + SPs + reconcile + generate all

# AI enrichment
npm run ai:enrich               # Claude API enrichment (needs ANTHROPIC_API_KEY)
npm run ai:enrich:dotnet        # .NET-dedicated enrichment pipeline
npm run enrich:merge            # Merge batch enrichment files into final JSONs
npm run enrich:pages            # Generate MDX file reference pages from enrichment JSONs
npm run enrich:build            # enrich:merge + enrich:pages (run after enrichment)
npm run enrich:sprocs           # Merge SP enrichment JSONs (after Claude CLI agents)

# Full pipeline
npm run build:full              # sync-repos + generate:all + build
```

## Architecture
- **Framework:** Docusaurus 3.7 with MDX, Mermaid diagrams, local search
- **Serving:** nginx:alpine in Docker (port 3700)
- **Deployment:** Coolify at myevalsdocs.i95dev.com (UUID: `dc6d71e6-1d2e-4563-86bd-d3c9ead30428`)
- **Source sync:** Shallow-clones 4 source repos at build time
- **DB schema source:** `input/MyEvaluations_Schema_20260226.sql` (147MB SSMS export, UTF-16LE) → AST-parsed via `node-sql-parser` + regex → `generated/db-schema/tables.json` (2,242 tables with 24,282 columns)
- **SP analysis:** Same SQL file → `parse-sql-sprocs.ts` → `generated/db-schema/stored-procedures-full.json` (5,028 SPs with parameters, anti-patterns, table refs, complexity)
- **AI enrichment:** Two modes — Claude API (automated, weekly) + Claude CLI Task agents (bulk, manual)

## Key Directories
- `docs/` — 139 MDX documentation pages
- `docs/dotnet-backend/` — 119 pages covering the .NET backend (primary focus)
  - `docs/dotnet-backend/business/` — 20 module overview pages (16 original + Common, Utilities, MailGunService, MyHelp)
  - `docs/dotnet-backend/business/files/` — 22 per-file reference pages (generated)
  - `docs/dotnet-backend/web/pages/` — 32 per-directory web reference pages (generated)
  - `docs/dotnet-backend/schedulers/files/` — 1 scheduler file reference page (generated)
  - `docs/dotnet-backend/supporting/` — 9 supporting project pages (generated)
- `docs/database/modules/sprocs/` — 21 per-module SP reference pages (generated)
- `static/sproc-detail-data/` — Static JSON data for SprocDetail component (generated)
- `scripts/` — 17 TypeScript build/parse/enrich scripts
- `src/components/` — 8 interactive React components (incl. `TableDetail.tsx`, `SprocDetail.tsx`, `SchemaHealth.tsx`)
- `generated/` — Auto-generated metadata (git-ignored)
  - `generated/dotnet-metadata/` — tree-sitter extraction JSONs
  - `generated/ai-enriched/dotnet/per-file/` — Per-file enrichment JSONs (4 layers)
  - `generated/db-schema/` — SQL parser output (tables.json, stored-procedures-full.json, indexes.json, etc.)
  - `generated/db-schema/sp-bodies/` — Full SP bodies per module for AI enrichment (git-ignored)
- `.repos/` — Cloned source repos (git-ignored)
- `docker/` — Dockerfile and nginx config
- `.github/workflows/` — CI/CD workflows

## Per-File Enrichment Coverage (2,422 files total)

| Layer | Files | Directories | JSON Location |
|-------|-------|-------------|---------------|
| Web Application | 1,644 | 32 | `generated/ai-enriched/dotnet/per-file/web/` |
| Schedulers | 160 | 66 projects | `generated/ai-enriched/dotnet/per-file/schedulers/` |
| Business Layer | 556 | 22 modules | `generated/ai-enriched/dotnet/per-file/business/` |
| Supporting Projects | 62 | 9 | `generated/ai-enriched/dotnet/per-file/supporting/` |

## FileEnrichment JSON Schema

Each enrichment JSON file follows this structure:
```json
{
  "directory": "Web/Security",
  "layer": "web",
  "generatedAt": "ISO-timestamp",
  "fileCount": 185,
  "files": [{
    "filePath": "Web/Security/Login.aspx.cs",
    "fileName": "Login.aspx.cs",
    "fileType": "code-behind",
    "className": "Login",
    "inheritsFrom": "BasePage",
    "module": "Security",
    "summary": "...",
    "businessPurpose": "...",
    "keyMethods": ["MethodName - description"],
    "storedProcedures": ["sp_AuthenticateUser"],
    "businessManagersUsed": ["SecurityManager"],
    "migrationRelevance": "high|medium|low|none",
    "migrationNote": "...",
    "complexity": "trivial|simple|moderate|complex|very-complex",
    "lineCount": 312
  }],
  "directoryOverview": "...",
  "keyWorkflows": ["Workflow description"]
}
```

**Valid values:**
- `complexity`: `trivial` | `simple` | `moderate` | `complex` | `very-complex` (never "high", "low", "medium")
- `migrationRelevance`: `high` | `medium` | `low` | `none` (never "critical")
- `keyMethods`: strings only, format `"MethodName - description"` (never objects)
- `keyWorkflows`: strings only (never objects)

## Development Notes
- The .NET backend is the primary documentation focus (17-year-old monolith)
- Scripts use `tsx` for TypeScript execution
- tree-sitter C# parsing falls back to regex if native module unavailable
- Per-file enrichment done via Claude CLI Task agents (not API credits) — one agent at a time
- After enrichment agent runs: always run `npm run enrich:build` to regenerate MDX pages
- For large files (>300 lines): agents should read only first 200 lines
- Skip auto-generated files: `AssemblyInfo.cs`, `Settings.Designer.cs`, `Web References/*/Reference.cs`, `obj/Release/TemporaryGeneratedFile_*.cs`
- After `enrich:build`: run `npm run build` to verify no Docusaurus errors before committing
- Use `node /tmp/script.js` for inline scripts (not `node -e "..."`) to avoid shell escaping issues with `!`
- `tree-sitter` peer dependency requires `--legacy-peer-deps` for npm install (handled automatically by `.npmrc`)
- `generated/` is **git-ignored** — per-file enrichment JSONs (`generated/ai-enriched/dotnet/per-file/**`) are NOT committed to git; regenerate locally before running `enrich:pages`. The **MDX pages** produced from them (`docs/dotnet-backend/business/files/*.mdx`, `docs/dotnet-backend/web/pages/*.mdx`, etc.) ARE committed and deployed.
- Every business module overview page links to its per-file reference page via a `## File Reference` section at the bottom. Keep this cross-linking consistent when adding new modules.

## Workflow Orchestration

### 1. Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake from recurring
- Review lessons at session start for the relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it — don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code impact.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
