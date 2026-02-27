/**
 * parse-sql-sprocs.ts
 *
 * Parses all stored procedures from the MyEvaluations SQL export file.
 * Extracts name, schema, parameters, body, anti-patterns, table references,
 * CRUD type, complexity rating, and merges code-caller data from reconciliation.
 *
 * Input:  input/MyEvaluations_Schema_20260226.sql (147MB, UTF-16LE)
 * Output: generated/db-schema/stored-procedures-full.json  (metadata + bodyPreview)
 *         generated/db-schema/sp-bodies/<MODULE>.json       (full bodies for AI enrichment)
 *
 * Usage: npx tsx scripts/parse-sql-sprocs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(
  PROJECT_ROOT,
  'input',
  'MyEvaluations_Schema_20260226.sql'
);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');
const SP_BODIES_DIR = path.join(OUTPUT_DIR, 'sp-bodies');
const TABLES_JSON = path.join(OUTPUT_DIR, 'tables.json');
const RECONCILIATION_JSON = path.join(OUTPUT_DIR, 'sproc-reconciliation.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpParameter {
  name: string;
  dataType: string;
  direction: 'IN' | 'OUTPUT';
  defaultValue: string | null;
}

interface AntiPatterns {
  hasCursor: boolean;
  hasSelectStar: boolean;
  hasDynamicSql: boolean;
  hasNolock: boolean;
  nolockCount: number;
  missingSetNocountOn: boolean;
  hasTableVariable: boolean;
  hasTempTable: boolean;
  hasWhileLoop: boolean;
  hasNoTryCatch: boolean;
}

type CrudType = 'get' | 'insert' | 'update' | 'delete' | 'report' | 'mixed';
type Complexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';

interface SprocParsed {
  name: string;
  schema: string;
  parameters: SpParameter[];
  body: string;
  lineCount: number;
  bodyPreview: string;
  tablesReferenced: string[];
  sprocsCalledFromBody: string[];
  crudType: CrudType;
  antiPatterns: AntiPatterns;
  calledFromCode: string[];
  complexity: Complexity;
}

interface SprocOutput {
  name: string;
  schema: string;
  parameters: SpParameter[];
  lineCount: number;
  bodyPreview: string;
  tablesReferenced: string[];
  sprocsCalledFromBody: string[];
  crudType: CrudType;
  antiPatterns: AntiPatterns;
  calledFromCode: string[];
  complexity: Complexity;
  aiEnrichment: null;
}

interface ModuleSprocOutput {
  prefix: string;
  displayName: string;
  procedureCount: number;
  procedures: SprocOutput[];
}

interface StoredProceduresFullJson {
  exportDate: string;
  source: string;
  totalProcedures: number;
  stats: {
    bySchema: Record<string, number>;
    byCrudType: Record<string, number>;
    byComplexity: Record<string, number>;
    antiPatternCounts: {
      cursors: number;
      selectStar: number;
      dynamicSql: number;
      nolockUsage: number;
      missingSetNocountOn: number;
      tableVariables: number;
      tempTables: number;
      whileLoops: number;
      noTryCatch: number;
    };
  };
  modules: ModuleSprocOutput[];
}

interface SpBodyModule {
  module: string;
  procedureCount: number;
  procedures: Array<{ name: string; fullBody: string }>;
}

interface ReconciliationEntry {
  sprocName: string;
  dbSchema: string;
  calledFromFiles: string[];
  calledFromMethods: string[];
  calledFromProjects: string[];
  module: string;
}

// ---------------------------------------------------------------------------
// Module prefix detection (from parse-sql-schema.ts)
// ---------------------------------------------------------------------------

const PREFIX_PATTERNS: string[] = [
  'MYEVAL',
  'MYEval',
  'MyEvals',
  'MyEval',
  'MyGME',
  'MyGme',
  'MYGME',
  'ACGME',
  'EVAL',
  'Eval',
  'eval',
  'SEC',
  'Sec',
  'sec',
  'DH',
  'PRC',
  'prc',
  'Prc',
  'APE2',
  'APE',
  'BSN',
  'ACT',
  'PF',
  'OBC',
  'CME',
  'Prep',
  'PTL',
  'ptl',
  'RPT',
  'QUIZ',
  'Quiz',
  'SCHE',
  'SYS',
  'POST',
  'LA',
];

const PREFIX_NORMALIZE: Record<string, string> = {
  Eval: 'EVAL',
  eval: 'EVAL',
  Sec: 'SEC',
  sec: 'SEC',
  prc: 'PRC',
  Prc: 'PRC',
  MYEval: 'MYEVAL',
  MyEval: 'MYEVAL',
  MyEvals: 'MYEVAL',
  MyGme: 'MyGME',
  MYGME: 'MyGME',
  Quiz: 'QUIZ',
  ptl: 'PTL',
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
  RPT: 'Reports',
  QUIZ: 'Quizzes',
  SCHE: 'Scheduling',
  SYS: 'System',
  MYEVAL: 'MyEval Platform',
  POST: 'Post-Graduation',
  MyGME: 'MyGME Integration',
  LA: 'Learning Activities',
  ACGME: 'ACGME',
  _DEL_: 'Soft-Deleted',
  perf: 'Performance Schema',
  '(uncategorized)': 'Uncategorized',
};

function detectPrefix(name: string, schema: string): string {
  if (name.startsWith('_DEL_')) return '_DEL_';
  if (schema === 'perf') return 'perf';

  const sorted = [...PREFIX_PATTERNS].sort((a, b) => b.length - a.length);

  for (const prefix of sorted) {
    if (name.startsWith(prefix + '_')) {
      return PREFIX_NORMALIZE[prefix] || prefix;
    }
  }

  return '(uncategorized)';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Strip single-line (--) and block comments from SQL body */
