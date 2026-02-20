import React, { useEffect, useRef, useState } from 'react';

interface GraphNode {
  id: string;
  group: string;
  label: string;
}

interface GraphLink {
  source: string;
  target: string;
}

interface DependencyGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface DependencyGraphProps {
  data?: DependencyGraphData;
}

const GROUP_COLORS: Record<string, string> = {
  Business: '#1a73e8',
  DataAccess: '#28a745',
  Infrastructure: '#28a745',
  Web: '#fd7e14',
  Services: '#6f42c1',
  WindowsServices: '#6f42c1',
  Common: '#1a73e8',
  Other: '#6c757d',
};

const DEFAULT_COLOR = '#6c757d';

function getGroupColor(group: string): string {
  return GROUP_COLORS[group] ?? DEFAULT_COLOR;
}

export default function DependencyGraph({ data }: DependencyGraphProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!data || data.nodes.length === 0) return;

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

        const width = container.clientWidth || 800;
        const height = Math.max(container.clientHeight, 400);

        const svg = d3
          .select(container)
          .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('viewBox', `0 0 ${width} ${height}`)
          .style('width', '100%')
          .style('height', '100%');

        svgRef.current = svg.node();

        // Create a group for zoom/pan
        const g = svg.append('g');

        // Enable zoom and pan
        const zoom = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.3, 5])
          .on('zoom', (event) => {
            g.attr('transform', event.transform);
          });

        svg.call(zoom);

        // Build simulation with typed nodes
        interface SimNode extends d3.SimulationNodeDatum {
          id: string;
          group: string;
          label: string;
        }

        interface SimLink extends d3.SimulationLinkDatum<SimNode> {
          source: string | SimNode;
          target: string | SimNode;
        }

        const simNodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
        const simLinks: SimLink[] = data.links.map((l) => ({ ...l }));

        const simulation = d3
          .forceSimulation<SimNode>(simNodes)
          .force(
            'link',
            d3
              .forceLink<SimNode, SimLink>(simLinks)
              .id((d) => d.id)
              .distance(100),
          )
          .force('charge', d3.forceManyBody().strength(-300))
          .force('center', d3.forceCenter(width / 2, height / 2))
          .force('collision', d3.forceCollide().radius(30));

        // Draw links
        const link = g
          .append('g')
          .attr('stroke', '#999')
          .attr('stroke-opacity', 0.6)
          .selectAll<SVGLineElement, SimLink>('line')
          .data(simLinks)
          .join('line')
          .attr('stroke-width', 1.5);

        // Draw nodes
        const node = g
          .append('g')
          .selectAll<SVGCircleElement, SimNode>('circle')
          .data(simNodes)
          .join('circle')
          .attr('r', 10)
          .attr('fill', (d) => getGroupColor(d.group))
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
          .style('cursor', 'pointer');

        // Add drag behavior
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

        // Tooltip on hover
        const tooltip = d3
          .select(container)
          .append('div')
          .style('position', 'absolute')
          .style('background', 'rgba(0, 0, 0, 0.8)')
          .style('color', '#fff')
          .style('padding', '4px 8px')
          .style('border-radius', '4px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('opacity', '0')
          .style('transition', 'opacity 0.15s ease');

        node
          .on('mouseover', (event, d) => {
            tooltip
              .style('opacity', '1')
              .html(`<strong>${d.label}</strong><br/><span style="color:${getGroupColor(d.group)}">${d.group}</span>`);
          })
          .on('mousemove', (event) => {
            const rect = container.getBoundingClientRect();
            tooltip
              .style('left', `${event.clientX - rect.left + 12}px`)
              .style('top', `${event.clientY - rect.top - 10}px`);
          })
          .on('mouseout', () => {
            tooltip.style('opacity', '0');
          });

        // Draw labels next to nodes
        const labels = g
          .append('g')
          .selectAll<SVGTextElement, SimNode>('text')
          .data(simNodes)
          .join('text')
          .text((d) => d.label)
          .attr('font-size', '10px')
          .attr('dx', 14)
          .attr('dy', 4)
          .attr('fill', 'var(--ifm-font-color-base, #333)');

        // Tick updates
        simulation.on('tick', () => {
          link
            .attr('x1', (d) => (d.source as SimNode).x ?? 0)
            .attr('y1', (d) => (d.source as SimNode).y ?? 0)
            .attr('x2', (d) => (d.target as SimNode).x ?? 0)
            .attr('y2', (d) => (d.target as SimNode).y ?? 0);

          node.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);

          labels.attr('x', (d) => d.x ?? 0).attr('y', (d) => d.y ?? 0);
        });

        // Cleanup on unmount
        return () => {
          simulation.stop();
          tooltip.remove();
        };
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load D3 visualization library.');
          console.error('DependencyGraph D3 load error:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (svgRef.current) {
        svgRef.current.remove();
        svgRef.current = null;
      }
    };
  }, [data]);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="dependency-graph" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--ifm-color-emphasis-600)' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            No dependency graph data provided.
          </p>
          <p style={{ fontSize: '0.9rem' }}>
            Pass a <code>data</code> prop with <code>nodes</code> and <code>links</code> to render the graph.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dependency-graph" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--ifm-color-danger)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        {Object.entries(GROUP_COLORS).map(([group, color]) => (
          <span key={group} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: color,
              }}
            />
            {group}
          </span>
        ))}
      </div>
      <div
        className="dependency-graph"
        ref={containerRef}
        style={{ position: 'relative' }}
      />
    </div>
  );
}
