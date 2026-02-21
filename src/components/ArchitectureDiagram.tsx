import React from 'react';

interface ArchitectureDiagramProps {
  chart: string;
  title?: string;
}

// Attempt to load the Mermaid component once at module scope.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MermaidComponent: React.ComponentType<{ value: string }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  MermaidComponent = require('@docusaurus/theme-mermaid/lib/theme/Mermaid').default;
} catch {
  console.warn('ArchitectureDiagram: @docusaurus/theme-mermaid not available, falling back to code block');
}

/**
 * Renders the Mermaid diagram if the theme component is available,
 * otherwise falls back to a raw code block.
 */
function MermaidRenderer({ chart }: { chart: string }): React.JSX.Element {
  if (MermaidComponent) {
    return <MermaidComponent value={chart} />;
  }
  return (
    <div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-600)', marginBottom: '0.5rem' }}>
        Mermaid rendering is not available. Showing raw diagram definition:
      </p>
      <pre
        style={{
          background: 'var(--ifm-code-background)',
          padding: '1rem',
          borderRadius: '4px',
          overflow: 'auto',
          fontSize: '0.85rem',
        }}
      >
        <code>{chart}</code>
      </pre>
    </div>
  );
}

export default function ArchitectureDiagram({ chart, title }: ArchitectureDiagramProps): React.JSX.Element {
  return (
    <div
      style={{
        border: '1px solid var(--ifm-color-emphasis-200)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '1.5rem',
      }}
    >
      {title && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--ifm-color-emphasis-200)',
            background: 'var(--ifm-color-emphasis-100)',
            fontWeight: 600,
            fontSize: '1rem',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: '1rem' }}>
        <MermaidRenderer chart={chart} />
      </div>
    </div>
  );
}
