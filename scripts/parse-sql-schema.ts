/**
 * parse-sql-schema.ts
 *
 * Parses the MyEvaluations database schema from a raw SQL export (SSMS "Generate Scripts")
 * and produces structured JSON files with full column-level detail.
 *
 * Input:  input/MyEvaluations_Schema_20260226.sql (147MB, UTF-16LE)
 * Output: generated/db-schema/tables.json  (main output with columns)
 *         generated/db-schema/summary.json
 *         generated/db-schema/indexes.json
 *         generated/db-schema/triggers.json
 *
 * Usage: npx tsx scripts/parse-sql-schema.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Parser } from 'node-sql-parser';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(
  PROJECT_ROOT,
  'input',
  'MyEvaluations_Schema_20260226.sql'
);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UdtInfo {
  baseType: string;
  maxLength: string | null;
}

interface ColumnOutput {
  name: string;
  dataType: string;        // Resolved base type
  rawType: string;          // Original UDT name or same as dataType
  maxLength: string | null;
  isNullable: boolean;
  isIdentity: boolean;
  isPrimaryKey: boolean;
  defaultValue: string | null;
  ordinalPosition: number;
}

interface ForeignKeyOutput {
  constraintName: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

interface IndexOutput {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  keyColumns: string[];
  includedColumns: string[];
}

interface TriggerOutput {
  name: string;
  isDisabled: boolean;
  isInsteadOf: boolean;
}

interface TableOutput {
  name: string;
  schema: string;
  fullName: string;           // "dbo.SEC_Users"
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  columns: ColumnOutput[];
  foreignKeys: ForeignKeyOutput[];
  indexes: IndexOutput[];
  checkConstraints: string[];
  defaultConstraints: number;
  uniqueConstraints: string[];
  triggers: TriggerOutput[];
}

interface ModuleOutput {
  prefix: string;
  displayName: string;
  tableCount: number;
  tables: TableOutput[];
}

interface TablesJson {
  exportDate: string;
  source: string;
  totalTables: number;
  schemas: string[];
  modules: ModuleOutput[];
}

interface SummaryJson {
  exportDate: string;
  source: string;
  totalTables: number;
  totalColumns: number;
  totalForeignKeys: number;
  totalIndexes: number;
  totalTriggers: number;
  totalStoredProcedures: number;
  totalFunctions: number;
  totalViews: number;
  totalDefaultConstraints: number;
  schemas: string[];
  moduleCount: number;
  modules: Array<{
    prefix: string;
    displayName: string;
    tableCount: number;
  }>;
}

interface StandaloneIndex {
  name: string;
  schema: string;
  tableName: string;
  isUnique: boolean;
  isClustered: boolean;
  keyColumns: string[];
  includedColumns: string[];
}

interface TriggerInfo {
  name: string;
  schema: string;
  tableName: string;
  tableSchema: string;
  isInsteadOf: boolean;
  events: string[];
}

// ---------------------------------------------------------------------------
// Module prefix detection (copied from parse-db-schema.ts)
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

function detectPrefix(tableName: string, schema: string): string {
  if (tableName.startsWith('_DEL_')) return '_DEL_';
  if (schema === 'perf') return 'perf';

  const sorted = [...PREFIX_PATTERNS].sort((a, b) => b.length - a.length);

  for (const prefix of sorted) {
    if (tableName.startsWith(prefix + '_')) {
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
// Phase 1: UDT Extraction
// ---------------------------------------------------------------------------

function extractUDTs(content: string): Map<string, UdtInfo> {
  console.log('\n=== Phase 1: UDT Extraction ===');
  const udts = new Map<string, UdtInfo>();

  // Pattern: CREATE TYPE [schema].[Name] FROM [baseType](maxLen) NULL
  const udtRegex = /CREATE TYPE \[(\w+)\]\.\[(\w+)\] FROM \[(\w+)\](?:\(([^)]+)\))?\s*NULL/g;
  let match: RegExpExecArray | null;

  while ((match = udtRegex.exec(content)) !== null) {
    const name = match[2];
    const baseType = match[3];
    const maxLength = match[4] || null;
    udts.set(name, { baseType, maxLength });
  }

  console.log(`  Found ${udts.size} scalar UDTs:`);
  for (const [name, info] of udts) {
    const lenStr = info.maxLength ? `(${info.maxLength})` : '';
    console.log(`    ${name} -> ${info.baseType}${lenStr}`);
  }

  return udts;
}

// ---------------------------------------------------------------------------
// Phase 2: CREATE TABLE Parsing
// ---------------------------------------------------------------------------

function extractTables(
  content: string,
  udts: Map<string, UdtInfo>
): Map<string, TableOutput> {
  console.log('\n=== Phase 2: CREATE TABLE Parsing ===');

  const parser = new Parser();
  const tables = new Map<string, TableOutput>();
  let astSuccess = 0;
  let regexFallback = 0;

  // Split into GO-delimited blocks to isolate top-level statements
  const blocks = content.split(/\nGO\r?\n/);

  for (const block of blocks) {
    const trimmed = block.trim();

    // Match top-level CREATE TABLE (not inside a proc/function)
    const tableMatch = trimmed.match(
      /CREATE TABLE \[(\w+)\]\.\[(\w+)\]\s*\(/
    );
    if (!tableMatch) continue;

    // Skip if the block starts with CREATE PROC/FUNCTION/VIEW/TRIGGER
    if (
      /^CREATE\s+(?:PROC(?:EDURE)?|FUNCTION|VIEW|TRIGGER)/i.test(trimmed)
    ) {
      continue;
    }

    // Also skip if the block has SET... then a CREATE PROC before the CREATE TABLE
    const createTableIdx = trimmed.indexOf('CREATE TABLE');
    const createProcIdx = trimmed.search(
      /CREATE\s+(?:PROC(?:EDURE)?|FUNCTION)/i
    );
    if (createProcIdx >= 0 && createProcIdx < createTableIdx) continue;

    const schema = tableMatch[1];
    const tableName = tableMatch[2];
    const fullName = `${schema}.${tableName}`;

    // Skip duplicates (take first occurrence)
    if (tables.has(fullName)) continue;

    // Extract the CREATE TABLE block from the start
    const createTableStart = trimmed.indexOf('CREATE TABLE');
    let tableBody = trimmed.substring(createTableStart);

    // Find the closing of the CREATE TABLE (balanced parentheses)
    const endIdx = findCreateTableEnd(tableBody);
    if (endIdx < 0) continue;
    tableBody = tableBody.substring(0, endIdx + 1);

    // Track original column types for rawType
    const originalColumnTypes = extractOriginalColumnTypes(tableBody);

    // Pre-process: replace UDT references with base types
    const preprocessed = preprocessUDTs(tableBody, udts);

    // Try AST parsing
    let columns: ColumnOutput[] = [];
    let pkColumns: string[] = [];
    let uniqueConstraints: string[] = [];
    let parsed = false;

    try {
      const ast = parser.astify(preprocessed, {
        database: 'TransactSQL',
      }) as any;

      if (ast && ast.create_definitions) {
        columns = [];
        let ordinal = 0;

        for (const def of ast.create_definitions) {
          if (def.resource === 'column') {
            ordinal++;
            const colName = def.column?.column || '';
            const dataType = (
              def.definition?.dataType || ''
            ).toLowerCase();
            const length = def.definition?.length;
            const scale = def.definition?.scale;
            let maxLength: string | null = null;

            if (length !== undefined && length !== null) {
              if (scale !== undefined && scale !== null) {
                maxLength = `${length}, ${scale}`;
              } else {
                maxLength = String(length);
              }
            }

            const isNullable =
              def.nullable?.type === 'null' ||
              def.nullable === null ||
              def.nullable === undefined;
            const isIdentity = !!def.auto_increment;

            // Get original type info
            const origInfo = originalColumnTypes.get(colName);

            columns.push({
              name: colName,
              dataType,
              rawType: origInfo?.rawType || dataType,
              maxLength: origInfo?.maxLength || maxLength,
              isNullable,
              isIdentity,
              isPrimaryKey: false,
              defaultValue: null,
              ordinalPosition: ordinal,
            });
          } else if (def.resource === 'constraint') {
            if (def.constraint_type === 'primary key') {
              pkColumns = (def.definition || []).map(
                (d: any) => d.column || ''
              );
              // Mark PK columns
              for (const col of columns) {
                if (pkColumns.includes(col.name)) {
                  col.isPrimaryKey = true;
                }
              }
            } else if (def.constraint_type === 'unique') {
              const constraintName = def.constraint || '';
              uniqueConstraints.push(constraintName);
            }
          }
        }

        astSuccess++;
        parsed = true;
      }
    } catch {
      // AST parsing failed; fall through to regex
    }

    if (!parsed) {
      // Regex fallback
      const result = parseColumnsRegex(tableBody, udts);
      columns = result.columns;
      pkColumns = result.pkColumns;
      uniqueConstraints = result.uniqueConstraints;
      regexFallback++;
    }

    tables.set(fullName, {
      name: tableName,
      schema,
      fullName,
      hasPrimaryKey: pkColumns.length > 0,
      primaryKeyColumns: pkColumns,
      columns,
      foreignKeys: [],
      indexes: [],
      checkConstraints: [],
      defaultConstraints: 0,
      uniqueConstraints,
      triggers: [],
    });
  }

  console.log(
    `  Phase 2: Parsed ${fmt(tables.size)} tables (${fmt(astSuccess)} via AST, ${fmt(regexFallback)} via regex fallback)`
  );

  // Spot checks
  const secUsers = tables.get('dbo.SEC_Users');
  if (secUsers) {
    console.log(
      `  Spot check: SEC_Users has ${secUsers.columns.length} columns (expected ~93-96)`
    );
  }
  const secUserTypes = tables.get('dbo.SEC_UserTypes');
  if (secUserTypes) {
    console.log(
      `  Spot check: SEC_UserTypes has ${secUserTypes.columns.length} columns (expected 9)`
    );
  }

  return tables;
}

/**
 * Find the end of the CREATE TABLE statement by tracking balanced parentheses.
 * Returns index of the final closing paren (including trailing ON [PRIMARY] etc.)
 */
