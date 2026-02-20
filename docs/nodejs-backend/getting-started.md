---
sidebar_position: 2
title: Getting Started
description: Developer setup guide for the MyEvaluations Node.js backend -- prerequisites, environment configuration, database setup, and running the development server.
---

# Getting Started

This guide walks you through setting up the MyEvaluations Node.js backend (`myevals-nodejs-backend`) for local development.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20 LTS | Use [nvm](https://github.com/nvm-sh/nvm) to manage versions |
| npm | 10+ | Comes with Node.js 20 |
| PostgreSQL | 14+ | For new feature data |
| Redis | 7+ | For BullMQ queues and caching |
| SQL Server access | 2016+ | Via VPN for shared legacy data |
| Git | 2.x | For cloning the repository |
| Docker (optional) | 24+ | For running PostgreSQL and Redis locally |

## Step 1: Clone the Repository

```bash
git clone git@github.com:myevaluations/myevals-nodejs-backend.git
cd myevals-nodejs-backend
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment Variables

Copy the example environment file and fill in the values:

```bash
cp .env.example .env
```

Key environment variables to configure:

```env
# Application
PORT=3000
NODE_ENV=development

# MSSQL (shared with .NET backend -- requires VPN)
MSSQL_HOST=<dev-sql-server-host>
MSSQL_PORT=1433
MSSQL_DATABASE=MyEvaluations
MSSQL_USER=<your-username>
MSSQL_PASSWORD=<your-password>

# PostgreSQL (local)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=myevaluations_dev
PG_USER=postgres
PG_PASSWORD=<your-local-pg-password>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=<dev-jwt-secret>
JWT_EXPIRATION=24h

# Azure Blob Storage (optional for local dev)
AZURE_STORAGE_CONNECTION_STRING=<optional>
```

:::warning VPN Required
You must be connected to the VPN to access the development SQL Server database. Without VPN, endpoints that query MSSQL will fail.
:::

## Step 4: Set Up Local Databases

### PostgreSQL

Create the local PostgreSQL database:

```bash
createdb myevaluations_dev
```

Run MikroORM migrations for PostgreSQL:

```bash
npm run migration:up
```

### Redis

Start Redis locally (or use Docker):

```bash
# Option A: If Redis is installed locally
redis-server

# Option B: Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### SQL Server (via VPN)

No local setup needed -- the development server is accessed via VPN. Ensure your VPN is connected and the MSSQL environment variables point to the dev server.

## Step 5: Run the Development Server

```bash
npm run start:dev
```

The server will start on `http://localhost:3000` with hot-reload enabled.

### Verify It's Running

```bash
curl http://localhost:3000/api/health
# Expected: { "status": "ok", "timestamp": "..." }
```

### Swagger API Docs

Once running, access the Swagger UI at:

```
http://localhost:3000/api/docs
```

## Common Development Commands

```bash
# Start development server (hot-reload)
npm run start:dev

# Start in debug mode (attach VS Code debugger)
npm run start:debug

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e

# Generate a new MikroORM migration
npm run migration:create

# Run pending migrations
npm run migration:up

# Lint the codebase
npm run lint

# Build for production
npm run build

# Start production server
npm run start:prod
```

## Project Structure

```
myevals-nodejs-backend/
├── src/
│   ├── modules/            # Domain modules (auth, evaluations, etc.)
│   │   ├── auth/
│   │   ├── evaluations/
│   │   ├── duty-hours/
│   │   ├── patient-log/
│   │   └── ...
│   ├── entities/
│   │   ├── mssql/          # MikroORM entities for shared MSSQL data
│   │   └── postgres/       # MikroORM entities for PostgreSQL data
│   ├── workers/            # BullMQ worker processors
│   ├── common/             # Shared guards, pipes, decorators, utils
│   ├── config/             # Configuration modules
│   └── main.ts             # Application entry point
├── test/                   # E2E tests
├── migrations/             # MikroORM migration files
├── docker/                 # Docker and Docker Swarm configs
├── .github/workflows/      # GitHub Actions CI/CD
└── package.json
```

## Running BullMQ Workers Locally

Workers run as separate processes. To start them locally:

```bash
# Start all workers
npm run worker:start

# Start a specific worker
npm run worker:start -- --name=evaluation-reminder
```

## Debugging

### VS Code Launch Configuration

The repository includes a `.vscode/launch.json` with pre-configured debug profiles:

1. **Debug Server** -- Attach the debugger to the NestJS development server
2. **Debug Tests** -- Run tests with the debugger attached
3. **Debug Worker** -- Attach the debugger to a BullMQ worker

### Logging

Structured logging is provided via Winston/Pino. Set the log level via environment variable:

```env
LOG_LEVEL=debug  # Options: error, warn, info, debug, verbose
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| MSSQL connection refused | Ensure VPN is connected and MSSQL_HOST is correct |
| PostgreSQL connection refused | Ensure PostgreSQL is running on port 5432 |
| Redis connection refused | Ensure Redis is running on port 6379 |
| Migration fails | Check that the PostgreSQL database exists (`createdb myevaluations_dev`) |
| Port 3000 already in use | Change `PORT` in `.env` or kill the process on port 3000 |
| JWT errors | Ensure `JWT_SECRET` is set in `.env` |

## Next Steps

- Read the [Node.js Backend Overview](/docs/nodejs-backend/overview) for architecture details
- Explore the [Shared Database](/docs/dotnet-backend/migration/shared-database) documentation for MSSQL access rules
- Check the [Migration Status](/docs/dotnet-backend/migration/status) to see what features are being migrated
