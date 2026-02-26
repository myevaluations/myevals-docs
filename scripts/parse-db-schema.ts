/**
 * parse-db-schema.ts
 *
 * Parses the MyEvaluations database schema Excel export and produces
 * structured JSON files for downstream documentation generation.
 *
 * Input:  input/MyEvaluationsDatabaseSchema_20260226.xlsx
 * Output: generated/db-schema/*.json
 *
 * Usage: tsx scripts/parse-db-schema.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INPUT_FILE = path.join(
  PROJECT_ROOT,
  'input',
  'MyEvaluationsDatabaseSchema_20260226.xlsx'
);
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'db-schema');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProgrammableObject {
  objectType: string;
  schema: string;
  name: string;
}

interface ConstraintRow {
  objectType: string;
  schema: string;
  name: string;
  parentSchema: string;
  parentTable: string;
}

interface TriggerRow {
  schema: string;
  name: string;
  parentSchema: string;
  parentTable: string;
  isDisabled: boolean;
  isInsteadOf: boolean;
}

interface IndexRow {
  schema: string;
  tableName: string;
  indexName: string;
  indexType: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  keyColumns: string[];
  includedColumns: string[];
}

interface UdtRow {
  type: string;
  schema: string;
  name: string;
  systemType: string;
  maxLength: number;
  precision: number;
  scale: number;
}

interface TableTypeRow {
  type: string;
  schema: string;
  name: string;
}

interface PartitionRow {
  tableName: string;
  partitionScheme: string;
  partitionFunction: string;
}

// Output types

interface ForeignKeyOutput {
  constraintName: string;
  referencedTable: string;
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
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
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

// ---------------------------------------------------------------------------
// Module prefix detection
// ---------------------------------------------------------------------------

// Ordered longest-first to avoid ambiguity (e.g. MYEVAL before MY)
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

// Normalize variant prefixes to canonical form
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

/**
 * Detect the module prefix for a table name.
 * Returns the canonical (normalized) prefix.
 */
function detectPrefix(tableName: string, schema: string): string {
  // Special cases first
  if (tableName.startsWith('_DEL_')) return '_DEL_';
  if (schema === 'perf') return 'perf';

  // Sort prefixes by length descending so longer matches win
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

function splitColumns(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sheet parsers
// ---------------------------------------------------------------------------

function parseObjectCounts(
  ws: XLSX.WorkSheet
): Array<{ objectType: string; count: number }> {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    objectType: String(r['ObjectType'] || ''),
    count: Number(r['CountOfObjects'] || 0),
  }));
}

function parseProgrammableObjects(ws: XLSX.WorkSheet): ProgrammableObject[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    objectType: String(r['ObjectType'] || ''),
    schema: String(r['SchemaName'] || 'dbo'),
    name: String(r['ObjectName'] || ''),
  }));
}

function parseConstraints(ws: XLSX.WorkSheet): ConstraintRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    objectType: String(r['ObjectType'] || ''),
    schema: String(r['SchemaName'] || 'dbo'),
    name: String(r['ObjectName'] || ''),
    parentSchema: String(r['ParentSchemaName'] || 'dbo'),
    parentTable: String(r['ParentObjectName'] || ''),
  }));
}

function parseTriggers(ws: XLSX.WorkSheet): TriggerRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    schema: String(r['SchemaName'] || 'dbo'),
    name: String(r['ObjectName'] || ''),
    parentSchema: String(r['ParentSchemaName'] || 'dbo'),
    parentTable: String(r['ParentObjectName'] || ''),
    isDisabled: Boolean(r['IsTriggerDisabled']),
    isInsteadOf: Boolean(r['IsInsteadOfTrigger']),
  }));
}

function parseUdts(ws: XLSX.WorkSheet): UdtRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    type: String(r['Type'] || ''),
    schema: String(r['SchemaName'] || 'dbo'),
    name: String(r['UserDefinedTypeName'] || ''),
    systemType: String(r['SystemTypeName'] || ''),
    maxLength: Number(r['max_length'] || 0),
    precision: Number(r['precision'] || 0),
    scale: Number(r['scale'] || 0),
  }));
}