function findCreateTableEnd(sql: string): number {
  let depth = 0;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inString) {
      inString = true;
    } else if (ch === "'" && inString) {
      // Check for escaped quote
      if (i + 1 < sql.length && sql[i + 1] === "'") {
        i++;
      } else {
        inString = false;
      }
    }

    if (inString) continue;

    if (ch === '(') depth++;
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        // Found the closing paren of the CREATE TABLE
        // Look for trailing ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
        const trailing = sql.substring(i + 1);
        const trailingMatch = trailing.match(
          /^\s*(?:ON\s+\[\w+\](?:\s*TEXTIMAGE_ON\s+\[\w+\])?)?/
        );
        if (trailingMatch) {
          return i + trailingMatch[0].length;
        }
        return i;
      }
    }
  }

  return -1;
}

/**
 * Pre-process SQL to replace UDT references with base SQL types.
 * Replaces [dbo].[UdtName] with [baseType](maxLength)
 */
function preprocessUDTs(sql: string, udts: Map<string, UdtInfo>): string {
  // Replace [dbo].[UdtName] in column definitions with [baseType](len) or [baseType]
  // But NOT the table reference in the CREATE TABLE header
  const lines = sql.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Skip the CREATE TABLE header line (contains the table name as [dbo].[TableName])
    if (i === 0 && /CREATE TABLE/.test(line)) {
      result.push(line);
      continue;
    }

    // Replace UDT references in column definition lines
    line = line.replace(
      /\[dbo\]\.\[(\w+)\]/g,
      (_match, name) => {
        const udt = udts.get(name);
        if (!udt) return _match;
        if (udt.maxLength) {
          return `[${udt.baseType}](${udt.maxLength})`;
        }
        return `[${udt.baseType}]`;
      }
    );

    // Replace system types that node-sql-parser doesn't understand
    // [sysname] is nvarchar(128), [xml] maps to nvarchar(max) for AST purposes
    line = line.replace(/\[sysname\]/g, '[nvarchar](128)');
    line = line.replace(/\[xml\]/g, '[nvarchar](max)');

    // Strip WITH (PAD_INDEX = OFF, ...) clauses that node-sql-parser can't handle
    line = line.replace(
      /\)WITH\s*\([^)]+\)\s*ON\s+\[\w+\]/g,
      ')'
    );

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Extract original column type info (before UDT replacement) for rawType tracking.
 */
