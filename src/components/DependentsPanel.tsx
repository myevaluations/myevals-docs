import React, { useState, useEffect } from 'react';
import { GITHUB_BASE } from '../utils/github';

interface DependentFile {
  fileName: string;
  filePath: string;
  directory: string;
  module?: string;
}

interface RevDepsData {
  module: string;
  dependents: {
    web: DependentFile[];
    schedulers: DependentFile[];
  };
  totals: { web: number; schedulers: number };
}

interface DependentsPanelProps {
  /** Module name (e.g., "Evaluations") — fetches /reverse-deps/{module}.json */
  module: string;
}

function FileLink({ file }: { file: DependentFile }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '6px',
        padding: '3px 0',
        fontSize: '0.85rem',
        borderBottom: '1px solid var(--ifm-color-emphasis-100)',
      }}
    >
      <span
        style={{
          fontFamily: 'monospace',
          fontWeight: 500,
          color: 'var(--ifm-font-color-base)',
          flexShrink: 0,
        }}
      >
        {file.fileName}
      </span>
      {file.directory && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--ifm-color-emphasis-500)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.directory}
        </span>
      )}
      <a
        href={`${GITHUB_BASE}${file.filePath}`}
        target="_blank"
        rel="noopener noreferrer"
        title="View on GitHub"
        style={{
          marginLeft: 'auto',
          flexShrink: 0,
          color: 'var(--ifm-color-emphasis-400)',
          fontSize: '0.75rem',
          textDecoration: 'none',
        }}
      >
        ↗
      </a>
    </div>
  );
}

export default function DependentsPanel({ module }: DependentsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAllWeb, setShowAllWeb] = useState(false);
  const [showAllSched, setShowAllSched] = useState(false);
  const [data, setData] = useState<RevDepsData | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Fetch reverse-deps data on mount (small per-module JSON, cached by browser)
  useEffect(() => {
    fetch(`/reverse-deps/${module}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RevDepsData>;
      })
      .then((d) => setData(d))
      .catch(() => setLoadError(true));
  }, [module]);

  const webDependents = data?.dependents.web ?? [];
  const schedulerDependents = data?.dependents.schedulers ?? [];
  const totalDependents = webDependents.length + schedulerDependents.length;

  const WEB_PREVIEW = 8;
  const SCHED_PREVIEW = 5;

  const visibleWeb = showAllWeb ? webDependents : webDependents.slice(0, WEB_PREVIEW);
  const visibleSched = showAllSched ? schedulerDependents : schedulerDependents.slice(0, SCHED_PREVIEW);

  const severityColor =
    totalDependents > 200
      ? '#ef4444'
      : totalDependents > 50
      ? '#f97316'
      : totalDependents > 10
      ? '#eab308'
      : '#22c55e';

  // Show neutral color while loading
  const borderColor = data === null && !loadError ? 'var(--ifm-color-emphasis-200)' : `${severityColor}40`;
  const bgColor = data === null && !loadError ? 'var(--ifm-color-emphasis-50)' : `${severityColor}10`;

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        marginBottom: '20px',
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          background: bgColor,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--ifm-font-color-base)',
        }}
      >
        <span style={{ fontSize: '1rem' }}>{isOpen ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Who depends on {module}?
        </span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {data === null && !loadError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-400)' }}>
              loading…
            </span>
          )}
          {loadError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-400)' }}>
              unavailable
            </span>
          )}
          {data !== null && webDependents.length > 0 && (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                backgroundColor: `${severityColor}20`,
                color: severityColor,
                border: `1px solid ${severityColor}40`,
              }}
            >
              {webDependents.length} web pages
            </span>
          )}
          {data !== null && schedulerDependents.length > 0 && (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: '12px',
                fontSize: '0.78rem',
                fontWeight: 700,
                backgroundColor: '#3b82f620',
                color: '#3b82f6',
                border: '1px solid #3b82f640',
              }}
            >
              {schedulerDependents.length} schedulers
            </span>
          )}
          {data !== null && totalDependents === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-500)' }}>
              No tracked dependents
            </span>
          )}
        </span>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div style={{ padding: '12px 16px' }}>
          {loadError ? (
            <p style={{ color: 'var(--ifm-color-emphasis-500)', fontSize: '0.85rem', margin: 0 }}>
              Could not load dependency data. Run <code>npm run generate:reverse-deps</code> to regenerate.
            </p>
          ) : data === null ? (
            <p style={{ color: 'var(--ifm-color-emphasis-400)', fontSize: '0.85rem', margin: 0 }}>
              Loading…
            </p>
          ) : totalDependents === 0 ? (
            <p style={{ color: 'var(--ifm-color-emphasis-500)', fontSize: '0.85rem', margin: 0 }}>
              No web pages or schedulers reference classes from this module in the enrichment data.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--ifm-color-emphasis-600)', marginTop: 0 }}>
                Changing this module may affect <strong>{totalDependents} files</strong> across the codebase.
                Review these before making changes.
              </p>

              {webDependents.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--ifm-color-emphasis-600)',
                      marginBottom: '6px',
                    }}
                  >
                    Web Pages ({webDependents.length})
                  </div>
                  {visibleWeb.map((f) => (
                    <FileLink key={f.filePath} file={f} />
                  ))}
                  {webDependents.length > WEB_PREVIEW && (
                    <button
                      onClick={() => setShowAllWeb((v) => !v)}
                      style={{
                        marginTop: '6px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: 'var(--ifm-color-primary)',
                        padding: '2px 0',
                      }}
                    >
                      {showAllWeb
                        ? `▲ Show fewer`
                        : `▼ Show all ${webDependents.length} web pages`}
                    </button>
                  )}
                </div>
              )}

              {schedulerDependents.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--ifm-color-emphasis-600)',
                      marginBottom: '6px',
                    }}
                  >
                    Schedulers ({schedulerDependents.length})
                  </div>
                  {visibleSched.map((f) => (
                    <FileLink key={f.filePath} file={f} />
                  ))}
                  {schedulerDependents.length > SCHED_PREVIEW && (
                    <button
                      onClick={() => setShowAllSched((v) => !v)}
                      style={{
                        marginTop: '6px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: 'var(--ifm-color-primary)',
                        padding: '2px 0',
                      }}
                    >
                      {showAllSched
                        ? `▲ Show fewer`
                        : `▼ Show all ${schedulerDependents.length} schedulers`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
