import React, { useState, useEffect } from 'react';

interface SchedulerRecord {
  name: string;
  module: string;
  domain: string;
  frequency: string;
  hour: number;
  minute: number;
  timeLabel: string;
  purpose: string;
  complexity: string;
  migrationRelevance: string;
  fileCount: number;
  lineCount: number;
  docUrl: string;
  timingSource: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  evaluations: '#8b5cf6',
  'duty-hours': '#3b82f6',
  clinical: '#22c55e',
  communication: '#f97316',
  license: '#eab308',
  compliance: '#14b8a6',
  learning: '#06b6d4',
  'data-integration': '#6b7280',
  admin: '#ec4899',
};

const DOMAIN_LABELS: Record<string, string> = {
  evaluations: 'Evaluations',
  'duty-hours': 'Duty Hours',
  clinical: 'Clinical',
  communication: 'Communication',
  license: 'License',
  compliance: 'Compliance',
  learning: 'Learning',
  'data-integration': 'Data Integration',
  admin: 'Admin',
};

const FREQUENCY_GROUPS: { key: string; label: string }[] = [
  { key: 'daily-am', label: 'Daily AM (midnight–noon)' },
  { key: 'daily-pm', label: 'Daily PM (noon–midnight)' },
  { key: 'nightly', label: 'Nightly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'interval', label: 'Interval / Recurring' },
  { key: 'event-triggered', label: 'Event-triggered' },
  { key: 'unknown', label: 'Unknown Schedule' },
];

// 24-hour grid constants
const GRID_W = 900;
const GRID_H_PER_ROW = 38;
const GRID_LEFT = 120;
const GRID_RIGHT_MARGIN = 10;
const GRID_PLOT_W = GRID_W - GRID_LEFT - GRID_RIGHT_MARGIN;
const HOUR_LABELS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

const DOMAIN_ORDER = [
  'evaluations', 'duty-hours', 'clinical', 'communication',
  'license', 'compliance', 'learning', 'data-integration', 'admin',
];

function hourToX(hour: number, minute: number = 0): number {
  return GRID_LEFT + ((hour + minute / 60) / 24) * GRID_PLOT_W;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  scheduler: SchedulerRecord | null;
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: '10px',
        background: DOMAIN_COLORS[domain] || '#6b7280',
        color: '#fff',
        fontSize: '0.7rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {DOMAIN_LABELS[domain] || domain}
    </span>
  );
}

function Grid24Hour({ schedulers }: { schedulers: SchedulerRecord[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, scheduler: null });

  // Group by domain, keeping only schedulers with known times
  const timedSchedulers = schedulers.filter((s) => s.hour >= 0);
  const domains = DOMAIN_ORDER.filter((d) => timedSchedulers.some((s) => s.domain === d));

  const svgH = 30 + domains.length * GRID_H_PER_ROW + 30;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${GRID_W} ${svgH}`}
        style={{ width: '100%', height: 'auto', minWidth: '600px', display: 'block' }}
        aria-label="24-hour scheduler grid"
      >
        {/* Hour lines */}
        {HOUR_LABELS.map((h) => {
          const x = hourToX(h);
          return (
            <g key={h}>
              <line x1={x} y1={20} x2={x} y2={svgH - 20} stroke="var(--ifm-color-emphasis-200)" strokeWidth={1} />
              <text x={x} y={15} textAnchor="middle" fontSize={9} fill="var(--ifm-color-emphasis-500)">
                {h === 0 ? 'midnight' : h === 12 ? 'noon' : h === 24 ? '' : `${h}:00`}
              </text>
            </g>
          );
        })}

        {/* Current time marker (client-side) */}
        {/* Domain rows */}
        {domains.map((domain, rowIdx) => {
          const rowY = 25 + rowIdx * GRID_H_PER_ROW;
          const rowSchedulers = timedSchedulers.filter((s) => s.domain === domain);
          return (
            <g key={domain}>
              {/* Row background */}
              <rect
                x={0}
                y={rowY}
                width={GRID_W}
                height={GRID_H_PER_ROW}
                fill={rowIdx % 2 === 0 ? 'var(--ifm-color-emphasis-100)' : 'transparent'}
                opacity={0.4}
              />
              {/* Domain label */}
              <text
                x={GRID_LEFT - 8}
                y={rowY + GRID_H_PER_ROW / 2 + 4}
                textAnchor="end"
                fontSize={10}
                fontWeight={600}
                fill={DOMAIN_COLORS[domain] || '#6b7280'}
              >
                {DOMAIN_LABELS[domain]}
              </text>
              {/* Scheduler dots */}
              {rowSchedulers.map((s) => {
                const cx = hourToX(s.hour, s.minute);
                const cy = rowY + GRID_H_PER_ROW / 2;
                return (
                  <g key={s.name}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill={DOMAIN_COLORS[s.domain] || '#6b7280'}
                      opacity={0.85}
                      style={{ cursor: 'pointer' }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${s.name} — ${s.timeLabel}`}
                      onMouseEnter={(e) => setTooltip({ visible: true, x: e.clientX, y: e.clientY, scheduler: s })}
                      onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                      onClick={() => { window.location.href = s.docUrl; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.href = s.docUrl; }}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.scheduler && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            background: 'var(--ifm-background-color)',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 9999,
            maxWidth: '260px',
            pointerEvents: 'none',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>{tooltip.scheduler.name}</div>
          <DomainBadge domain={tooltip.scheduler.domain} />
          <div style={{ marginTop: '6px', color: 'var(--ifm-color-emphasis-600)', fontSize: '0.75rem' }}>
            {tooltip.scheduler.timeLabel}
          </div>
          {tooltip.scheduler.purpose && (
            <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--ifm-color-emphasis-700)', lineHeight: 1.4 }}>
              {tooltip.scheduler.purpose.slice(0, 120)}{tooltip.scheduler.purpose.length > 120 ? '…' : ''}
            </div>
          )}
          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--ifm-color-primary)' }}>Click to view docs →</div>
        </div>
      )}
    </div>
  );
}