function extractOriginalColumnTypes(
  tableBody: string
): Map<string, { rawType: string; maxLength: string | null }> {
  const result = new Map<
    string,
    { rawType: string; maxLength: string | null }
  >();

  const lines = tableBody.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Skip CREATE TABLE header
    if (i === 0 && /CREATE TABLE/.test(lines[i])) continue;

    const line = lines[i];
    // Match column: [ColName] [schema].[Type] or [ColName] [type](len)
    const colMatch = line.match(
      /^\s*\[(\w+)\]\s+(?:\[(\w+)\]\.)?\[(\w+)\](?:\(([^)]+)\))?/
    );
    if (!colMatch) continue;

    const colName = colMatch[1];
    const schemaPrefix = colMatch[2];
    const typeName = colMatch[3];
    const lengthStr = colMatch[4] || null;

    // Skip constraint-related keywords
    if (
      ['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'INDEX', 'CHECK'].includes(
        colName.toUpperCase()
      )
    ) {
      continue;
    }

    if (schemaPrefix) {
      // UDT reference: [dbo].[ShortText]
      result.set(colName, { rawType: typeName, maxLength: lengthStr });
    } else {
      // Native type: [varchar](100)
      result.set(colName, {
        rawType: typeName.toLowerCase(),
        maxLength: lengthStr,
      });
    }
  }

  return result;
}