function stripComments(sql: string): string {
  // Remove block comments (non-greedy, handles nested poorly but sufficient)
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments
  result = result.replace(/--[^\r\n]*/g, '');
  return result;
}

// ---------------------------------------------------------------------------
// Phase 1: Read file and split into SP blocks
// ---------------------------------------------------------------------------

function readAndSplitBlocks(): string[] {
  console.log('\n=== Phase 1: Read SQL file and split SP blocks ===');

  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Error: Input file not found at ' + INPUT_FILE);
    process.exit(1);
  }

  const stat = fs.statSync(INPUT_FILE);
  console.log('  File size: ' + (stat.size / 1024 / 1024).toFixed(1) + ' MB');

  console.log('  Reading file (UTF-16LE)...');
  const content = fs.readFileSync(INPUT_FILE, 'utf16le');
  console.log('  Read ' + fmt(content.length) + ' characters');

  // Split by GO blocks
  const allBlocks = content.split(/\nGO\r?\n/);
  console.log('  Total GO blocks: ' + fmt(allBlocks.length));

  // Filter SP blocks
  const spRegex =
    /^(?:\/\*[\s\S]*?\*\/\s*)?(?:SET\s+\w+\s+\w+\s*\r?\n)*\s*CREATE\s+PROC(?:EDURE)?\s/i;

  const spBlocks: string[] = [];
  for (const block of allBlocks) {
    const trimmed = block.trim();
    if (spRegex.test(trimmed)) {
      spBlocks.push(trimmed);
    }
  }

  console.log('  SP blocks found: ' + fmt(spBlocks.length));

  return spBlocks;
}

// ---------------------------------------------------------------------------
// Phase 2: Parse SP name, schema, and parameters
// ---------------------------------------------------------------------------

interface SpRaw {
  name: string;
  schema: string;
  parameters: SpParameter[];
  body: string;
}

function parseSpBlock(block: string): SpRaw | null {
  // Extract the CREATE PROCEDURE line to get name and schema
  // Pattern: CREATE PROC[EDURE] [schema].[name] or CREATE PROC[EDURE] schema.name
  const nameMatch = block.match(
    /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?\.\[?(\w+)\]?/i
  );
  if (!nameMatch) return null;

  const schema = nameMatch[1];
  const name = nameMatch[2];

  // Find the parameter block: between the procedure name and AS keyword
  // The AS keyword should be on its own line or after parameters
  const nameEnd = nameMatch.index! + nameMatch[0].length;
  const restAfterName = block.substring(nameEnd);

  // Find AS keyword: must be on its own or preceded by whitespace/newline
  // Be careful not to match AS inside parameter names or types
  const asMatch = restAfterName.match(/\n\s*AS\s*\r?\n/i)
    || restAfterName.match(/\nAS\s*$/im)
    || restAfterName.match(/\)\s*\r?\nAS\s*\r?\n/i);

  let paramBlock = '';
  let body = '';

  if (asMatch) {
    const asIdx = asMatch.index!;
    paramBlock = restAfterName.substring(0, asIdx);
    // Body starts after 'AS\n'
    body = restAfterName.substring(asIdx + asMatch[0].length);
  } else {
    // Try a simpler AS pattern: just find first standalone AS
    const simpleAsMatch = restAfterName.match(/\bAS\b\s*\r?\n/i);
    if (simpleAsMatch) {
      paramBlock = restAfterName.substring(0, simpleAsMatch.index!);
      body = restAfterName.substring(
        simpleAsMatch.index! + simpleAsMatch[0].length
      );
    } else {
      // No AS found, entire rest is body (unusual)
      body = restAfterName;
    }
  }

  // Parse parameters from paramBlock
  const parameters = parseParameters(paramBlock);

  return { name, schema, parameters, body };
}