function FrequencyAccordion({ schedulers }: { schedulers: SchedulerRecord[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['daily-am', 'daily-pm', 'nightly']));
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? schedulers.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.domain && s.domain.toLowerCase().includes(search.toLowerCase()))
      )
    : schedulers;

  function toggle(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <input
          type="search"
          placeholder="Filter by name or domain…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '360px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--ifm-color-emphasis-300)',
            fontSize: '0.85rem',
            background: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          }}
        />
      </div>

      {FREQUENCY_GROUPS.map(({ key, label }) => {
        const groupItems = filtered.filter((s) => s.frequency === key);
        if (groupItems.length === 0) return null;
        const isOpen = openGroups.has(key) || !!search.trim();

        return (
          <div
            key={key}
            style={{
              marginBottom: '8px',
              border: '1px solid var(--ifm-color-emphasis-200)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => toggle(key)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'var(--ifm-color-emphasis-100)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--ifm-font-color-base)',
                textAlign: 'left',
              }}
            >
              <span>{label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'var(--ifm-color-emphasis-300)',
                    padding: '1px 8px',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {groupItems.length}
                </span>
                <span style={{ fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
              </span>
            </button>

            {isOpen && (
              <div>
                {groupItems.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '10px 16px',
                      borderTop: '1px solid var(--ifm-color-emphasis-100)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <DomainBadge domain={s.domain} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                        {s.name}
                        <a
                          href={s.docUrl}
                          style={{
                            marginLeft: '8px',
                            fontSize: '0.75rem',
                            color: 'var(--ifm-color-primary)',
                            textDecoration: 'none',
                          }}
                          title="View documentation"
                        >
                          ↗
                        </a>
                      </div>
                      <div style={{ color: 'var(--ifm-color-emphasis-600)', fontSize: '0.75rem', marginBottom: '2px' }}>
                        {s.timeLabel}
                        {' · '}
                        {s.fileCount} file{s.fileCount !== 1 ? 's' : ''}
                        {' · '}
                        {s.lineCount.toLocaleString()} lines
                      </div>
                      {s.purpose && (
                        <div style={{ color: 'var(--ifm-color-emphasis-700)', lineHeight: 1.4 }}>
                          {s.purpose.slice(0, 160)}{s.purpose.length > 160 ? '…' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SchedulerTimeline() {
  const [schedulers, setSchedulers] = useState<SchedulerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch('/scheduler-data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SchedulerRecord[]) => {
        setSchedulers(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (!mounted || loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>
        Loading scheduler data…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#ef4444' }}>
        Failed to load scheduler data: {error}
      </div>
    );
  }

  const timedCount = schedulers.filter((s) => s.hour >= 0).length;

  return (
    <div style={{ fontFamily: 'var(--ifm-font-family-base)' }}>
      {/* Domain color legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '16px',
          padding: '10px 14px',
          background: 'var(--ifm-color-emphasis-100)',
          borderRadius: '8px',
        }}
      >
        {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: DOMAIN_COLORS[key], display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      {/* Section A: 24-Hour Grid */}
      <h3 style={{ marginBottom: '8px' }}>24-Hour Run Schedule</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)', marginBottom: '12px' }}>
        {timedCount} schedulers with documented run times. Hover for details, click to view docs.
      </p>
      <Grid24Hour schedulers={schedulers} />

      {/* Section B: Frequency Accordion */}
      <h3 style={{ marginTop: '32px', marginBottom: '8px' }}>All {schedulers.length} Schedulers by Frequency</h3>
      <FrequencyAccordion schedulers={schedulers} />
    </div>
  );
}
