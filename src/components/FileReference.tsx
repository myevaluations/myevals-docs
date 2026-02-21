import React, { useState, useMemo } from 'react';

import { GITHUB_BASE } from '../utils/github';

interface FileEntry {
  filePath: string;
  fileName: string;
  fileType: string;
  className: string;
  inheritsFrom: string | null;
  module: string;
  summary: string;
  businessPurpose: string;
  keyMethods: (string | { name: string; description: string })[];
  storedProcedures: string[];
  businessManagersUsed: string[];
  migrationRelevance: string;
  migrationNote?: string;
  complexity: string;
  lineCount: number;
}

interface FileReferenceProps {
  files?: FileEntry[];
  /** @deprecated — overview is now rendered in MDX body, not inside the component */
  directoryOverview?: string;
  /** @deprecated — workflows are now rendered in MDX body, not inside the component */
  keyWorkflows?: (string | { name: string; description?: string; [key: string]: unknown })[];
  showExpandedDetails?: boolean;
  /** ISO timestamp from enrichment JSON generatedAt field */
  generatedAt?: string;
}

function formatMethod(m: string | { name: string; description: string }): string {
  if (typeof m === 'string') return m;
  return m.description ? `${m.name} - ${m.description}` : m.name;
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

const FILE_TYPE_LABELS: Record<string, string> = {
  'code-behind': 'Page',
  'handler': 'Handler',
  'user-control': 'Control',
  'class': 'Class',
  'service': 'Service',
  'business': 'Business',
  'infrastructure': 'Infra',
  'page': 'Page',
  'other': 'Other',
};

const PLACEHOLDER_FILES: FileEntry[] = [
  {
    filePath: 'Web/Security/Login.aspx.cs',
    fileName: 'Login.aspx.cs',
    fileType: 'code-behind',
    className: 'Login',
    inheritsFrom: 'BasePage',
    module: 'Security',
    summary: 'Main login page handling user authentication via username/password and SSO.',
    businessPurpose: 'Allows users to sign into the MyEvaluations platform.',
    keyMethods: ['Page_Load - Initializes login form', 'btnLogin_Click - Validates credentials'],
    storedProcedures: ['sp_ValidateUser'],
    businessManagersUsed: ['SecurityManager'],
    migrationRelevance: 'high',
    migrationNote: 'Login flow has been partially migrated to Node.js backend.',
    complexity: 'moderate',
    lineCount: 285,
  },
  {
    filePath: 'Web/Security/UserManagement.aspx.cs',
    fileName: 'UserManagement.aspx.cs',
    fileType: 'code-behind',
    className: 'UserManagement',
    inheritsFrom: 'BasePage',
    module: 'Security',
    summary: 'Admin page for managing user accounts, roles, and permissions.',
    businessPurpose: 'Enables administrators to create, edit, and deactivate user accounts.',
    keyMethods: ['BindUsers - Loads user list', 'SaveUser - Creates/updates user record'],
    storedProcedures: ['sp_GetUsers', 'sp_SaveUser'],
    businessManagersUsed: ['SecurityManager'],
    migrationRelevance: 'medium',
    complexity: 'complex',
    lineCount: 650,
  },
];

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

function FileDetailRow({ file, isExpanded, onToggle }: {
  file: FileEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        title="Click to expand details"
      >
        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          <span style={{ marginRight: '4px' }}>{isExpanded ? '▼' : '▶'}</span>
          {file.fileName}
          <a
            href={`${GITHUB_BASE}${file.filePath}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View on GitHub"
            onClick={(e) => e.stopPropagation()}
            style={{
              marginLeft: '6px',
              color: 'var(--ifm-color-emphasis-500)',
              fontSize: '0.75rem',
              textDecoration: 'none',
              verticalAlign: 'middle',
            }}
          >
            ↗
          </a>
        </td>
        <td>
          <Badge
            label={FILE_TYPE_LABELS[file.fileType] || file.fileType}
            color="#3b82f6"
          />
        </td>
        <td style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
          {file.summary}
        </td>
        <td>
          <Badge
            label={file.complexity}
            color={COMPLEXITY_COLORS[file.complexity] || '#6b7280'}
          />
        </td>
        <td>
          <Badge
            label={file.migrationRelevance}
            color={MIGRATION_COLORS[file.migrationRelevance] || '#6b7280'}
          />
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {file.lineCount.toLocaleString()}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} style={{ padding: '12px 16px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <strong>Class:</strong> {file.className}
                {file.inheritsFrom && <> : {file.inheritsFrom}</>}
                <br />
                <strong>Purpose:</strong> {file.businessPurpose}
                {file.migrationNote && (
                  <>
                    <br />
                    <strong>Migration:</strong> {file.migrationNote}
                  </>
                )}
              </div>
              <div>
                {file.keyMethods.length > 0 && (
                  <>
                    <strong>Key Methods:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '0.85rem' }}>
                      {file.keyMethods.slice(0, 8).map((m, i) => (
                        <li key={`${file.filePath}-m-${i}`}>{formatMethod(m)}</li>
                      ))}
                      {file.keyMethods.length > 8 && (
                        <li style={{ fontStyle: 'italic' }}>+{file.keyMethods.length - 8} more</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>
            {(file.storedProcedures.length > 0 || file.businessManagersUsed.length > 0) && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {file.storedProcedures.length > 0 && (
                  <div>
                    <strong>Stored Procedures:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {file.storedProcedures.join(', ')}
                    </span>
                  </div>
                )}
                {file.businessManagersUsed.length > 0 && (
                  <div>
                    <strong>Business Managers:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {file.businessManagersUsed.join(', ')}
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

export default function FileReference({
  files,
  directoryOverview,
  keyWorkflows,
  showExpandedDetails = false,
  generatedAt,
}: FileReferenceProps) {
  const data = files && files.length > 0 ? files : PLACEHOLDER_FILES;
  const isPlaceholder = !files || files.length === 0;

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'fileName' | 'complexity' | 'migrationRelevance' | 'lineCount'>('fileName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');
  const [filterMigration, setFilterMigration] = useState<string>('all');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [exportCopied, setExportCopied] = useState(false);

  const toggleExpand = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = data.filter((f) => {
      const matchesSearch =
        !search ||
        f.fileName.toLowerCase().includes(search.toLowerCase()) ||
        f.className?.toLowerCase().includes(search.toLowerCase()) ||
        f.summary.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || f.fileType === filterType;
      const matchesComplexity = filterComplexity === 'all' || f.complexity === filterComplexity;
      const matchesMigration = filterMigration === 'all' || f.migrationRelevance === filterMigration;
      return matchesSearch && matchesType && matchesComplexity && matchesMigration;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'fileName':
          cmp = a.fileName.localeCompare(b.fileName);
          break;
        case 'complexity':
          cmp = COMPLEXITY_ORDER.indexOf(a.complexity) - COMPLEXITY_ORDER.indexOf(b.complexity);
          break;
        case 'migrationRelevance':
          cmp = MIGRATION_ORDER.indexOf(a.migrationRelevance) - MIGRATION_ORDER.indexOf(b.migrationRelevance);
          break;
        case 'lineCount':
          cmp = a.lineCount - b.lineCount;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, search, sortField, sortDir, filterType, filterComplexity, filterMigration]);

  const fileTypes = [...new Set(data.map((f) => f.fileType))];
  const complexities = [...new Set(data.map((f) => f.complexity))];
  const migrations = [...new Set(data.map((f) => f.migrationRelevance))];

  const handleExport = () => {
    const modules = [...new Set(filtered.map((f) => f.module).filter(Boolean))];
    const moduleLabel = modules.length === 1 ? modules[0] : modules.length > 1 ? `${modules.join(', ')}` : 'Files';
    const lines = [
      `## Files to Review — ${moduleLabel} (${filtered.length} files)`,
      '',
      ...filtered.map((f) => `- [ ] ${f.fileName} (${f.complexity}) — ${f.summary}`),
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2000);
    }).catch(() => {
      // Clipboard API unavailable (e.g. non-HTTPS or blocked by browser)
      setExportCopied(false);
    });
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: typeof sortField) =>
    sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // Summary stats (memoised — data only changes on prop change)
  const { totalLines, complexityDist, migrationDist } = useMemo(() => {
    const totalLines = data.reduce((s, f) => s + f.lineCount, 0);
    const complexityDist = COMPLEXITY_ORDER.map((c) => ({
      label: c,
      count: data.filter((f) => f.complexity === c).length,
      color: COMPLEXITY_COLORS[c],
    })).filter((d) => d.count > 0);
    const migrationDist = [...MIGRATION_ORDER].reverse().map((m) => ({
      label: m,
      count: data.filter((f) => f.migrationRelevance === m).length,
      color: MIGRATION_COLORS[m],
    })).filter((d) => d.count > 0);
    return { totalLines, complexityDist, migrationDist };
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
            title={`AI enrichment generated on ${enrichedLabel}`}
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
            🕒 Last enriched: {enrichedLabel}
          </span>
        </div>
      )}
      {isPlaceholder && (
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
          Showing placeholder data. Run the enrichment pipeline to populate with real file data.
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
        {/* File / line count card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Files</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{data.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>{totalLines.toLocaleString()} lines</div>
        </div>

        {/* Complexity breakdown card */}
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

        {/* Migration breakdown card */}
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

        {/* Filter status card */}
        <div style={{ padding: '10px 14px', backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ifm-color-emphasis-600)', marginBottom: '4px' }}>Showing</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1 }}>{filtered.length.toLocaleString()}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600)', marginTop: '2px' }}>of {data.length} files</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search files..."
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
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Types</option>
          {fileTypes.map((t) => (
            <option key={t} value={t}>
              {FILE_TYPE_LABELS[t] || t}
            </option>
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
          value={filterMigration}
          onChange={(e) => setFilterMigration(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--ifm-color-emphasis-300)', fontSize: '0.85rem' }}
        >
          <option value="all">All Migration</option>
          {migrations.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          onClick={handleExport}
          title="Copy filtered files as a Markdown checklist to clipboard"
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
          {exportCopied ? '✓ Copied!' : '📋 Export Checklist'}
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--ifm-color-emphasis-300)' }}>
              <th
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px' }}
                onClick={() => handleSort('fileName')}
              >
                File{sortIndicator('fileName')}
              </th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Type</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Summary</th>
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
              <th
                style={{ cursor: 'pointer', textAlign: 'right', padding: '8px' }}
                onClick={() => handleSort('lineCount')}
              >
                Lines{sortIndicator('lineCount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((file) => (
              <FileDetailRow
                key={file.filePath}
                file={file}
                isExpanded={expandedFiles.has(file.filePath)}
                onToggle={() => toggleExpand(file.filePath)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', padding: '24px', color: 'var(--ifm-color-emphasis-600)' }}>
          No files match the current filters.
        </p>
      )}
    </div>
  );
}