function parseTableTypes(ws: XLSX.WorkSheet): TableTypeRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    type: String(r['Type'] || ''),
    schema: String(r['SchemaName'] || 'dbo'),
    name: String(r['UserDefinedTypeName'] || ''),
  }));
}

function parseIndexes(ws: XLSX.WorkSheet): IndexRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    schema: String(r['SchemaName'] || 'dbo'),
    tableName: String(r['TableName'] || ''),
    indexName: String(r['IndexName'] || ''),
    indexType: String(r['IndexType'] || ''),
    isPrimaryKey: Boolean(r['IsPrimaryKey']),
    isUnique: Boolean(r['IsUniqueIndex']),
    isDisabled: Boolean(r['IsIndexDisabled']),
    keyColumns: splitColumns(r['KeyColumns']),
    includedColumns: splitColumns(r['IncludedColumns']),
  }));
}

function parsePartitions(ws: XLSX.WorkSheet): PartitionRow[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  return rows.map((r) => ({
    tableName: String(r['TableName'] || ''),
    partitionScheme: String(r['PartitionScheme'] || ''),
    partitionFunction: String(r['PartitionFunction'] || ''),
  }));
}

// ---------------------------------------------------------------------------
// Build tables.json — group tables into modules with their constraints/indexes
// ---------------------------------------------------------------------------