function parseParameters(paramBlock: string): SpParameter[] {
  const params: SpParameter[] = [];

  // Match @ParamName datatype[(len)] [= default] [OUTPUT|OUT]
  // Parameters are separated by commas and/or newlines
  const paramRegex =
    /(@\w+)\s+([\w]+(?:\s*\([^)]*\))?(?:\s*\(\s*\w+\s*\))?)\s*(?:=\s*([^,\r\n]*?))?\s*(OUTPUT|OUT)?\s*(?:,|\s*$)/gi;

  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(paramBlock)) !== null) {
    const paramName = match[1];
    let dataType = match[2].trim();
    let defaultValue = match[3] ? match[3].trim() : null;
    const isOutput = !!match[4];

    // Clean up default value
    if (defaultValue === '' || defaultValue === undefined) {
      defaultValue = null;
    }
    // Remove trailing comma from default value
    if (defaultValue && defaultValue.endsWith(',')) {
      defaultValue = defaultValue.slice(0, -1).trim();
    }

    // Normalize data type (remove extra whitespace)
    dataType = dataType.replace(/\s+/g, ' ');

    params.push({
      name: paramName,
      dataType,
      direction: isOutput ? 'OUTPUT' : 'IN',
      defaultValue,
    });
  }

  return params;
}

// ---------------------------------------------------------------------------
// Phase 3: Anti-pattern detection
// ---------------------------------------------------------------------------

