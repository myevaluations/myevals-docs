/**
 * reconcile-sprocs.ts
 *
 * Bidirectional matching of stored procedures between the database-side export
 * (sprocs-db.json) and the code-side parser output (stored-procedures.json).
 *
 * Input:
 *   - generated/db-schema/sprocs-db.json         (6,169 SPs from database)
 *   - generated/dotnet-metadata/stored-procedures.json (3,991 SPs from .NET code)
 *   - generated/db-schema/tables.json             (module→table mappings)
 *
 * Output:
 *   - generated/db-schema/sproc-reconciliation.json
 *   - generated/db-schema/table-sproc-mapping.json
 *
 * Usage: tsx scripts/reconcile-sprocs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DB_SCHEMA_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');
const DOTNET_META_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DbSproc {
  name: string;
  schema: string;
  fullName: string;
}

interface DbSprocsJson {
  totalStoredProcedures: number;
  schemas: string[];
  bySchema: Record<string, string[]>;
  procedures: DbSproc[];
}

interface CalledByEntry {
  className: string;
  methodName: string;
  filePath: string;
}

interface CodeSproc {
  procedureName: string;
  callCount: number;
  calledBy: CalledByEntry[];
}

interface CodeSprocsJson {
  totalUniqueProcedures: number;
  totalReferences: number;
  byProject: Record<string, number>;
  procedures: CodeSproc[];
}

interface TableOutput {
  name: string;
  schema: string;
  fullName: string;
}

interface ModuleOutput {
  prefix: string;
  displayName: string;
  tableCount: number;
  tables: TableOutput[];
}

interface TablesJson {
  totalTables: number;
  modules: ModuleOutput[];
}

// Output types

interface OrphanDb {
  name: string;
  schema: string;
}

interface OrphanCode {
  name: string;
  calledFrom: string[];
}

interface CrossReference {
  sprocName: string;
  dbSchema: string;
  dbSchemas: string[];
  matchType: 'exact' | 'fuzzy';
  fuzzyCodeName?: string;
  calledFromFiles: string[];
  calledFromMethods: string[];
  calledFromProjects: string[];
  module: string;
}

interface ReconciliationJson {
  generatedAt: string;
  totalDbSprocs: number;
  totalCodeSprocs: number;
  matched: number;
  matchedExact: number;
  matchedFuzzy: number;
  multiSchemaMatches: number;
  orphanDbCount: number;
  orphanCodeCount: number;
  orphanDb: OrphanDb[];
  orphanCode: OrphanCode[];
  crossReference: CrossReference[];
}

interface ModuleSprocMapping {
  module: string;
  displayName: string;
  tables: string[];
  sprocs: {
    matched: string[];
    dbOnly: string[];
    codeOnly: string[];
  };
  tableCount: number;
  sprocCount: {
    matched: number;
    dbOnly: number;
    codeOnly: number;
  };
}

interface TableSprocMappingJson {
  generatedAt: string;
  mappings: ModuleSprocMapping[];
}

// ---------------------------------------------------------------------------
// Normalization & matching
// ---------------------------------------------------------------------------

/** Strip schema prefix and lowercase for matching */
function normalizeSprocName(name: string): string {
  const bare = name.replace(/^(dbo|perf)\./, '');
  return bare.toLowerCase();
}

/** Strip common SP prefixes for fuzzy matching */
function stripSprocPrefix(name: string): string {
  return name.replace(/^(usp_|USP_|sp_)/i, '');
}

/** Extract project name from a file path like "MyEvaluations.Business.Security/UserManager.cs" */
function extractProject(filePath: string): string {
  const slashIdx = filePath.indexOf('/');
  return slashIdx > 0 ? filePath.substring(0, slashIdx) : filePath;
}

/** Extract just the filename from a path */
function extractFileName(filePath: string): string {
  const slashIdx = filePath.lastIndexOf('/');
  return slashIdx >= 0 ? filePath.substring(slashIdx + 1) : filePath;
}

// ---------------------------------------------------------------------------
// Project → Module mapping
// ---------------------------------------------------------------------------

