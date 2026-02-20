---
sidebar_position: 2
title: Getting Started
description: Developer setup guide for the MyEvaluations React frontend -- prerequisites, Plasmic access, environment configuration, and running the development server.
---

# Getting Started

This guide walks you through setting up the MyEvaluations React frontend (`myevals-react-frontend`) for local development.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20 LTS | Use [nvm](https://github.com/nvm-sh/nvm) to manage versions |
| npm | 10+ | Comes with Node.js 20 |
| Git | 2.x | For cloning the repository |
| Plasmic account | -- | Request access from the team lead |
| VPN | -- | Required for API access to dev backends |

## Step 1: Clone the Repository

```bash
git clone git@github.com:myevaluations/myevals-react-frontend.git
cd myevals-react-frontend
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Key environment variables:

```env
# API Endpoints
NEXT_PUBLIC_DOTNET_API_URL=https://dev.myevaluations.com
NEXT_PUBLIC_NODEJS_API_URL=https://api-dev.myevaluations.com

# Plasmic
PLASMIC_PROJECT_ID=<project-id>
PLASMIC_PROJECT_TOKEN=<project-token>

# Feature Flags
NEXT_PUBLIC_ENABLE_NEW_DASHBOARD=true
```

## Step 4: Run the Development Server

```bash
npm run dev
```

The development server starts on `http://localhost:3000`.

## Plasmic Studio Access

To work with Plasmic visual components:

1. Request access to the MyEvaluations Plasmic project from the team lead
2. Log in to [Plasmic Studio](https://studio.plasmic.app/)
3. Open the MyEvaluations project
4. Make visual changes in the studio
5. Sync changes to your local codebase:

```bash
npx plasmic sync
```

:::tip
Always run `plasmic sync` on a feature branch, never directly on `main`. Review the generated component changes before committing.
:::

## Common Development Commands

```bash
# Start development server (hot-reload)
npm run dev

# Build Next.js standalone app
npm run build

# Build HTML partials (esbuild)
npm run build:html

# Build both outputs
npm run build:all

# Sync Plasmic components
npx plasmic sync

# Run linter
npm run lint

# Type-check without building
npm run type-check

# Start production server locally
npm run start
```

## Project Structure

```
myevals-react-frontend/
├── pages/                  # Next.js pages (route definitions)
│   ├── New/               # Migrated pages (embedded in .NET shell)
│   │   ├── Evaluations/
│   │   ├── DutyHours/
│   │   ├── PatientLog/
│   │   └── ...
│   ├── api/               # Next.js API routes (if any)
│   └── _app.tsx           # App wrapper
├── components/
│   ├── plasmic/           # Plasmic-generated components (500+)
│   └── custom/            # Hand-written custom components
├── lib/
│   ├── api/               # API client utilities
│   ├── hooks/             # Custom React hooks
│   └── utils/             # Shared utilities
├── styles/                # Global styles and CSS modules
├── public/                # Static assets
├── esbuild/               # HTML partial build configuration
├── .github/workflows/     # CI/CD pipelines
└── package.json
```

## Working with HTML Partials

The HTML partial build creates embeddable React bundles for the .NET WebForms shell:

```bash
# Build HTML partials only
npm run build:html
```

Output goes to `dist/html/` -- each page becomes a self-contained HTML file with inlined JS and CSS.

### Testing Partials Locally

To test how a partial looks when embedded in the .NET shell:

1. Build the partial: `npm run build:html`
2. Open the HTML file directly in a browser for a quick check
3. For full integration testing, deploy to the dev environment and access via the .NET application

## Debugging

### React DevTools

Install the [React DevTools](https://react.dev/learn/react-developer-tools) browser extension to inspect component hierarchy, props, and state.

### Network Debugging

Use the browser's Network tab to verify API calls are going to the correct backend (.NET vs Node.js).

### Common Issues

| Problem | Solution |
|---------|----------|
| Plasmic sync fails | Ensure your Plasmic token is valid in `.env.local` |
| API calls return 401 | Connect to VPN and ensure dev backend is running |
| Styles look wrong | Clear browser cache; Plasmic styles may have been updated |
| Build fails on `build:html` | Check esbuild config in `esbuild/` directory |
| `Module not found` errors | Run `npm install` -- a Plasmic sync may have added new dependencies |

## Next Steps

- Read the [React Frontend Overview](/docs/react-frontend/overview) for architecture details
- Explore how React pages are [embedded in the .NET shell](/docs/dotnet-backend/web/new-frontend)
- Review the [Feature Matrix](/docs/cross-cutting/feature-matrix) to see which pages have been migrated