function buildTablesJson(
  objects: ProgrammableObject[],
  constraints: ConstraintRow[],
  indexes: IndexRow[],
  triggers: TriggerRow[]
): TablesJson {
  const tables = objects.filter((o) => o.objectType === 'User Tables');

  // Build lookup maps by parent table (schema.tableName)
  const fkByParent = new Map<string, ConstraintRow[]>();
  const pkByParent = new Map<string, ConstraintRow[]>();
  const checkByParent = new Map<string, ConstraintRow[]>();
  const defaultByParent = new Map<string, ConstraintRow[]>();
  const uniqueByParent = new Map<string, ConstraintRow[]>();

  for (const c of constraints) {
    const key = `${c.parentSchema}.${c.parentTable}`;
    switch (c.objectType) {
      case 'Foreign Key Constraints':
        pushToMap(fkByParent, key, c);
        break;
      case 'Primary Key Constraints':
        pushToMap(pkByParent, key, c);
        break;
      case 'Check Constraints':
        pushToMap(checkByParent, key, c);
        break;
      case 'Default Constraints':
        pushToMap(defaultByParent, key, c);
        break;
      case 'Unique Constraints':
        pushToMap(uniqueByParent, key, c);
        break;
    }
  }

  // Index lookup by schema.tableName
  const indexByTable = new Map<string, IndexRow[]>();
  for (const idx of indexes) {
    const key = `${idx.schema}.${idx.tableName}`;
    pushToMap(indexByTable, key, idx);
  }

  // Trigger lookup by parentSchema.parentTable
  const triggerByTable = new Map<string, TriggerRow[]>();
  for (const t of triggers) {
    const key = `${t.parentSchema}.${t.parentTable}`;
    pushToMap(triggerByTable, key, t);
  }

  // Group tables by module prefix
  const moduleMap = new Map<string, TableOutput[]>();
  const allSchemas = new Set<string>();

  for (const t of tables) {
    const prefix = detectPrefix(t.name, t.schema);
    const fullName = `${t.schema}.${t.name}`;
    allSchemas.add(t.schema);

    // PK info — get columns from the index data if available
    const pkConstraints = pkByParent.get(fullName) || [];
    const hasPK = pkConstraints.length > 0;
    let primaryKeyColumns: string[] = [];
    if (hasPK) {
      // Find the PK index to get the key columns
      const tableIndexes = indexByTable.get(fullName) || [];
      const pkIndex = tableIndexes.find((idx) => idx.isPrimaryKey);
      if (pkIndex) {
        primaryKeyColumns = pkIndex.keyColumns;
      }
    }

    // FK info
    const fkConstraints = fkByParent.get(fullName) || [];
    const foreignKeys: ForeignKeyOutput[] = fkConstraints.map((fk) => ({
      constraintName: fk.name,
      // For FK constraints, the ParentObjectName IS the child table (owner).
      // The referenced table name is typically embedded in the FK constraint name.
      // We extract it as a best-effort hint.
      referencedTable: extractReferencedTable(fk.name, t.name),
    }));

    // Indexes
    const tableIndexes = indexByTable.get(fullName) || [];
    const indexOutputs: IndexOutput[] = tableIndexes.map((idx) => ({
      name: idx.indexName,
      type: idx.indexType,
      isPrimaryKey: idx.isPrimaryKey,
      isUnique: idx.isUnique,
      isDisabled: idx.isDisabled,
      keyColumns: idx.keyColumns,
      includedColumns: idx.includedColumns,
    }));

    // Check constraints
    const checkConstraints = (checkByParent.get(fullName) || []).map(
      (c) => c.name
    );

    // Default constraints (just the count)
    const defaultConstraints = (defaultByParent.get(fullName) || []).length;

    // Unique constraints
    const uniqueConstraints = (uniqueByParent.get(fullName) || []).map(
      (c) => c.name
    );

    // Triggers
    const tableTriggers = triggerByTable.get(fullName) || [];
    const triggerOutputs: TriggerOutput[] = tableTriggers.map((tr) => ({
      name: tr.name,
      isDisabled: tr.isDisabled,
      isInsteadOf: tr.isInsteadOf,
    }));

    const tableOutput: TableOutput = {
      name: t.name,
      schema: t.schema,
      fullName,
      hasPrimaryKey: hasPK,
      primaryKeyColumns,
      foreignKeys,
      indexes: indexOutputs,
      checkConstraints,
      defaultConstraints,
      uniqueConstraints,
      triggers: triggerOutputs,
    };

    if (!moduleMap.has(prefix)) {
      moduleMap.set(prefix, []);
    }
    moduleMap.get(prefix)!.push(tableOutput);
  }

  // Build module output, sorted by table count descending
  const modules: ModuleOutput[] = Array.from(moduleMap.entries())
    .map(([prefix, moduleTables]) => ({
      prefix,
      displayName: DISPLAY_NAMES[prefix] || prefix,
      tableCount: moduleTables.length,
      tables: moduleTables.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.tableCount - a.tableCount);

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalTables: tables.length,
    schemas: Array.from(allSchemas).sort(),
    modules,
  };
}

/**
 * Best-effort extraction of the referenced table from an FK constraint name.
 *
 * Common patterns:
 *   FK_ChildTable_ReferencedTable          -> ReferencedTable
 *   FK_ChildTable_ColumnName               -> (unknown — column hint)
 *   FK__ChildTbl__Col__HexHash             -> (system-named, no ref table)
 *   ChildTable_ReferencedTable_FK1         -> ReferencedTable
 */
function extractReferencedTable(
  constraintName: string,
  ownerTableName: string
): string {
  // System-generated FK names with double underscores and hex suffix
  if (/^FK__\w+__\w+__[0-9A-Fa-f]+$/.test(constraintName)) {
    return '(system-named)';
  }

  // Pattern: FK_OwnerTable_ReferencedTable or FK_OwnerTable_ReferencedTable_ColumnHint
  // Try to find a known table name after the owner table name
  const prefixed = constraintName.replace(/^FK_/, '');

  // If the constraint starts with the owner table name, strip it
  if (prefixed.startsWith(ownerTableName + '_')) {
    const remainder = prefixed.substring(ownerTableName.length + 1);
    // The remainder could be: ReferencedTable, ColumnName, or ReferencedTable_ColumnHint
    // We return it as-is — downstream consumers can cross-reference against known tables
    return remainder;
  }

  // Pattern: OwnerTable_ReferencedTable_FK1
  if (constraintName.endsWith('_FK1') || constraintName.endsWith('_FK2')) {
    const withoutSuffix = constraintName.replace(/_FK\d+$/, '');
    const parts = withoutSuffix.split('_');
    // Try to find where the owner table prefix ends and referenced table begins
    // This is heuristic — return the full constraint name as the hint
    if (parts.length >= 2) {
      return withoutSuffix;
    }
  }

  // Fallback: return the full constraint name as reference hint
  return constraintName;
}

function pushToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key);
  if (arr) {
    arr.push(value);
  } else {
    map.set(key, [value]);
  }
}

