import React, { useState, useMemo } from 'react';

interface TableEntry {
  name: string;
  schema: string;
  fullName: string;
  hasPrimaryKey: boolean;
  primaryKeyColumns: string[];
  columns?: Array<{
    name: string;
    dataType: string;
    rawType: string;
    maxLength: string | null;
    isNullable: boolean;
    isIdentity: boolean;
    isPrimaryKey: boolean;
    defaultValue: string | null;
    ordinalPosition: number;
  }>;
  foreignKeys: Array<{
    constraintName: string;
    referencedTable: string;
    columns?: string[];
    referencedColumns?: string[];
  }>;
  indexes: Array<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isUnique: boolean;
    isDisabled: boolean;
    keyColumns: string[];
    includedColumns: string[];
  }>;
  checkConstraints: string[];
  defaultConstraints: number;
  triggers: string[];
  // AI-enriched fields (optional)
  summary?: string;
  businessPurpose?: string;
  dataSensitivity?: string;
  migrationRelevance?: string;
  migrationNote?: string;
  complexity?: string;
  relatedSprocs?: string[];
  relatedFiles?: string[];
  keyRelationships?: string[];
  keyColumns?: string[];
}

interface TableDetailProps {
  tables: TableEntry[];
  moduleOverview?: string;
  keyWorkflows?: string[];
  schemaHealthNotes?: string[];
  generatedAt?: string;
}

const COMPLEXITY_ORDER = ['trivial', 'simple', 'moderate', 'complex', 'very-complex'];
const MIGRATION_ORDER = ['none', 'low', 'medium', 'high'];

const COMPLEXITY_COLORS: Record<string, string> = {
  'trivial': '#22c55e',
  'simple': '#84cc16',
  'moderate': '#eab308',
  'complex': '#f97316',
  'very-complex': '#ef4444',
};

const MIGRATION_COLORS: Record<string, string> = {
  'high': '#ef4444',
  'medium': '#f97316',
  'low': '#eab308',
  'none': '#6b7280',
};

const SENSITIVITY_COLORS: Record<string, string> = {
  'phi': '#ef4444',
  'pii': '#f97316',
  'financial': '#eab308',
  'internal': '#3b82f6',
  'public': '#22c55e',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}