/**
 * Regex fallback for parsing columns when AST fails.
 */
function parseColumnsRegex(
  tableBody: string,
  udts: Map<string, UdtInfo>
): {
  columns: ColumnOutput[];
  pkColumns: string[];
  uniqueConstraints: string[];
} {
  const columns: ColumnOutput[] = [];
  const pkColumns: string[] = [];
  const uniqueConstraints: string[] = [];
  const lines = tableBody.split('\n');
  let ordinal = 0;

  // Column regex: [ColName] [Type] or [ColName] [schema].[Type]
  const colRegex =
    /^\s*\[(\w+)\]\s+(?:\[(\w+)\]\.)?\[(\w+)\](?:\(([^)]+)\))?\s*(IDENTITY\s*\([^)]+\))?\s*(NOT\s+NULL|NULL)?/;

  // PK constraint regex (named: CONSTRAINT [name] PRIMARY KEY)
  const pkRegex =
    /CONSTRAINT\s+\[(\w+)\]\s+PRIMARY\s+KEY\s+(?:CLUSTERED|NONCLUSTERED)/i;

  // Unnamed PK (e.g., PRIMARY KEY NONCLUSTERED)
  const unnamedPkRegex =
    /^PRIMARY\s+KEY\s+(?:CLUSTERED|NONCLUSTERED)/i;

  // Unique constraint regex
  const uniqueRegex =
    /CONSTRAINT\s+\[(\w+)\]\s+UNIQUE\s+(?:CLUSTERED|NONCLUSTERED)?/i;

  let inPkBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the CREATE TABLE line itself
    if (trimmed.startsWith('CREATE TABLE')) continue;

    // Check for named PK constraint block
    const pkMatch = trimmed.match(pkRegex);
    if (pkMatch) {
      inPkBlock = true;
      continue;
    }

    // Check for unnamed PK constraint block
    if (unnamedPkRegex.test(trimmed)) {
      inPkBlock = true;
      continue;
    }

    // Check for UNIQUE constraint
    const uniqueMatch = trimmed.match(uniqueRegex);
    if (uniqueMatch) {
      uniqueConstraints.push(uniqueMatch[1]);
      continue;
    }

    // Inside PK block, capture column names
    if (inPkBlock) {
      const pkColMatch = trimmed.match(/^\[(\w+)\]\s+(?:ASC|DESC)/);
      if (pkColMatch) {
        pkColumns.push(pkColMatch[1]);
        continue;
      }
      if (trimmed.startsWith(')')) {
        inPkBlock = false;
        continue;
      }
    }

    // Try to match a column definition
    const colMatch = trimmed.match(colRegex);
    if (!colMatch) continue;

    const colName = colMatch[1];

    // Skip constraint-related keywords
    if (
      ['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'INDEX', 'CHECK'].includes(
        colName.toUpperCase()
      )
    ) {
      continue;
    }

    ordinal++;
    const schemaPrefix = colMatch[2];
    const rawTypeName = colMatch[3];
    const lengthStr = colMatch[4] || null;
    const identityStr = colMatch[5] || '';
    const nullStr = colMatch[6] || '';

    // Resolve UDT
    let dataType = rawTypeName.toLowerCase();
    let maxLength = lengthStr;
    let rawType = rawTypeName;

    if (schemaPrefix) {
      // This is a UDT reference
      rawType = rawTypeName;
      const udt = udts.get(rawTypeName);
      if (udt) {
        dataType = udt.baseType.toLowerCase();
        maxLength = udt.maxLength || lengthStr;
      }
    } else {
      rawType = rawTypeName.toLowerCase();
    }

    const isNullable = nullStr.toUpperCase() !== 'NOT NULL';
    const isIdentity = identityStr !== '';

    columns.push({
      name: colName,
      dataType,
      rawType,
      maxLength,
      isNullable,
      isIdentity,
      isPrimaryKey: false,
      defaultValue: null,
      ordinalPosition: ordinal,
    });
  }

  // Mark PK columns
  for (const col of columns) {
    if (pkColumns.includes(col.name)) {
      col.isPrimaryKey = true;
    }
  }

  return { columns, pkColumns, uniqueConstraints };
}

