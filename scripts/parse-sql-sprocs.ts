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
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('==============================================');
  console.log('MyEvaluations Stored Procedure Parser');
  console.log('==============================================');

  // Phase 1: Read and split
  const spBlocks = readAndSplitBlocks();

  console.log('\nPhase 1 complete. Found ' + fmt(spBlocks.length) + ' SP blocks.');
  console.log('Next: parse SP name, schema, and parameters.');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\nDone in ' + elapsed + 's');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
