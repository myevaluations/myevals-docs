# CLAUDE.md - MyEvaluations Documentation Site

## Overview
Interactive code documentation for the MyEvaluations platform. Built with Docusaurus 3.7.

## Commands
```bash
npm run dev          # Dev server on port 3700
npm run build        # Production build
npm run serve        # Serve production build on port 3700
npm run sync-repos   # Clone source repos into .repos/
npm run generate:all # Parse all repos and generate metadata
npm run build:full   # Sync + generate + build (full pipeline)
npm run ai:enrich    # Run Claude API enrichment (needs ANTHROPIC_API_KEY)
```

## Architecture
- **Framework:** Docusaurus 3.7 with MDX, Mermaid diagrams, local search
- **Serving:** nginx:alpine in Docker (port 3700)
- **Deployment:** Coolify at myevalsdocs.i95dev.com
- **Source sync:** Shallow-clones 4 source repos at build time
- **AI enrichment:** Claude Sonnet via @anthropic-ai/sdk, weekly schedule

## Key Directories
- `docs/` - MDX documentation pages
- `docs/dotnet-backend/` - .NET backend docs (primary focus)
- `scripts/` - TypeScript build/parse/enrich scripts
- `src/components/` - React components (DependencyGraph, MigrationTracker, etc.)
- `generated/` - Auto-generated metadata (git-ignored)
- `.repos/` - Cloned source repos (git-ignored)
- `docker/` - Dockerfile and nginx config
- `.github/workflows/` - CI/CD workflows

## Development Notes
- The .NET backend is the primary documentation focus (17-year-old monolith)
- Scripts use `tsx` for TypeScript execution
- tree-sitter C# parsing falls back to regex if native module unavailable
- AI enrichment caches by SHA to avoid re-processing unchanged files