function detectAntiPatterns(body: string): AntiPatterns {
  const cleanBody = stripComments(body);
  const upperBody = cleanBody.toUpperCase();

  // Cursors
  const hasCursor =
    /DECLARE\s+\S+\s+CURSOR/i.test(cleanBody) ||
    /FETCH\s+NEXT/i.test(cleanBody);

  // SELECT *
  const hasSelectStar = /SELECT\s+\*\s+FROM/i.test(cleanBody);

  // Dynamic SQL
  const hasDynamicSql =
    /EXEC\s*\(/i.test(cleanBody) ||
    /sp_executesql/i.test(cleanBody);

  // NOLOCK
  const nolockMatches = cleanBody.match(/WITH\s*\(\s*NOLOCK\s*\)/gi);
  const nolockCount = nolockMatches ? nolockMatches.length : 0;
  const hasNolock = nolockCount > 0;

  // Missing SET NOCOUNT ON
  const missingSetNocountOn = !upperBody.includes('SET NOCOUNT ON');

  // Table variables
  const hasTableVariable = /DECLARE\s+@\w+\s+TABLE/i.test(cleanBody);

  // Temp tables
  const hasTempTable =
    /CREATE\s+TABLE\s+#/i.test(cleanBody) ||
    /INTO\s+#/i.test(cleanBody);

  // WHILE loops
  const hasWhileLoop = /\bWHILE\s+/i.test(cleanBody);

  // No TRY/CATCH
  const hasNoTryCatch = !upperBody.includes('BEGIN TRY');

  return {
    hasCursor,
    hasSelectStar,
    hasDynamicSql,
    hasNolock,
    nolockCount,
    missingSetNocountOn,
    hasTableVariable,
    hasTempTable,
    hasWhileLoop,
    hasNoTryCatch,
  };
}

// ---------------------------------------------------------------------------
// Phase 4: Table references, SP calls, CRUD type, complexity
// ---------------------------------------------------------------------------

function extractTableReferences(
  body: string,
  knownTableNames: Set<string>
): string[] {
  const cleanBody = stripComments(body);
  const tables = new Set<string>();

  // Patterns to match table references with schema prefix:
  // FROM [schema].[table], JOIN [schema].[table], INSERT INTO [schema].[table],
  // UPDATE [schema].[table], DELETE FROM [schema].[table], MERGE [schema].[table],
  // TRUNCATE TABLE [schema].[table]
  const patterns = [
    /(?:FROM|JOIN)\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /INSERT\s+(?:INTO\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /UPDATE\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /DELETE\s+(?:FROM\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /MERGE\s+(?:INTO\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /TRUNCATE\s+TABLE\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
  ];

  // Also match unqualified table names after FROM/JOIN (no schema prefix)
  const unqualifiedPatterns = [
    /(?:FROM|JOIN)\s+\[?([A-Z_]\w+)\]?(?:\s+(?:AS\s+)?\w+)?(?:\s+WITH\s*\(\s*NOLOCK\s*\))?/gi,
    /INSERT\s+(?:INTO\s+)?\[?([A-Z_]\w+)\]?/gi,
    /UPDATE\s+\[?([A-Z_]\w+)\]?/gi,
    /DELETE\s+(?:FROM\s+)?\[?([A-Z_]\w+)\]?/gi,
    /MERGE\s+(?:INTO\s+)?\[?([A-Z_]\w+)\]?/gi,
    /TRUNCATE\s+TABLE\s+\[?([A-Z_]\w+)\]?/gi,
  ];

  const SQL_KEYWORDS = new Set([
    'SET', 'WHERE', 'SELECT', 'INTO', 'FROM', 'TABLE', 'VALUES',
    'BEGIN', 'END', 'IF', 'ELSE', 'CASE', 'WHEN', 'THEN', 'AS',
    'ON', 'AND', 'OR', 'NOT', 'NULL', 'OUTPUT', 'INSERTED',
    'DELETED', 'EXEC', 'EXECUTE', 'DECLARE', 'RETURN', 'PRINT',
    'RAISERROR', 'THROW', 'TRY', 'CATCH', 'WHILE', 'BREAK',
    'CONTINUE', 'CURSOR', 'OPEN', 'CLOSE', 'FETCH', 'NEXT',
    'DEALLOCATE', 'TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVE',
    'GO', 'USE', 'DROP', 'ALTER', 'CREATE', 'INDEX', 'VIEW',
    'TRIGGER', 'PROCEDURE', 'FUNCTION', 'NOCOUNT', 'ANSI_NULLS',
    'QUOTED_IDENTIFIER', 'XACT_ABORT', 'CONCAT_NULL_YIELDS_NULL',
    'INFORMATION_SCHEMA', 'SCOPE_IDENTITY', 'IDENTITY',
  ]);

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleanBody)) !== null) {
      const tableName = match[2];
      if (knownTableNames.has(tableName)) {
        tables.add(tableName);
      }
    }
  }

  for (const pattern of unqualifiedPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleanBody)) !== null) {
      const tableName = match[1];
      // Filter out SQL keywords that might match
      if (!SQL_KEYWORDS.has(tableName.toUpperCase()) && knownTableNames.has(tableName)) {
        tables.add(tableName);
      }
    }
  }

  return Array.from(tables).sort();
}

function extractSpCalls(body: string, selfName: string): string[] {
  const cleanBody = stripComments(body);
  const calls = new Set<string>();

  // EXEC [schema].[spName] or EXECUTE [schema].[spName]
  const qualifiedPattern =
    /(?:EXEC(?:UTE)?)\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi;
  let match: RegExpExecArray | null;
  while ((match = qualifiedPattern.exec(cleanBody)) !== null) {
    const spName = match[2];
    // Exclude system SPs and self
    if (
      !spName.startsWith('sp_') &&
      !spName.startsWith('xp_') &&
      spName !== selfName
    ) {
      calls.add(spName);
    }
  }

  // EXEC spName (no schema) - match word boundary to avoid partial matches
  const unqualifiedPattern =
    /(?:EXEC(?:UTE)?)\s+\[?([A-Z_]\w+)\]?(?:\s|$|@)/gi;
  while ((match = unqualifiedPattern.exec(cleanBody)) !== null) {
    const spName = match[1];
    if (
      !spName.startsWith('sp_') &&
      !spName.startsWith('xp_') &&
      spName !== selfName &&
      spName.toUpperCase() !== 'SP_EXECUTESQL'
    ) {
      calls.add(spName);
    }
  }

  return Array.from(calls).sort();
}