function TableDetailRow({ table, isExpanded, onToggle }: {
  table: TableEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const nonPkIndexes = table.indexes.filter((idx) => !idx.isPrimaryKey);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        title="Click to expand details"
      >
        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-word', minWidth: '140px' }}>
          <span style={{ marginRight: '4px' }}>{isExpanded ? '▼' : '▶'}</span>
          {table.fullName}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
          {table.columns ? table.columns.length : '--'}
        </td>
        <td style={{ textAlign: 'center' }}>
          {table.hasPrimaryKey ? (
            <span style={{ color: '#22c55e', fontWeight: 600 }} title="Has primary key">Yes</span>
          ) : (
            <span style={{ color: '#ef4444', fontWeight: 600 }} title="No primary key">No</span>
          )}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {table.foreignKeys.length}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {nonPkIndexes.length}
        </td>
        <td>
          {table.complexity ? (
            <Badge
              label={table.complexity}
              color={COMPLEXITY_COLORS[table.complexity] || '#6b7280'}
            />
          ) : (
            <span style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.8rem' }}>--</span>
          )}
        </td>
        <td>
          {table.migrationRelevance ? (
            <Badge
              label={table.migrationRelevance}
              color={MIGRATION_COLORS[table.migrationRelevance] || '#6b7280'}
            />
          ) : (
            <span style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.8rem' }}>--</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} style={{ padding: '12px 16px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)' }}>
            {/* Column definitions sub-table */}
            {table.columns && table.columns.length > 0 && (
              <details style={{ marginBottom: '10px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>
                  Columns ({table.columns.length})
                </summary>
                <div style={{ overflowX: 'auto', marginTop: '4px' }}>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--ifm-color-emphasis-200)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px', width: '30px' }}>#</th>
                        <th style={{ padding: '4px 8px' }}>Column</th>
                        <th style={{ padding: '4px 8px' }}>Type</th>
                        <th style={{ padding: '4px 8px', width: '40px' }}>Null</th>
                        <th style={{ padding: '4px 8px' }}>Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...table.columns]
                        .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
                        .map((col) => (
                          <tr key={col.name} style={{ borderBottom: '1px solid var(--ifm-color-emphasis-100)' }}>
                            <td style={{ padding: '3px 8px', color: 'var(--ifm-color-emphasis-500)', fontSize: '0.75rem' }}>
                              {col.ordinalPosition}
                            </td>
                            <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {col.isPrimaryKey && <span title="Primary Key" style={{ marginRight: '2px' }}>&#128273;</span>}
                              {col.isIdentity && <span title="Identity (auto-increment)" style={{ color: '#722ed1', marginRight: '2px' }}>&#9889;</span>}
                              {col.name}
                            </td>
                            <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {col.dataType}{col.maxLength ? `(${col.maxLength})` : ''}
                              {col.rawType !== col.dataType && (
                                <span style={{ color: 'var(--ifm-color-emphasis-500)', marginLeft: '4px', fontSize: '0.75rem' }} title={`UDT: ${col.rawType}`}>
                                  &larr; {col.rawType}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '3px 8px' }}>
                              {col.isNullable
                                ? <span style={{ color: 'var(--ifm-color-emphasis-500)' }}>yes</span>
                                : <span style={{ fontWeight: 600 }}>NO</span>}
                            </td>
                            <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)' }}>
                              {col.defaultValue ?? ''}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Left column */}
              <div>
                {table.summary && (
                  <>
                    <strong>Summary:</strong> {table.summary}
                    <br />
                  </>
                )}
                {table.businessPurpose && (
                  <>
                    <strong>Business Purpose:</strong> {table.businessPurpose}
                    <br />
                  </>
                )}
                {table.migrationNote && (
                  <>
                    <strong>Migration Note:</strong> {table.migrationNote}
                    <br />
                  </>
                )}
                {table.dataSensitivity && (
                  <div style={{ marginTop: '6px' }}>
                    <strong>Data Sensitivity:</strong>{' '}
                    <Badge
                      label={table.dataSensitivity}
                      color={SENSITIVITY_COLORS[table.dataSensitivity.toLowerCase()] || '#6b7280'}
                    />
                  </div>
                )}
                {table.keyRelationships && table.keyRelationships.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    <strong>Key Relationships:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {table.keyRelationships.map((rel, i) => (
                        <li key={`${table.fullName}-rel-${i}`}>{rel}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div>
                {table.primaryKeyColumns.length > 0 && (
                  <>
                    <strong>Primary Key:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.primaryKeyColumns.join(', ')}
                    </span>
                    <br />
                  </>
                )}
                {table.keyColumns && table.keyColumns.length > 0 && (
                  <>
                    <strong>Key Columns:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.keyColumns.join(', ')}
                    </span>
                    <br />
                  </>
                )}
                {table.foreignKeys.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Foreign Keys ({table.foreignKeys.length}):</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {table.foreignKeys.slice(0, 10).map((fk, i) => (
                        <li key={`${table.fullName}-fk-${i}`}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {fk.columns ? fk.columns.join(', ') : fk.constraintName}
                          </span>
                          {' '}&rarr;{' '}
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {fk.referencedTable}{fk.referencedColumns ? `.${fk.referencedColumns.join(', ')}` : ''}
                          </span>
                        </li>
                      ))}
                      {table.foreignKeys.length > 10 && (
                        <li style={{ fontStyle: 'italic' }}>+{table.foreignKeys.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {nonPkIndexes.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Indexes:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {nonPkIndexes.slice(0, 8).map((idx, i) => (
                        <li key={`${table.fullName}-idx-${i}`}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{idx.name}</span>
                          {idx.isUnique && <Badge label="UNIQUE" color="#8b5cf6" />}
                          {idx.isDisabled && <Badge label="DISABLED" color="#6b7280" />}
                          <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginLeft: '4px' }}>
                            ({idx.keyColumns.join(', ')})
                          </span>
                        </li>
                      ))}
                      {nonPkIndexes.length > 8 && (
                        <li style={{ fontStyle: 'italic' }}>+{nonPkIndexes.length - 8} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {table.triggers.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Triggers:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.triggers.join(', ')}
                    </span>
                  </div>
                )}
                {table.checkConstraints.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <strong>Check Constraints:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.checkConstraints.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom row: related SPs and files */}
            {((table.relatedSprocs && table.relatedSprocs.length > 0) || (table.relatedFiles && table.relatedFiles.length > 0)) && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {table.relatedSprocs && table.relatedSprocs.length > 0 && (
                  <div>
                    <strong>Related Stored Procedures:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.relatedSprocs.join(', ')}
                    </span>
                  </div>
                )}
                {table.relatedFiles && table.relatedFiles.length > 0 && (
                  <div>
                    <strong>Related Files:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {table.relatedFiles.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

type SortField = 'name' | 'hasPrimaryKey' | 'foreignKeys' | 'indexes' | 'complexity' | 'migrationRelevance';

export default function TableDetail({
  tables,
  moduleOverview,
  keyWorkflows,
  schemaHealthNotes,
  generatedAt,
}: TableDetailProps) {
  const data = tables && tables.length > 0 ? tables : [];

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');
  const [filterMigration, setFilterMigration] = useState<string>('all');
  const [filterHasPK, setFilterHasPK] = useState<string>('all');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [exportCopied, setExportCopied] = useState(false);

  const toggleExpand = (fullName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else {
        next.add(fullName);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = data.filter((t) => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        (t.summary && t.summary.toLowerCase().includes(search.toLowerCase()));
      const matchesComplexity = filterComplexity === 'all' || t.complexity === filterComplexity;
      const matchesMigration = filterMigration === 'all' || t.migrationRelevance === filterMigration;
      const matchesHasPK =
        filterHasPK === 'all' ||
        (filterHasPK === 'yes' && t.hasPrimaryKey) ||
        (filterHasPK === 'no' && !t.hasPrimaryKey);
      return matchesSearch && matchesComplexity && matchesMigration && matchesHasPK;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.fullName.localeCompare(b.fullName);
          break;
        case 'hasPrimaryKey':
          cmp = (a.hasPrimaryKey ? 1 : 0) - (b.hasPrimaryKey ? 1 : 0);
          break;
        case 'foreignKeys':
          cmp = a.foreignKeys.length - b.foreignKeys.length;
          break;
        case 'indexes':
          cmp = a.indexes.filter((i) => !i.isPrimaryKey).length - b.indexes.filter((i) => !i.isPrimaryKey).length;
          break;
        case 'complexity':
          cmp = COMPLEXITY_ORDER.indexOf(a.complexity || '') - COMPLEXITY_ORDER.indexOf(b.complexity || '');
          break;
        case 'migrationRelevance':
          cmp = MIGRATION_ORDER.indexOf(a.migrationRelevance || '') - MIGRATION_ORDER.indexOf(b.migrationRelevance || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, search, sortField, sortDir, filterComplexity, filterMigration, filterHasPK]);

  const complexities = [...new Set(data.map((t) => t.complexity).filter(Boolean))] as string[];
  const migrations = [...new Set(data.map((t) => t.migrationRelevance).filter(Boolean))] as string[];

  const handleExport = () => {
    const lines = [
      `## Tables to Review (${filtered.length} tables)`,
      '',
      ...filtered.map((t) => {
        const pkLabel = t.hasPrimaryKey ? 'PK' : 'NO-PK';
        const complexLabel = t.complexity ? ` (${t.complexity})` : '';
        const summaryLabel = t.summary ? ` -- ${t.summary}` : '';
        return `- [ ] ${t.fullName} [${pkLabel}]${complexLabel}${summaryLabel}`;
      }),
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    }).catch(() => {
      setExportCopied(false);
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  // Summary stats
  const { pkCount, pkPct, totalFKs, totalIndexes, totalColumns, complexityDist, migrationDist } = useMemo(() => {
    const pkCount = data.filter((t) => t.hasPrimaryKey).length;
    const pkPct = data.length > 0 ? Math.round((pkCount / data.length) * 100) : 0;
    const totalFKs = data.reduce((s, t) => s + t.foreignKeys.length, 0);
    const totalIndexes = data.reduce((s, t) => s + t.indexes.filter((i) => !i.isPrimaryKey).length, 0);
    const totalColumns = data.reduce((s, t) => s + (t.columns?.length ?? 0), 0);
    const complexityDist = COMPLEXITY_ORDER.map((c) => ({
      label: c,
      count: data.filter((t) => t.complexity === c).length,
      color: COMPLEXITY_COLORS[c],
    })).filter((d) => d.count > 0);
    const migrationDist = [...MIGRATION_ORDER].reverse().map((m) => ({
      label: m,
      count: data.filter((t) => t.migrationRelevance === m).length,
      color: MIGRATION_COLORS[m],
    })).filter((d) => d.count > 0);
    return { pkCount, pkPct, totalFKs, totalIndexes, totalColumns, complexityDist, migrationDist };
  }, [data]);

  const enrichedDate = generatedAt ? new Date(generatedAt) : null;
  const enrichedLabel = enrichedDate
    ? enrichedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div>
      {enrichedLabel && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <span
            title={`Generated on ${enrichedLabel}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '0.72rem',
              backgroundColor: 'var(--ifm-color-emphasis-100)',
              color: 'var(--ifm-color-emphasis-600)',
              border: '1px solid var(--ifm-color-emphasis-200)',
            }}
          >
            Generated: {enrichedLabel}
          </span>
        </div>
      )}

      {data.length === 0 && (
        <div
          style={{
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #f59e0b',
            fontSize: '0.9rem',
          }}
        >
          No table data available. Run the schema extraction pipeline to populate.
        </div>
      )}

      {/* Stats cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          marginBottom: '16px',
        }}
      >
        {/* Total tables card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Tables</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{data.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>
            PK coverage: {pkPct}% ({pkCount}/{data.length})
          </div>
        </div>

        {/* Columns card */}
        {totalColumns > 0 && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Columns</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{totalColumns.toLocaleString()}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>
              avg {data.length > 0 ? Math.round(totalColumns / data.length) : 0} per table
            </div>
          </div>
        )}

        {/* FK count card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Foreign Keys</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{totalFKs.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>across all tables</div>
        </div>

        {/* Index count card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Indexes</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{totalIndexes.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>non-PK indexes</div>
        </div>

        {/* Complexity breakdown card */}
        {complexityDist.length > 0 && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px' }}>Complexity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {complexityDist.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ifm-color-emphasis-700)', minWidth: '80px' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Migration breakdown card */}
        {migrationDist.length > 0 && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px' }}>Migration Priority</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {migrationDist.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ifm-color-emphasis-700)', minWidth: '55px' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter status card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Showing</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{filtered.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>of {data.length} tables</div>
        </div>
      </div>

      {/* Schema health notes */}
      {schemaHealthNotes && schemaHealthNotes.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '12px',
            backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)',
            borderRadius: '8px',
            border: '1px solid var(--ifm-color-emphasis-200)',
            fontSize: '0.85rem',
          }}
        >
          <strong>Schema Health Notes:</strong>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
            {schemaHealthNotes.map((note, i) => (
              <li key={`health-${i}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search tables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--ifm-color-emphasis-300)',
            fontSize: '0.85rem',
            minWidth: '200px',
          }}
        />
        <select
          value={filterMigration}
          onChange={(e) => setFilterMigration(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Migration</option>
          {migrations.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select
          value={filterComplexity}
          onChange={(e) => setFilterComplexity(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Complexity</option>
          {complexities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterHasPK}
          onChange={(e) => setFilterHasPK(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">Has PK</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <button
          onClick={handleExport}
          title="Copy filtered tables as a Markdown checklist to clipboard"
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--ifm-color-emphasis-300)',
            fontSize: '0.85rem',
            cursor: 'pointer',
            backgroundColor: exportCopied ? '#22c55e20' : 'var(--ifm-background-color)',
            color: exportCopied ? '#16a34a' : 'var(--ifm-font-color-base)',
            transition: 'background-color 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {exportCopied ? 'Copied!' : 'Export Checklist'}
        </button>
      </div>

      {/* Table */}
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'auto' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--ifm-color-emphasis-300)' }}>
              <th
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}
                onClick={() => handleSort('name')}
              >
                Table{sortIndicator('name')}
              </th>
              <th style={{ textAlign: 'right', padding: '8px' }}>
                Cols
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'center', padding: '8px' }}
                onClick={() => handleSort('hasPrimaryKey')}
              >
                PK{sortIndicator('hasPrimaryKey')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'right', padding: '8px' }}
                onClick={() => handleSort('foreignKeys')}
              >
                FKs{sortIndicator('foreignKeys')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'right', padding: '8px' }}
                onClick={() => handleSort('indexes')}
              >
                Indexes{sortIndicator('indexes')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}
                onClick={() => handleSort('complexity')}
              >
                Complexity{sortIndicator('complexity')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}
                onClick={() => handleSort('migrationRelevance')}
              >
                Migration{sortIndicator('migrationRelevance')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((table) => (
              <TableDetailRow
                key={table.fullName}
                table={table}
                isExpanded={expandedTables.has(table.fullName)}
                onToggle={() => toggleExpand(table.fullName)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && data.length > 0 && (
        <p style={{ textAlign: 'center', padding: '24px', color: 'var(--ifm-color-emphasis-600)' }}>
          No tables match the current filters.
        </p>
      )}
    </div>
  );
}
