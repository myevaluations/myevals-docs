import React from 'react';

interface ArchitectureDiagramProps {
  chart: string;
  title?: string;
}

/**
 * Attempts to import and render the Mermaid component from @docusaurus/theme-mermaid.
 * If not available, falls back to rendering the chart definition as a code block.
 */
function MermaidRenderer({ chart }: { chart: string }): React.JSX.Element {
  // Attempt to use Docusaurus Mermaid theme component
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Mermaid = require('@docusaurus/theme-mermaid/lib/theme/Mermaid').default;
    return <Mermaid value={chart} />;
  } catch {
    // Mermaid theme not available - render as code block fallback
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