function classifyCrudType(name: string, body: string): CrudType {
  const cleanBody = stripComments(body).toUpperCase();
  const upperName = name.toUpperCase();

  // Name-based heuristics (order matters - check report first, then specific ops)
  const namePatterns: Array<{ pattern: RegExp; type: CrudType }> = [
    { pattern: /^RPT_|^REPORT|_REPORT$/i, type: 'report' },
    { pattern: /GET|SELECT|FIND|SEARCH|LIST|LOAD|FETCH|RETRIEVE|CHECK|LOOKUP|EXISTS|COUNT/i, type: 'get' },
    { pattern: /INSERT|ADD|CREATE|NEW/i, type: 'insert' },
    { pattern: /UPDATE|MODIFY|EDIT|CHANGE|SET|ENABLE|DISABLE|TOGGLE|ACTIVATE|DEACTIVATE/i, type: 'update' },
    { pattern: /DELETE|REMOVE|ARCHIVE|PURGE|CLEAN|CLEAR/i, type: 'delete' },
    { pattern: /SAVE|UPSERT|MERGE/i, type: 'mixed' },
  ];

  // Try name-based first
  for (const { pattern, type } of namePatterns) {
    if (pattern.test(upperName)) {
      return type;
    }
  }

  // Body-based analysis
  const hasSelect = /\bSELECT\b/.test(cleanBody) && /\bFROM\b/.test(cleanBody);
  const hasInsert = /\bINSERT\s+(?:INTO\s+)?\[?[A-Z]/.test(cleanBody);
  const hasUpdate = /\bUPDATE\s+\[?[A-Z]/.test(cleanBody);
  const hasDelete = /\bDELETE\s+(?:FROM\s+)?\[?[A-Z]/.test(cleanBody);
  const hasMerge = /\bMERGE\s+/.test(cleanBody);
  const hasGroupBy = /\bGROUP\s+BY\b/.test(cleanBody);

  const crudOps = [hasInsert, hasUpdate, hasDelete].filter(Boolean).length;

  // Report: multiple JOINs + GROUP BY
  if (hasGroupBy && hasSelect && !hasInsert && !hasUpdate && !hasDelete) {
    return 'report';
  }

  // Mixed: multiple mutation operations or MERGE
  if (hasMerge || crudOps >= 2) {
    return 'mixed';
  }

  if (hasDelete && !hasInsert && !hasUpdate) return 'delete';
  if (hasUpdate && !hasInsert && !hasDelete) return 'update';
  if (hasInsert && !hasUpdate && !hasDelete) return 'insert';
  if (hasSelect) return 'get';

  return 'mixed';
}

function classifyComplexity(
  lineCount: number,
  tableCount: number,
  antiPatterns: AntiPatterns
): Complexity {
  const antiPatternCount = [
    antiPatterns.hasCursor,
    antiPatterns.hasSelectStar,
    antiPatterns.hasDynamicSql,
    antiPatterns.hasTableVariable,
    antiPatterns.hasTempTable,
    antiPatterns.hasWhileLoop,
  ].filter(Boolean).length;

  // very-complex: 500+ lines, many tables, multiple anti-patterns
  if (lineCount >= 500 || (tableCount >= 8 && antiPatternCount >= 2)) {
    return 'very-complex';
  }

  // complex: 150-500 lines, 5+ tables, dynamic SQL or cursors
  if (
    lineCount >= 150 ||
    tableCount >= 5 ||
    antiPatterns.hasCursor ||
    antiPatterns.hasDynamicSql
  ) {
    return 'complex';
  }

  // moderate: 50-150 lines, 3-5 tables
  if (lineCount >= 50 || tableCount >= 3) {
    return 'moderate';
  }

  // simple: 20-50 lines, 1-2 tables
  if (lineCount >= 20 || tableCount >= 2) {
    return 'simple';
  }

  // trivial: <20 lines, single table
  return 'trivial';
}

// ---------------------------------------------------------------------------
// Phase 5: Load supporting data (tables.json, sproc-reconciliation.json)
// ---------------------------------------------------------------------------

function loadKnownTableNames(): Set<string> {
  console.log('\n=== Loading known table names from tables.json ===');

  if (!fs.existsSync(TABLES_JSON)) {
    console.warn('  Warning: tables.json not found, table validation disabled');
    return new Set();
  }

  const tablesData = JSON.parse(fs.readFileSync(TABLES_JSON, 'utf-8'));
  const names = new Set<string>();

  for (const mod of tablesData.modules) {
    for (const table of mod.tables) {
      names.add(table.name);
    }
  }

  console.log('  Loaded ' + fmt(names.size) + ' known table names');
  return names;
}

function loadReconciliationData(): Map<string, ReconciliationEntry> {
  console.log('\n=== Loading reconciliation data ===');

  if (!fs.existsSync(RECONCILIATION_JSON)) {
    console.warn('  Warning: sproc-reconciliation.json not found, code-caller merge disabled');
    return new Map();
  }

  const data = JSON.parse(fs.readFileSync(RECONCILIATION_JSON, 'utf-8'));
  const map = new Map<string, ReconciliationEntry>();

  if (data.crossReference) {
    for (const entry of data.crossReference) {
      map.set(entry.sprocName, entry);
    }
  }

  console.log('  Loaded ' + fmt(map.size) + ' cross-reference entries');
  return map;
}

// ---------------------------------------------------------------------------
// Phase 6: Build output JSON files
// ---------------------------------------------------------------------------

/**
 * Detect module for a stored procedure using multiple strategies:
 * 1. Prefix detection on SP name (e.g., ACT_SaveData, SEC_GetUser)
 * 2. Reconciliation module from .NET code analysis
 * 3. Infer from referenced table names (most tables have clear prefixes)
 */
function detectSpModule(
  sp: SprocParsed,
  reconciliation: Map<string, ReconciliationEntry>
): string {
  // Strategy 1: Standard prefix detection (matches SPs like ACT_Save, SEC_Get, etc.)
  const prefixResult = detectPrefix(sp.name, sp.schema);
  if (prefixResult !== '(uncategorized)') {
    return prefixResult;
  }

  // Strategy 2: Use reconciliation module (from .NET code calling analysis)
  const recon = reconciliation.get(sp.name);
  if (recon && recon.module) {
    return recon.module;
  }

  // Strategy 3: Infer from referenced table names
  // Most tables have clear module prefixes; use the most common one
  if (sp.tablesReferenced.length > 0) {
    const tablePrefixCounts = new Map<string, number>();
    for (const tableName of sp.tablesReferenced) {
      const tablePrefix = detectPrefix(tableName, 'dbo');
      if (tablePrefix !== '(uncategorized)') {
        tablePrefixCounts.set(
          tablePrefix,
          (tablePrefixCounts.get(tablePrefix) || 0) + 1
        );
      }
    }
    if (tablePrefixCounts.size > 0) {
      // Pick the most common table prefix
      let bestPrefix = '';
      let bestCount = 0;
      for (const [prefix, count] of tablePrefixCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestPrefix = prefix;
        }
      }
      if (bestPrefix) return bestPrefix;
    }
  }

  return '(uncategorized)';
}

function buildOutputs(
  parsedSprocs: SprocParsed[],
  reconciliation: Map<string, ReconciliationEntry>
): { fullJson: StoredProceduresFullJson; bodyModules: Map<string, SpBodyModule> } {
  console.log('\n=== Phase 6: Building output JSON ===');

  // Merge code-caller data
  let mergedCount = 0;
  for (const sp of parsedSprocs) {
    const recon = reconciliation.get(sp.name);
    if (recon) {
      // Build calledFromCode strings: "File.Method" or "Project/File"
      const callers: string[] = [];
      for (let i = 0; i < recon.calledFromFiles.length; i++) {
        const file = recon.calledFromFiles[i];
        const method = recon.calledFromMethods[i] || '';
        const project = recon.calledFromProjects[i] || '';
        if (method) {
          callers.push(file + '.' + method);
        } else if (project) {
          callers.push(project + '/' + file);
        } else {
          callers.push(file);
        }
      }
      sp.calledFromCode = callers;
      mergedCount++;
    }
  }
  console.log('  Merged code-caller data for ' + fmt(mergedCount) + ' SPs');

  // Group by module using enhanced detection
  const moduleMap = new Map<string, SprocParsed[]>();
  const schemaCount: Record<string, number> = {};
  let reconModuleCount = 0;
  let tableInferCount = 0;

  for (const sp of parsedSprocs) {
    const prefixResult = detectPrefix(sp.name, sp.schema);
    const module = detectSpModule(sp, reconciliation);

    if (prefixResult === '(uncategorized)' && module !== '(uncategorized)') {
      const recon = reconciliation.get(sp.name);
      if (recon && recon.module === module) {
        reconModuleCount++;
      } else {
        tableInferCount++;
      }
    }

    if (!moduleMap.has(module)) {
      moduleMap.set(module, []);
    }
    moduleMap.get(module)!.push(sp);

    schemaCount[sp.schema] = (schemaCount[sp.schema] || 0) + 1;
  }
  console.log('  Module assignment: ' + reconModuleCount + ' from reconciliation, ' + tableInferCount + ' from table inference');

  // Build stats
  const crudCounts: Record<string, number> = {};
  const complexityCounts: Record<string, number> = {};
  let cursors = 0, selectStar = 0, dynamicSql = 0, nolockUsage = 0;
  let missingSetNocountOn = 0, tableVariables = 0, tempTables = 0;
  let whileLoops = 0, noTryCatch = 0;

  for (const sp of parsedSprocs) {
    crudCounts[sp.crudType] = (crudCounts[sp.crudType] || 0) + 1;
    complexityCounts[sp.complexity] = (complexityCounts[sp.complexity] || 0) + 1;

    if (sp.antiPatterns.hasCursor) cursors++;
    if (sp.antiPatterns.hasSelectStar) selectStar++;
    if (sp.antiPatterns.hasDynamicSql) dynamicSql++;
    if (sp.antiPatterns.hasNolock) nolockUsage++;
    if (sp.antiPatterns.missingSetNocountOn) missingSetNocountOn++;
    if (sp.antiPatterns.hasTableVariable) tableVariables++;
    if (sp.antiPatterns.hasTempTable) tempTables++;
    if (sp.antiPatterns.hasWhileLoop) whileLoops++;
    if (sp.antiPatterns.hasNoTryCatch) noTryCatch++;
  }

  // Build module outputs
  const modules: ModuleSprocOutput[] = Array.from(moduleMap.entries())
    .map(([prefix, sprocs]) => ({
      prefix,
      displayName: DISPLAY_NAMES[prefix] || prefix,
      procedureCount: sprocs.length,
      procedures: sprocs
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((sp): SprocOutput => ({
          name: sp.name,
          schema: sp.schema,
          parameters: sp.parameters,
          lineCount: sp.lineCount,
          bodyPreview: sp.bodyPreview,
          tablesReferenced: sp.tablesReferenced,
          sprocsCalledFromBody: sp.sprocsCalledFromBody,
          crudType: sp.crudType,
          antiPatterns: sp.antiPatterns,
          calledFromCode: sp.calledFromCode,
          complexity: sp.complexity,
          aiEnrichment: null,
        })),
    }))
    .sort((a, b) => b.procedureCount - a.procedureCount);

  const fullJson: StoredProceduresFullJson = {
    exportDate: '2026-02-26',
    source: 'MyEvaluations_Schema_20260226.sql',
    totalProcedures: parsedSprocs.length,
    stats: {
      bySchema: schemaCount,
      byCrudType: crudCounts,
      byComplexity: complexityCounts,
      antiPatternCounts: {
        cursors,
        selectStar,
        dynamicSql,
        nolockUsage,
        missingSetNocountOn,
        tableVariables,
        tempTables,
        whileLoops,
        noTryCatch,
      },
    },
    modules,
  };

  // Build per-module body files
  const bodyModules = new Map<string, SpBodyModule>();
  for (const [prefix, sprocs] of moduleMap) {
    bodyModules.set(prefix, {
      module: prefix,
      procedureCount: sprocs.length,
      procedures: sprocs
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((sp) => ({
          name: sp.name,
          fullBody: sp.body,
        })),
    });
  }

  return { fullJson, bodyModules };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('==============================================');
  console.log('MyEvaluations Stored Procedure Parser');
  console.log('==============================================');

  // Phase 1: Read and split
  const spBlocks = readAndSplitBlocks();

  // Load supporting data
  const knownTableNames = loadKnownTableNames();
  const reconciliation = loadReconciliationData();

  // Phase 2-4: Parse each SP block
  console.log('\n=== Phase 2-4: Parse SP blocks ===');
  const parsedSprocs: SprocParsed[] = [];
  let parseFailures = 0;

  for (const block of spBlocks) {
    const raw = parseSpBlock(block);
    if (!raw) {
      parseFailures++;
      continue;
    }

    const bodyLines = raw.body.split('\n');
    const lineCount = bodyLines.length;
    const bodyPreview = bodyLines.slice(0, 200).join('\n');

    // Phase 3: Anti-patterns
    const antiPatterns = detectAntiPatterns(raw.body);

    // Phase 4: Table refs, SP calls, CRUD, complexity
    const tablesReferenced = extractTableReferences(raw.body, knownTableNames);
    const sprocsCalledFromBody = extractSpCalls(raw.body, raw.name);
    const crudType = classifyCrudType(raw.name, raw.body);
    const complexity = classifyComplexity(lineCount, tablesReferenced.length, antiPatterns);

    parsedSprocs.push({
      name: raw.name,
      schema: raw.schema,
      parameters: raw.parameters,
      body: raw.body,
      lineCount,
      bodyPreview,
      tablesReferenced,
      sprocsCalledFromBody,
      crudType,
      antiPatterns,
      calledFromCode: [],
      complexity,
    });
  }

  console.log('  Parsed: ' + fmt(parsedSprocs.length) + ' SPs');
  if (parseFailures > 0) {
    console.log('  Parse failures: ' + fmt(parseFailures));
  }

  // Print quick stats
  const paramCounts = parsedSprocs.map((sp) => sp.parameters.length);
  const avgParams =
    paramCounts.length > 0
      ? (paramCounts.reduce((a, b) => a + b, 0) / paramCounts.length).toFixed(1)
      : '0';
  console.log('  Average parameters per SP: ' + avgParams);

  // Phase 6: Build outputs
  const { fullJson, bodyModules } = buildOutputs(parsedSprocs, reconciliation);

  // Print stats
  console.log('\n=== Stats ===');
  console.log('  Total procedures: ' + fmt(fullJson.totalProcedures));
  console.log('  By schema: ' + JSON.stringify(fullJson.stats.bySchema));
  console.log('  By CRUD type: ' + JSON.stringify(fullJson.stats.byCrudType));
  console.log('  By complexity: ' + JSON.stringify(fullJson.stats.byComplexity));
  console.log('  Anti-pattern counts:');
  const ap = fullJson.stats.antiPatternCounts;
  console.log('    Cursors: ' + ap.cursors);
  console.log('    SELECT *: ' + ap.selectStar);
  console.log('    Dynamic SQL: ' + ap.dynamicSql);
  console.log('    NOLOCK usage: ' + ap.nolockUsage);
  console.log('    Missing SET NOCOUNT ON: ' + ap.missingSetNocountOn);
  console.log('    Table variables: ' + ap.tableVariables);
  console.log('    Temp tables: ' + ap.tempTables);
  console.log('    WHILE loops: ' + ap.whileLoops);
  console.log('    No TRY/CATCH: ' + ap.noTryCatch);

  console.log('\n  Modules: ' + fullJson.modules.length);
  for (const mod of fullJson.modules) {
    console.log('    ' + mod.displayName + ' (' + mod.prefix + '): ' + mod.procedureCount + ' SPs');
  }

  // Write outputs
  console.log('\n=== Writing output files ===');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SP_BODIES_DIR, { recursive: true });

  // Write main JSON
  const fullPath = path.join(OUTPUT_DIR, 'stored-procedures-full.json');
  fs.writeFileSync(fullPath, JSON.stringify(fullJson, null, 2), 'utf-8');
  const fullSizeKB = (fs.statSync(fullPath).size / 1024).toFixed(0);
  console.log('  Written: stored-procedures-full.json (' + fullSizeKB + ' KB)');

  // Write per-module body files
  for (const [prefix, bodyModule] of bodyModules) {
    const safePrefix = prefix.replace(/[^a-zA-Z0-9_()-]/g, '_');
    const bodyPath = path.join(SP_BODIES_DIR, safePrefix + '.json');
    fs.writeFileSync(bodyPath, JSON.stringify(bodyModule, null, 2), 'utf-8');
    const sizeKB = (fs.statSync(bodyPath).size / 1024).toFixed(0);
    console.log('  Written: sp-bodies/' + safePrefix + '.json (' + sizeKB + ' KB, ' + bodyModule.procedureCount + ' SPs)');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\nDone in ' + elapsed + 's');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
