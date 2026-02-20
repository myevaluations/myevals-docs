import React from 'react';
import clsx from 'clsx';

interface MigrationFeature {
  feature: string;
  dotnetStatus: 'Active' | 'Legacy' | 'Deprecated';
  nodejsStatus: 'Complete' | 'In Progress' | 'Not Started' | 'Planned';
  migrationPercent: number;
}

const SAMPLE_DATA: MigrationFeature[] = [
  {
    feature: 'Authentication & SSO',
    dotnetStatus: 'Active',
    nodejsStatus: 'Complete',
    migrationPercent: 100,
  },
  {
    feature: 'Evaluations',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 65,
  },
  {
    feature: 'Duty Hours',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 40,
  },
  {
    feature: 'CME Tracking',
    dotnetStatus: 'Active',
    nodejsStatus: 'Planned',
    migrationPercent: 10,
  },
  {
    feature: 'Patient Log',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 55,
  },
  {
    feature: 'Goals & Milestones',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 45,
  },
  {
    feature: 'Conference Management',
    dotnetStatus: 'Active',
    nodejsStatus: 'Not Started',
    migrationPercent: 0,
  },
  {
    feature: 'Reports & Analytics',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 30,
  },
  {
    feature: 'User Management',
    dotnetStatus: 'Active',
    nodejsStatus: 'Complete',
    migrationPercent: 95,
  },
  {
    feature: 'Notifications & Email',
    dotnetStatus: 'Active',
    nodejsStatus: 'In Progress',
    migrationPercent: 70,
  },
  {
    feature: 'Scheduling (Rotations)',
    dotnetStatus: 'Active',
    nodejsStatus: 'Not Started',
    migrationPercent: 5,
  },
  {
    feature: 'Document Management',
    dotnetStatus: 'Active',
    nodejsStatus: 'Planned',
    migrationPercent: 15,
  },
];

function getProgressFillClass(percent: number): string {
  if (percent >= 80) return 'migration-progress__fill migration-progress__fill--complete';
  if (percent > 0) return 'migration-progress__fill migration-progress__fill--partial';
  return 'migration-progress__fill migration-progress__fill--none';
}

function getDotnetBadge(status: MigrationFeature['dotnetStatus']): React.JSX.Element {
  const classMap: Record<string, string> = {
    Active: 'badge badge--legacy',
    Legacy: 'badge badge--critical',
    Deprecated: 'badge badge--critical',
  };
  return <span className={classMap[status] ?? 'badge'}>{status}</span>;
}

function getNodejsBadge(status: MigrationFeature['nodejsStatus']): React.JSX.Element {
  const classMap: Record<string, string> = {
    Complete: 'badge badge--modern',
    'In Progress': 'badge badge--migrating',
    Planned: 'badge badge--migrating',
    'Not Started': 'badge badge--critical',
  };
  return <span className={classMap[status] ?? 'badge'}>{status}</span>;
}

function computeSummary(features: MigrationFeature[]) {
  const total = features.length;
  const complete = features.filter((f) => f.migrationPercent >= 80).length;
  const inProgress = features.filter((f) => f.migrationPercent > 0 && f.migrationPercent < 80).length;
  const notStarted = features.filter((f) => f.migrationPercent === 0).length;
  const avgPercent = Math.round(features.reduce((sum, f) => sum + f.migrationPercent, 0) / total);
  return { total, complete, inProgress, notStarted, avgPercent };
}

export default function MigrationTracker(): React.JSX.Element {
  const features = SAMPLE_DATA;
  const summary = computeSummary(features);

  return (
    <div>
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Total Features" value={summary.total} color="var(--ifm-color-primary)" />
        <SummaryCard label="Complete" value={summary.complete} color="#28a745" />
        <SummaryCard label="In Progress" value={summary.inProgress} color="#ffc107" />
        <SummaryCard label="Not Started" value={summary.notStarted} color="#dc3545" />
        <SummaryCard label="Avg. Migration" value={`${summary.avgPercent}%`} color="var(--ifm-color-primary)" />
      </div>

      {/* Feature table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem' }}>Feature</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>.NET Status</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem' }}>Node.js Status</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.75rem', minWidth: '120px' }}>Migration %</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', minWidth: '150px' }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.feature} style={{ borderBottom: '1px solid var(--ifm-color-emphasis-200)' }}>
                <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{f.feature}</td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{getDotnetBadge(f.dotnetStatus)}</td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{getNodejsBadge(f.nodejsStatus)}</td>
                <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                  {f.migrationPercent}%
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <div className="migration-progress">
                    <div
                      className={getProgressFillClass(f.migrationPercent)}
                      style={{ width: `${f.migrationPercent}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}): React.JSX.Element {
  return (
    <div
      style={{
        border: '1px solid var(--ifm-color-emphasis-200)',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        borderTop: `3px solid ${color}`,
      }}
    >
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--ifm-color-emphasis-600)' }}>{label}</div>
    </div>
  );
}
