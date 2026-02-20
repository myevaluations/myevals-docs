---
sidebar_position: 2
title: Getting Started
description: Developer setup guide for the MyEvaluations .NET backend, including prerequisites, VPN setup, building, running locally, and troubleshooting common issues.
---

# Getting Started with the .NET Backend

This guide walks you through setting up a local development environment for the MyEvaluations .NET backend (`myevals-dotnet-backend`).

## Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Visual Studio** | 2019 (Professional or Enterprise) | Required for WebForms designer support |
| **.NET Framework Targeting Pack** | 4.6.1 | Install via Visual Studio Installer |
| **SQL Server** | 2016 or later | LocalDB, Express, or Developer edition for local dev |
| **SQL Server Management Studio (SSMS)** | 18+ | For database management and query debugging |
| **Git** | 2.x | For source control |
| **VPN Client** | (Company-provided) | Required for database access |
| **NuGet CLI** | 5.x+ | For package restore (included with VS) |

### Visual Studio Workloads

Ensure these Visual Studio workloads are installed:

- **ASP.NET and web development**
- **.NET desktop development** (for Windows Services)
- **.NET Framework 4.6.1 targeting pack** (individual component)

## Step 1: VPN Setup

The development SQL Server database is hosted on a remote server. You must connect to the VPN before you can run the application locally.

1. Install the company VPN client (provided during onboarding)
2. Connect to the VPN using your credentials
3. Verify connectivity by pinging the database server or testing with SSMS

:::warning
Without VPN access, you cannot connect to the shared development database. If you need to work offline, you will need a local SQL Server instance with a restored database backup. Contact your team lead for a backup file.
:::

## Step 2: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/myevaluations/myevals-dotnet-backend.git

# Navigate to the project directory
cd myevals-dotnet-backend
```

The repository is approximately **453 MB** due to vendored DLLs and historical assets.

### Repository Structure

```
myevals-dotnet-backend/
├── MyEvaluations2009.sln          # Main solution file
├── Common/                         # MyEvaluations.Common project
├── Evaluations/                    # MyEvaluations.Evaluations project
├── DutyHours/                      # MyEvaluations.DutyHours project
├── CMETracking/                    # MyEvaluations.CMETracking project
├── PatientLog/                     # MyEvaluations.PatientLog project
├── Procedures/                     # MyEvaluations.Procedures project
├── Portfolio/                      # MyEvaluations.Portfolio project
├── LearningAssignment/             # MyEvaluations.LearningAssignment project
├── Quiz/                           # MyEvaluations.Quiz project
├── Mail/                           # MyEvaluations.Mail project
├── Security/                       # MyEvaluations.Security project
├── DataAccess.SQL/                 # Data access layer
├── Logging/                        # Enterprise Library logging
├── Utilities/                      # Shared utilities
├── Web/                            # ASP.NET WebForms web application
│   ├── Login.aspx                  # Start page
│   ├── ApiHandler.ashx             # JSON API router
│   ├── Web.config                  # Configuration
│   ├── Reference DLL/              # Vendored third-party DLLs
│   └── [50+ subdirectories]        # Feature-specific pages
├── SAMLServiceProvider/            # SAML SSO implementation
├── FusionChartLibrary/             # Chart generation
├── Schedulers/                     # 70+ Windows Service projects
└── docs/                           # Generated code documentation
```

## Step 3: Open the Solution

1. Open **Visual Studio 2019**
2. Go to **File > Open > Project/Solution**
3. Navigate to the cloned repository and select `MyEvaluations2009.sln`
4. Wait for the solution to load (this may take 1-2 minutes due to the number of projects)

### First-Time NuGet Restore

Visual Studio should automatically restore NuGet packages. If it does not:

1. Right-click the solution in Solution Explorer
2. Select **Restore NuGet Packages**

Or from the command line:

```bash
nuget restore MyEvaluations2009.sln
```

:::note
Some packages use the legacy `packages.config` format rather than `PackageReference`. This is expected for a .NET Framework 4.6.1 project.
:::

## Step 4: Create Required Local Files

Three encryption key files must exist locally but are **never committed to source control**:

1. Create `Web/key.txt` -- Contains the primary encryption key
2. Create `Web/Encryptkey.txt` -- Contains the secondary encryption key
3. Create `Web/Vectorkey.txt` -- Contains the encryption initialization vector

Contact your team lead or check the secure credential store for the correct values.

## Step 5: Configure the Connection String

Edit `Web/Web.config` to set your database connection string:

```xml
<connectionStrings>
  <!-- For VPN-connected development database -->
  <add name="MyEvalsConnectionString"
       connectionString="Server=DEV_SERVER_ADDRESS;Database=MyEvaluations;User ID=YOUR_USER;Password=YOUR_PASS;MultipleActiveResultSets=true;"
       providerName="System.Data.SqlClient" />

  <!-- OR for local SQL Server -->
  <add name="MyEvalsConnectionString"
       connectionString="Server=localhost;Database=MyEvaluations;Integrated Security=true;MultipleActiveResultSets=true;"
       providerName="System.Data.SqlClient" />