// ---------------------------------------------------------------------------
// Phase 3: FK Constraint Extraction
// ---------------------------------------------------------------------------

function extractForeignKeys(
  content: string,
  tables: Map<string, TableOutput>
): number {
  console.log('\n=== Phase 3: FK Constraint Extraction ===');

  let fkCount = 0;

  // FK pattern spans two lines:
  // ALTER TABLE [schema].[table]  WITH CHECK ADD  CONSTRAINT [name] FOREIGN KEY([col1], [col2])
  // REFERENCES [schema].[refTable] ([refCol1], [refCol2])
  const fkRegex =
    /ALTER TABLE \[(\w+)\]\.\[(\w+)\]\s+WITH (?:CHECK|NOCHECK) ADD\s+CONSTRAINT \[([^\]]+)\] FOREIGN KEY\(([^)]+)\)\s*\r?\n\s*REFERENCES \[(\w+)\]\.\[(\w+)\]\s*\(([^)]+)\)/g;

  let match: RegExpExecArray | null;

  while ((match = fkRegex.exec(content)) !== null) {
    const schema = match[1];
    const tableName = match[2];
    const constraintName = match[3];
    const fkColsRaw = match[4];
    const refSchema = match[5];
    const refTable = match[6];
    const refColsRaw = match[7];

    const fkCols = fkColsRaw
      .split(',')
      .map((c) => c.trim().replace(/^\[|\]$/g, ''));
    const refCols = refColsRaw
      .split(',')
      .map((c) => c.trim().replace(/^\[|\]$/g, ''));

    const fullName = `${schema}.${tableName}`;
    const table = tables.get(fullName);
    if (table) {
      table.foreignKeys.push({
        constraintName,
        columns: fkCols,
        referencedTable: `${refSchema}.${refTable}`,
        referencedColumns: refCols,
      });
      fkCount++;
    }
  }

  console.log(
    `  Phase 3: Extracted ${fmt(fkCount)} foreign key constraints`
  );

  return fkCount;
}

// ---------------------------------------------------------------------------
// Phase 4: Remaining Objects
// ---------------------------------------------------------------------------

interface Phase4Results {
  spCount: number;
  funcCount: number;
  viewCount: number;
  standaloneIndexes: StandaloneIndex[];
  defaultCount: number;
  triggerInfos: TriggerInfo[];
}

