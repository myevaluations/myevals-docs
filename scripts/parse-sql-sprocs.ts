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

function parseSpBlock(block: string): SpRaw | null {
  // Extract the CREATE PROCEDURE line to get name and schema
  const nameMatch = block.match(
    /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?\.\[?(\w+)\]?/i
  );
  if (!nameMatch) return null;

  const schema = nameMatch[1];
  const name = nameMatch[2];

  // Find the parameter block: between the procedure name and AS keyword
  const nameEnd = nameMatch.index! + nameMatch[0].length;
  const restAfterName = block.substring(nameEnd);

  // Find AS keyword: must be on its own or preceded by whitespace/newline
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

  // Cursors: DECLARE ... CURSOR or FETCH NEXT
  const hasCursor =
    /DECLARE\s+\S+\s+CURSOR/i.test(cleanBody) ||
    /FETCH\s+NEXT/i.test(cleanBody);

  // SELECT *: SELECT * FROM (not in comments, already stripped)
  const hasSelectStar = /SELECT\s+\*\s+FROM/i.test(cleanBody);

  // Dynamic SQL: EXEC( or sp_executesql
  const hasDynamicSql =
    /EXEC\s*\(/i.test(cleanBody) ||
    /sp_executesql/i.test(cleanBody);

  // NOLOCK: WITH (NOLOCK) with occurrence count
  const nolockMatches = cleanBody.match(/WITH\s*\(\s*NOLOCK\s*\)/gi);
  const nolockCount = nolockMatches ? nolockMatches.length : 0;
  const hasNolock = nolockCount > 0;

  // Missing SET NOCOUNT ON
  const missingSetNocountOn = !upperBody.includes('SET NOCOUNT ON');

  // Table variables: DECLARE @var TABLE
  const hasTableVariable = /DECLARE\s+@\w+\s+TABLE/i.test(cleanBody);

  // Temp tables: CREATE TABLE # or INTO #
  const hasTempTable =
    /CREATE\s+TABLE\s+#/i.test(cleanBody) ||
    /INTO\s+#/i.test(cleanBody);

  // WHILE loops
  const hasWhileLoop = /\bWHILE\s+/i.test(cleanBody);

  // No TRY/CATCH: body doesn't contain BEGIN TRY
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
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('==============================================');
  console.log('MyEvaluations Stored Procedure Parser');
  console.log('==============================================');

  // Phase 1: Read and split
  const spBlocks = readAndSplitBlocks();

  // Phase 2: Parse each SP block
  console.log('\n=== Phase 2: Parse SP name, schema, parameters ===');
  const parsed: SpRaw[] = [];
  let parseFailures = 0;

  for (const block of spBlocks) {
    const raw = parseSpBlock(block);
    if (!raw) {
      parseFailures++;
      continue;
    }
    parsed.push(raw);
  }

  console.log('  Parsed: ' + fmt(parsed.length) + ' SPs');
  if (parseFailures > 0) {
    console.log('  Parse failures: ' + fmt(parseFailures));
  }

  // Phase 3: Anti-pattern detection
  console.log('\n=== Phase 3: Anti-pattern detection ===');
  let cursors = 0, selectStar = 0, dynamicSql = 0, nolockUsage = 0;
  let missingSetNocountOn = 0, tableVariables = 0, tempTables = 0;
  let whileLoops = 0, noTryCatch = 0;
  let totalNolockOccurrences = 0;

  for (const sp of parsed) {
    const ap = detectAntiPatterns(sp.body);
    if (ap.hasCursor) cursors++;
    if (ap.hasSelectStar) selectStar++;
    if (ap.hasDynamicSql) dynamicSql++;
    if (ap.hasNolock) nolockUsage++;
    totalNolockOccurrences += ap.nolockCount;
    if (ap.missingSetNocountOn) missingSetNocountOn++;
    if (ap.hasTableVariable) tableVariables++;
    if (ap.hasTempTable) tempTables++;
    if (ap.hasWhileLoop) whileLoops++;
    if (ap.hasNoTryCatch) noTryCatch++;
  }

  console.log('  Anti-pattern counts:');
  console.log('    Cursors: ' + cursors);
  console.log('    SELECT *: ' + selectStar);
  console.log('    Dynamic SQL: ' + dynamicSql);
  console.log('    NOLOCK usage: ' + nolockUsage + ' SPs (' + totalNolockOccurrences + ' occurrences)');
  console.log('    Missing SET NOCOUNT ON: ' + missingSetNocountOn);
  console.log('    Table variables: ' + tableVariables);
  console.log('    Temp tables: ' + tempTables);
  console.log('    WHILE loops: ' + whileLoops);
  console.log('    No TRY/CATCH: ' + noTryCatch);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\nDone in ' + elapsed + 's');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
