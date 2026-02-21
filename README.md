# MyEvaluations Docs

Interactive code documentation for the [MyEvaluations](https://github.com/myevaluations) healthcare education platform. Built with **Docusaurus 3.7**, auto-generated from 4 source repositories, and enriched with **Claude AI** explanations.

**Live site:** [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com) (basic auth protected)

---

## Why This Exists

MyEvaluations is a 25-year-old platform serving 10,000+ users across 900+ institutions for Graduate Medical Education (GME), CME, Nursing, and PA programs. The codebase spans 4 repositories with 19 developers, but had **no centralized documentation** — especially for the legacy .NET backend, a 17-year-old monolith with 27 projects, 70+ schedulers, and critical business logic locked in code.

This documentation site solves that by:

- Parsing all 4 source repos with tree-sitter and static analysis
- Generating searchable, cross-referenced documentation automatically
- Using Claude AI to enrich every source file with plain-English summaries, business purpose, key methods, stored procedure references, and migration guidance
- Providing interactive components for exploring dependencies, schedulers, and stored procedures

## Documentation Coverage

### 139 pages across 8 sections:

| Section | Pages | Description |
|---------|-------|-------------|
| **Architecture** | 5 | System overview, data flows, deployment, auth, database schema |
| **.NET Backend** | 119 | Solution map, 20 business module overviews, 10 scheduler groups, patterns, data access, web structure, integrations, migration, **file reference (2,422 files)** |
| **Node.js Backend** | 2 | NestJS overview, getting started |
| **React Frontend** | 2 | Next.js + Plasmic overview, getting started |
| **MAUI Mobile App** | 2 | .NET MAUI overview, getting started |
| **Cross-Cutting** | 4 | Migration status, feature matrix, coding standards, onboarding |
| **Guides** | 4 | Debugging, adding features, creating schedulers, common bugs |
| **Root** | 1 | Landing page |

### .NET Backend Deep Dive (Primary Focus)

The legacy .NET backend gets the most comprehensive treatment:

- **Project Map** — Visual dependency graph of all 27 projects (interactive D3.js)
- **20 Business Module Overviews** — Security, Evaluations, DutyHours, CMETracking, PatientLog, Procedures, Portfolio, LearningAssignment, Quiz, Mail, TimeSheet, HelloSign, ERAS, ICC, EssentialActivities, NurseNotify, Common, Utilities, MailGunService, MyHelp — each with a `## File Reference` link to its per-file documentation
- **70+ Schedulers** — Cataloged across 10 domain groups with per-file reference
- **Data Access Layer** — ADO.NET patterns, stored procedure catalog, connection management
- **Web Application** — ASPX structure, ApiHandler.ashx (React bridge), NewFrontend.cs (CDN embedding), user controls
- **Integrations** — ERAS, Amion/QGenda, Mailgun, e-signatures, Google APIs, Salesforce, Banner
- **Migration** — Strangler fig strategy, status tracker, shared MSSQL database coexistence

### Per-File Reference (2,422 files documented)

Every meaningful source file in the .NET backend has per-file documentation including summary, business purpose, key methods, stored procedures called, migration relevance, and complexity rating:

| Layer | Files | Pages |
|-------|-------|-------|
| Web Application (32 directories) | 1,644 | `dotnet-backend/web/pages/*` |
| Schedulers (66 projects) | 160 | `dotnet-backend/schedulers/files/schedulers` |
| Business Layer (22 modules) | 556 | `dotnet-backend/business/files/*` |
| Supporting Projects (9) | 62 | `dotnet-backend/supporting/*` |
| **Total** | **2,422** | |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | [Docusaurus 3.7](https://docusaurus.io/) with MDX |
| **Diagrams** | [Mermaid](https://mermaid.js.org/) (built-in theme) |
| **Search** | [@easyops-cn/docusaurus-search-local](https://github.com/easyops-cn/docusaurus-search-local) (offline, no Algolia) |
| **Interactive Components** | React 18, D3.js v7 (dependency graphs, force-directed layouts) |
| **Code Parsing** | [tree-sitter](https://tree-sitter.github.io/) with C# grammar |
| **AI Enrichment** | Claude Opus via Claude CLI Task agents (bulk) + Claude Sonnet via [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) (automated) |
| **Serving** | nginx 1.27 Alpine (static files, gzip, SPA fallback) |
| **Container** | Multi-stage Docker (node:22-alpine builder, nginx:1.27-alpine runner) |
| **Deployment** | [Coolify](https://coolify.io/) PaaS with Traefik reverse proxy |
| **CI/CD** | GitHub Actions (build on push, weekly AI enrichment) |

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+

### Development

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start dev server (port 3700)
npm run dev
```

The site will be available at `http://localhost:3700`.

### Production Build

```bash
# Build static site
npm run build

# Serve locally
npm run serve
```

---

## Scripts

### Core Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Docusaurus dev server on port 3700 |
| `npm run build` | Build production static site |
| `npm run serve` | Serve production build on port 3700 |
| `npm run clear` | Clear Docusaurus cache |

### Source Repo Sync & Parsing

| Command | Description |
|---------|-------------|
| `npm run sync-repos` | Shallow-clone all 4 source repos into `.repos/` |
| `npm run parse:dotnet:solution` | Parse `MyEvaluations2009.sln` for project map and dependencies |
| `npm run parse:dotnet:classes` | Extract classes, methods, and namespaces via tree-sitter C# |
| `npm run parse:dotnet:schedulers` | Catalog 70+ schedulers from Schedulers directory |
| `npm run parse:dotnet:sprocs` | Extract stored procedure references from the data access layer |
| `npm run parse:dotnet:web-files` | Parse all Web/ subdirectory .cs files → `generated/dotnet-metadata/web-files/` |
| `npm run parse:dotnet:all-files` | Parse Schedulers/ + supporting project .cs files → `generated/dotnet-metadata/schedulers-files/` |
| `npm run parse:dotnet:full` | Run all 6 dotnet parsers sequentially (full metadata extraction) |
| `npm run generate:nodejs` | Generate Node.js backend docs from OpenAPI + TypeDoc |
| `npm run generate:react` | Generate React frontend component docs |
| `npm run generate:maui` | Generate MAUI mobile app docs via tree-sitter C# |
| `npm run generate:all` | Run all parsers and generators sequentially |

### AI Enrichment

| Command | Description |
|---------|-------------|
| `npm run ai:enrich` | Run Claude API enrichment across all repos (needs `ANTHROPIC_API_KEY`) |
| `npm run ai:enrich:dotnet` | Dedicated .NET enrichment pipeline (priority) |
| `npm run enrich:merge` | Merge per-batch enrichment JSONs into final per-directory JSONs |
| `npm run enrich:pages` | Generate MDX file reference pages from enrichment JSONs |
| `npm run enrich:build` | Run `enrich:merge` + `enrich:pages` (run after any enrichment work) |

### Full Pipeline

| Command | Description |
|---------|-------------|
| `npm run build:full` | Sync repos + generate all metadata + build site |

---

## Project Structure

```
myevals-docs/
├── .github/workflows/
│   ├── build-and-deploy.yml         # Build + deploy to Coolify on push to main
│   ├── ai-enrich-scheduled.yml      # Weekly Claude AI enrichment (Monday 6 AM UTC)
│   └── trigger-docs.yml             # Template for source repos to trigger rebuilds
├── docker/
│   ├── Dockerfile.coolify            # Multi-stage: node:22-alpine → nginx:1.27-alpine
│   └── nginx.conf                    # Port 3700, gzip, health check, SPA fallback, robots.txt
├── docs/                             # 135 MDX/MD documentation pages
│   ├── intro.md                      # Landing page (slug: /)
│   ├── architecture/                 # 5 pages — system architecture
│   ├── dotnet-backend/               # 115 pages — .NET backend deep dive
│   │   ├── overview.mdx
│   │   ├── project-map.mdx           # Interactive dependency graph
│   │   ├── file-index.mdx            # Master index: 2,422 files across 4 layers
│   │   ├── business/                 # 20 business module overview pages (each cross-links to per-file reference)
│   │   │   └── files/               # 22 per-file reference pages (generated)
│   │   ├── schedulers/               # 10 scheduler group pages + index
│   │   │   └── files/               # 1 scheduler file reference page (generated)
│   │   ├── supporting/               # 9 supporting project pages (generated)
│   │   ├── web/
│   │   │   └── pages/               # 32 web directory reference pages (generated)
│   │   ├── patterns/                 # Manager/Info, data access, caching, auth patterns
│   │   ├── data-access/              # ADO.NET, stored procedures, connections
│   │   ├── integrations/             # ERAS, Amion, Mailgun, e-signatures, etc.
│   │   └── migration/                # .NET → Node.js strategy and status
│   ├── nodejs-backend/               # 2 pages — NestJS backend
│   ├── react-frontend/               # 2 pages — Next.js + Plasmic frontend
│   ├── maui-app/                     # 2 pages — .NET MAUI mobile app
│   ├── cross-cutting/                # 4 pages — migration, standards, onboarding
│   └── guides/                       # 4 pages — debugging, features, schedulers, bugs
├── scripts/                          # 14 TypeScript build/parse/enrich scripts
│   ├── sync-repos.ts                 # Shallow-clone source repos
│   ├── parse-dotnet-solution.ts      # .sln → project map + Mermaid graph
│   ├── parse-dotnet-classes.ts       # tree-sitter C# → class/method extraction
│   ├── parse-dotnet-schedulers.ts    # Scheduler cataloging
│   ├── parse-dotnet-sprocs.ts        # Stored procedure reference extraction
│   ├── parse-dotnet-web-files.ts     # Web/ subdirectory .cs file metadata extraction
│   ├── parse-dotnet-all-files.ts     # Schedulers/ + supporting project metadata extraction
│   ├── generate-nodejs-docs.ts       # OpenAPI + TypeDoc generation
│   ├── generate-react-docs.ts        # react-docgen-typescript
│   ├── generate-maui-docs.ts         # MAUI ViewModels/Refit extraction
│   ├── ai-enrich.ts                  # Claude API enrichment with SHA caching
│   ├── ai-enrich-dotnet.ts           # Dedicated .NET enrichment pipeline
│   ├── merge-enrichment-batches.ts   # Merge per-batch JSONs + regenerate enrichment-index.json
│   └── generate-file-reference-pages.ts # Generate MDX pages from enrichment JSONs
├── src/
│   ├── components/                   # 6 interactive React components
│   │   ├── DependencyGraph.tsx       # D3.js force-directed project dependency map
│   │   ├── MigrationTracker.tsx      # .NET → Node.js migration progress tracker
│   │   ├── SchedulerCatalog.tsx      # Searchable/filterable scheduler table
│   │   ├── SprocMap.tsx              # Stored procedure → Manager method mapping
│   │   ├── ArchitectureDiagram.tsx   # Interactive Mermaid diagram renderer
│   │   └── FileReference.tsx         # Per-file documentation table with sorting/filtering
│   ├── css/custom.css                # Theme customization
│   └── pages/index.tsx               # Homepage with project cards and quick links
├── static/
│   ├── img/favicon.ico
│   └── openapi/                      # OpenAPI specs (populated by generate scripts)
├── generated/                        # Auto-generated metadata (git-ignored)
│   ├── dotnet-metadata/
│   │   ├── solution.json             # Project map and dependencies
│   │   ├── classes/                  # Business module class extraction (22 JSONs)
│   │   ├── schedulers.json           # Scheduler catalog
│   │   ├── sprocs.json               # Stored procedure references
│   │   ├── web-files/                # Web subdirectory metadata (32 JSONs)
│   │   └── schedulers-files/         # Scheduler project metadata
│   ├── nodejs-api/                   # TypeDoc output
│   └── ai-enriched/
│       └── dotnet/
│           └── per-file/             # Per-file enrichment JSONs + index
│               ├── web/              # 32 JSONs (1,644 files)
│               ├── schedulers/       # 1 JSON (160 files, 66 projects)
│               ├── business/         # 22 JSONs (556 files)
│               ├── supporting/       # 9 JSONs (62 files)
│               ├── enrichment-index.json  # Master index with complexity/migration stats
│               └── cache-manifest.json    # SHA-based cache for incremental re-runs
├── docusaurus.config.ts              # Site configuration
├── sidebars.ts                       # Sidebar navigation structure
├── package.json
├── tsconfig.json
└── .npmrc                            # legacy-peer-deps=true (for tree-sitter compat)
```

---

## Interactive Components

### DependencyGraph

D3.js force-directed graph showing inter-project dependencies across all 27 .NET solution projects. Nodes are color-coded by layer (Web, Business, DataAccess, Infrastructure). Click to navigate to project docs.

### SchedulerCatalog

Searchable, filterable table of 70+ schedulers. Filter by domain (evaluation, clinical, duty hours, etc.), status (active, legacy VBS, deprecated), or free-text search. Each entry links to detailed scheduler documentation.

### MigrationTracker

Visual progress tracker for the .NET-to-Node.js strangler fig migration. Shows feature-by-feature status with completion percentages per module.

### SprocMap

Two-way mapping between stored procedures and the Business Manager methods that call them. Search by procedure name or method name to trace data flow through the system.

### ArchitectureDiagram

Interactive Mermaid diagram renderer with zoom, pan, and theme-aware rendering (light/dark mode).

### FileReference

Sortable, filterable table of per-file documentation. Shows file name, summary, complexity badge, and migration relevance for all files in a directory. Used in all generated `business/files/*.mdx` and `web/pages/*.mdx` reference pages.

---

## Deployment

### Production

The site is deployed to **Coolify PaaS** at [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com).

| Property | Value |
|----------|-------|
| **URL** | `https://myevalsdocs.i95dev.com` |
| **Auth** | Basic auth: `i95dev` / `i95DevTe@m` |
| **Port** | 3700 |
| **Coolify UUID** | `dc6d71e6-1d2e-4563-86bd-d3c9ead30428` |
| **Container** | nginx:1.27-alpine (static files) |
| **Health check** | `GET /health` (30s interval) |
| **Auto-deploy** | Push to `main` triggers Coolify rebuild |
| **SSL** | Auto-renewed Let's Encrypt via Traefik |

### Docker Build

```bash
# Build locally
docker build -f docker/Dockerfile.coolify -t myevals-docs .

# Run locally
docker run -p 3700:3700 myevals-docs
```

The Dockerfile uses a multi-stage build:
1. **Builder** (node:22-alpine) — installs dependencies, builds Docusaurus static site
2. **Runner** (nginx:1.27-alpine) — serves static files with gzip compression

### GitHub Actions Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `build-and-deploy.yml` | Push to `main`, repository dispatch | Build site and deploy to Coolify |
| `ai-enrich-scheduled.yml` | Cron (Monday 6 AM UTC) | Run Claude API enrichment on source repos |
| `trigger-docs.yml` | Template | Add to source repos to trigger doc rebuilds |

### Secrets Required

| Secret | Description |
|--------|-------------|
| `DEPLOY_SSH_KEY` | SSH private key for root access to production server |
| `COOLIFY_APP_UUID` | Coolify application UUID (`dc6d71e6-...`) |
| `ANTHROPIC_API_KEY` | Claude API key (for AI enrichment workflow only) |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions (for source repo cloning) |

---

## Security

### Access Control

- **Traefik basic auth** — All requests require HTTP basic authentication
- **Internal network only** — Not intended for public access

### Search Engine Blocking (Defense-in-Depth)

Four layers prevent indexing by search engines:

1. **Traefik `X-Robots-Tag` header** — `noindex, nofollow, noarchive, nosnippet` (via `security-headers` middleware)
2. **nginx `robots.txt`** — Returns `User-agent: * / Disallow: /`
3. **Docusaurus `noIndex: true`** — Adds `<meta name="robots" content="noindex, nofollow">` to all pages
4. **HTML `headTags`** — Additional `<meta name="robots">` tag in document head

### Security Headers

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Robots-Tag` | `noindex, nofollow, noarchive, nosnippet` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |

---

## Source Repositories

This documentation site generates content from these 4 MyEvaluations repositories:

| Repository | Language | Description |
|------------|----------|-------------|
| [myevals-dotnet-backend](https://github.com/myevaluations/myevals-dotnet-backend) | C# | Legacy .NET 4.6.1 WebForms monolith (27 projects, 70+ schedulers, 2,422 documented files) |
| [myevals-nodejs-backend](https://github.com/myevaluations/myevals-nodejs-backend) | TypeScript | NestJS 10 backend (28 domains, 29 BullMQ workers) |
| [myevals-react-frontend](https://github.com/myevaluations/myevals-react-frontend) | TypeScript | Next.js 13.5 + Plasmic visual builder |
| [myevals-xamarin-app](https://github.com/myevaluations/myevals-xamarin-app) | C# | .NET MAUI 9 mobile app (iOS + Android) |

Source repos are shallow-cloned into `.repos/` at build time by `npm run sync-repos`.

---

## AI Enrichment

Documentation is enriched using two modes:

### Claude CLI Task Agents (Bulk Enrichment — No API Credits)

The 2,422-file per-file enrichment was generated using Claude CLI Task agents with no API credits:
- Each agent reads 15–30 source files from `.repos/myevals-dotnet-backend/`
- Produces structured JSON with summary, business purpose, key methods, stored procedures, migration relevance, and complexity rating
- Results stored in `generated/ai-enriched/dotnet/per-file/{layer}/`
- After agents complete: run `npm run enrich:build` to regenerate MDX pages

### Claude API (Automated, Weekly)

The automated weekly enrichment pipeline:
1. Parses source code and extracts context (classes, methods, dependencies)
2. Sends code snippets to Claude Sonnet with structured prompts
3. Generates MDX content with Mermaid diagrams and code annotations
4. Caches results by file SHA to avoid re-processing unchanged files
5. Estimated cost: ~$8 per full enrichment run

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run ai:enrich          # All repos
npm run ai:enrich:dotnet   # .NET backend only (priority)
```

---

## Contributing

### Adding a New Documentation Page

1. Create an `.mdx` file in the appropriate `docs/` subdirectory
2. Add the page to `sidebars.ts` in the correct category
3. Use MDX features: Mermaid diagrams, admonitions, tabs, code blocks with syntax highlighting
4. Run `npm run dev` to preview locally
5. Push to `main` to deploy

### Adding Per-File Enrichment for a New Directory

1. Run `npm run parse:dotnet:web-files` (or `parse:dotnet:all-files`) to extract metadata
2. Use a Claude CLI Task agent to enrich the files, writing output to `generated/ai-enriched/dotnet/per-file/{layer}/{Directory}.json`
3. Run `npm run enrich:build` to regenerate MDX pages and update `file-index.mdx`
4. Run `npm run build` to verify no errors
5. Commit and push

### Supported MDX Syntax

- **Mermaid diagrams** — Fenced code blocks with `mermaid` language tag
- **Admonitions** — `:::tip`, `:::warning`, `:::danger`, `:::info`, `:::note`
- **Syntax highlighting** — C#, TypeScript, SQL, JSON, Bash, and markup via Prism
- **MDX components** — Import and use React components directly in documentation
- **Tabs** — `<Tabs>` component for showing multiple code examples

### Running the Full Pipeline

To regenerate all documentation from source repos:

```bash
# 1. Clone/update source repos
npm run sync-repos

# 2. Parse all repos and generate metadata
npm run parse:dotnet:full
npm run generate:all

# 3. (Optional) Run AI enrichment
npm run ai:enrich

# 4. Regenerate file reference pages
npm run enrich:build

# 5. Build the site
npm run build
```

Or use the combined command (excludes enrichment):

```bash
npm run build:full   # sync + generate + build
```

---

## Known Issues

- **tree-sitter peer dependency** — Requires `--legacy-peer-deps` for installation (handled by `.npmrc`)
- **`showLastUpdateTime` in Docker** — Disabled during Docker builds via `DOCKER_BUILD=true` env var (no `.git` directory in container)
- **Container network reconnection** — After each Coolify redeployment, the container must be reconnected to the `web` Docker network for Traefik routing: `docker network connect web <container-name>`
- **`generated/` is git-ignored** — Per-file enrichment JSONs are not committed; they are regenerated at build time (the MDX pages generated from them ARE committed)

---

## License

Proprietary — All rights reserved. MyEvaluations / i95Dev Inc.
