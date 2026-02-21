import React, { useState, useEffect, useRef } from 'react';

interface FileRecord {
  n: string;   // fileName
  p: string;   // filePath
  la: string;  // layer: web | business | scheduler | supporting
  m: string;   // module
  c: number;   // complexity 0-4
  r: number;   // migrationRelevance 0-3
  lc: number;  // lineCount
  u: string;   // docUrl
}

const LAYER_COLORS: Record<string, string> = {
  web: '#3b82f6',
  business: '#ef4444',
  scheduler: '#f97316',
  supporting: '#6b7280',
};

const LAYER_LABELS: Record<string, string> = {
  web: 'Web Application',
  business: 'Business Layer',
  scheduler: 'Schedulers',
  supporting: 'Supporting Projects',
};

const COMPLEXITY_LABELS = ['Trivial', 'Simple', 'Moderate', 'Complex', 'Very Complex'];
const MIGRATION_LABELS = ['None', 'Low', 'Medium', 'High'];

// SVG layout constants
const SVG_W = 1000;
const SVG_H = 620;
const MARGIN = { top: 30, right: 180, bottom: 60, left: 120 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;

// Axis bands
const X_POSITIONS = [0, 1, 2, 3].map((i) => MARGIN.left + (i / 3) * PLOT_W);
const Y_POSITIONS = [0, 1, 2, 3, 4].map((i) => MARGIN.top + PLOT_H - (i / 4) * PLOT_H);

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 31) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function jitter(seed: string, axis: string, range: number): number {
  const h = hashStr(seed + axis);
  return ((h % (range * 2 + 1)) + (range * 2 + 1)) % (range * 2 + 1) - range;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  file: FileRecord | null;
}

