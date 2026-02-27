import React, { useState, useEffect, useMemo } from 'react';

interface ModuleHealth {
  module: string;
  tableCount: number;
  pkCoverage: number;
  indexCoverage: number;
  avgIndexesPerTable: number;
  fkCount: number;
}

interface NamingInconsistency {
  canonical: string;
  variants: string[];
  counts: Record<string, number>;
}

interface TableIssue {
  name: string;
  module: string;
}

interface SchemaHealthProps {
  totalTables?: number;
  tablesWithPK?: number;
  tablesWithIndex?: number;
  disabledIndexes?: number;
  totalIndexes?: number;
  totalFKs?: number;
  namingInconsistencies?: NamingInconsistency[];
  tablesWithoutPK?: TableIssue[];
  tablesWithoutIndex?: TableIssue[];
  moduleHealth?: ModuleHealth[];
}

type SortKey = 'module' | 'tableCount' | 'pkCoverage' | 'indexCoverage' | 'avgIndexesPerTable' | 'fkCount';
type SortDir = 'asc' | 'desc';

function pctColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

function pctBg(pct: number): string {
  if (pct >= 80) return 'rgba(34,197,94,0.12)';
  if (pct >= 50) return 'rgba(234,179,8,0.12)';
  return 'rgba(239,68,68,0.12)';
}

function groupByModule(items: TableIssue[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const item of items) {
    const key = item.module || 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item.name);
  }
  return groups;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        transition: 'transform 0.2s',
        transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        marginRight: '8px',
        fontSize: '0.85em',
      }}
    >
      &#9654;
    </span>
  );
}

function WarningIcon() {
  return (
    <span style={{ color: '#eab308', marginRight: '6px', fontSize: '1em' }} aria-hidden="true">
      &#9888;
    </span>
  );
}

