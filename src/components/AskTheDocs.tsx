/**
 * AskTheDocs.tsx
 *
 * Floating chat widget using OpenAI GPT-4o.
 * Context: enrichment-index.json file list (2,422 files) as system prompt.
 * API key injected via Docusaurus customFields at build time.
 *
 * Uses the OpenAI chat completions API directly via fetch (no openai SDK
 * needed in browser bundle — avoids bundle size issues).
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

interface DocsIndex {
  totalFiles: number;
  directories: Record<string, {
    layer: string;
    fileCount: number;
    totalLines: number;
    classes: string[];
    highPriority: string[];
  }>;
  moduleDependencies: Record<string, { web: number; schedulers: number }>;
}

function buildSystemPrompt(index: DocsIndex): string {
  const dirSummaries: string[] = [];
  for (const [dir, info] of Object.entries(index.directories)) {
    const classStr = info.classes.slice(0, 20).join(', ');
    dirSummaries.push(`${dir} [${info.layer}, ${info.fileCount}f, ${info.totalLines.toLocaleString()}L]: ${classStr}`);
  }

  const depSummaries = Object.entries(index.moduleDependencies)
    .filter(([, v]) => v.web + v.schedulers > 0)
    .sort(([, a], [, b]) => (b.web + b.schedulers) - (a.web + a.schedulers))
    .map(([mod, v]) => `${mod}: ${v.web} web pages, ${v.schedulers} schedulers`)
    .join('\n');

  return `You are an expert assistant for the MyEvaluations platform — a 25-year-old healthcare education management SaaS (GME, CME, Nursing, PA programs). 10,000+ users, 900+ institutions.

CODEBASE LAYERS:
- .NET 4.6.1 WebForms (legacy): Business.* (managers/DTOs) + Web/* (ASPX pages) + 74 Windows Scheduler services
- NestJS 10 (modern): Progressive strangler fig replacement
- Next.js 13.5 + React: New frontend (Plasmic visual builder)
- .NET MAUI 9: Mobile app (iOS + Android)

ARCHITECTURE PATTERNS:
- Manager classes = data access + business logic (call SQL Server stored procedures)
- Info classes = DTOs (serializable data containers)
- Business classes = WebForms UI orchestration
- Every web page inherits from BasePage → calls SecurityManager for auth

MODULE BLAST RADIUS (dependents):
${depSummaries}

DIRECTORIES & KEY CLASSES (${index.totalFiles} total files):
${dirSummaries.join('\n')}

ANSWER GUIDELINES:
- Reference specific class names and file paths when possible (e.g., Web/Evaluations/EvaluateEvaluation.aspx.cs)
- For migration: reference NestJS equivalents and the strangler fig pattern
- For "what will break" questions: reference the blast radius numbers above
- Keep answers concise and actionable (3-8 sentences or a short list)
- Suggest /docs/dotnet-backend/feature-map for "where do I start" questions
- Suggest /docs/dotnet-backend/module-health for blast radius / migration planning
- Suggest /docs/dotnet-backend/migration/evaluations-runbook for Evaluations migration details`;
}

const EXAMPLE_QUESTIONS = [
  'Which files do I need to change to add a field to the evaluation form?',
  'What stored procedures does EvaluationsManager use?',
  'Which web pages depend on SecurityManager?',
  'How do I debug a duty hours sync failure?',
  'What is the migration priority for the Evaluations module?',
];

export default function AskTheDocs(): React.JSX.Element | null {
  const { siteConfig } = useDocusaurusContext();
  const apiKey = (siteConfig.customFields?.openaiApiKey as string) || '';

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const msgIdRef = React.useRef(0);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docsIndex, setDocsIndex] = useState<DocsIndex | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(docsIndex || { totalFiles: 2422, directories: {}, moduleDependencies: {} }),
    [docsIndex],
  );

  // Load compact docs index on first open
  useEffect(() => {
    if (isOpen && !docsIndex) {
      fetch('/docs-index.json')
        .then((r) => r.json())
        .then((data: DocsIndex) => {
          setDocsIndex(data);
        })
        .catch(() => {
          // Fallback: create empty index so chat still works
          setDocsIndex({ totalFiles: 2422, directories: {}, moduleDependencies: {} });
        });
    }
  }, [isOpen]); // docsIndex intentionally omitted — guard prevents re-fetch

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || isLoading) return;

      let newMessages: Message[] = [];
      setMessages((prev) => {
        newMessages = [...prev, { id: ++msgIdRef.current, role: 'user', content: userMessage }];
        return newMessages;
      });
      setInput('');
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              ...newMessages.map((m) => ({ role: m.role, content: m.content })),
            ],
            max_tokens: 800,
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            (errData as { error?: { message?: string } }).error?.message ||
              `API error: ${response.status}`,
          );
        }

        const data = await response.json() as {
          choices: { message: { content: string } }[];
        };
        const assistantMessage = data.choices[0]?.message?.content || 'No response.';

        setMessages((prev) => [...prev, { id: ++msgIdRef.current, role: 'assistant', content: assistantMessage }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get response');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, apiKey, systemPrompt],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  // Don't render if no API key or before client mount (must be after all hooks)
  if (!apiKey || !mounted) return null;

  return ReactDOM.createPortal(
    <>
      {/* Floating chat panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '380px',
            maxWidth: 'calc(100vw - 40px)',
            height: '500px',
            maxHeight: 'calc(100vh - 120px)',
            backgroundColor: 'var(--ifm-background-color)',
            border: '1px solid var(--ifm-color-emphasis-300)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--ifm-color-emphasis-200)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--ifm-color-primary)',
              color: '#fff',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>🤖</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Ask the Docs</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>GPT-4o · {docsIndex ? `${docsIndex.totalFiles.toLocaleString()} files indexed` : 'loading…'}</div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Clear chat"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                }}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              title="Close"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.85rem',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {messages.length === 0 && (
              <div>
                <p
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--ifm-color-emphasis-600)',
                    margin: '0 0 10px',
                  }}
                >
                  Ask me anything about the MyEvaluations codebase:
                </p>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      marginBottom: '6px',
                      borderRadius: '6px',
                      border: '1px solid var(--ifm-color-emphasis-200)',
                      backgroundColor: 'var(--ifm-background-surface-color)',
                      color: 'var(--ifm-color-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      lineHeight: 1.4,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  maxWidth: '90%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  backgroundColor:
                    msg.role === 'user'
                      ? 'var(--ifm-color-primary)'
                      : 'var(--ifm-background-surface-color)',
                  color: msg.role === 'user' ? '#fff' : 'var(--ifm-font-color-base)',
                  border:
                    msg.role === 'assistant'
                      ? '1px solid var(--ifm-color-emphasis-200)'
                      : 'none',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            ))}

            {isLoading && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 12px',
                  borderRadius: '12px 12px 12px 2px',
                  backgroundColor: 'var(--ifm-background-surface-color)',
                  border: '1px solid var(--ifm-color-emphasis-200)',
                  fontSize: '0.82rem',
                  color: 'var(--ifm-color-emphasis-500)',
                }}
              >
                Thinking…
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  fontSize: '0.78rem',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: '10px',
              borderTop: '1px solid var(--ifm-color-emphasis-200)',
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-end',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about the codebase… (Enter to send)"
              rows={2}
              disabled={isLoading || !docsIndex}
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: '6px',
                border: '1px solid var(--ifm-color-emphasis-300)',
                fontSize: '0.82rem',
                resize: 'none',
                backgroundColor: 'var(--ifm-background-color)',
                color: 'var(--ifm-font-color-base)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim() || !docsIndex}
              aria-label="Send message"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--ifm-color-primary)',
                color: '#fff',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !input.trim() || !docsIndex ? 0.6 : 1,
                fontSize: '0.85rem',
                flexShrink: 0,
                alignSelf: 'stretch',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        title="Ask the Docs — AI assistant (GPT-4o)"
        aria-label="Ask the Docs chat"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: 'var(--ifm-color-primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.4rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
        }}
      >
        {isOpen ? '✕' : '🤖'}
      </button>
    </>,
    document.body,
  );
}
