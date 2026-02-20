# MyEvaluations Docs

Interactive code documentation for the [MyEvaluations](https://github.com/myevaluations) healthcare education platform. Built with **Docusaurus 3.7**, auto-generated from 4 source repositories, and enriched with **Claude AI** explanations.

**Live site:** [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com) (basic auth protected)

---

## Why This Exists

MyEvaluations is a 25-year-old platform serving 10,000+ users across 900+ institutions for Graduate Medical Education (GME), CME, Nursing, and PA programs. The codebase spans 4 repositories with 19 developers, but had **no centralized documentation** — especially for the legacy .NET backend, a 17-year-old monolith with 27 projects, 70+ schedulers, and critical business logic locked in code.

This documentation site solves that by:

- Parsing all 4 source repos with tree-sitter and static analysis
- Generating searchable, cross-referenced documentation automatically
- Using Claude AI to enrich code docs with plain-English explanations and Mermaid diagrams
- Providing interactive components for exploring dependencies, schedulers, and stored procedures

## Documentation Coverage

### 70 pages across 7 sections:

| Section | Pages | Description |
|---------|-------|-------------|
| **Architecture** | 5 | System overview, data flows, deployment, auth, database schema |
| **.NET Backend** | 46 | Solution map, 16 business modules, 10 scheduler groups, patterns, data access, web structure, integrations, migration |
| **Node.js Backend** | 2 | NestJS overview, getting started |
| **React Frontend** | 2 | Next.js + Plasmic overview, getting started |
| **MAUI Mobile App** | 2 | .NET MAUI overview, getting started |
| **Cross-Cutting** | 4 | Migration status, feature matrix, coding standards, onboarding |
| **Guides** | 4 | Debugging, adding features, creating schedulers, common bugs |

### .NET Backend Deep Dive (Primary Focus)

The legacy .NET backend gets the most comprehensive treatment:

- **Project Map** — Visual dependency graph of all 27 projects (interactive D3.js)
- **16 Business Modules** — Security, Evaluations, DutyHours, CMETracking, PatientLog, Procedures, Portfolio, LearningAssignment, Quiz, Mail, TimeSheet, HelloSign, ERAS, ICC, EssentialActivities, NurseNotify
- **70+ Schedulers** — Cataloged across 10 domain groups (evaluation, clinical, duty hours, learning, license, communication, data integration, admin, conference, specialized)
- **Data Access Layer** — ADO.NET patterns, stored procedure catalog, connection management
- **Web Application** — ASPX structure, ApiHandler.ashx (React bridge), NewFrontend.cs (CDN embedding), user controls
- **Integrations** — ERAS, Amion/QGenda, Mailgun, e-signatures, Google APIs, Salesforce, Banner
- **Migration** — Strangler fig strategy, status tracker, shared MSSQL database coexistence

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | [Docusaurus 3.7](https://docusaurus.io/) with MDX |
| **Diagrams** | [Mermaid](https://mermaid.js.org/) (built-in theme) |
| **Search** | [@easyops-cn/docusaurus-search-local](https://github.com/easyops-cn/docusaurus-search-local) (offline, no Algolia) |
| **Interactive Components** | React 18, D3.js v7 (dependency graphs, force-directed layouts) |
| **Code Parsing** | [tree-sitter](https://tree-sitter.github.io/) with C# grammar |
| **AI Enrichment** | Claude Sonnet via [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) |
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
| `npm run generate:nodejs` | Generate Node.js backend docs from OpenAPI + TypeDoc |
| `npm run generate:react` | Generate React frontend component docs |
| `npm run generate:maui` | Generate MAUI mobile app docs via tree-sitter C# |
| `npm run generate:all` | Run all parsers and generators sequentially |

### AI Enrichment

| Command | Description |
|---------|-------------|
| `npm run ai:enrich` | Run Claude API enrichment across all repos (needs `ANTHROPIC_API_KEY`) |
| `npm run ai:enrich:dotnet` | Dedicated .NET enrichment pipeline (priority) |

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
├── docs/                             # 70 MDX/MD documentation pages
│   ├── intro.md                      # Landing page (slug: /)
│   ├── architecture/                 # 5 pages — system architecture
│   ├── dotnet-backend/               # 46 pages — .NET backend deep dive
│   │   ├── overview.mdx
│   │   ├── project-map.mdx           # Interactive dependency graph
│   │   ├── business/                 # 16 business module pages
│   │   ├── schedulers/               # 10 scheduler group pages + index
│   │   ├── patterns/                 # Manager/Info, data access, caching, auth patterns
│   │   ├── data-access/              # ADO.NET, stored procedures, connections
│   │   ├── web/                      # ASPX structure, ApiHandler, NewFrontend
│   │   ├── integrations/             # ERAS, Amion, Mailgun, e-signatures, etc.
│   │   └── migration/                # .NET → Node.js strategy and status
│   ├── nodejs-backend/               # 2 pages — NestJS backend
│   ├── react-frontend/               # 2 pages — Next.js + Plasmic frontend
│   ├── maui-app/                     # 2 pages — .NET MAUI mobile app
│   ├── cross-cutting/                # 4 pages — migration, standards, onboarding
│   └── guides/                       # 4 pages — debugging, features, schedulers, bugs
├── scripts/                          # 10 TypeScript build/parse/enrich scripts
│   ├── sync-repos.ts                 # Shallow-clone source repos
│   ├── parse-dotnet-solution.ts      # .sln → project map + Mermaid graph
│   ├── parse-dotnet-classes.ts       # tree-sitter C# → class/method extraction
│   ├── parse-dotnet-schedulers.ts    # Scheduler cataloging
│   ├── parse-dotnet-sprocs.ts        # Stored procedure reference extraction
│   ├── generate-nodejs-docs.ts       # OpenAPI + TypeDoc generation
│   ├── generate-react-docs.ts        # react-docgen-typescript
│   ├── generate-maui-docs.ts         # MAUI ViewModels/Refit extraction
│   ├── ai-enrich.ts                  # Claude API enrichment with SHA caching
│   └── ai-enrich-dotnet.ts           # Dedicated .NET enrichment pipeline
├── src/
│   ├── components/                   # 5 interactive React components
│   │   ├── DependencyGraph.tsx       # D3.js force-directed project dependency map
│   │   ├── MigrationTracker.tsx      # .NET → Node.js migration progress tracker
│   │   ├── SchedulerCatalog.tsx      # Searchable/filterable scheduler table
│   │   ├── SprocMap.tsx              # Stored procedure → Manager method mapping
│   │   └── ArchitectureDiagram.tsx   # Interactive Mermaid diagram renderer
│   ├── css/custom.css                # Theme customization
│   └── pages/index.tsx               # Homepage with project cards and quick links
├── static/
│   ├── img/favicon.ico
│   └── openapi/                      # OpenAPI specs (populated by generate scripts)
├── generated/                        # Auto-generated metadata (git-ignored)
│   ├── dotnet-metadata/              # tree-sitter extraction JSONs
│   ├── nodejs-api/                   # TypeDoc output
│   └── ai-enriched/                  # Claude-generated MDX (cached by SHA)
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

---

## Deployment

### Production

The site is deployed to **Coolify PaaS** at [myevalsdocs.i95dev.com](https://myevalsdocs.i95dev.com).

| Property | Value |
|----------|-------|
| **URL** | `https://myevalsdocs.i95dev.com` |
| **Port** | 3700 |
| **Coolify UUID** | `dc6d71e6-1d2e-4563-86bd-d3c9ead30428` |
| **Container** | nginx:1.27-alpine (static files) |
| **Health check** | `GET /health` (30s interval) |
| **Auto-deploy** | Push to `main` triggers Coolify rebuild |
| **SSL** | Auto-renewed Let's Encrypt via Traefik |
| **Auth** | Traefik basic auth middleware |

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
| [myevals-dotnet-backend](https://github.com/myevaluations/myevals-dotnet-backend) | C# | Legacy .NET 4.6.1 WebForms monolith (27 projects, 70+ schedulers) |
| [myevals-nodejs-backend](https://github.com/myevaluations/myevals-nodejs-backend) | TypeScript | NestJS 10 backend (28 domains, 29 BullMQ workers) |
| [myevals-react-frontend](https://github.com/myevaluations/myevals-react-frontend) | TypeScript | Next.js 13.5 + Plasmic visual builder |
| [myevals-xamarin-app](https://github.com/myevaluations/myevals-xamarin-app) | C# | .NET MAUI 9 mobile app (iOS + Android) |

Source repos are shallow-cloned into `.repos/` at build time by `npm run sync-repos`.

---

## AI Enrichment

The documentation is enriched using **Claude Sonnet** via the Anthropic SDK. The enrichment pipeline:

1. Parses source code files and extracts context (classes, methods, dependencies)
2. Sends code snippets to Claude with structured prompts requesting explanations
3. Generates MDX content with Mermaid diagrams and code annotations
4. Caches results by file SHA to avoid re-processing unchanged files
5. Estimated cost: ~$8 per full enrichment run across all repos

The enrichment runs automatically every Monday at 6 AM UTC via GitHub Actions, or can be triggered manually:

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

### Supported Syntax

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
npm run generate:all

# 3. (Optional) Run AI enrichment
npm run ai:enrich

# 4. Build the site
npm run build
```

Or use the combined command:

```bash
npm run build:full   # sync + generate + build
```

---

## Known Issues

- **tree-sitter peer dependency** — Requires `--legacy-peer-deps` for installation (handled by `.npmrc`)
- **`showLastUpdateTime` in Docker** — Disabled during Docker builds via `DOCKER_BUILD=true` env var (no `.git` directory in container)
- **Container network reconnection** — After each Coolify redeployment, the container must be reconnected to the `web` Docker network for Traefik routing: `docker network connect web <container-name>`

---

## License

Proprietary — All rights reserved. MyEvaluations / i95Dev Inc.
