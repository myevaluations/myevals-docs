import React, { useState, useMemo, useEffect } from 'react';

interface SprocEntry {
  name: string;
  schema: string;
  parameters: Array<{
    name: string;
    dataType: string;
    direction: 'IN' | 'OUTPUT';
    defaultValue: string | null;
  }>;
  lineCount: number;
  tablesReferenced: string[];
  sprocsCalledFromBody: string[];
  crudType: string;
  antiPatterns: {
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
  };
  calledFromCode: string[];
  complexity: string;
  module: string;
  summary?: string;
  businessPurpose?: string;
  optimizationRecommendations?: string[];
  migrationRelevance?: string;
}

interface SprocDetailProps {
  procedures?: SprocEntry[];
  dataUrl?: string;
  generatedAt?: string;
}

const COMPLEXITY_ORDER = ['trivial', 'simple', 'moderate', 'complex', 'very-complex'];

const COMPLEXITY_COLORS: Record<string, string> = {
  'trivial': '#22c55e',
  'simple': '#84cc16',
  'moderate': '#eab308',
  'complex': '#f97316',
  'very-complex': '#ef4444',
};

const CRUD_COLORS: Record<string, string> = {
  'get': '#3b82f6',
  'insert': '#22c55e',
  'update': '#eab308',
  'delete': '#ef4444',
  'report': '#8b5cf6',
  'mixed': '#6b7280',
};

const MIGRATION_COLORS: Record<string, string> = {
  'high': '#ef4444',
  'medium': '#f97316',
  'low': '#eab308',
  'none': '#6b7280',
};