// ---------------------------------------------------------------------------
// Build sprocs-db.json — stored procedures from the database export
// ---------------------------------------------------------------------------

function buildSprocsJson(objects: ProgrammableObject[]) {
  const sps = objects.filter((o) => o.objectType === 'Stored Procedures');

  // Group by schema
  const bySchema: Record<string, string[]> = {};
  for (const sp of sps) {
    if (!bySchema[sp.schema]) bySchema[sp.schema] = [];
    bySchema[sp.schema].push(sp.name);
  }

  // Sort within each schema
  for (const schema of Object.keys(bySchema)) {
    bySchema[schema].sort();
  }

  // Detect prefix patterns in SP names
  const byPrefix: Record<string, number> = {};
  for (const sp of sps) {
    const prefix = sp.name.match(/^((?:sp_|usp_|fn_)?[A-Za-z]+?)_/)?.[1] || '(other)';
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalStoredProcedures: sps.length,
    schemas: Object.keys(bySchema).sort(),
    bySchema,
    byPrefix: Object.fromEntries(
      Object.entries(byPrefix).sort((a, b) => b[1] - a[1])
    ),
    procedures: sps.map((sp) => ({
      name: sp.name,
      schema: sp.schema,
      fullName: `${sp.schema}.${sp.name}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Build functions.json
// ---------------------------------------------------------------------------

function buildFunctionsJson(objects: ProgrammableObject[]) {
  const funcTypes = [
    'Scalar Functions',
    'Table Valued Functions',
    'Inline Table Valued Functions',
    'CLR Scalar Functions',
  ];
  const funcs = objects.filter((o) => funcTypes.includes(o.objectType));

  const byType: Record<string, Array<{ name: string; schema: string; fullName: string }>> = {};
  for (const f of funcs) {
    if (!byType[f.objectType]) byType[f.objectType] = [];
    byType[f.objectType].push({
      name: f.name,
      schema: f.schema,
      fullName: `${f.schema}.${f.name}`,
    });
  }

  // Sort within each type
  for (const type of Object.keys(byType)) {
    byType[type].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalFunctions: funcs.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, fns]) => [
        type,
        { count: fns.length, functions: fns },
      ])
    ),
  };
}

// ---------------------------------------------------------------------------
// Build views.json
// ---------------------------------------------------------------------------

function buildViewsJson(objects: ProgrammableObject[]) {
  const views = objects.filter((o) => o.objectType === 'Views');

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalViews: views.length,
    views: views
      .map((v) => ({
        name: v.name,
        schema: v.schema,
        fullName: `${v.schema}.${v.name}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ---------------------------------------------------------------------------
// Build constraints.json
// ---------------------------------------------------------------------------

function buildConstraintsJson(constraints: ConstraintRow[]) {
  const byType: Record<
    string,
    Array<{
      name: string;
      schema: string;
      parentTable: string;
      parentSchema: string;
    }>
  > = {};

  for (const c of constraints) {
    if (!byType[c.objectType]) byType[c.objectType] = [];
    byType[c.objectType].push({
      name: c.name,
      schema: c.schema,
      parentTable: c.parentTable,
      parentSchema: c.parentSchema,
    });
  }

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalConstraints: constraints.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, items]) => [
        type,
        { count: items.length, constraints: items },
      ])
    ),
  };
}

// ---------------------------------------------------------------------------
// Build indexes.json
// ---------------------------------------------------------------------------