</connectionStrings>
```

:::warning
Never commit `Web.config` changes that contain real connection strings or credentials. The production `Web.config` on the IIS server has its own connection strings that are managed separately.
:::

## Step 6: Set the Start Page

1. In Solution Explorer, expand the **Web** project
2. Right-click `Login.aspx`
3. Select **Set As Start Page**

## Step 7: Build and Run

### Build the Solution

1. Go to **Build > Build Solution** (or press `Ctrl+Shift+B`)
2. Check the Output window for build results
3. The first build may take 2-3 minutes; subsequent builds are faster

### Run Locally

1. Press **F5** (Debug) or **Ctrl+F5** (Run without debugging)
2. Visual Studio will launch IIS Express
3. The browser will open to `Login.aspx`
4. Log in with your development credentials

### Command-Line Build

```bash
# From the Visual Studio Developer Command Prompt
nuget restore MyEvaluations2009.sln
msbuild MyEvaluations2009.sln /p:Configuration=Debug
```

## Common Setup Issues and Fixes

### Build Errors

| Error | Fix |
|-------|-----|
| "The type or namespace 'X' could not be found" | Restore NuGet packages: right-click solution > Restore NuGet Packages |
| "Could not load file or assembly 'X'" | Check `Web/Reference DLL/` folder -- some third-party DLLs are vendored here |
| ".NET Framework 4.6.1 targeting pack not installed" | Open Visual Studio Installer > Modify > Individual Components > select ".NET Framework 4.6.1 targeting pack" |
| "Project 'X' is not compatible with 'netstandard2.0'" | Ensure you are using Visual Studio 2019, not 2022 (some project references may have compatibility issues) |
| "MSB3644: The reference assemblies were not found" | Install the .NET Framework 4.6.1 Developer Pack from Microsoft |

### Runtime Errors

| Error | Fix |
|-------|-----|
| "Login failed for user" | Check VPN connection; verify connection string in Web.config |
| "Encryption key file not found" | Create the three key files (`key.txt`, `Encryptkey.txt`, `Vectorkey.txt`) in the Web directory |
| "The page cannot be displayed" | Ensure IIS Express is running; check the Output window for port conflicts |
| "Object reference not set to null" on login | Check that the database has the required user account and stored procedures |
| "Could not load type 'ASP.xxx'" | Clean solution (Build > Clean Solution) and rebuild |
| HTTP 500 on any page | Check `Web/Logfiles/` for detailed error logs; also check Windows Event Viewer |

### Database Issues

| Issue | Fix |
|-------|-----|
| Cannot connect to dev database | Verify VPN is connected; try pinging the server |
| Stored procedure not found | Your local database may be out of date; request a fresh backup |
| Timeout expired | Some queries are slow on large datasets; increase command timeout in Web.config |
| Permission denied | Verify your SQL Server user has the correct role assignments |

## Working with the Codebase

### Understanding the Code Flow

For any feature, the typical code path is:

1. **ASPX page** (`Web/[Module]/PageName.aspx`) -- UI markup
2. **Code-behind** (`Web/[Module]/PageName.aspx.cs`) -- Page event handlers
3. **Manager** (`[Module]/[Feature]Manager.cs`) -- Business logic
4. **Info** (`[Module]/[Feature]Info.cs`) -- Data transfer object
5. **Data Access** (`DataAccess.SQL/DBDataAccess.cs`) -- Execute stored procedure
6. **Stored Procedure** -- SQL Server stored proc

### Finding Code for a Feature

```
# Example: Finding evaluation-related code
Web/Evaluations/         → ASPX pages and code-behind
Evaluations/             → Business layer (EvaluationsManager, EvaluationsInfo)
DataAccess.SQL/          → Data access utility classes
SQL Server               → usp_Eval* stored procedures
```

### Debugging Tips

1. **Set breakpoints in code-behind files** (`.aspx.cs`) to trace page events
2. **Use SQL Server Profiler** or **Extended Events** to trace stored procedure calls
3. **Check `Web/Logfiles/`** for application error logs
4. **ViewState issues:** WebForms pages use ViewState extensively; invalid ViewState can cause cryptic errors
5. **Session state:** Use the Immediate Window to inspect `Session["key"]` values during debugging

### Branching Strategy

| Branch | Purpose |
|--------|---------|
| `master` | Production-ready code (deployable) |
| Feature branches | Created from `master` for new work |

Pull requests are submitted to `master` and require review before merging. There is no automated CI/CD -- the PR review process is the primary quality gate.

## Next Steps

- Read the [Project Map](/docs/dotnet-backend/project-map) to understand the full solution structure
- Learn the [Manager/Info Pattern](/docs/dotnet-backend/patterns/manager-info) used throughout the codebase
- Review the [Data Access Patterns](/docs/dotnet-backend/patterns/data-access) for understanding database interactions
- Explore the [Architecture Overview](/docs/architecture/overview) for system-wide context