/** Map .NET project names to module codes */
const PROJECT_TO_MODULE: Record<string, string> = {
  'MyEvaluations.Business.Security': 'SEC',
  'MyEvaluations.Business.Evaluations': 'EVAL',
  'MyEvaluations.Business.DutyHours': 'DH',
  'MyEvaluations.Business.CMETracking': 'CME',
  'MyEvaluations.Business.EssentialActivities': 'ACT',
  'MyEvaluations.Business.PatientLog': 'PTL',
  'MyEvaluations.Business.Portfolio': 'PF',
  'MyEvaluations.Business.Procedures': 'PRC',
  'MyEvaluations.Business.Quiz': 'QUIZ',
  'MyEvaluations.Business.LearningAssignment': 'LA',
  'MyEvaluations.Business.Mail': 'SYS',
  'MyEvaluations.Business.TimeSheet': 'DH',
  'MyEvaluations.Business.ERAS': 'SEC',
  'MyEvaluations.Business.MyHelp': 'SYS',
  'MyEvaluations.Business.Common': 'SYS',
  'MyEvaluations.Business.Utilities': 'SYS',
};

const DISPLAY_NAMES: Record<string, string> = {
  SEC: 'Security',
  EVAL: 'Evaluations',
  DH: 'Duty Hours',
  PRC: 'Procedures',
  APE: 'Annual Program Evaluation',
  APE2: 'APE v2',
  BSN: 'Nursing',
  ACT: 'Activity Logs',
  PF: 'Portfolio',
  OBC: 'Clinical Assessment',
  CME: 'CME Credits',
  Prep: 'Prep/Onboarding',
  PTL: 'Patient Logs',
  QUIZ: 'Quizzes',
  SCHE: 'Scheduling',
  SYS: 'System',
  MYEVAL: 'MyEval Platform',
  POST: 'Post-Graduation',
  MyGME: 'MyGME Integration',
  LA: 'Learning Activities',
  ACGME: 'ACGME',
  perf: 'Performance Schema',
  '(uncategorized)': 'Uncategorized',
};

/**
 * Infer a module code for an SP based on its calling projects.
 * Uses the most-frequent calling project as the primary signal.
 */
function inferModuleFromCallers(calledBy: CalledByEntry[]): string {
  if (calledBy.length === 0) return '(uncategorized)';

  // Count calls per project
  const projectCounts = new Map<string, number>();
  for (const entry of calledBy) {
    const proj = extractProject(entry.filePath);
    projectCounts.set(proj, (projectCounts.get(proj) || 0) + 1);
  }

  // Pick the project with the most calls
  let maxProject = '';
  let maxCount = 0;
  for (const [proj, count] of projectCounts) {
    if (count > maxCount) {
      maxProject = proj;
      maxCount = count;
    }
  }

  return PROJECT_TO_MODULE[maxProject] || '(uncategorized)';
}

/**
 * Infer a module for a DB-only SP based on its name prefix.
 * Uses the same prefix patterns as the table module detection.
 */