function buildIndexesJson(indexes: IndexRow[]) {
  // Group by type
  const byType: Record<string, number> = {};
  for (const idx of indexes) {
    byType[idx.indexType] = (byType[idx.indexType] || 0) + 1;
  }

  const stats = {
    totalPrimaryKeys: indexes.filter((i) => i.isPrimaryKey).length,
    totalUniqueIndexes: indexes.filter((i) => i.isUnique).length,
    totalDisabledIndexes: indexes.filter((i) => i.isDisabled).length,
    totalWithIncludedColumns: indexes.filter(
      (i) => i.includedColumns.length > 0
    ).length,
  };

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalIndexes: indexes.length,
    byType,
    stats,
    indexes: indexes.map((idx) => ({
      schema: idx.schema,
      tableName: idx.tableName,
      fullTableName: `${idx.schema}.${idx.tableName}`,
      indexName: idx.indexName,
      indexType: idx.indexType,
      isPrimaryKey: idx.isPrimaryKey,
      isUnique: idx.isUnique,
      isDisabled: idx.isDisabled,
      keyColumns: idx.keyColumns,
      includedColumns: idx.includedColumns,
    })),
  };
}

// ---------------------------------------------------------------------------
// Build triggers.json
// ---------------------------------------------------------------------------

function buildTriggersJson(triggers: TriggerRow[]) {
  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalTriggers: triggers.length,
    disabledCount: triggers.filter((t) => t.isDisabled).length,
    insteadOfCount: triggers.filter((t) => t.isInsteadOf).length,
    triggers: triggers.map((t) => ({
      name: t.name,
      schema: t.schema,
      parentTable: t.parentTable,
      parentSchema: t.parentSchema,
      fullParentTable: `${t.parentSchema}.${t.parentTable}`,
      isDisabled: t.isDisabled,
      isInsteadOf: t.isInsteadOf,
    })),
  };
}

// ---------------------------------------------------------------------------
// Build types.json
// ---------------------------------------------------------------------------

function buildTypesJson(udts: UdtRow[], tableTypes: TableTypeRow[]) {
  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    totalUserDefinedTypes: udts.length,
    totalTableTypes: tableTypes.length,
    userDefinedTypes: udts.map((u) => ({
      name: u.name,
      schema: u.schema,
      systemType: u.systemType,
      maxLength: u.maxLength,
      precision: u.precision,
      scale: u.scale,
    })),
    tableTypes: tableTypes.map((t) => ({
      name: t.name,
      schema: t.schema,
    })),
  };
}

// ---------------------------------------------------------------------------
// Build summary.json
// ---------------------------------------------------------------------------