function extractRemainingObjects(
  content: string,
  tables: Map<string, TableOutput>
): Phase4Results {
  console.log('\n=== Phase 4: Remaining Objects ===');

  const blocks = content.split(/\nGO\r?\n/);

  // Stored procedures
  let spCount = 0;
  // Functions
  let funcCount = 0;
  // Views
  let viewCount = 0;

  for (const block of blocks) {
    const trimmed = block.trim();

    if (/^(?:\/\*[\s\S]*?\*\/\s*)?(?:SET\s+\w+\s+\w+\s*\r?\n)*\s*CREATE\s+PROC(?:EDURE)?\s/i.test(trimmed)) {
      spCount++;
    }

    if (/^(?:\/\*[\s\S]*?\*\/\s*)?(?:SET\s+\w+\s+\w+\s*\r?\n)*\s*CREATE\s+FUNCTION\s/i.test(trimmed)) {
      funcCount++;
    }

    if (/^(?:\/\*[\s\S]*?\*\/\s*)?(?:SET\s+\w+\s+\w+\s*\r?\n)*\s*CREATE\s+VIEW\s/i.test(trimmed)) {
      viewCount++;
    }
  }

  console.log(`  Stored Procedures: ${fmt(spCount)}`);
  console.log(`  Functions: ${fmt(funcCount)}`);
  console.log(`  Views: ${fmt(viewCount)}`);

  // Standalone indexes (in their own GO blocks)
  const standaloneIndexes: StandaloneIndex[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();

    // Match standalone index blocks (prefixed by a comment block typically)
    const idxMatch = trimmed.match(
      /CREATE\s+(UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\s+\[([^\]]+)\]\s+ON\s+\[(\w+)\]\.\[(\w+)\]/i
    );
    if (!idxMatch) continue;

    // Skip if this is a CREATE PROC/FUNCTION/VIEW that happens to contain CREATE INDEX
    if (/CREATE\s+(?:PROC(?:EDURE)?|FUNCTION|VIEW|TRIGGER)\s/i.test(trimmed)) {
      // Check if the CREATE INDEX comes before the CREATE PROC
      const idxPos = trimmed.search(/CREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX/i);
      const procPos = trimmed.search(/CREATE\s+(?:PROC(?:EDURE)?|FUNCTION|VIEW|TRIGGER)\s/i);
      if (procPos >= 0 && procPos < idxPos) continue;
    }

    const isUnique = !!idxMatch[1];
    const indexName = idxMatch[2];
    const schema = idxMatch[3];
    const tableName = idxMatch[4];

    // Extract key columns from the parenthesized list after ON [schema].[table]
    const afterTable = trimmed.substring(idxMatch.index! + idxMatch[0].length);
    const keyColsMatch = afterTable.match(/\s*\(\s*([\s\S]*?)\)/);
    const keyColumns: string[] = [];
    if (keyColsMatch) {
      const colsStr = keyColsMatch[1];
      const colEntries = colsStr.split(',');
      for (const entry of colEntries) {
        const colNameMatch = entry.trim().match(/^\[(\w+)\]/);
        if (colNameMatch) {
          keyColumns.push(colNameMatch[1]);
        }
      }
    }

    // Extract INCLUDE columns
    const includedColumns: string[] = [];
    const includeMatch = afterTable.match(/INCLUDE\s*\(\s*([\s\S]*?)\)/i);
    if (includeMatch) {
      const inclStr = includeMatch[1];
      const inclEntries = inclStr.split(',');
      for (const entry of inclEntries) {
        const colNameMatch = entry.trim().match(/^\[(\w+)\]/);
        if (colNameMatch) {
          includedColumns.push(colNameMatch[1]);
        }
      }
    }

    const isClustered = /CLUSTERED\s+INDEX/i.test(trimmed) &&
      !/NONCLUSTERED/i.test(trimmed.substring(0, trimmed.indexOf('INDEX')));

    standaloneIndexes.push({
      name: indexName,
      schema,
      tableName,
      isUnique,
      isClustered,
      keyColumns,
      includedColumns,
    });

    // Merge into table
    const fullName = `${schema}.${tableName}`;
    const table = tables.get(fullName);
    if (table) {
      table.indexes.push({
        name: indexName,
        type: isClustered ? 'CLUSTERED' : 'NONCLUSTERED',
        isPrimaryKey: false,
        isUnique,
        isDisabled: false,
        keyColumns,
        includedColumns,
      });
    }
  }

  console.log(`  Standalone Indexes: ${fmt(standaloneIndexes.length)}`);

  // Default constraints
  let defaultCount = 0;
  const defaultRegex =
    /ALTER TABLE \[(\w+)\]\.\[(\w+)\] ADD\s+CONSTRAINT \[([^\]]+)\]\s+DEFAULT\s+\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s+FOR\s+\[(\w+)\]/g;

  let defMatch: RegExpExecArray | null;

  while ((defMatch = defaultRegex.exec(content)) !== null) {
    const schema = defMatch[1];
    const tableName = defMatch[2];
    const defaultValue = defMatch[4];
    const columnName = defMatch[5];

    const fullName = `${schema}.${tableName}`;
    const table = tables.get(fullName);
    if (table) {
      table.defaultConstraints++;
      // Find the column and set default value
      const col = table.columns.find((c) => c.name === columnName);
      if (col) {
        col.defaultValue = defaultValue;
      }
      defaultCount++;
    }
  }

  console.log(`  Default Constraints: ${fmt(defaultCount)}`);

  // Triggers
  const triggerInfos: TriggerInfo[] = [];
  const triggerRegex =
    /CREATE\s+TRIGGER\s+\[(\w+)\]\.\[(\w+)\]\s*(?:\r?\n)?\s*ON\s+\[(\w+)\]\.\[(\w+)\]\s*(?:\r?\n)?\s*(AFTER|FOR|INSTEAD\s+OF)\s+([\w\s,]+)/gi;

  let trigMatch: RegExpExecArray | null;

  while ((trigMatch = triggerRegex.exec(content)) !== null) {
    const trigSchema = trigMatch[1];
    const trigName = trigMatch[2];
    const tableSchema = trigMatch[3];
    const tableName = trigMatch[4];
    const timing = trigMatch[5].trim().toUpperCase();
    const eventsRaw = trigMatch[6];

    const events = eventsRaw
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter((e) => ['INSERT', 'UPDATE', 'DELETE'].includes(e));

    const isInsteadOf = timing.includes('INSTEAD');

    triggerInfos.push({
      name: trigName,
      schema: trigSchema,
      tableName,
      tableSchema,
      isInsteadOf,
      events,
    });

    // Merge into table
    const fullName = `${tableSchema}.${tableName}`;
    const table = tables.get(fullName);
    if (table) {
      table.triggers.push({
        name: trigName,
        isDisabled: false,
        isInsteadOf,
      });
    }
  }

  console.log(`  Triggers: ${triggerInfos.length}`);

  return {
    spCount,
    funcCount,
    viewCount,
    standaloneIndexes,
    defaultCount,
    triggerInfos,
  };
}