function inferModuleFromSprocName(spName: string): string {
  // Ordered longest-first to avoid ambiguity
  const SP_PREFIX_PATTERNS: Array<{ prefix: string; module: string }> = [
    { prefix: 'ARCH_', module: 'SEC' },
    { prefix: 'ACT_', module: 'ACT' },
    { prefix: 'DEV_', module: 'SYS' },
    { prefix: 'APE_', module: 'APE' },
    { prefix: 'BSN_', module: 'BSN' },
    { prefix: 'OBC_', module: 'OBC' },
    { prefix: 'PF_', module: 'PF' },
    { prefix: 'PTL_', module: 'PTL' },
    { prefix: 'DH_', module: 'DH' },
    { prefix: 'CME_', module: 'CME' },
    { prefix: 'LA_', module: 'LA' },
  ];

  for (const { prefix, module } of SP_PREFIX_PATTERNS) {
    if (spName.startsWith(prefix)) return module;
  }

  // Heuristic: look for module-related keywords in the SP name
  const lower = spName.toLowerCase();
  if (lower.includes('dutyhour') || lower.includes('timesheet')) return 'DH';
  if (lower.includes('evaluation') || lower.includes('eval')) return 'EVAL';
  if (lower.includes('security') || lower.includes('user') || lower.includes('login') || lower.includes('auth')) return 'SEC';
  if (lower.includes('patient') || lower.includes('patientlog')) return 'PTL';
  if (lower.includes('procedure') && !lower.includes('storedprocedure')) return 'PRC';
  if (lower.includes('cme') || lower.includes('credit')) return 'CME';
  if (lower.includes('quiz')) return 'QUIZ';
  if (lower.includes('portfolio')) return 'PF';
  if (lower.includes('schedule') || lower.includes('rotation')) return 'SCHE';
  if (lower.includes('ape') || lower.includes('program')) return 'APE';
  if (lower.includes('nursing') || lower.includes('bsn')) return 'BSN';

  return '(uncategorized)';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Main reconciliation
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('Reconciling stored procedures...');

  // Load input files
  const [dbSprocsRaw, codeSprocsRaw, tablesRaw] = await Promise.all([
    fs.readFile(path.join(DB_SCHEMA_DIR, 'sprocs-db.json'), 'utf-8'),
    fs.readFile(path.join(DOTNET_META_DIR, 'stored-procedures.json'), 'utf-8'),
    fs.readFile(path.join(DB_SCHEMA_DIR, 'tables.json'), 'utf-8'),
  ]);

  const dbSprocs: DbSprocsJson = JSON.parse(dbSprocsRaw);
  const codeSprocs: CodeSprocsJson = JSON.parse(codeSprocsRaw);
  const tables: TablesJson = JSON.parse(tablesRaw);

  console.log(`  DB-side: ${fmt(dbSprocs.totalStoredProcedures)} SPs`);
  console.log(`  Code-side: ${fmt(codeSprocs.totalUniqueProcedures)} SPs`);

  // -------------------------------------------------------------------------
  // Step 1: Build lookup maps
  // -------------------------------------------------------------------------

  // DB-side: Map<normalizedName, DbSproc>
  // If multiple SPs share a normalized name (e.g. dbo.Foo and perf.Foo), keep both
  const dbMap = new Map<string, DbSproc[]>();
  for (const sp of dbSprocs.procedures) {
    const key = normalizeSprocName(sp.name);
    const arr = dbMap.get(key);
    if (arr) {
      arr.push(sp);
    } else {
      dbMap.set(key, [sp]);
    }
  }

  // Code-side: Map<normalizedName, CodeSproc>
  const codeMap = new Map<string, CodeSproc>();
  for (const sp of codeSprocs.procedures) {
    const key = normalizeSprocName(sp.procedureName);
    codeMap.set(key, sp);
  }

  // -------------------------------------------------------------------------
  // Step 2: Exact matching
  // -------------------------------------------------------------------------

  const matchedDbKeys = new Set<string>(); // normalized DB keys that were matched
  const matchedCodeKeys = new Set<string>(); // normalized code keys that were matched
  const crossReference: CrossReference[] = [];

  // For each code-side SP, look up in DB map by normalized name
  for (const [codeKey, codeSp] of codeMap) {
    const dbEntries = dbMap.get(codeKey);
    if (dbEntries && dbEntries.length > 0) {
      matchedCodeKeys.add(codeKey);
      matchedDbKeys.add(codeKey);

      // Prefer dbo entry as primary; record all schemas
      const dbSp = dbEntries.find((e) => e.schema === 'dbo') || dbEntries[0];
      const allSchemas = [...new Set(dbEntries.map((e) => e.schema))].sort();
      const files = [...new Set(codeSp.calledBy.map(c => extractFileName(c.filePath)))];
      const methods = [...new Set(codeSp.calledBy.map(c => c.methodName))];
      const projects = [...new Set(codeSp.calledBy.map(c => extractProject(c.filePath)))];
      const module = inferModuleFromCallers(codeSp.calledBy);

      crossReference.push({
        sprocName: dbSp.name,
        dbSchema: dbSp.schema,
        dbSchemas: allSchemas,
        matchType: 'exact',
        calledFromFiles: files,
        calledFromMethods: methods,
        calledFromProjects: projects,
        module,
      });
    }
  }

  const exactMatchCount = matchedCodeKeys.size;
  console.log(`  Exact matches: ${fmt(exactMatchCount)}`);

  // -------------------------------------------------------------------------
  // Step 3: Fuzzy matching — strip usp_, sp_, USP_ prefixes and re-match
  // -------------------------------------------------------------------------

  let fuzzyMatchCount = 0;

  for (const [codeKey, codeSp] of codeMap) {
    if (matchedCodeKeys.has(codeKey)) continue; // already matched

    const stripped = stripSprocPrefix(codeSp.procedureName).toLowerCase();
    if (stripped === codeKey) continue; // stripping didn't change anything

    const dbEntries = dbMap.get(stripped);
    if (dbEntries && dbEntries.length > 0 && !matchedDbKeys.has(stripped)) {
      matchedCodeKeys.add(codeKey);
      matchedDbKeys.add(stripped);
      fuzzyMatchCount++;

      const dbSp = dbEntries.find((e) => e.schema === 'dbo') || dbEntries[0];
      const allSchemas = [...new Set(dbEntries.map((e) => e.schema))].sort();
      const files = [...new Set(codeSp.calledBy.map(c => extractFileName(c.filePath)))];
      const methods = [...new Set(codeSp.calledBy.map(c => c.methodName))];
      const projects = [...new Set(codeSp.calledBy.map(c => extractProject(c.filePath)))];
      const module = inferModuleFromCallers(codeSp.calledBy);

      crossReference.push({
        sprocName: dbSp.name,
        dbSchema: dbSp.schema,
        dbSchemas: allSchemas,
        matchType: 'fuzzy',
        fuzzyCodeName: codeSp.procedureName,
        calledFromFiles: files,
        calledFromMethods: methods,
        calledFromProjects: projects,
        module,
      });
    }
  }

  // Also try the reverse: DB-side SPs with prefixes matching stripped code-side names
  for (const [dbKey, dbEntries] of dbMap) {
    if (matchedDbKeys.has(dbKey)) continue; // already matched

    const stripped = stripSprocPrefix(dbEntries[0].name).toLowerCase();
    if (stripped === dbKey) continue; // stripping didn't change anything

    const codeSp = codeMap.get(stripped);
    if (codeSp && !matchedCodeKeys.has(stripped)) {
      matchedDbKeys.add(dbKey);
      matchedCodeKeys.add(stripped);
      fuzzyMatchCount++;

      const dbSp = dbEntries.find((e) => e.schema === 'dbo') || dbEntries[0];
      const allSchemas = [...new Set(dbEntries.map((e) => e.schema))].sort();
      const files = [...new Set(codeSp.calledBy.map(c => extractFileName(c.filePath)))];
      const methods = [...new Set(codeSp.calledBy.map(c => c.methodName))];
      const projects = [...new Set(codeSp.calledBy.map(c => extractProject(c.filePath)))];
      const module = inferModuleFromCallers(codeSp.calledBy);

      crossReference.push({
        sprocName: dbSp.name,
        dbSchema: dbSp.schema,
        dbSchemas: allSchemas,
        matchType: 'fuzzy',
        fuzzyCodeName: codeSp.procedureName,
        calledFromFiles: files,
        calledFromMethods: methods,
        calledFromProjects: projects,
        module,
      });
    }
  }

  // Count multi-schema matches (SPs existing in both dbo and perf that matched)
  const multiSchemaMatches = crossReference.filter(
    (x) => x.dbSchemas.length > 1
  ).length;

  console.log(`  Fuzzy matches: ${fmt(fuzzyMatchCount)}`);
  console.log(`  Total matched: ${fmt(exactMatchCount + fuzzyMatchCount)}`);
  if (multiSchemaMatches > 0) {
    console.log(
      `  Multi-schema matches: ${fmt(multiSchemaMatches)} (SP exists in both dbo and perf)`
    );
  }

  // -------------------------------------------------------------------------
  // Step 4: Collect orphans
  // -------------------------------------------------------------------------

  // DB-only orphans: DB SPs whose normalized name was never matched
  const orphanDb: OrphanDb[] = [];
  for (const [dbKey, dbEntries] of dbMap) {
    if (!matchedDbKeys.has(dbKey)) {
      for (const dbSp of dbEntries) {
        orphanDb.push({ name: dbSp.name, schema: dbSp.schema });
      }
    }
  }
  orphanDb.sort((a, b) => a.name.localeCompare(b.name));

  // Code-only orphans: code SPs whose normalized name was never matched
  const orphanCode: OrphanCode[] = [];
  for (const [codeKey, codeSp] of codeMap) {
    if (!matchedCodeKeys.has(codeKey)) {
      const calledFrom = codeSp.calledBy.map(
        (c) => `${extractFileName(c.filePath)}:${c.methodName}`
      );
      orphanCode.push({
        name: codeSp.procedureName,
        calledFrom: [...new Set(calledFrom)],
      });
    }
  }
  orphanCode.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`  DB-only orphans: ${fmt(orphanDb.length)}`);
  console.log(`  Code-only orphans: ${fmt(orphanCode.length)}`);

  // -------------------------------------------------------------------------
  // Step 5: Build sproc-reconciliation.json
  // -------------------------------------------------------------------------

  // Sort cross-reference by SP name
  crossReference.sort((a, b) => a.sprocName.localeCompare(b.sprocName));

  const reconciliation: ReconciliationJson = {
    generatedAt: new Date().toISOString(),
    totalDbSprocs: dbSprocs.totalStoredProcedures,
    totalCodeSprocs: codeSprocs.totalUniqueProcedures,
    matched: exactMatchCount + fuzzyMatchCount,
    matchedExact: exactMatchCount,
    matchedFuzzy: fuzzyMatchCount,
    multiSchemaMatches,
    orphanDbCount: orphanDb.length,
    orphanCodeCount: orphanCode.length,
    orphanDb,
    orphanCode,
    crossReference,
  };

  const reconciliationPath = path.join(DB_SCHEMA_DIR, 'sproc-reconciliation.json');
  await fs.writeFile(reconciliationPath, JSON.stringify(reconciliation, null, 2), 'utf-8');
  console.log(`Written: generated/db-schema/sproc-reconciliation.json`);

  // -------------------------------------------------------------------------
  // Step 6: Build table-sproc-mapping.json
  // -------------------------------------------------------------------------

  // Load module→table mappings from tables.json
  const moduleTablesMap = new Map<string, string[]>();
  const moduleDisplayNames = new Map<string, string>();
  for (const mod of tables.modules) {
    moduleTablesMap.set(mod.prefix, mod.tables.map((t) => t.name));
    moduleDisplayNames.set(mod.prefix, mod.displayName);
  }

  // Categorize all SPs into modules
  const moduleSprocs = new Map<
    string,
    { matched: Set<string>; dbOnly: Set<string>; codeOnly: Set<string> }
  >();

  function ensureModuleSprocs(module: string) {
    if (!moduleSprocs.has(module)) {
      moduleSprocs.set(module, {
        matched: new Set(),
        dbOnly: new Set(),
        codeOnly: new Set(),
      });
    }
    return moduleSprocs.get(module)!;
  }

  // Matched SPs: assign based on code-side callers
  for (const xref of crossReference) {
    const mod = xref.module;
    const bucket = ensureModuleSprocs(mod);
    bucket.matched.add(xref.sprocName);
  }

  // DB-only orphans: assign based on SP name heuristics
  for (const orphan of orphanDb) {
    const mod = inferModuleFromSprocName(orphan.name);
    const bucket = ensureModuleSprocs(mod);
    bucket.dbOnly.add(orphan.name);
  }

  // Code-only orphans: assign based on where they're called from
  for (const orphan of orphanCode) {
    // Find the original code sproc to get calledBy
    const codeSp = codeSprocs.procedures.find(
      (p) => p.procedureName === orphan.name
    );
    let mod = '(uncategorized)';
    if (codeSp) {
      mod = inferModuleFromCallers(codeSp.calledBy);
    }
    const bucket = ensureModuleSprocs(mod);
    bucket.codeOnly.add(orphan.name);
  }

  // Build output sorted by total SP count descending
  const mappings: ModuleSprocMapping[] = [];
  const allModuleKeys = new Set([
    ...moduleTablesMap.keys(),
    ...moduleSprocs.keys(),
  ]);

  for (const modKey of allModuleKeys) {
    const tableNames = moduleTablesMap.get(modKey) || [];
    const sprocBucket = moduleSprocs.get(modKey) || {
      matched: new Set<string>(),
      dbOnly: new Set<string>(),
      codeOnly: new Set<string>(),
    };

    const matchedArr = [...sprocBucket.matched].sort();
    const dbOnlyArr = [...sprocBucket.dbOnly].sort();
    const codeOnlyArr = [...sprocBucket.codeOnly].sort();

    mappings.push({
      module: modKey,
      displayName:
        moduleDisplayNames.get(modKey) || DISPLAY_NAMES[modKey] || modKey,
      tables: tableNames.sort(),
      sprocs: {
        matched: matchedArr,
        dbOnly: dbOnlyArr,
        codeOnly: codeOnlyArr,
      },
      tableCount: tableNames.length,
      sprocCount: {
        matched: matchedArr.length,
        dbOnly: dbOnlyArr.length,
        codeOnly: codeOnlyArr.length,
      },
    });
  }

  // Sort by total SP count descending
  mappings.sort((a, b) => {
    const totalA =
      a.sprocCount.matched + a.sprocCount.dbOnly + a.sprocCount.codeOnly;
    const totalB =
      b.sprocCount.matched + b.sprocCount.dbOnly + b.sprocCount.codeOnly;
    return totalB - totalA;
  });

  const tableSprocMapping: TableSprocMappingJson = {
    generatedAt: new Date().toISOString(),
    mappings,
  };

  const mappingPath = path.join(DB_SCHEMA_DIR, 'table-sproc-mapping.json');
  await fs.writeFile(mappingPath, JSON.stringify(tableSprocMapping, null, 2), 'utf-8');
  console.log(`Written: generated/db-schema/table-sproc-mapping.json`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal error reconciling stored procedures:', err);
  process.exit(1);
});
