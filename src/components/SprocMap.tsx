import React, { useState, useMemo, useEffect } from 'react';

const GITHUB_BASE = 'https://github.com/myevaluations/myevals-dotnet-backend/blob/master/';

interface WebCaller {
  fileName: string;
  filePath: string;
  directory: string;
  viaManager: string;
}

interface CalledByEntry {
  class: string;
  method: string;
  project: string;
}

interface SprocMapping {
  sproc: string;
  calledBy: CalledByEntry[];
}

/** Raw format from parse-dotnet-sprocs.ts (procedures[] array) */
interface RawSprocProcedure {
  procedureName: string;
  callCount: number;
  calledBy: {
    className: string;
    methodName: string;
    filePath: string;
  }[];
}

interface SprocMapProps {
  mappings?: (SprocMapping | RawSprocProcedure)[];
}

function extractProject(filePath: string): string {
  // Extract project from path like "MyEvaluations.Business.Security/UserManager.cs"
  const parts = filePath.split('/');
  return parts[0] || filePath;
}

function normalizeSprocMapping(m: SprocMapping | RawSprocProcedure): SprocMapping {
  if ('sproc' in m) return m as SprocMapping;
  const raw = m as RawSprocProcedure;
  return {
    sproc: raw.procedureName,
    calledBy: raw.calledBy.map((cb) => ({
      class: cb.className,
      method: cb.methodName,
      project: extractProject(cb.filePath),
    })),
  };
}

const PLACEHOLDER_MAPPINGS: SprocMapping[] = [
  {
    sproc: 'sp_GetUserProfile',
    calledBy: [
      { class: 'UserManager', method: 'GetProfile', project: 'MyEvals.Business' },
      { class: 'AuthService', method: 'ValidateUser', project: 'MyEvals.Security' },
    ],
  },
  {
    sproc: 'sp_SaveEvaluation',
    calledBy: [
      { class: 'EvaluationManager', method: 'SaveEvaluation', project: 'MyEvals.Business' },
    ],
  },
  {
    sproc: 'sp_GetDutyHours',
    calledBy: [
      { class: 'DutyHourManager', method: 'GetHours', project: 'MyEvals.Business' },
      { class: 'ComplianceChecker', method: 'CheckCompliance', project: 'MyEvals.Compliance' },
      { class: 'ReportGenerator', method: 'GenerateDutyReport', project: 'MyEvals.Reports' },
    ],
  },
  {
    sproc: 'sp_InsertPatientLog',
    calledBy: [
      { class: 'PatientLogManager', method: 'InsertLog', project: 'MyEvals.Business' },
    ],
  },
  {
    sproc: 'sp_GetEvaluationsByResident',
    calledBy: [
      { class: 'EvaluationManager', method: 'GetByResident', project: 'MyEvals.Business' },
      { class: 'MilestoneCalculator', method: 'CalculateProgress', project: 'MyEvals.Business' },
    ],
  },
  {
    sproc: 'sp_UpdateRotationAssignment',
    calledBy: [
      { class: 'RotationManager', method: 'UpdateAssignment', project: 'MyEvals.Business' },
    ],
  },
  {
    sproc: 'sp_GetCMECredits',
    calledBy: [
      { class: 'CMEManager', method: 'GetCredits', project: 'MyEvals.Business' },
      { class: 'CMESyncService', method: 'SyncCredits', project: 'MyEvals.Services' },
    ],
  },
  {
    sproc: 'sp_SendNotification',
    calledBy: [
      { class: 'NotificationManager', method: 'Send', project: 'MyEvals.Business' },
      { class: 'EmailService', method: 'QueueEmail', project: 'MyEvals.Services' },
      { class: 'ReminderScheduler', method: 'ProcessReminders', project: 'MyEvals.Schedulers' },
    ],
  },
];

