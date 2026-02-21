import React, { useState, useEffect, useCallback } from 'react';

export interface ReadingItem {
  id: string;
  label: string;
  href?: string;
  description?: string;
  week?: number;
  tag?: string;
}

interface ReadingProgressProps {
  items: ReadingItem[];
  storageKey?: string;
  title?: string;
}

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  architecture: { bg: '#3b82f620', color: '#3b82f6' },
  security: { bg: '#ef444420', color: '#ef4444' },
  evaluations: { bg: '#8b5cf620', color: '#8b5cf6' },
  migration: { bg: '#f9731620', color: '#f97316' },
  patterns: { bg: '#22c55e20', color: '#22c55e' },
  debugging: { bg: '#eab30820', color: '#ca8a04' },
  reference: { bg: '#6b728020', color: '#6b7280' },
};

function TagBadge({ tag }: { tag: string }) {
  const style = TAG_COLORS[tag.toLowerCase()] || { bg: '#6b728020', color: '#6b7280' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        marginLeft: '6px',
        verticalAlign: 'middle',
      }}
    >
      {tag}
    </span>
  );
}

export default function ReadingProgress({
  items,
  storageKey = 'reading-progress',
  title,
}: ReadingProgressProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setChecked(new Set(JSON.parse(stored) as string[]));
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  const resetAll = () => {
    setChecked(new Set());
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  const weeks = [...new Set(items.map((i) => i.week ?? 1))].sort();
  const completedCount = items.filter((i) => checked.has(i.id)).length;
  const totalCount = items.length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div>
      {/* Progress header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: 'var(--ifm-background-surface-color, #f8f9fa)',
          border: '1px solid var(--ifm-color-emphasis-200)',
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span>{title || 'Reading Progress'}</span>
            <span style={{ color: pct === 100 ? '#22c55e' : 'var(--ifm-color-emphasis-600)' }}>
              {completedCount}/{totalCount} completed {pct === 100 && '🎉'}
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              backgroundColor: 'var(--ifm-color-emphasis-200)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: '3px',
                backgroundColor: pct === 100 ? '#22c55e' : 'var(--ifm-color-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
        {completedCount > 0 && (
          <button
            onClick={resetAll}
            title="Reset all progress"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: 'var(--ifm-color-emphasis-500)',
              padding: '2px 6px',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Items grouped by week */}
      {weeks.map((week) => {
        const weekItems = items.filter((i) => (i.week ?? 1) === week);
        const weekCompleted = weekItems.filter((i) => checked.has(i.id)).length;

        return (
          <div key={week} style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--ifm-color-emphasis-600)',
                }}
              >
                Week {week}
              </h4>
              <span
                style={{
                  fontSize: '0.72rem',
                  color:
                    weekCompleted === weekItems.length
                      ? '#22c55e'
                      : 'var(--ifm-color-emphasis-400)',
                  fontWeight: 600,
                }}
              >
                {weekCompleted}/{weekItems.length}
                {weekCompleted === weekItems.length && ' ✓'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {weekItems.map((item) => {
                const isDone = mounted && checked.has(item.id);
                return (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: isDone
                        ? '#22c55e08'
                        : 'var(--ifm-background-color)',
                      border: `1px solid ${isDone ? '#22c55e30' : 'var(--ifm-color-emphasis-200)'}`,
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggle(item.id)}
                      style={{ marginTop: '2px', flexShrink: 0, accentColor: '#22c55e' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 500,
                          textDecoration: isDone ? 'line-through' : 'none',
                          color: isDone
                            ? 'var(--ifm-color-emphasis-500)'
                            : 'var(--ifm-font-color-base)',
                        }}
                      >
                        {item.href ? (
                          <a
                            href={item.href}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: 'inherit',
                              textDecoration: isDone ? 'line-through' : 'underline',
                              textDecorationColor: isDone
                                ? 'var(--ifm-color-emphasis-400)'
                                : 'var(--ifm-color-primary)',
                            }}
                          >
                            {item.label}
                          </a>
                        ) : (
                          item.label
                        )}
                        {item.tag && <TagBadge tag={item.tag} />}
                      </div>
                      {item.description && (
                        <div
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--ifm-color-emphasis-600)',
                            marginTop: '2px',
                          }}
                        >
                          {item.description}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
