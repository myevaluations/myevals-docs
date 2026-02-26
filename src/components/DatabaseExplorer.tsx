import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Type definitions ---

interface DBGraphNode {
  id: string;          // fullName e.g. "dbo.SEC_Users"
  name: string;        // short name e.g. "SEC_Users"
  module: string;      // normalized prefix e.g. "SEC"
  hasPK: boolean;
  fkCount: number;
  indexCount: number;
}

interface DBGraphLink {
  source: string;      // FK child table fullName
  target: string;      // FK parent table fullName
  constraintName: string;
}

interface DatabaseExplorerProps {
  nodes?: DBGraphNode[];
  links?: DBGraphLink[];
}

// --- Simulation node/link types (augmented by D3) ---

interface SimNode extends DBGraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
  vx?: number;
  vy?: number;
}

interface SimLink {
  source: SimNode | string;
  target: SimNode | string;
  constraintName: string;
  index?: number;
}

// --- Color palette: d3.schemeCategory10 (10) + d3.schemeSet3 (12) = 22 distinct colors ---

const COLOR_PALETTE = [
  // schemeCategory10
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  // schemeSet3
  '#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3',
  '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd',
  '#ccebc5', '#ffed6f',
];

function getModuleColor(module: string, moduleList: string[]): string {
  const idx = moduleList.indexOf(module);
  if (idx < 0) return '#6c757d';
  return COLOR_PALETTE[idx % COLOR_PALETTE.length];
}

function nodeRadius(fkCount: number): number {
  return 6 + Math.min(fkCount * 2, 20);
}

// --- Component ---

