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

# AI enrichment
npm run ai:enrich               # Claude API enrichment (needs ANTHROPIC_API_KEY)
npm run ai:enrich:dotnet        # .NET-dedicated enrichment pipeline
npm run enrich:merge            # Merge batch enrichment files into final JSONs
npm run enrich:pages            # Generate MDX file reference pages from enrichment JSONs
npm run enrich:build            # enrich:merge + enrich:pages (run after enrichment)

# Full pipeline
npm run build:full              # sync-repos + generate:all + build
```

## Architecture
- **Framework:** Docusaurus 3.7 with MDX, Mermaid diagrams, local search
- **Serving:** nginx:alpine in Docker (port 3700)
- **Deployment:** Coolify at myevalsdocs.i95dev.com (UUID: `dc6d71e6-1d2e-4563-86bd-d3c9ead30428`)
- **Source sync:** Shallow-clones 4 source repos at build time
- **AI enrichment:** Two modes — Claude API (automated, weekly) + Claude CLI Task agents (bulk, manual)

## Key Directories
- `docs/` — 139 MDX documentation pages
- `docs/dotnet-backend/` — 119 pages covering the .NET backend (primary focus)
  - `docs/dotnet-backend/business/` — 20 module overview pages (16 original + Common, Utilities, MailGunService, MyHelp)
  - `docs/dotnet-backend/business/files/` — 22 per-file reference pages (generated)
  - `docs/dotnet-backend/web/pages/` — 32 per-directory web reference pages (generated)
  - `docs/dotnet-backend/schedulers/files/` — 1 scheduler file reference page (generated)
  - `docs/dotnet-backend/supporting/` — 9 supporting project pages (generated)
- `scripts/` — 14 TypeScript build/parse/enrich scripts
- `src/components/` — 6 interactive React components (incl. `FileReference.tsx`)
- `generated/` — Auto-generated metadata (git-ignored)
  - `generated/dotnet-metadata/` — tree-sitter extraction JSONs
  - `generated/ai-enriched/dotnet/per-file/` — Per-file enrichment JSONs (4 layers)
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