export default function SchemaHealth(props: SchemaHealthProps) {
  const [data, setData] = useState<SchemaHealthProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('module');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [namingOpen, setNamingOpen] = useState(false);
  const [noPkOpen, setNoPkOpen] = useState(false);
  const [noIdxOpen, setNoIdxOpen] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const hasProps = props.totalTables !== undefined;

  useEffect(() => {
    setMounted(true);
    if (hasProps) {
      setData(props);
      setLoading(false);
      return;
    }
    fetch('/schema-health-data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: any) => {
        // Normalize JSON field names to match component interface
        const normalized: SchemaHealthProps = {
          totalTables: json.totalTables ?? 0,
          tablesWithPK: json.stats?.tablesWithPK ?? json.tablesWithPK ?? 0,
          tablesWithIndex: json.stats?.tablesWithIndex ?? json.tablesWithIndex ?? 0,
          disabledIndexes: json.stats?.totalDisabledIndexes ?? (Array.isArray(json.disabledIndexes) ? json.disabledIndexes.length : json.disabledIndexes) ?? 0,
          totalIndexes: json.stats?.totalIndexes ?? json.totalIndexes ?? 0,
          totalFKs: json.stats?.totalFKs ?? json.totalFKs ?? 0,
          namingInconsistencies: (json.namingIssues || json.namingInconsistencies || []).map((n: any) => ({
            canonical: n.canonical ?? n.name ?? '',
            variants: n.variants ?? [],
            counts: n.counts ?? {},
          })),
          tablesWithoutPK: (json.tablesNoPK || json.tablesWithoutPK || []).map((t: any) => ({
            name: t.name,
            module: t.module ?? t.schema ?? '',
          })),
          tablesWithoutIndex: (json.tablesNoIndex || json.tablesWithoutIndex || []).map((t: any) => ({
            name: t.name,
            module: t.module ?? t.schema ?? '',
          })),
          moduleHealth: json.moduleHealth ?? [],
        };
        setData(normalized);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [hasProps]);

  // Update data when props change
  useEffect(() => {
    if (hasProps) setData(props);
  }, [props, hasProps]);

  const sortedModules = useMemo(() => {
    if (!data?.moduleHealth) return [];
    const sorted = [...data.moduleHealth];
    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? diff : -diff;
    });
    return sorted;
  }, [data?.moduleHealth, sortKey, sortDir]);

  const noPkGroups = useMemo(() => groupByModule(data?.tablesWithoutPK || []), [data?.tablesWithoutPK]);
  const noIdxGroups = useMemo(() => groupByModule(data?.tablesWithoutIndex || []), [data?.tablesWithoutIndex]);

  if (!mounted || loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>
        Loading schema health data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#ef4444' }}>
        Failed to load schema health data: {error}
      </div>
    );
  }

  if (!data) return null;

  const {
    totalTables = 0,
    tablesWithPK = 0,
    tablesWithIndex = 0,
    disabledIndexes = 0,
    totalFKs = 0,
    namingInconsistencies = [],
    tablesWithoutPK = [],
    tablesWithoutIndex = [],
  } = data;

  const pkPct = totalTables > 0 ? Math.round((tablesWithPK / totalTables) * 100) : 0;
  const idxPct = totalTables > 0 ? Math.round((tablesWithIndex / totalTables) * 100) : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'module' ? 'asc' : 'desc');
    }
  }

  function toggleModule(mod: string) {
    setExpandedModules((prev) => ({ ...prev, [mod]: !prev[mod] }));
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // --- Styles ---

  const cardStyle: React.CSSProperties = {
    flex: '1 1 200px',
    background: '#1e1e1e',
    borderRadius: '8px',
    padding: '16px 20px',
    minWidth: '180px',
  };

  const cardLabelStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    color: 'var(--ifm-color-emphasis-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
  };

  const cardValueStyle: React.CSSProperties = {
    fontSize: '1.8rem',
    fontWeight: 700,
    lineHeight: 1.1,
  };

  const cardSubStyle: React.CSSProperties = {
    fontSize: '0.82rem',
    color: 'var(--ifm-color-emphasis-500)',
    marginTop: '4px',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '12px 16px',
    background: 'var(--ifm-color-emphasis-100)',
    borderRadius: '8px',
    marginTop: '24px',
    userSelect: 'none',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'var(--ifm-font-color-base)',
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.82rem',
    color: 'var(--ifm-color-emphasis-600)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    borderBottom: '2px solid var(--ifm-color-emphasis-200)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: '0.88rem',
    borderBottom: '1px solid var(--ifm-color-emphasis-100)',
  };

  return (
    <div style={{ fontFamily: 'var(--ifm-font-family-base)' }}>
      {/* === Stats Cards === */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        {/* PK Coverage */}
        <div style={{ ...cardStyle, borderLeft: `4px solid ${pctColor(pkPct)}` }}>
          <div style={cardLabelStyle}>Primary Key Coverage</div>
          <div style={{ ...cardValueStyle, color: pctColor(pkPct) }}>{pkPct}%</div>
          <div style={cardSubStyle}>
            {tablesWithPK} / {totalTables} tables
          </div>
        </div>

        {/* Index Coverage */}
        <div style={{ ...cardStyle, borderLeft: `4px solid ${pctColor(idxPct)}` }}>
          <div style={cardLabelStyle}>Index Coverage</div>
          <div style={{ ...cardValueStyle, color: pctColor(idxPct) }}>{idxPct}%</div>
          <div style={cardSubStyle}>
            {tablesWithIndex} / {totalTables} tables
          </div>
        </div>

        {/* Disabled Indexes */}
        <div
          style={{
            ...cardStyle,
            borderLeft: `4px solid ${disabledIndexes > 0 ? '#eab308' : '#22c55e'}`,
          }}
        >
          <div style={cardLabelStyle}>Disabled Indexes</div>
          <div
            style={{
              ...cardValueStyle,
              color: disabledIndexes > 0 ? '#eab308' : '#22c55e',
            }}
          >
            {disabledIndexes}
          </div>
          <div style={cardSubStyle}>
            {disabledIndexes > 0 ? 'Need attention' : 'All indexes active'}
          </div>
        </div>

        {/* Total FKs */}
        <div style={{ ...cardStyle, borderLeft: '4px solid #3b82f6' }}>
          <div style={cardLabelStyle}>Foreign Keys</div>
          <div style={{ ...cardValueStyle, color: '#3b82f6' }}>{totalFKs.toLocaleString()}</div>
          <div style={cardSubStyle}>Referential constraints</div>
        </div>
      </div>

      {/* === Module Health Table === */}
      {sortedModules.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>
            Module Health
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.88rem',
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('module')}>
                    Module{sortIndicator('module')}
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('tableCount')}>
                    Tables{sortIndicator('tableCount')}
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('pkCoverage')}>
                    PK Coverage{sortIndicator('pkCoverage')}
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('indexCoverage')}>
                    Index Coverage{sortIndicator('indexCoverage')}
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('avgIndexesPerTable')}>
                    Avg Idx/Table{sortIndicator('avgIndexesPerTable')}
                  </th>
                  <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('fkCount')}>
                    FKs{sortIndicator('fkCount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedModules.map((row, i) => (
                  <tr
                    key={row.module}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'var(--ifm-color-emphasis-100)',
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.module}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{row.tableCount}</td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: pctColor(row.pkCoverage),
                        background: pctBg(row.pkCoverage),
                        fontWeight: 600,
                      }}
                    >
                      {row.pkCoverage}%
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        color: pctColor(row.indexCoverage),
                        background: pctBg(row.indexCoverage),
                        fontWeight: 600,
                      }}
                    >
                      {row.indexCoverage}%
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      {row.avgIndexesPerTable.toFixed(1)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{row.fkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === Naming Inconsistencies === */}
      {namingInconsistencies.length > 0 && (
        <div>
          <div style={sectionHeaderStyle} onClick={() => setNamingOpen((o) => !o)}>
            <ChevronIcon open={namingOpen} />
            <WarningIcon />
            Naming Inconsistencies
            <span
              style={{
                marginLeft: '8px',
                background: '#eab308',
                color: '#000',
                borderRadius: '12px',
                padding: '2px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {namingInconsistencies.length}
            </span>
          </div>
          {namingOpen && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--ifm-color-emphasis-100)',
                borderRadius: '0 0 8px 8px',
                marginTop: '-4px',
              }}
            >
              {namingInconsistencies.map((ni) => (
                <div
                  key={ni.canonical}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--ifm-color-emphasis-200)',
                    fontSize: '0.88rem',
                  }}
                >
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                    {ni.canonical}:
                  </span>{' '}
                  {ni.variants.map((v, vi) => (
                    <span key={v}>
                      {vi > 0 && ', '}
                      <code
                        style={{
                          background: 'var(--ifm-color-emphasis-200)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '0.82rem',
                        }}
                      >
                        {v}
                      </code>
                      <span style={{ color: 'var(--ifm-color-emphasis-500)', fontSize: '0.78rem', marginLeft: '2px' }}>
                        ({ni.counts[v] ?? 0})
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === Tables Without PK === */}
      {tablesWithoutPK.length > 0 && (
        <div>
          <div style={sectionHeaderStyle} onClick={() => setNoPkOpen((o) => !o)}>
            <ChevronIcon open={noPkOpen} />
            Tables Without Primary Key
            <span
              style={{
                marginLeft: '8px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '12px',
                padding: '2px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {tablesWithoutPK.length}
            </span>
          </div>
          {noPkOpen && (
            <div
              style={{
                padding: '8px 16px',
                background: 'var(--ifm-color-emphasis-100)',
                borderRadius: '0 0 8px 8px',
                marginTop: '-4px',
              }}
            >
              {Object.entries(noPkGroups)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([mod, tables]) => (
                  <div key={mod} style={{ marginBottom: '4px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 0',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => toggleModule(`nopk-${mod}`)}
                    >
                      <ChevronIcon open={!!expandedModules[`nopk-${mod}`]} />
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{mod}</span>
                      <span
                        style={{
                          background: 'var(--ifm-color-emphasis-300)',
                          color: 'var(--ifm-font-color-base)',
                          borderRadius: '12px',
                          padding: '1px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {tables.length}
                      </span>
                    </div>
                    {expandedModules[`nopk-${mod}`] && (
                      <div style={{ paddingLeft: '28px', paddingBottom: '8px' }}>
                        {tables.map((t) => (
                          <div
                            key={t}
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.82rem',
                              padding: '3px 0',
                              color: 'var(--ifm-color-emphasis-700)',
                            }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* === Tables Without Indexes === */}
      {tablesWithoutIndex.length > 0 && (
        <div>
          <div style={sectionHeaderStyle} onClick={() => setNoIdxOpen((o) => !o)}>
            <ChevronIcon open={noIdxOpen} />
            Tables Without Indexes
            <span
              style={{
                marginLeft: '8px',
                background: '#f97316',
                color: '#fff',
                borderRadius: '12px',
                padding: '2px 10px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {tablesWithoutIndex.length}
            </span>
          </div>
          {noIdxOpen && (
            <div
              style={{
                padding: '8px 16px',
                background: 'var(--ifm-color-emphasis-100)',
                borderRadius: '0 0 8px 8px',
                marginTop: '-4px',
              }}
            >
              {Object.entries(noIdxGroups)
                .sort(([, a], [, b]) => b.length - a.length)
                .map(([mod, tables]) => (
                  <div key={mod} style={{ marginBottom: '4px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 0',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onClick={() => toggleModule(`noidx-${mod}`)}
                    >
                      <ChevronIcon open={!!expandedModules[`noidx-${mod}`]} />
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{mod}</span>
                      <span
                        style={{
                          background: 'var(--ifm-color-emphasis-300)',
                          color: 'var(--ifm-font-color-base)',
                          borderRadius: '12px',
                          padding: '1px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {tables.length}
                      </span>
                    </div>
                    {expandedModules[`noidx-${mod}`] && (
                      <div style={{ paddingLeft: '28px', paddingBottom: '8px' }}>
                        {tables.map((t) => (
                          <div
                            key={t}
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.82rem',
                              padding: '3px 0',
                              color: 'var(--ifm-color-emphasis-700)',
                            }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