// ---------------------------------------------------------------------------
// Phase 5: Module Assignment + Output
// ---------------------------------------------------------------------------

function buildTablesJson(tables: Map<string, TableOutput>): TablesJson {
  const moduleMap = new Map<string, TableOutput[]>();
  const allSchemas = new Set<string>();

  for (const [, table] of tables) {
    const prefix = detectPrefix(table.name, table.schema);
    allSchemas.add(table.schema);

    if (!moduleMap.has(prefix)) {
      moduleMap.set(prefix, []);
    }
    moduleMap.get(prefix)!.push(table);
  }

  const modules: ModuleOutput[] = Array.from(moduleMap.entries())
    .map(([prefix, moduleTables]) => ({
      prefix,
      displayName: DISPLAY_NAMES[prefix] || prefix,
      tableCount: moduleTables.length,
      tables: moduleTables.sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }))
    .sort((a, b) => b.tableCount - a.tableCount);

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluations_Schema_20260226.sql',
    totalTables: tables.size,
    schemas: Array.from(allSchemas).sort(),
    modules,
  };
}

function buildSummaryJson(
  tablesJson: TablesJson,
  totalFKs: number,
  phase4: Phase4Results
): SummaryJson {
  let totalColumns = 0;
  for (const mod of tablesJson.modules) {
    for (const t of mod.tables) {
      totalColumns += t.columns.length;
    }
  }

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluations_Schema_20260226.sql',
    totalTables: tablesJson.totalTables,
    totalColumns,
    totalForeignKeys: totalFKs,
    totalIndexes: phase4.standaloneIndexes.length,
    totalTriggers: phase4.triggerInfos.length,
    totalStoredProcedures: phase4.spCount,
    totalFunctions: phase4.funcCount,
    totalViews: phase4.viewCount,
    totalDefaultConstraints: phase4.defaultCount,
    schemas: tablesJson.schemas,
    moduleCount: tablesJson.modules.length,
    modules: tablesJson.modules.map((m) => ({
      prefix: m.prefix,
      displayName: m.displayName,
      tableCount: m.tableCount,
    })),
  };
}