function buildSummaryJson(
  objectCounts: Array<{ objectType: string; count: number }>,
  tablesJson: TablesJson,
  partitions: PartitionRow[]
) {
  const modulesSummary = tablesJson.modules.map((m) => ({
    prefix: m.prefix,
    displayName: m.displayName,
    tableCount: m.tableCount,
  }));

  return {
    exportDate: '2026-02-26',
    source: 'MyEvaluationsDatabaseSchema_20260226.xlsx',
    objectCounts: Object.fromEntries(
      objectCounts.map((c) => [c.objectType, c.count])
    ),
    schemas: tablesJson.schemas,
    moduleCount: tablesJson.modules.length,
    modules: modulesSummary,
    partitions,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log(
    `Parsing database schema from input/MyEvaluationsDatabaseSchema_20260226.xlsx...`
  );

  // Verify input file exists
  try {
    await fs.access(INPUT_FILE);
  } catch {
    console.error(`Error: Input file not found at ${INPUT_FILE}`);
    console.error('Place the Excel export in the input/ directory first.');
    process.exit(1);
  }

  // Read workbook
  const wb = XLSX.readFile(INPUT_FILE);

  // Parse all sheets
  const objectCounts = parseObjectCounts(wb.Sheets['ObjectsCountByType']);
  console.log(
    `  Sheet 'ObjectsCountByType': ${objectCounts.length} object types`
  );

  const programmableObjects = parseProgrammableObjects(
    wb.Sheets['Programable Objects']
  );
  const objTypeCounts: Record<string, number> = {};
  for (const o of programmableObjects) {
    objTypeCounts[o.objectType] = (objTypeCounts[o.objectType] || 0) + 1;
  }
  const objSummary = Object.entries(objTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${fmt(count)} ${type.toLowerCase()}`)
    .join(', ');
  console.log(
    `  Sheet 'Programable Objects': ${fmt(programmableObjects.length)} objects (${objSummary})`
  );

  const constraints = parseConstraints(wb.Sheets['ConstraintsAndKeys']);
  const constraintTypeCounts: Record<string, number> = {};
  for (const c of constraints) {
    constraintTypeCounts[c.objectType] =
      (constraintTypeCounts[c.objectType] || 0) + 1;
  }
  const conSummary = Object.entries(constraintTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${fmt(count)} ${type.toLowerCase()}`)
    .join(', ');
  console.log(
    `  Sheet 'ConstraintsAndKeys': ${fmt(constraints.length)} constraints (${conSummary})`
  );

  const triggers = parseTriggers(wb.Sheets['Triggers']);
  console.log(
    `  Sheet 'Triggers': ${triggers.length} triggers`
  );

  const udts = parseUdts(wb.Sheets['UserDefined_DataTypes']);
  console.log(
    `  Sheet 'UserDefined_DataTypes': ${udts.length} user-defined types`
  );

  const tableTypes = parseTableTypes(wb.Sheets['UserDefined_TypeTables']);
  console.log(
    `  Sheet 'UserDefined_TypeTables': ${tableTypes.length} table types`
  );

  const indexes = parseIndexes(wb.Sheets['Indexes']);
  console.log(
    `  Sheet 'Indexes': ${fmt(indexes.length)} indexes`
  );

  const partitions = parsePartitions(wb.Sheets['TablePartition']);
  console.log(
    `  Sheet 'TablePartition': ${partitions.length} partitioned tables`
  );

  // Build output JSONs
  console.log('');

  const tablesJson = buildTablesJson(
    programmableObjects,
    constraints,
    indexes,
    triggers
  );
  console.log(
    `Grouped ${fmt(tablesJson.totalTables)} tables into ${tablesJson.modules.length} modules`
  );

  // Create output directory
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Write all output files
  const outputs: Array<{
    filename: string;
    data: unknown;
    description: string;
  }> = [
    {
      filename: 'tables.json',
      data: tablesJson,
      description: `${fmt(tablesJson.totalTables)} tables`,
    },
    {
      filename: 'sprocs-db.json',
      data: buildSprocsJson(programmableObjects),
      description: `${fmt(objTypeCounts['Stored Procedures'] || 0)} stored procedures`,
    },
    {
      filename: 'functions.json',
      data: buildFunctionsJson(programmableObjects),
      description: `${fmt((objTypeCounts['Scalar Functions'] || 0) + (objTypeCounts['Table Valued Functions'] || 0) + (objTypeCounts['Inline Table Valued Functions'] || 0) + (objTypeCounts['CLR Scalar Functions'] || 0))} functions`,
    },
    {
      filename: 'views.json',
      data: buildViewsJson(programmableObjects),
      description: `${fmt(objTypeCounts['Views'] || 0)} views`,
    },
    {
      filename: 'constraints.json',
      data: buildConstraintsJson(constraints),
      description: `${fmt(constraints.length)} constraints`,
    },
    {
      filename: 'indexes.json',
      data: buildIndexesJson(indexes),
      description: `${fmt(indexes.length)} indexes`,
    },
    {
      filename: 'triggers.json',
      data: buildTriggersJson(triggers),
      description: `${triggers.length} triggers`,
    },
    {
      filename: 'types.json',
      data: buildTypesJson(udts, tableTypes),
      description: `${udts.length} UDTs + ${tableTypes.length} table types`,
    },
    {
      filename: 'summary.json',
      data: buildSummaryJson(objectCounts, tablesJson, partitions),
      description: 'summary',
    },
  ];

  for (const output of outputs) {
    const filePath = path.join(OUTPUT_DIR, output.filename);
    await fs.writeFile(filePath, JSON.stringify(output.data, null, 2), 'utf-8');
    console.log(
      `Written: generated/db-schema/${output.filename} (${output.description})`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s`);
}

main().catch((err) => {
  console.error('Fatal error parsing database schema:', err);
  process.exit(1);
});
