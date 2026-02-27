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

interface SpRaw {
  name: string;
  schema: string;
  parameters: SpParameter[];
  body: string;
}

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
  let result = sql.replace(/\/\*[\s\S]*?\*\//g, '');
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

  const allBlocks = content.split(/\nGO\r?\n/);
  console.log('  Total GO blocks: ' + fmt(allBlocks.length));

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

function parseSpBlock(block: string): SpRaw | null {
  const nameMatch = block.match(
    /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?\.\[?(\w+)\]?/i
  );
  if (!nameMatch) return null;

  const schema = nameMatch[1];
  const name = nameMatch[2];

  const nameEnd = nameMatch.index! + nameMatch[0].length;
  const restAfterName = block.substring(nameEnd);

  const asMatch = restAfterName.match(/\n\s*AS\s*\r?\n/i)
    || restAfterName.match(/\nAS\s*$/im)
    || restAfterName.match(/\)\s*\r?\nAS\s*\r?\n/i);

  let paramBlock = '';
  let body = '';

  if (asMatch) {
    const asIdx = asMatch.index!;
    paramBlock = restAfterName.substring(0, asIdx);
    body = restAfterName.substring(asIdx + asMatch[0].length);
  } else {
    const simpleAsMatch = restAfterName.match(/\bAS\b\s*\r?\n/i);
    if (simpleAsMatch) {
      paramBlock = restAfterName.substring(0, simpleAsMatch.index!);
      body = restAfterName.substring(
        simpleAsMatch.index! + simpleAsMatch[0].length
      );
    } else {
      body = restAfterName;
    }
  }

  const parameters = parseParameters(paramBlock);

  return { name, schema, parameters, body };
}

