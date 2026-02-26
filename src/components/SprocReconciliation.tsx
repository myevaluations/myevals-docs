import React, { useState, useMemo, useEffect } from 'react';

interface SprocMatch {
  sprocName: string;
  calledFromFiles: string[];
  calledFromMethods: string[];
  module: string;
}

interface SprocOrphanDb {
  name: string;
  schema: string;
}

interface SprocOrphanCode {
  name: string;
  calledFrom: string[];
}

interface SprocReconciliationProps {
  totalDbSprocs?: number;
  totalCodeSprocs?: number;
  matched?: SprocMatch[];
  orphanDb?: SprocOrphanDb[];
  orphanCode?: SprocOrphanCode[];
}

type Tab = 'matched' | 'dbOnly' | 'codeOnly';
type SortDir = 'asc' | 'desc';

interface SortState {
  column: string;
  dir: SortDir;
}

function SortArrow({ column, sort }: { column: string; sort: SortState }) {
  if (sort.column !== column) {
    return <span style={{ opacity: 0.3, marginLeft: '4px' }}>{'\u2195'}</span>;
  }
  return (
    <span style={{ marginLeft: '4px' }}>
      {sort.dir === 'asc' ? '\u25B2' : '\u25BC'}
    </span>
  );
}

export default function SprocReconciliation(props: SprocReconciliationProps): React.JSX.Element {
  const [data, setData] = useState<{
    totalDbSprocs: number;
    totalCodeSprocs: number;
    matched: SprocMatch[];
    orphanDb: SprocOrphanDb[];
    orphanCode: SprocOrphanCode[];
  } | null>(
    props.matched ? {
      totalDbSprocs: props.totalDbSprocs ?? 0,
      totalCodeSprocs: props.totalCodeSprocs ?? 0,
      matched: props.matched,
      orphanDb: props.orphanDb ?? [],
      orphanCode: props.orphanCode ?? [],
    } : null
  );

  useEffect(() => {
    if (!data) {
      fetch('/sproc-reconciliation-data.json')
        .then((r) => r.json())
        .then((d) => setData({
          totalDbSprocs: d.totalDbSprocs ?? 0,
          totalCodeSprocs: d.totalCodeSprocs ?? 0,
          matched: d.crossReference ?? d.matched ?? [],
          orphanDb: d.orphanDb ?? [],
          orphanCode: d.orphanCode ?? [],
        }))
        .catch(console.error);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('matched');
  const [search, setSearch] = useState('');
  const [matchedSort, setMatchedSort] = useState<SortState>({ column: 'sprocName', dir: 'asc' });
  const [dbSort, setDbSort] = useState<SortState>({ column: 'name', dir: 'asc' });
  const [codeSort, setCodeSort] = useState<SortState>({ column: 'name', dir: 'asc' });

  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ifm-color-emphasis-500)' }}>Loading reconciliation data...</div>;
  }

  const { totalDbSprocs, totalCodeSprocs, matched, orphanDb, orphanCode } = data;

  const matchedPct = totalDbSprocs > 0
    ? ((matched.length / totalDbSprocs) * 100).toFixed(1)
    : '0';

  // --- Filtering ---
  const query = search.toLowerCase();

  const filteredMatched = useMemo(() => {
    if (!query) return matched;
    return matched.filter(
      (m) =>
        m.sprocName.toLowerCase().includes(query) ||
        m.module.toLowerCase().includes(query) ||
        m.calledFromFiles.some((f) => f.toLowerCase().includes(query)) ||
        m.calledFromMethods.some((meth) => meth.toLowerCase().includes(query)),
    );
  }, [matched, query]);

  const filteredDbOnly = useMemo(() => {
    if (!query) return orphanDb;
    return orphanDb.filter(
      (o) =>
        o.name.toLowerCase().includes(query) ||
        o.schema.toLowerCase().includes(query),
    );
  }, [orphanDb, query]);

  const filteredCodeOnly = useMemo(() => {
    if (!query) return orphanCode;
    return orphanCode.filter(
      (o) =>
        o.name.toLowerCase().includes(query) ||
        o.calledFrom.some((f) => f.toLowerCase().includes(query)),
    );
  }, [orphanCode, query]);

  // --- Sorting ---
  function toggleSort(
    current: SortState,
    setter: React.Dispatch<React.SetStateAction<SortState>>,
    column: string,
  ) {
    if (current.column === column) {
      setter({ column, dir: current.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      setter({ column, dir: 'asc' });
    }
  }

  function cmp(a: string, b: string, dir: SortDir): number {
    const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
    return dir === 'asc' ? result : -result;
  }

  const sortedMatched = useMemo(() => {
    const arr = [...filteredMatched];
    arr.sort((a, b) => {
      switch (matchedSort.column) {
        case 'sprocName':
          return cmp(a.sprocName, b.sprocName, matchedSort.dir);
        case 'module':
          return cmp(a.module, b.module, matchedSort.dir);
        case 'calledFrom':
          return cmp(
            a.calledFromFiles[0] || '',
            b.calledFromFiles[0] || '',
            matchedSort.dir,
          );
        case 'methods':
          return cmp(
            a.calledFromMethods[0] || '',
            b.calledFromMethods[0] || '',
            matchedSort.dir,
          );
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredMatched, matchedSort]);

  const sortedDbOnly = useMemo(() => {
    const arr = [...filteredDbOnly];
    arr.sort((a, b) => {
      switch (dbSort.column) {
        case 'name':
          return cmp(a.name, b.name, dbSort.dir);
        case 'schema':
          return cmp(a.schema, b.schema, dbSort.dir);
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredDbOnly, dbSort]);

  const sortedCodeOnly = useMemo(() => {
    const arr = [...filteredCodeOnly];
    arr.sort((a, b) => {
      switch (codeSort.column) {
        case 'name':
          return cmp(a.name, b.name, codeSort.dir);
        case 'calledFrom':
          return cmp(
            a.calledFrom[0] || '',
            b.calledFrom[0] || '',
            codeSort.dir,
          );
        default:
          return 0;
      }
    });
    return arr;
  }, [filteredCodeOnly, codeSort]);

  // --- Styles ---
  const statCardBase: React.CSSProperties = {
    flex: '1 1 0',
    minWidth: '120px',
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'var(--ifm-color-emphasis-100)',
    textAlign: 'center',
  };

  const statValue: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
  };

  const statLabel: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--ifm-color-emphasis-600)',
    marginTop: '2px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    borderBottom: '2px solid var(--ifm-color-emphasis-200)',
    fontSize: '0.85rem',
    fontWeight: 600,
  };

  const tdStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    borderBottom: '1px solid var(--ifm-color-emphasis-200)',
    verticalAlign: 'top',
  };

  const monoTd: React.CSSProperties = {
    ...tdStyle,
    fontFamily: 'var(--ifm-font-family-monospace)',
  };

  const tabBase: React.CSSProperties = {
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: 'var(--ifm-color-emphasis-600)',
    borderBottom: '3px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  };

  function tabStyle(tab: Tab): React.CSSProperties {
    const colors: Record<Tab, string> = {
      matched: '#22c55e',
      dbOnly: '#f97316',
      codeOnly: '#ef4444',
    };
    if (activeTab === tab) {
      return {
        ...tabBase,
        color: 'var(--ifm-font-color-base)',
        fontWeight: 600,
        borderBottomColor: colors[tab],
      };
    }
    return tabBase;
  }

  function badgeStyle(tab: Tab): React.CSSProperties {
    const colors: Record<Tab, string> = {
      matched: '#22c55e',
      dbOnly: '#f97316',
      codeOnly: '#ef4444',
    };
    return {
      marginLeft: '6px',
      fontSize: '0.72rem',
      fontWeight: 600,
      padding: '1px 7px',
      borderRadius: '10px',
      background: activeTab === tab ? colors[tab] : 'var(--ifm-color-emphasis-200)',
      color: activeTab === tab ? '#fff' : 'var(--ifm-color-emphasis-600)',
    };
  }

  const emptyRow = (colSpan: number) => (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          textAlign: 'center',
          padding: '2rem',
          color: 'var(--ifm-color-emphasis-500)',
        }}
      >
        No stored procedures match the search query.
      </td>
    </tr>
  );

  // --- Active tab counts for the filter status ---
  const activeCount =
    activeTab === 'matched'
      ? filteredMatched.length
      : activeTab === 'dbOnly'
        ? filteredDbOnly.length
        : filteredCodeOnly.length;
  const activeTotal =
    activeTab === 'matched'
      ? matched.length
      : activeTab === 'dbOnly'
        ? orphanDb.length
        : orphanCode.length;

  return (
    <div style={{ fontFamily: 'var(--ifm-font-family-base)' }}>
      {/* Summary Stats Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '1.25rem',
        }}
      >
        <div style={statCardBase}>
          <div style={{ ...statValue, color: 'var(--ifm-color-primary)' }}>
            {totalDbSprocs.toLocaleString()}
          </div>
          <div style={statLabel}>DB Stored Procs</div>
        </div>
        <div style={statCardBase}>
          <div style={{ ...statValue, color: 'var(--ifm-color-primary)' }}>
            {totalCodeSprocs.toLocaleString()}
          </div>
          <div style={statLabel}>Code References</div>
        </div>
        <div style={{ ...statCardBase, borderLeft: '3px solid #22c55e' }}>
          <div style={{ ...statValue, color: '#22c55e' }}>
            {matched.length.toLocaleString()}
            <span style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: '4px' }}>
              ({matchedPct}%)
            </span>
          </div>
          <div style={statLabel}>Matched</div>
        </div>
        <div style={{ ...statCardBase, borderLeft: '3px solid #f97316' }}>
          <div style={{ ...statValue, color: '#f97316' }}>
            {orphanDb.length.toLocaleString()}
          </div>
          <div style={statLabel}>DB-Only</div>
        </div>
        <div style={{ ...statCardBase, borderLeft: '3px solid #ef4444' }}>
          <div style={{ ...statValue, color: '#ef4444' }}>
            {orphanCode.length.toLocaleString()}
          </div>
          <div style={statLabel}>Code-Only</div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--ifm-color-emphasis-200)',
          marginBottom: '0.75rem',
        }}
      >
        <button style={tabStyle('matched')} onClick={() => setActiveTab('matched')}>
          Matched
          <span style={badgeStyle('matched')}>{matched.length.toLocaleString()}</span>
        </button>
        <button style={tabStyle('dbOnly')} onClick={() => setActiveTab('dbOnly')}>
          DB-Only Orphans
          <span style={badgeStyle('dbOnly')}>{orphanDb.length.toLocaleString()}</span>
        </button>
        <button style={tabStyle('codeOnly')} onClick={() => setActiveTab('codeOnly')}>
          Code-Only Orphans
          <span style={badgeStyle('codeOnly')}>{orphanCode.length.toLocaleString()}</span>
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '0.75rem' }}>
        <input
          type="text"
          placeholder="Search stored procedures..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--ifm-color-emphasis-600)',
            marginTop: '0.25rem',
          }}
        >
          Showing {activeCount.toLocaleString()} of {activeTotal.toLocaleString()} stored procedures
        </p>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {activeTab === 'matched' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(matchedSort, setMatchedSort, 'sprocName')}
                >
                  SP Name
                  <SortArrow column="sprocName" sort={matchedSort} />
                </th>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(matchedSort, setMatchedSort, 'module')}
                >
                  Module
                  <SortArrow column="module" sort={matchedSort} />
                </th>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(matchedSort, setMatchedSort, 'calledFrom')}
                >
                  Called From
                  <SortArrow column="calledFrom" sort={matchedSort} />
                </th>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(matchedSort, setMatchedSort, 'methods')}
                >
                  Methods
                  <SortArrow column="methods" sort={matchedSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedMatched.length === 0
                ? emptyRow(4)
                : sortedMatched.map((m) => (
                    <tr key={m.sprocName}>
                      <td style={monoTd}>
                        <span style={{ fontWeight: 600 }}>{m.sprocName}</span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 8px',
                            borderRadius: '4px',
                            background: 'var(--ifm-color-emphasis-100)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {m.module}
                        </span>
                      </td>
                      <td style={monoTd}>
                        {m.calledFromFiles.map((f, i) => (
                          <div key={i} style={{ lineHeight: 1.5 }}>
                            {f}
                          </div>
                        ))}
                      </td>
                      <td style={monoTd}>
                        {m.calledFromMethods.map((meth, i) => (
                          <div key={i} style={{ lineHeight: 1.5 }}>
                            {meth}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}

        {activeTab === 'dbOnly' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(dbSort, setDbSort, 'name')}
                >
                  SP Name
                  <SortArrow column="name" sort={dbSort} />
                </th>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(dbSort, setDbSort, 'schema')}
                >
                  Schema
                  <SortArrow column="schema" sort={dbSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDbOnly.length === 0
                ? emptyRow(2)
                : sortedDbOnly.map((o) => (
                    <tr key={o.name}>
                      <td style={monoTd}>
                        <span style={{ fontWeight: 600 }}>{o.name}</span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 8px',
                            borderRadius: '4px',
                            background: 'var(--ifm-color-emphasis-100)',
                            fontSize: '0.8rem',
                          }}
                        >
                          {o.schema}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}

        {activeTab === 'codeOnly' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(codeSort, setCodeSort, 'name')}
                >
                  SP Name
                  <SortArrow column="name" sort={codeSort} />
                </th>
                <th
                  style={thStyle}
                  onClick={() => toggleSort(codeSort, setCodeSort, 'calledFrom')}
                >
                  Called From
                  <SortArrow column="calledFrom" sort={codeSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCodeOnly.length === 0
                ? emptyRow(2)
                : sortedCodeOnly.map((o) => (
                    <tr key={o.name}>
                      <td style={monoTd}>
                        <span style={{ fontWeight: 600 }}>{o.name}</span>
                      </td>
                      <td style={monoTd}>
                        {o.calledFrom.map((f, i) => (
                          <div key={i} style={{ lineHeight: 1.5 }}>
                            {f}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