export default function TechDebtRadar() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    web: true, business: true, scheduler: true, supporting: true,
  });
  const [minMigration, setMinMigration] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, file: null });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setMounted(true);
    fetch('/tech-debt-data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: FileRecord[]) => {
        setFiles(data);
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
        Loading chart…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#ef4444' }}>
        Failed to load tech debt data: {error}
      </div>
    );
  }

  const visible = files.filter((f) => layers[f.la] && f.r >= minMigration);

  function getBubbleX(f: FileRecord): number {
    return X_POSITIONS[f.r] + jitter(f.p, 'x', 35);
  }

  function getBubbleY(f: FileRecord): number {
    return Y_POSITIONS[f.c] + jitter(f.p, 'y', 35);
  }

  function getBubbleR(f: FileRecord): number {
    return Math.max(2, Math.min(12, Math.sqrt(f.lc) / 5));
  }

  function handleMouseMove(e: React.MouseEvent<SVGCircleElement>, file: FileRecord) {
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, file });
  }

  function handleMouseLeave() {
    setTooltip((t) => ({ ...t, visible: false }));
  }

  function handleClick(file: FileRecord) {
    window.location.href = file.u;
  }

  return (
    <div style={{ fontFamily: 'var(--ifm-font-family-base)', position: 'relative' }}>
      {/* Filter controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          marginBottom: '12px',
          padding: '12px 16px',
          background: 'var(--ifm-color-emphasis-100)',
          borderRadius: '8px',
          fontSize: '0.85rem',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--ifm-font-color-base)' }}>Layers:</span>
        {Object.keys(LAYER_LABELS).map((layer) => (
          <label key={layer} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={layers[layer]}
              onChange={(e) => setLayers((prev) => ({ ...prev, [layer]: e.target.checked }))}
            />
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: LAYER_COLORS[layer],
              }}
            />
            {LAYER_LABELS[layer]}
          </label>
        ))}
        <span style={{ marginLeft: '8px', fontWeight: 600 }}>Min Migration:</span>
        <select
          value={minMigration}
          onChange={(e) => setMinMigration(Number(e.target.value))}
          style={{ fontSize: '0.85rem', padding: '2px 6px', borderRadius: '4px' }}
        >
          <option value={0}>All</option>
          <option value={1}>Low+</option>
          <option value={2}>Medium+</option>
          <option value={3}>High only</option>
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--ifm-color-emphasis-600)', fontSize: '0.8rem' }}>
          Showing <strong>{visible.length}</strong> of {files.length} files
        </span>
      </div>

      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '600px' }}
        aria-label="Tech Debt Radar scatter plot"
      >
        {/* Quadrant backgrounds */}
        <rect x={MARGIN.left + PLOT_W / 2} y={MARGIN.top} width={PLOT_W / 2} height={PLOT_H / 2} fill="rgba(239,68,68,0.04)" />
        <rect x={MARGIN.left + PLOT_W / 2} y={MARGIN.top + PLOT_H / 2} width={PLOT_W / 2} height={PLOT_H / 2} fill="rgba(34,197,94,0.04)" />
        <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W / 2} height={PLOT_H / 2} fill="rgba(249,115,22,0.04)" />
        <rect x={MARGIN.left} y={MARGIN.top + PLOT_H / 2} width={PLOT_W / 2} height={PLOT_H / 2} fill="rgba(107,114,128,0.04)" />

        {/* Quadrant labels */}
        <text x={MARGIN.left + PLOT_W * 0.75} y={MARGIN.top + 18} textAnchor="middle" fontSize={11} fill="rgba(239,68,68,0.6)" fontWeight="600">Migration Priority</text>
        <text x={MARGIN.left + PLOT_W * 0.75} y={MARGIN.top + PLOT_H - 8} textAnchor="middle" fontSize={11} fill="rgba(34,197,94,0.7)" fontWeight="600">Quick Wins</text>
        <text x={MARGIN.left + PLOT_W * 0.25} y={MARGIN.top + 18} textAnchor="middle" fontSize={11} fill="rgba(249,115,22,0.6)" fontWeight="600">Refactor Candidates</text>
        <text x={MARGIN.left + PLOT_W * 0.25} y={MARGIN.top + PLOT_H - 8} textAnchor="middle" fontSize={11} fill="rgba(107,114,128,0.5)" fontWeight="600">Stable Code</text>

        {/* Grid lines */}
        {X_POSITIONS.map((x, i) => (
          <line key={`gx-${i}`} x1={x} y1={MARGIN.top} x2={x} y2={MARGIN.top + PLOT_H} stroke="var(--ifm-color-emphasis-200)" strokeWidth={1} />
        ))}
        {Y_POSITIONS.map((y, i) => (
          <line key={`gy-${i}`} x1={MARGIN.left} y1={y} x2={MARGIN.left + PLOT_W} y2={y} stroke="var(--ifm-color-emphasis-200)" strokeWidth={1} />
        ))}

        {/* X-axis labels */}
        {MIGRATION_LABELS.map((label, i) => (
          <text key={`xl-${i}`} x={X_POSITIONS[i]} y={SVG_H - MARGIN.bottom + 20} textAnchor="middle" fontSize={11} fill="var(--ifm-color-emphasis-600)">
            {label}
          </text>
        ))}
        <text x={MARGIN.left + PLOT_W / 2} y={SVG_H - 8} textAnchor="middle" fontSize={12} fontWeight="600" fill="var(--ifm-color-emphasis-700)">
          Migration Relevance →
        </text>

        {/* Y-axis labels */}
        {COMPLEXITY_LABELS.map((label, i) => (
          <text key={`yl-${i}`} x={MARGIN.left - 8} y={Y_POSITIONS[i] + 4} textAnchor="end" fontSize={10} fill="var(--ifm-color-emphasis-600)">
            {label}
          </text>
        ))}
        <text
          x={20}
          y={MARGIN.top + PLOT_H / 2}
          textAnchor="middle"
          fontSize={12}
          fontWeight="600"
          fill="var(--ifm-color-emphasis-700)"
          transform={`rotate(-90, 20, ${MARGIN.top + PLOT_H / 2})`}
        >
          ↑ Complexity
        </text>

        {/* Bubbles */}
        {visible.map((file) => (
          <circle
            key={file.p}
            cx={getBubbleX(file)}
            cy={getBubbleY(file)}
            r={getBubbleR(file)}
            fill={LAYER_COLORS[file.la] || '#6b7280'}
            opacity={0.7}
            style={{ cursor: 'pointer' }}
            onMouseMove={(e) => handleMouseMove(e, file)}
            onMouseLeave={handleMouseLeave}
            onClick={() => handleClick(file)}
          />
        ))}

        {/* Legend */}
        {Object.entries(LAYER_LABELS).map(([key, label], i) => (
          <g key={key} transform={`translate(${SVG_W - MARGIN.right + 10}, ${MARGIN.top + 20 + i * 22})`}>
            <circle cx={6} cy={0} r={6} fill={LAYER_COLORS[key]} opacity={0.8} />
            <text x={16} y={4} fontSize={11} fill="var(--ifm-color-emphasis-700)">{label}</text>
          </g>
        ))}
        <text x={SVG_W - MARGIN.right + 10} y={MARGIN.top + 115} fontSize={10} fill="var(--ifm-color-emphasis-500)">
          Size = lines of code
        </text>
      </svg>

      {/* Tooltip */}
      {tooltip.visible && tooltip.file && (
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
            maxWidth: '280px',
            pointerEvents: 'none',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ fontWeight: 700, fontFamily: 'monospace', marginBottom: '4px', wordBreak: 'break-all' }}>
            {tooltip.file.n}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '1px 7px',
                borderRadius: '10px',
                background: LAYER_COLORS[tooltip.file.la],
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 600,
                marginRight: '6px',
              }}
            >
              {LAYER_LABELS[tooltip.file.la]}
            </span>
          </div>
          {tooltip.file.m && (
            <div style={{ color: 'var(--ifm-color-emphasis-600)', marginBottom: '2px', fontSize: '0.75rem' }}>
              {tooltip.file.m}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
            <span>Complexity: <strong>{COMPLEXITY_LABELS[tooltip.file.c]}</strong></span>
            <span>Migration: <strong>{MIGRATION_LABELS[tooltip.file.r]}</strong></span>
          </div>
          <div style={{ marginTop: '2px', color: 'var(--ifm-color-emphasis-500)' }}>
            {tooltip.file.lc.toLocaleString()} lines
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: 'var(--ifm-color-primary)', textDecoration: 'underline' }}>
            Click to view docs →
          </div>
        </div>
      )}
    </div>
  );
}