function parseParameters(paramBlock: string): SpParameter[] {
  const params: SpParameter[] = [];

  const paramRegex =
    /(@\w+)\s+([\w]+(?:\s*\([^)]*\))?(?:\s*\(\s*\w+\s*\))?)\s*(?:=\s*([^,\r\n]*?))?\s*(OUTPUT|OUT)?\s*(?:,|\s*$)/gi;

  let match: RegExpExecArray | null;
  while ((match = paramRegex.exec(paramBlock)) !== null) {
    const paramName = match[1];
    let dataType = match[2].trim();
    let defaultValue = match[3] ? match[3].trim() : null;
    const isOutput = !!match[4];

    if (defaultValue === '' || defaultValue === undefined) {
      defaultValue = null;
    }
    if (defaultValue && defaultValue.endsWith(',')) {
      defaultValue = defaultValue.slice(0, -1).trim();
    }

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

  const hasCursor =
    /DECLARE\s+\S+\s+CURSOR/i.test(cleanBody) ||
    /FETCH\s+NEXT/i.test(cleanBody);

  const hasSelectStar = /SELECT\s+\*\s+FROM/i.test(cleanBody);

  const hasDynamicSql =
    /EXEC\s*\(/i.test(cleanBody) ||
    /sp_executesql/i.test(cleanBody);

  const nolockMatches = cleanBody.match(/WITH\s*\(\s*NOLOCK\s*\)/gi);
  const nolockCount = nolockMatches ? nolockMatches.length : 0;
  const hasNolock = nolockCount > 0;

  const missingSetNocountOn = !upperBody.includes('SET NOCOUNT ON');

  const hasTableVariable = /DECLARE\s+@\w+\s+TABLE/i.test(cleanBody);

  const hasTempTable =
    /CREATE\s+TABLE\s+#/i.test(cleanBody) ||
    /INTO\s+#/i.test(cleanBody);

  const hasWhileLoop = /\bWHILE\s+/i.test(cleanBody);

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

function extractTableReferences(
  body: string,
  knownTableNames: Set<string>
): string[] {
  const cleanBody = stripComments(body);
  const tables = new Set<string>();

  // Qualified patterns: [schema].[table]
  const patterns = [
    /(?:FROM|JOIN)\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /INSERT\s+(?:INTO\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /UPDATE\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /DELETE\s+(?:FROM\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /MERGE\s+(?:INTO\s+)?\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    /TRUNCATE\s+TABLE\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
  ];

  // Unqualified patterns: just table name
  const unqualifiedPatterns = [
    /(?:FROM|JOIN)\s+\[?([A-Z_]\w+)\]?(?:\s+(?:AS\s+)?\w+)?(?:\s+WITH\s*\(\s*NOLOCK\s*\))?/gi,
    /INSERT\s+(?:INTO\s+)?\[?([A-Z_]\w+)\]?/gi,
    /UPDATE\s+\[?([A-Z_]\w+)\]?/gi,
    /DELETE\s+(?:FROM\s+)?\[?([A-Z_]\w+)\]?/gi,
    /MERGE\s+(?:INTO\s+)?\[?([A-Z_]\w+)\]?/gi,
    /TRUNCATE\s+TABLE\s+\[?([A-Z_]\w+)\]?/gi,
  ];

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

  // EXEC [schema].[spName]
  const qualifiedPattern =
    /(?:EXEC(?:UTE)?)\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi;
  let match: RegExpExecArray | null;
  while ((match = qualifiedPattern.exec(cleanBody)) !== null) {
    const spName = match[2];
    if (
      !spName.startsWith('sp_') &&
      !spName.startsWith('xp_') &&
      spName !== selfName
    ) {
      calls.add(spName);
    }
  }

  // EXEC spName (no schema)
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

  // Name-based heuristics (order matters)
  const namePatterns: Array<{ pattern: RegExp; type: CrudType }> = [
    { pattern: /^RPT_|^REPORT|_REPORT$/i, type: 'report' },
    { pattern: /GET|SELECT|FIND|SEARCH|LIST|LOAD|FETCH|RETRIEVE|CHECK|LOOKUP|EXISTS|COUNT/i, type: 'get' },
    { pattern: /INSERT|ADD|CREATE|NEW/i, type: 'insert' },
    { pattern: /UPDATE|MODIFY|EDIT|CHANGE|SET|ENABLE|DISABLE|TOGGLE|ACTIVATE|DEACTIVATE/i, type: 'update' },
    { pattern: /DELETE|REMOVE|ARCHIVE|PURGE|CLEAN|CLEAR/i, type: 'delete' },
    { pattern: /SAVE|UPSERT|MERGE/i, type: 'mixed' },
  ];

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

  if (hasGroupBy && hasSelect && !hasInsert && !hasUpdate && !hasDelete) {
    return 'report';
  }

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

  if (lineCount >= 500 || (tableCount >= 8 && antiPatternCount >= 2)) {
    return 'very-complex';
  }

  if (
    lineCount >= 150 ||
    tableCount >= 5 ||
    antiPatterns.hasCursor ||
    antiPatterns.hasDynamicSql
  ) {
    return 'complex';
  }

  if (lineCount >= 50 || tableCount >= 3) {
    return 'moderate';
  }

  if (lineCount >= 20 || tableCount >= 2) {
    return 'simple';
  }

  return 'trivial';
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

  // Load known table names
  const knownTableNames = loadKnownTableNames();

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

    const antiPatterns = detectAntiPatterns(raw.body);
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

  // Stats
  const crudCounts: Record<string, number> = {};
  const complexityCounts: Record<string, number> = {};
  let totalTableRefs = 0;
  let totalSpCalls = 0;

  for (const sp of parsedSprocs) {
    crudCounts[sp.crudType] = (crudCounts[sp.crudType] || 0) + 1;
    complexityCounts[sp.complexity] = (complexityCounts[sp.complexity] || 0) + 1;
    totalTableRefs += sp.tablesReferenced.length;
    totalSpCalls += sp.sprocsCalledFromBody.length;
  }

  console.log('\n  CRUD type distribution: ' + JSON.stringify(crudCounts));
  console.log('  Complexity distribution: ' + JSON.stringify(complexityCounts));
  console.log('  Total table references: ' + fmt(totalTableRefs) + ' (avg ' + (totalTableRefs / parsedSprocs.length).toFixed(1) + '/SP)');
  console.log('  Total SP-to-SP calls: ' + fmt(totalSpCalls));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\nDone in ' + elapsed + 's');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