export default function DatabaseExplorer(props: DatabaseExplorerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Data: either from props or lazy-fetched
  const [data, setData] = useState<{ nodes: DBGraphNode[]; links: DBGraphLink[] } | null>(
    props.nodes && props.links ? { nodes: props.nodes, links: props.links } : null,
  );

  // Module filter
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  // Search
  const [searchTerm, setSearchTerm] = useState('');
  // Detail popover
  const [selectedNode, setSelectedNode] = useState<DBGraphNode | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Lazy fetch if no props
  useEffect(() => {
    if (data) return;
    setLoading(true);
    fetch('/db-explorer-data.json')
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error('DatabaseExplorer: failed to fetch data', err);
        setError('Failed to load database explorer data.');
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute sorted module list
  const modules = React.useMemo(() => {
    if (!data) return [];
    const set = new Set(data.nodes.map((n) => n.module));
    return Array.from(set).sort();
  }, [data]);

  // Set default module (first alphabetically) when data loads
  useEffect(() => {
    if (modules.length > 0 && selectedModule === null) {
      setSelectedModule(modules[0]);
    }
  }, [modules, selectedModule]);

  // Dismiss popover on click outside
  const dismissPopover = useCallback(() => setSelectedNode(null), []);

  // --- D3 rendering ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!data || data.nodes.length === 0) return;
    if (selectedModule === null) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      try {
        const d3 = await import('d3');

        if (cancelled) return;

        // Clear previous SVG
        if (svgRef.current) {
          svgRef.current.remove();
          svgRef.current = null;
        }

        // Filter nodes by module
        const showAll = selectedModule === '__ALL__';
        const visibleNodeIds = new Set<string>();
        const filteredNodes: SimNode[] = [];

        for (const n of data.nodes) {
          if (showAll || n.module === selectedModule) {
            visibleNodeIds.add(n.id);
            filteredNodes.push({ ...n });
          }
        }

        // Filter links: both endpoints must be visible
        const filteredLinks: SimLink[] = [];
        for (const l of data.links) {
          if (visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target)) {
            filteredLinks.push({ ...l });
          }
        }

        if (filteredNodes.length === 0) return;

        const width = container.clientWidth || 900;
        const height = Math.max(500, Math.min(filteredNodes.length * 3, 800));

        const svg = d3
          .select(container)
          .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', `0 0 ${width} ${height}`)
          .style('width', '100%')
          .style('height', '100%');

        svgRef.current = svg.node();

        // Defs for arrow markers
        svg
          .append('defs')
          .append('marker')
          .attr('id', 'db-arrow')
          .attr('viewBox', '0 -5 10 10')
          .attr('refX', 20)
          .attr('refY', 0)
          .attr('markerWidth', 6)
          .attr('markerHeight', 6)
          .attr('orient', 'auto')
          .append('path')
          .attr('d', 'M0,-5L10,0L0,5')
          .attr('fill', '#999');

        // Zoom/pan group
        const g = svg.append('g');

        const zoom = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.2, 6])
          .on('zoom', (event) => {
            g.attr('transform', event.transform);
          });

        svg.call(zoom);

        // Dismiss popover when clicking SVG background
        svg.on('click', () => {
          if (!cancelled) setSelectedNode(null);
        });

        // Force simulation
        const simulation = d3
          .forceSimulation<SimNode>(filteredNodes)
          .force(
            'link',
            d3
              .forceLink<SimNode, SimLink>(filteredLinks)
              .id((d) => d.id)
              .distance(60),
          )
          .force('charge', d3.forceManyBody().strength(-150))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force(
            'collide',
            d3.forceCollide<SimNode>().radius((d) => nodeRadius(d.fkCount) + 2),
          )
          .alphaDecay(0.02);

        // Draw links
        const link = g
          .append('g')
          .attr('stroke', '#999')
          .attr('stroke-opacity', 0.4)
          .selectAll<SVGLineElement, SimLink>('line')
          .data(filteredLinks)
          .join('line')
          .attr('stroke-width', 1)
          .attr('marker-end', 'url(#db-arrow)');

        // Draw nodes
        const node = g
          .append('g')
          .selectAll<SVGCircleElement, SimNode>('circle')
          .data(filteredNodes)
          .join('circle')
          .attr('r', (d) => nodeRadius(d.fkCount))
          .attr('fill', (d) => getModuleColor(d.module, modules))
          .attr('stroke', (d) => (d.hasPK ? '#fff' : 'var(--ifm-color-danger, #d62728)'))
          .attr('stroke-width', (d) => (d.hasPK ? 1.5 : 2))
          .attr('stroke-dasharray', (d) => (d.hasPK ? 'none' : '4,3'))
          .style('cursor', 'pointer');

        // Drag behavior
        const drag = d3
          .drag<SVGCircleElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          });

        node.call(drag);

        // Tooltip (hover)
        const tooltip = d3
          .select(container)
          .append('div')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.85)')
          .style('color', '#fff')
          .style('padding', '6px 10px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('opacity', '0')
          .style('transition', 'opacity 0.15s ease')
          .style('z-index', '10')
          .style('max-width', '250px');

        node
          .on('mouseover', (_event, d) => {
            const color = getModuleColor(d.module, modules);
            tooltip
              .style('opacity', '1')
              .html(
                `<strong>${d.name}</strong><br/>` +
                  `<span style="color:${color}">${d.module}</span> | ` +
                  `${d.fkCount} FK${d.fkCount !== 1 ? 's' : ''} | ` +
                  `${d.indexCount} index${d.indexCount !== 1 ? 'es' : ''}` +
                  `${!d.hasPK ? '<br/><em style="color:#ff6b6b">No primary key</em>' : ''}`,
              );
          })
          .on('mousemove', (event) => {
            const rect = container.getBoundingClientRect();
            tooltip
              .style('left', `${event.clientX - rect.left + 14}px`)
              .style('top', `${event.clientY - rect.top - 12}px`);
          })
          .on('mouseout', () => {
            tooltip.style('opacity', '0');
          });

        // Click handler for detail popover
        node.on('click', (event, d) => {
          event.stopPropagation();
          if (!cancelled) {
            const rect = container.getBoundingClientRect();
            setPopoverPos({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
            setSelectedNode(d);
          }
        });

        // Labels
        const labels = g
          .append('g')
          .selectAll<SVGTextElement, SimNode>('text')
          .data(filteredNodes)
          .join('text')
          .text((d) => d.name)
          .attr('font-size', '9px')
          .attr('dx', (d) => nodeRadius(d.fkCount) + 4)
          .attr('dy', 3)
          .attr('fill', 'var(--ifm-font-color-base, #333)')
          .style('pointer-events', 'none');

        // Search highlighting
        const lowerSearch = searchTerm.toLowerCase().trim();
        if (lowerSearch) {
          node.attr('opacity', (d) =>
            d.name.toLowerCase().includes(lowerSearch) || d.id.toLowerCase().includes(lowerSearch) ? 1 : 0.15,
          );
          labels.attr('opacity', (d) =>
            d.name.toLowerCase().includes(lowerSearch) || d.id.toLowerCase().includes(lowerSearch) ? 1 : 0.15,
          );
          link.attr('stroke-opacity', 0.08);
        }

        // Tick
        simulation.on('tick', () => {
          link
            .attr('x1', (d) => (d.source as SimNode).x ?? 0)
            .attr('y1', (d) => (d.source as SimNode).y ?? 0)
            .attr('x2', (d) => (d.target as SimNode).x ?? 0)
            .attr('y2', (d) => (d.target as SimNode).y ?? 0);

          node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);

          labels.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
        });

        // Inner cleanup (returned from async but not actually used by React —
        // the outer return handles cleanup)
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load D3 visualization library.');
          console.error('DatabaseExplorer D3 load error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
      // Also remove tooltip div if present
      const container = containerRef.current;
      if (container) {
        const tooltipEl = container.querySelector('div[style*="pointer-events: none"]');
        if (tooltipEl) tooltipEl.remove();
      }
    };
  }, [data, selectedModule, searchTerm, modules]);

  // --- Render: loading / error / empty states ---

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--ifm-color-emphasis-600)' }}>Loading database schema data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--ifm-color-danger)' }}>{error}</p>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ifm-color-emphasis-600)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            No database schema data available.
          </p>
          <p style={{ fontSize: '0.9rem' }}>
            Pass <code>nodes</code> and <code>links</code> props, or place a{' '}
            <code>db-explorer-data.json</code> file in the static directory.
          </p>
        </div>
      </div>
    );
  }

  // Compute visible modules for the legend
  const visibleModules =
    selectedModule === '__ALL__' ? modules : modules.filter((m) => m === selectedModule);

  return (
    <div>
      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Module filter */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          <span style={{ fontWeight: 600 }}>Module:</span>
          <select
            value={selectedModule ?? ''}
            onChange={(e) => {
              setSelectedNode(null);
              setSelectedModule(e.target.value);
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--ifm-color-emphasis-300)',
              background: 'var(--ifm-background-color)',
              color: 'var(--ifm-font-color-base)',
              fontSize: '0.85rem',
            }}
          >
            {modules.map((m) => {
              const count = data.nodes.filter((n) => n.module === m).length;
              return (
                <option key={m} value={m}>
                  {m} ({count})
                </option>
              );
            })}
            <option value="__ALL__">All modules ({data.nodes.length} tables)</option>
          </select>
        </label>

        {/* Search box */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          <span style={{ fontWeight: 600 }}>Search:</span>
          <input
            type="text"
            placeholder="Filter tables..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--ifm-color-emphasis-300)',
              background: 'var(--ifm-background-color)',
              color: 'var(--ifm-font-color-base)',
              fontSize: '0.85rem',
              width: '180px',
            }}
          />
        </label>

        {/* Node count info */}
        <span style={{ fontSize: '0.8rem', color: 'var(--ifm-color-emphasis-600)' }}>
          {selectedModule === '__ALL__'
            ? `${data.nodes.length} tables | ${data.links.length} FK relationships`
            : `${data.nodes.filter((n) => n.module === selectedModule).length} tables`}
        </span>
      </div>

      {/* Performance warning for All */}
      {selectedModule === '__ALL__' && data.nodes.length > 200 && (
        <div
          style={{
            padding: '6px 12px',
            marginBottom: '0.5rem',
            background: 'var(--ifm-color-warning-contrast-background, #fff3cd)',
            border: '1px solid var(--ifm-color-warning-dark, #ffc107)',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: 'var(--ifm-color-warning-contrast-foreground, #856404)',
          }}
        >
          Showing all {data.nodes.length} tables. The graph may be slow to render. Consider filtering
          by module for better performance.
        </div>
      )}

      {/* Legend: module colors for currently visible modules */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {visibleModules.map((m) => (
          <span
            key={m}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.8rem',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: getModuleColor(m, modules),
              }}
            />
            {m}
          </span>
        ))}
        {/* No-PK indicator in legend */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.8rem',
            marginLeft: '0.5rem',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--ifm-color-emphasis-400, #aaa)',
              border: '2px dashed var(--ifm-color-danger, #d62728)',
            }}
          />
          No PK
        </span>
      </div>

      {/* Graph container */}
      <div
        ref={containerRef}
        onClick={dismissPopover}
        style={{ position: 'relative', minHeight: '400px' }}
      >
        {/* Detail popover */}
        {selectedNode && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.min(popoverPos.x + 10, (containerRef.current?.clientWidth ?? 600) - 260),
              top: Math.max(popoverPos.y - 80, 10),
              background: 'var(--ifm-background-surface-color, #fff)',
              border: '1px solid var(--ifm-color-emphasis-300)',
              borderRadius: '6px',
              padding: '12px 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 20,
              minWidth: '200px',
              maxWidth: '280px',
              fontSize: '0.85rem',
              color: 'var(--ifm-font-color-base)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.95rem' }}>{selectedNode.name}</strong>
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  color: 'var(--ifm-color-emphasis-600)',
                  padding: '0 2px',
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div style={{ marginTop: '8px', lineHeight: 1.6 }}>
              <div>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Full name:</span>{' '}
                <code style={{ fontSize: '0.8rem' }}>{selectedNode.id}</code>
              </div>
              <div>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Module:</span>{' '}
                <span
                  style={{
                    color: getModuleColor(selectedNode.module, modules),
                    fontWeight: 600,
                  }}
                >
                  {selectedNode.module}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Primary key:</span>{' '}
                {selectedNode.hasPK ? (
                  <span style={{ color: 'var(--ifm-color-success, #28a745)' }}>Yes</span>
                ) : (
                  <span style={{ color: 'var(--ifm-color-danger, #d62728)', fontWeight: 600 }}>No</span>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Foreign keys:</span>{' '}
                {selectedNode.fkCount}
              </div>
              <div>
                <span style={{ color: 'var(--ifm-color-emphasis-600)' }}>Indexes:</span>{' '}
                {selectedNode.indexCount}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
