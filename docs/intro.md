---
sidebar_position: 1
title: Welcome to MyEvaluations Docs
description: Internal technical documentation for the MyEvaluations healthcare education management platform.
slug: /
---

# MyEvaluations Documentation

**MyEvaluations** is a healthcare education management platform serving **10,000+ users** across **900+ institutions** for over **25 years**. The platform supports Graduate Medical Education (GME), Continuing Medical Education (CME), Nursing, and Physician Assistant (PA) programs.

This documentation site provides comprehensive technical reference for the four core systems that power MyEvaluations.

## Core Systems

### [.NET Backend](/docs/dotnet-backend/overview) -- Primary Documentation Focus

The legacy monolith built on **.NET Framework 4.6.1** and **ASP.NET WebForms**. This is the largest and most complex system, containing 27 projects, 70+ Windows Services/schedulers, and the core business logic for evaluations, duty hours, patient logs, CME tracking, and more.

> The .NET backend is the **primary focus** of this documentation because it holds the majority of institutional knowledge and is the system most developers need to understand.

- **Repo:** [`myevals-dotnet-backend`](https://github.com/myevaluations/myevals-dotnet-backend)
- **Solution:** `MyEvaluations2009.sln` (27 projects)
- **Database:** SQL Server (stored procedures, ADO.NET)
- **Deployment:** Visual Studio publish to IIS (no CI/CD)

### [Node.js Backend](/docs/nodejs-backend/overview)

The modern replacement backend built with **NestJS 10** and **TypeScript**. Uses a Strangler Fig pattern to progressively take over functionality from the .NET backend. Both backends share the same MSSQL database.

- **Repo:** [`myevals-nodejs-backend`](https://github.com/myevaluations/myevals-nodejs-backend)
- **Stack:** NestJS 10, MikroORM, BullMQ/Redis, Docker Swarm
- **Database:** Dual -- MSSQL (shared with .NET) + PostgreSQL (new features)
- **Deployment:** GitHub Actions to Azure Docker Swarm

### [React Frontend](/docs/react-frontend/overview)

The modern UI layer built with **Next.js 13.5** and **Plasmic** visual builder. React HTML partials are served via Azure CDN and embedded within the .NET WebForms shell.

- **Repo:** [`myevals-react-frontend`](https://github.com/myevaluations/myevals-react-frontend)
- **Stack:** Next.js 13.5, Plasmic, esbuild, SWR
- **Deployment:** esbuild to Azure Blob Storage + CDN

### [MAUI Mobile App](/docs/maui-app/overview)

Cross-platform mobile application built with **.NET MAUI 9** targeting iOS and Android. Provides on-the-go access to evaluations, clinical hours, and compliance features.

- **Repo:** [`myevals-xamarin-app`](https://github.com/myevaluations/myevals-xamarin-app) (named for historical reasons)
- **Stack:** .NET MAUI 9, CommunityToolkit.Mvvm, Realm, Firebase
- **Deployment:** GitHub Actions to TestFlight (iOS) and Play Store (Android)

## Migration: Strangler Fig Pattern

MyEvaluations is actively migrating from the .NET monolith to a modern Node.js + React architecture using the [Strangler Fig pattern](https://martinfowler.com/bliki/StranglerFigApplication.html). Both backends coexist, sharing the same MSSQL database and authentication system. New features are built exclusively on Node.js + PostgreSQL while the .NET backend continues to serve existing functionality.

See the [Architecture Overview](/docs/architecture/overview) for detailed diagrams of how these systems interact.

## Documentation Structure

| Section | Description |
|---------|-------------|
| [Architecture](/docs/architecture/overview) | System-wide architecture, data flow, deployment, auth, and database schema |
| [.NET Backend](/docs/dotnet-backend/overview) | Comprehensive docs for the legacy monolith (primary focus) |
| [Node.js Backend](/docs/nodejs-backend/overview) | NestJS backend documentation |
| [React Frontend](/docs/react-frontend/overview) | Next.js + Plasmic frontend docs |
| [MAUI App](/docs/maui-app/overview) | Mobile application docs |
| [Cross-Cutting](/docs/cross-cutting/migration-status) | Migration status, feature matrix, coding standards |
| [Guides](/docs/guides/debugging) | Practical guides for debugging, adding features, and common bugs |

## How This Documentation Is Built

This site is powered by **Docusaurus** with automated documentation generation. Parse scripts analyze the source code repositories and generate structured documentation that is then enriched with contextual information.

```bash
# Sync source repos and generate all docs
npm run build:full

# Or run individual generators
npm run parse:dotnet:solution    # Parse .NET solution structure
npm run parse:dotnet:classes     # Extract class details
npm run parse:dotnet:schedulers  # Document Windows Services
npm run parse:dotnet:sprocs      # Catalog stored procedures
```

## Quick Links

- **New developer?** Start with [.NET Getting Started](/docs/dotnet-backend/getting-started)
- **Need architecture context?** See [Architecture Overview](/docs/architecture/overview)
- **Debugging an issue?** Check [Debugging Guide](/docs/guides/debugging)
- **Understanding data flow?** See [Data Flow](/docs/architecture/data-flow)