function buildIndexesJson(standaloneIndexes: StandaloneIndex[]) {
  const byType: Record<string, number> = {};
  for (const idx of standaloneIndexes) {
    const type = idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED';
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluations_Schema_20260226.sql',
    totalIndexes: standaloneIndexes.length,
    byType,
    stats: {
      totalUnique: standaloneIndexes.filter((i) => i.isUnique).length,
      totalWithIncludedColumns: standaloneIndexes.filter(
        (i) => i.includedColumns.length > 0
      ).length,
    },
    indexes: standaloneIndexes.map((idx) => ({
      schema: idx.schema,
      tableName: idx.tableName,
      fullTableName: `${idx.schema}.${idx.tableName}`,
      indexName: idx.name,
      isUnique: idx.isUnique,
      isClustered: idx.isClustered,
      keyColumns: idx.keyColumns,
      includedColumns: idx.includedColumns,
    })),
  };
}

function buildTriggersJson(triggerInfos: TriggerInfo[]) {
  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluations_Schema_20260226.sql',
    totalTriggers: triggerInfos.length,
    insteadOfCount: triggerInfos.filter((t) => t.isInsteadOf).length,
    triggers: triggerInfos.map((t) => ({
      name: t.name,
      schema: t.schema,
      tableName: t.tableName,
      tableSchema: t.tableSchema,
      fullParentTable: `${t.tableSchema}.${t.tableName}`,
      isInsteadOf: t.isInsteadOf,
      events: t.events,
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('==============================================');
  console.log('MyEvaluations SQL Schema Parser');
  console.log('==============================================');
  console.log(
    `Input: input/MyEvaluations_Schema_20260226.sql`
  );

  // Verify input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Input file not found at ${INPUT_FILE}`);
    process.exit(1);
  }

  const stat = fs.statSync(INPUT_FILE);
  console.log(`File size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

  // Read file (UTF-16LE encoded)
  console.log('Reading file (UTF-16LE)...');
  const content = fs.readFileSync(INPUT_FILE, 'utf16le');
  console.log(
    `  Read ${fmt(content.length)} characters, ${fmt(content.split('\n').length)} lines`
  );

  // Phase 1: UDT extraction
  const udts = extractUDTs(content);

  // Phase 2: CREATE TABLE parsing
  const tables = extractTables(content, udts);

  // Phase 3: FK constraint extraction
  const totalFKs = extractForeignKeys(content, tables);

  // Phase 4: Remaining objects
  const phase4 = extractRemainingObjects(content, tables);

  // Phase 5: Module assignment + output
  console.log('\n=== Phase 5: Module Assignment + Output ===');
  const tablesJson = buildTablesJson(tables);
  console.log(
    `  Grouped ${fmt(tablesJson.totalTables)} tables into ${tablesJson.modules.length} modules`
  );

  // Print module breakdown
  for (const mod of tablesJson.modules) {
    console.log(
      `    ${mod.displayName} (${mod.prefix}): ${mod.tableCount} tables`
    );
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write output files
  const summaryJson = buildSummaryJson(tablesJson, totalFKs, phase4);
  const indexesJson = buildIndexesJson(phase4.standaloneIndexes);
  const triggersJson = buildTriggersJson(phase4.triggerInfos);

  const outputs: Array<{
    filename: string;
    data: unknown;
    description: string;
  }> = [
    {
      filename: 'tables.json',
      data: tablesJson,
      description: `${fmt(tablesJson.totalTables)} tables with columns`,
    },
    {
      filename: 'summary.json',
      data: summaryJson,
      description: 'summary',
    },
    {
      filename: 'indexes.json',
      data: indexesJson,
      description: `${fmt(phase4.standaloneIndexes.length)} standalone indexes`,
    },
    {
      filename: 'triggers.json',
      data: triggersJson,
      description: `${phase4.triggerInfos.length} triggers`,
    },
  ];

  console.log('');
  for (const output of outputs) {
    const filePath = path.join(OUTPUT_DIR, output.filename);
    fs.writeFileSync(filePath, JSON.stringify(output.data, null, 2), 'utf-8');
    const sizeKB = (
      fs.statSync(filePath).size / 1024
    ).toFixed(0);
    console.log(
      `  Written: generated/db-schema/${output.filename} (${output.description}, ${sizeKB} KB)`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
