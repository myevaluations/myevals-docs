import React, { useState, useMemo } from 'react';

interface Scheduler {
  name: string;
  domain: string;
  frequency: string;
  description: string;
  type: string;
  status: string;
}

/** Raw format from parse-dotnet-schedulers.ts */
interface RawScheduler {
  name: string;
  className: string;
  description: string;
  schedulePattern: string;
  domain: string;
  filePath: string;
  projectName: string;
  serviceType: string;
  methods: string[];
}

interface SchedulerCatalogProps {
  schedulers?: (Scheduler | RawScheduler)[];
}

function normalizeScheduler(s: Scheduler | RawScheduler): Scheduler {
  // If already normalized (has 'frequency' field), return as-is
  if ('frequency' in s && 'type' in s && 'status' in s) {
    return s as Scheduler;
  }
  const raw = s as RawScheduler;
  return {
    name: raw.name,
    domain: raw.domain || 'Unknown',
    frequency: raw.schedulePattern || 'Unknown',
    description: raw.description || `${raw.className} in ${raw.projectName}`,
    type: raw.serviceType === 'Unknown' ? '.NET' : raw.serviceType,
    status: 'Active',
  };
}

const PLACEHOLDER_SCHEDULERS: Scheduler[] = [
  {
    name: 'EvaluationReminderScheduler',
    domain: 'Evaluation',
    frequency: 'Daily at 6:00 AM',
    description: 'Sends reminder emails for pending evaluations that are due within the configured window.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'DutyHourComplianceCheck',
    domain: 'DutyHours',
    frequency: 'Every 4 hours',
    description: 'Checks duty hour entries against ACGME compliance rules and flags violations.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'CMECreditSync',
    domain: 'Clinical',
    frequency: 'Weekly (Sunday 2:00 AM)',
    description: 'Synchronizes CME credit records with external accreditation bodies.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'RotationAutoAssignment',
    domain: 'Clinical',
    frequency: 'Monthly (1st at midnight)',
    description: 'Auto-assigns residents to rotations based on program requirements and availability.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'ReportGenerationService',
    domain: 'Evaluation',
    frequency: 'On-demand / Nightly',
    description: 'Generates and caches aggregate evaluation reports for programs.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'UserDeactivationCleanup',
    domain: 'Admin',
    frequency: 'Daily at 1:00 AM',
    description: 'Deactivates user accounts that have been marked for removal after the grace period.',
    type: 'Legacy',
    status: 'Deprecated',
  },
  {
    name: 'PatientLogArchiver',
    domain: 'Clinical',
    frequency: 'Monthly (15th at 3:00 AM)',
    description: 'Archives old patient log entries to cold storage after retention period.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'EmailDigestScheduler',
    domain: 'Notification',
    frequency: 'Daily at 7:00 AM',
    description: 'Compiles and sends daily digest emails summarizing pending tasks for each user.',
    type: '.NET',
    status: 'Active',
  },
  {
    name: 'DBMaintenanceVBS',
    domain: 'Admin',
    frequency: 'Weekly (Saturday 11:00 PM)',
    description: 'Legacy VBScript that performs database index maintenance and statistics updates.',
    type: 'VBS',
    status: 'Deprecated',
  },
  {
    name: 'MilestoneProgressCalculator',
    domain: 'Evaluation',
    frequency: 'Nightly at 11:00 PM',
    description: 'Recalculates milestone achievement levels based on recent evaluation data.',
    type: '.NET',
    status: 'Active',
  },
];

const ALL_DOMAINS = ['All', 'Evaluation', 'Clinical', 'DutyHours', 'Admin', 'Notification'];
const ALL_TYPES = ['All', '.NET', 'VBS', 'Legacy'];

function getStatusBadge(status: string): React.JSX.Element {
  const classMap: Record<string, string> = {
    Active: 'badge badge--modern',
    Deprecated: 'badge badge--critical',
    Disabled: 'badge badge--legacy',
    Migrated: 'badge badge--migrating',
  };
  return <span className={classMap[status] ?? 'badge'}>{status}</span>;
}

function getTypeBadge(type: string): React.JSX.Element {
  const classMap: Record<string, string> = {
    '.NET': 'badge badge--migrating',
    VBS: 'badge badge--critical',
    Legacy: 'badge badge--legacy',
  };
  return <span className={classMap[type] ?? 'badge'}>{type}</span>;
}

export default function SchedulerCatalog({ schedulers }: SchedulerCatalogProps): React.JSX.Element {
  const items = (schedulers ?? PLACEHOLDER_SCHEDULERS).map(normalizeScheduler);

  const [searchText, setSearchText] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  // Derive unique domains from data (merged with known ones)
  const domains = useMemo(() => {
    const fromData = new Set(items.map((s) => s.domain));
    const merged = new Set([...ALL_DOMAINS, ...fromData]);
    return Array.from(merged);
  }, [items]);

  // Derive unique types from data (merged with known ones)
  const types = useMemo(() => {
    const fromData = new Set(items.map((s) => s.type));
    const merged = new Set([...ALL_TYPES, ...fromData]);
    return Array.from(merged);
  }, [items]);

  const filteredSchedulers = useMemo(() => {
    const query = searchText.toLowerCase();
    return items.filter((s) => {
      const matchesSearch =
        !query || s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query);
      const matchesDomain = domainFilter === 'All' || s.domain === domainFilter;
      const matchesType = typeFilter === 'All' || s.type === typeFilter;
      return matchesSearch && matchesDomain && matchesType;
    });
  }, [items, searchText, domainFilter, typeFilter]);

  return (
    <div>
      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          placeholder="Search schedulers..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '4px',
            fontSize: '0.9rem',
            flex: '1 1 200px',
            minWidth: '200px',
            background: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          }}
        />
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '4px',
            fontSize: '0.9rem',
            background: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          }}
        >
          {domains.map((d) => (
            <option key={d} value={d}>
              {d === 'All' ? 'All Domains' : d}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.4rem 0.75rem',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '4px',
            fontSize: '0.9rem',
            background: 'var(--ifm-background-color)',
            color: 'var(--ifm-font-color-base)',
          }}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t === 'All' ? 'All Types' : t}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)', marginBottom: '0.5rem' }}>
        Showing {filteredSchedulers.length} of {items.length} schedulers
      </p>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="scheduler-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Domain</th>
              <th style={{ textAlign: 'left' }}>Frequency</th>
              <th style={{ textAlign: 'center' }}>Type</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'left' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {filteredSchedulers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--ifm-color-emphasis-500)' }}>
                  No schedulers match the current filters.
                </td>
              </tr>
            ) : (
              filteredSchedulers.map((s) => (
                <tr key={s.name}>
                  <td style={{ fontFamily: 'var(--ifm-font-family-monospace)', fontSize: '0.85rem', fontWeight: 500 }}>
                    {s.name}
                  </td>
                  <td>{s.domain}</td>
                  <td style={{ fontSize: '0.85rem' }}>{s.frequency}</td>
                  <td style={{ textAlign: 'center' }}>{getTypeBadge(s.type)}</td>
                  <td style={{ textAlign: 'center' }}>{getStatusBadge(s.status)}</td>
                  <td style={{ fontSize: '0.85rem', maxWidth: '300px' }}>{s.description}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