const ANTI_PATTERN_SEVERITY: Record<string, { label: string; color: string }> = {
  'hasCursor': { label: 'Cursor', color: '#ef4444' },
  'hasDynamicSql': { label: 'Dynamic SQL', color: '#ef4444' },
  'hasSelectStar': { label: 'SELECT *', color: '#f97316' },
  'hasNolock': { label: 'NOLOCK', color: '#eab308' },
  'hasTableVariable': { label: 'Table Variable', color: '#eab308' },
  'hasWhileLoop': { label: 'WHILE Loop', color: '#eab308' },
  'hasTempTable': { label: 'Temp Table', color: '#eab308' },
  'missingSetNocountOn': { label: 'No SET NOCOUNT ON', color: '#6b7280' },
  'hasNoTryCatch': { label: 'No TRY/CATCH', color: '#6b7280' },
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

function countIssues(ap: SprocEntry['antiPatterns']): number {
  let count = 0;
  if (ap.hasCursor) count++;
  if (ap.hasSelectStar) count++;
  if (ap.hasDynamicSql) count++;
  if (ap.hasNolock) count++;
  if (ap.missingSetNocountOn) count++;
  if (ap.hasTableVariable) count++;
  if (ap.hasTempTable) count++;
  if (ap.hasWhileLoop) count++;
  if (ap.hasNoTryCatch) count++;
  return count;
}

function hasCriticalOrHighIssue(ap: SprocEntry['antiPatterns']): boolean {
  return ap.hasCursor || ap.hasDynamicSql || ap.hasSelectStar;
}

function SprocDetailRow({ sproc, isExpanded, onToggle }: {
  sproc: SprocEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const issueCount = countIssues(sproc.antiPatterns);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        title="Click to expand details"
      >
        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-word', minWidth: '180px' }}>
          <span style={{ marginRight: '4px' }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
          {sproc.schema !== 'dbo' && (
            <span style={{ color: 'var(--ifm-color-emphasis-500)', fontSize: '0.78rem' }}>{sproc.schema}.</span>
          )}
          {sproc.name}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
          {sproc.parameters.length}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
          {sproc.lineCount.toLocaleString()}
        </td>
        <td>
          <Badge
            label={sproc.crudType.toUpperCase()}
            color={CRUD_COLORS[sproc.crudType] || '#6b7280'}
          />
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)' }}>
          {sproc.tablesReferenced.length}
        </td>
        <td style={{ textAlign: 'center' }}>
          {issueCount > 0 ? (
            <span
              style={{
                display: 'inline-block',
                padding: '1px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: hasCriticalOrHighIssue(sproc.antiPatterns) ? '#ef444420' : '#eab30820',
                color: hasCriticalOrHighIssue(sproc.antiPatterns) ? '#ef4444' : '#eab308',
                border: `1px solid ${hasCriticalOrHighIssue(sproc.antiPatterns) ? '#ef444440' : '#eab30840'}`,
              }}
            >
              {issueCount}
            </span>
          ) : (
            <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>--</span>
          )}
        </td>
        <td>
          <Badge
            label={sproc.complexity}
            color={COMPLEXITY_COLORS[sproc.complexity] || '#6b7280'}
          />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} style={{ padding: '12px 16px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)' }}>
            {/* Parameters sub-table */}
            {sproc.parameters.length > 0 && (
              <details style={{ marginBottom: '10px' }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>
                  Parameters ({sproc.parameters.length})
                </summary>
                <div style={{ overflowX: 'auto', marginTop: '4px' }}>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--ifm-color-emphasis-200)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px' }}>Name</th>
                        <th style={{ padding: '4px 8px' }}>Type</th>
                        <th style={{ padding: '4px 8px' }}>Direction</th>
                        <th style={{ padding: '4px 8px' }}>Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sproc.parameters.map((param) => (
                        <tr key={param.name} style={{ borderBottom: '1px solid var(--ifm-color-emphasis-100)' }}>
                          <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {param.name}
                          </td>
                          <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {param.dataType}
                          </td>
                          <td style={{ padding: '3px 8px' }}>
                            {param.direction === 'OUTPUT' ? (
                              <Badge label="OUTPUT" color="#8b5cf6" />
                            ) : (
                              <span style={{ color: 'var(--ifm-color-emphasis-500)', fontSize: '0.8rem' }}>IN</span>
                            )}
                          </td>
                          <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)' }}>
                            {param.defaultValue ?? ''}
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
                {/* Tables Referenced */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Tables Referenced:</strong>{' '}
                  {sproc.tablesReferenced.length > 0 ? (
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {sproc.tablesReferenced.join(', ')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.8rem' }}>None</span>
                  )}
                </div>

                {/* Anti-Pattern Badges */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Anti-Patterns:</strong>{' '}
                  {countIssues(sproc.antiPatterns) > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                      {(Object.keys(ANTI_PATTERN_SEVERITY) as Array<keyof typeof ANTI_PATTERN_SEVERITY>).map((key) => {
                        const apKey = key as keyof SprocEntry['antiPatterns'];
                        if (!sproc.antiPatterns[apKey]) return null;
                        const { label, color } = ANTI_PATTERN_SEVERITY[key];
                        const displayLabel = key === 'hasNolock' && sproc.antiPatterns.nolockCount > 0
                          ? `${label} (${sproc.antiPatterns.nolockCount}x)`
                          : label;
                        return <Badge key={key} label={displayLabel} color={color} />;
                      })}
                    </div>
                  ) : (
                    <span style={{ color: '#22c55e', fontSize: '0.8rem', marginLeft: '4px' }}>Clean</span>
                  )}
                </div>

                {/* Called From Code */}
                <div style={{ marginTop: '6px' }}>
                  <strong>Called From Code:</strong>
                  {sproc.calledFromCode.length > 0 ? (
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {sproc.calledFromCode.slice(0, 10).map((entry, i) => (
                        <li key={`${sproc.name}-code-${i}`}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{entry}</span>
                        </li>
                      ))}
                      {sproc.calledFromCode.length > 10 && (
                        <li style={{ fontStyle: 'italic' }}>+{sproc.calledFromCode.length - 10} more</li>
                      )}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.8rem', marginLeft: '4px' }}>
                      Not referenced from .NET code
                    </span>
                  )}
                </div>
              </div>

              {/* Right column */}
              <div>
                {/* SPs Called */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>SPs Called:</strong>{' '}
                  {sproc.sprocsCalledFromBody.length > 0 ? (
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {sproc.sprocsCalledFromBody.slice(0, 10).map((sp, i) => (
                        <li key={`${sproc.name}-sp-${i}`}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{sp}</span>
                        </li>
                      ))}
                      {sproc.sprocsCalledFromBody.length > 10 && (
                        <li style={{ fontStyle: 'italic' }}>+{sproc.sprocsCalledFromBody.length - 10} more</li>
                      )}
                    </ul>
                  ) : (
                    <span style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.8rem' }}>None</span>
                  )}
                </div>

                {/* Module */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Module:</strong>{' '}
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 8px',
                    borderRadius: '4px',
                    background: 'var(--ifm-color-emphasis-100)',
                    fontSize: '0.8rem',
                  }}>
                    {sproc.module}
                  </span>
                </div>

                {/* Line count */}
                <div style={{ marginBottom: '6px' }}>
                  <strong>Lines:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {sproc.lineCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Enrichment section */}
            {(sproc.summary || sproc.businessPurpose || sproc.optimizationRecommendations || sproc.migrationRelevance) && (
              <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: 'var(--ifm-color-emphasis-100)', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px', fontWeight: 600 }}>
                  AI Enrichment
                </div>
                {sproc.summary && (
                  <div style={{ marginBottom: '4px', fontSize: '0.85rem' }}>
                    <strong>Summary:</strong> {sproc.summary}
                  </div>
                )}
                {sproc.businessPurpose && (
                  <div style={{ marginBottom: '4px', fontSize: '0.85rem' }}>
                    <strong>Business Purpose:</strong> {sproc.businessPurpose}
                  </div>
                )}
                {sproc.optimizationRecommendations && sproc.optimizationRecommendations.length > 0 && (
                  <div style={{ marginBottom: '4px', fontSize: '0.85rem' }}>
                    <strong>Optimization Recommendations:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                      {sproc.optimizationRecommendations.map((rec, i) => (
                        <li key={`${sproc.name}-rec-${i}`}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sproc.migrationRelevance && (
                  <div style={{ fontSize: '0.85rem' }}>
                    <strong>Migration Relevance:</strong>{' '}
                    <Badge
                      label={sproc.migrationRelevance}
                      color={MIGRATION_COLORS[sproc.migrationRelevance] || '#6b7280'}
                    />
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

type SortField = 'name' | 'lineCount' | 'parameters' | 'complexity';

export default function SprocDetail({
  procedures,
  dataUrl,
  generatedAt,
}: SprocDetailProps) {
  const [fetchedData, setFetchedData] = useState<SprocEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!procedures && dataUrl) {
      setLoading(true);
      fetch(dataUrl)
        .then((r) => r.json())
        .then((d) => {
          setFetchedData(d.procedures ?? d ?? []);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load sproc data:', err);
          setLoading(false);
        });
    }
  }, [procedures, dataUrl]);

  const data: SprocEntry[] = procedures ?? fetchedData ?? [];

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterCrud, setFilterCrud] = useState<string>('all');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');
  const [filterIssue, setFilterIssue] = useState<string>('all');
  const [expandedSprocs, setExpandedSprocs] = useState<Set<string>>(new Set());

  const toggleExpand = (name: string) => {
    setExpandedSprocs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = data.filter((sp) => {
      const matchesSearch =
        !search ||
        sp.name.toLowerCase().includes(search.toLowerCase()) ||
        (sp.summary && sp.summary.toLowerCase().includes(search.toLowerCase())) ||
        (sp.module && sp.module.toLowerCase().includes(search.toLowerCase()));
      const matchesCrud = filterCrud === 'all' || sp.crudType === filterCrud;
      const matchesComplexity = filterComplexity === 'all' || sp.complexity === filterComplexity;
      const matchesIssue =
        filterIssue === 'all' ||
        (filterIssue === 'cursor' && sp.antiPatterns.hasCursor) ||
        (filterIssue === 'selectStar' && sp.antiPatterns.hasSelectStar) ||
        (filterIssue === 'dynamicSql' && sp.antiPatterns.hasDynamicSql) ||
        (filterIssue === 'nolock' && sp.antiPatterns.hasNolock);
      return matchesSearch && matchesCrud && matchesComplexity && matchesIssue;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'lineCount':
          cmp = a.lineCount - b.lineCount;
          break;
        case 'parameters':
          cmp = a.parameters.length - b.parameters.length;
          break;
        case 'complexity':
          cmp = COMPLEXITY_ORDER.indexOf(a.complexity || '') - COMPLEXITY_ORDER.indexOf(b.complexity || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, search, sortField, sortDir, filterCrud, filterComplexity, filterIssue]);

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
  const stats = useMemo(() => {
    const totalParams = data.reduce((s, sp) => s + sp.parameters.length, 0);
    const crudDist = Object.keys(CRUD_COLORS).map((c) => ({
      label: c,
      count: data.filter((sp) => sp.crudType === c).length,
      color: CRUD_COLORS[c],
    })).filter((d) => d.count > 0);
    const complexityDist = COMPLEXITY_ORDER.map((c) => ({
      label: c,
      count: data.filter((sp) => sp.complexity === c).length,
      color: COMPLEXITY_COLORS[c],
    })).filter((d) => d.count > 0);
    const issuesCount = data.filter((sp) => hasCriticalOrHighIssue(sp.antiPatterns)).length;
    return { totalParams, crudDist, complexityDist, issuesCount };
  }, [data]);

  const enrichedDate = generatedAt ? new Date(generatedAt) : null;
  const enrichedLabel = enrichedDate
    ? enrichedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  if (loading || (!procedures && dataUrl && !fetchedData)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>
        Loading stored procedure data...
      </div>
    );
  }

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
          No stored procedure data available. Run the SP extraction pipeline to populate.
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
        {/* Total Procedures card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Procedures</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{data.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>
            total stored procedures
          </div>
        </div>

        {/* Total Parameters card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Parameters</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{stats.totalParams.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>
            avg {data.length > 0 ? Math.round(stats.totalParams / data.length) : 0} per SP
          </div>
        </div>

        {/* CRUD Breakdown card */}
        {stats.crudDist.length > 0 && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px' }}>CRUD Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {stats.crudDist.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ifm-color-emphasis-700)', minWidth: '55px' }}>{label.toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complexity Distribution card */}
        {stats.complexityDist.length > 0 && (
          <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px' }}>Complexity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {stats.complexityDist.map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ifm-color-emphasis-700)', minWidth: '80px' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issues Found card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Issues Found</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1, color: stats.issuesCount > 0 ? '#ef4444' : '#22c55e' }}>
            {stats.issuesCount.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>
            SPs with critical/high anti-patterns
          </div>
        </div>

        {/* Showing card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Showing</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{filtered.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>of {data.length} procedures</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search procedures..."
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
          value={filterCrud}
          onChange={(e) => setFilterCrud(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All CRUD</option>
          <option value="get">GET</option>
          <option value="insert">INSERT</option>
          <option value="update">UPDATE</option>
          <option value="delete">DELETE</option>
          <option value="report">REPORT</option>
          <option value="mixed">MIXED</option>
        </select>
        <select
          value={filterComplexity}
          onChange={(e) => setFilterComplexity(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Complexity</option>
          <option value="trivial">trivial</option>
          <option value="simple">simple</option>
          <option value="moderate">moderate</option>
          <option value="complex">complex</option>
          <option value="very-complex">very-complex</option>
        </select>
        <select
          value={filterIssue}
          onChange={(e) => setFilterIssue(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Issues</option>
          <option value="cursor">Cursor</option>
          <option value="selectStar">SELECT *</option>
          <option value="dynamicSql">Dynamic SQL</option>
          <option value="nolock">NOLOCK</option>
        </select>
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
                SP Name{sortIndicator('name')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'right', padding: '8px' }}
                onClick={() => handleSort('parameters')}
              >
                Params{sortIndicator('parameters')}
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'right', padding: '8px' }}
                onClick={() => handleSort('lineCount')}
              >
                Lines{sortIndicator('lineCount')}
              </th>
              <th style={{ textAlign: 'left', padding: '8px' }}>
                CRUD
              </th>
              <th style={{ textAlign: 'right', padding: '8px' }}>
                Tables
              </th>
              <th style={{ textAlign: 'center', padding: '8px' }}>
                Issues
              </th>
              <th
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}
                onClick={() => handleSort('complexity')}
              >
                Complexity{sortIndicator('complexity')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sproc) => (
              <SprocDetailRow
                key={`${sproc.schema}.${sproc.name}`}
                sproc={sproc}
                isExpanded={expandedSprocs.has(sproc.name)}
                onToggle={() => toggleExpand(sproc.name)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && data.length > 0 && (
        <p style={{ textAlign: 'center', padding: '24px', color: 'var(--ifm-color-emphasis-600)' }}>
          No stored procedures match the current filters.
        </p>
      )}
    </div>
  );
}