export default function SprocMap({ mappings }: SprocMapProps): React.JSX.Element {
  const items = (mappings ?? PLACEHOLDER_MAPPINGS).map(normalizeSprocMapping);

  const [searchText, setSearchText] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [webCallersExpanded, setWebCallersExpanded] = useState<Set<string>>(new Set());
  const [webCallers, setWebCallers] = useState<Record<string, WebCaller[]> | null>(null);

  // Lazy-load 3-tier web callers data
  useEffect(() => {
    fetch('/sproc-web-callers.json')
      .then((r) => r.json())
      .then((data: Record<string, WebCaller[]>) => setWebCallers(data))
      .catch(() => setWebCallers({}));
  }, []);

  function toggleWebCallers(sproc: string) {
    setWebCallersExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sproc)) next.delete(sproc);
      else next.add(sproc);
      return next;
    });
  }

  const filteredMappings = useMemo(() => {
    const query = searchText.toLowerCase();
    if (!query) return items;
    return items.filter((m) => {
      if (m.sproc.toLowerCase().includes(query)) return true;
      return m.calledBy.some(
        (cb) =>
          cb.class.toLowerCase().includes(query) ||
          cb.method.toLowerCase().includes(query) ||
          cb.project.toLowerCase().includes(query),
      );
    });
  }, [items, searchText]);

  function toggleRow(sproc: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(sproc)) {
        next.delete(sproc);
      } else {
        next.add(sproc);
      }
      return next;
    });
  }

  return (
    <div>
      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search stored procedures, classes, or methods..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '4px',
            fontSize: '0.9rem',
            width: '100%',
            maxWidth: '500px',
            background: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          }}
        />
        <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '0.25rem' }}>
          Showing {filteredMappings.length} of {items.length} stored procedures
        </p>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', width: '30px' }} />
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Stored Procedure</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Called By</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Project</th>
            </tr>
          </thead>
          <tbody>
            {filteredMappings.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ textAlign: 'center', padding: '2rem', color: 'var(--ifm-color-emphasis-500)' }}
                >
                  No stored procedures match the search query.
                </td>
              </tr>
            ) : (
              filteredMappings.map((m) => {
                const hasMultiple = m.calledBy.length > 1;
                const isExpanded = expandedRows.has(m.sproc);
                const displayEntries = hasMultiple && !isExpanded ? [m.calledBy[0]] : m.calledBy;
                const webCallersForSp = webCallers?.[m.sproc] ?? [];
                const showWebCallers = webCallersExpanded.has(m.sproc);

                return (
                  <React.Fragment key={m.sproc}>
                    {displayEntries.map((cb, idx) => (
                      <tr
                        key={`${m.sproc}-${idx}`}
                        className={idx === 0 && searchText ? 'sproc-highlight' : undefined}
                        style={{
                          borderBottom:
                            idx === displayEntries.length - 1 && !showWebCallers
                              ? '1px solid var(--ifm-color-emphasis-200)'
                              : 'none',
                        }}
                      >
                        {/* Expand toggle - only on first row */}
                        <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center', verticalAlign: 'top' }}>
                          {idx === 0 && hasMultiple ? (
                            <button
                              onClick={() => toggleRow(m.sproc)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                color: 'var(--ifm-color-primary)',
                                padding: '0 4px',
                                lineHeight: 1,
                              }}
                              title={isExpanded ? 'Collapse' : `Expand (${m.calledBy.length} callers)`}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              {isExpanded ? '\u25BC' : '\u25B6'}
                            </button>
                          ) : null}
                        </td>

                        {/* Sproc name - only on first row, with rowSpan */}
                        {idx === 0 ? (
                          <td
                            style={{
                              padding: '0.5rem 0.75rem',
                              fontFamily: 'var(--ifm-font-family-monospace)',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              verticalAlign: 'top',
                            }}
                            rowSpan={displayEntries.length}
                          >
                            {m.sproc}
                            {hasMultiple && (
                              <span
                                style={{
                                  marginLeft: '0.5rem',
                                  fontSize: '0.75rem',
                                  color: 'var(--ifm-color-emphasis-500)',
                                }}
                              >
                                ({m.calledBy.length} callers)
                              </span>
                            )}
                            {webCallers !== null && (
                              <div style={{ marginTop: '4px' }}>
                                <button
                                  onClick={() => toggleWebCallers(m.sproc)}
                                  style={{
                                    background: 'none',
                                    border: `1px solid ${webCallersForSp.length > 0 ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-300)'}`,
                                    borderRadius: '4px',
                                    cursor: webCallersForSp.length > 0 ? 'pointer' : 'default',
                                    fontSize: '0.7rem',
                                    color: webCallersForSp.length > 0 ? 'var(--ifm-color-primary)' : 'var(--ifm-color-emphasis-400)',
                                    padding: '1px 6px',
                                    lineHeight: 1.4,
                                  }}
                                  title={webCallersForSp.length > 0 ? 'Show web page callers' : 'No web page chain data'}
                                  disabled={webCallersForSp.length === 0}
                                >
                                  {showWebCallers ? '▲' : '▶'} {webCallersForSp.length} web pages
                                </button>
                              </div>
                            )}
                          </td>
                        ) : null}

                        {/* Called by */}
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontFamily: 'var(--ifm-font-family-monospace)',
                            fontSize: '0.85rem',
                          }}
                        >
                          <span style={{ color: 'var(--ifm-color-primary-dark)' }}>{cb.class}</span>
                          <span style={{ color: 'var(--ifm-color-emphasis-500)' }}>.</span>
                          <span>{cb.method}</span>
                        </td>

                        {/* Project */}
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.85rem',
                          }}
                        >
                          <span className="badge badge--migrating">{cb.project}</span>
                        </td>
                      </tr>
                    ))}
                    {/* 3rd Tier: Web page callers */}
                    {showWebCallers && webCallersForSp.length > 0 && (
                      <tr>
                        <td />
                        <td colSpan={3} style={{ padding: '0 0.75rem 0.75rem', borderBottom: '1px solid var(--ifm-color-emphasis-200)' }}>
                          <div
                            style={{
                              backgroundColor: 'var(--ifm-background-surface-color)',
                              border: '1px solid var(--ifm-color-emphasis-200)',
                              borderRadius: '6px',
                              padding: '8px 12px',
                            }}
                          >
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '6px' }}>
                              Web Page Callers (via manager chain)
                            </div>
                            {webCallersForSp.map((wc) => (
                              <div key={wc.filePath} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', padding: '2px 0', fontSize: '0.8rem' }}>
                                <span style={{ fontFamily: 'monospace', color: 'var(--ifm-font-color-base)' }}>{wc.fileName}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--ifm-color-emphasis-500)' }}>via {wc.viaManager}</span>
                                <a
                                  href={`${GITHUB_BASE}${wc.filePath}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--ifm-color-emphasis-400)', textDecoration: 'none' }}
                                >↗</a>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
