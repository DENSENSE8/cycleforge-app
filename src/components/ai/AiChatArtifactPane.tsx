'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Sparkles } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import {
  assistantArtifactCsv,
  assistantArtifactFilename,
  assistantArtifacts,
  type ArtifactChatMessage,
} from '@/lib/assistant/chat-artifacts';

export function AiChatArtifactPane({ messages }: { messages: readonly ArtifactChatMessage[] }) {
  const artifacts = useMemo(() => assistantArtifacts(messages), [messages]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (artifacts.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => (current && artifacts.some((artifact) => artifact.id === current) ? current : artifacts[0]!.id));
  }, [artifacts]);

  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0] ?? null;

  const download = () => {
    if (!selected) return;
    const blob = new Blob([assistantArtifactCsv(selected)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = assistantArtifactFilename(selected.title);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Keep the object URL alive through the browser's download dispatch.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface-canvas" aria-label="Assistant data view">
      <header className="flex min-h-11 shrink-0 items-center justify-between border-b border-border-hairline px-3">
        <div className="min-w-0">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">Data view</p>
          <p className="truncate text-role-caption font-semibold text-text-default">
            {selected?.title ?? 'Waiting for data'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!selected || selected.rows.length === 0}
          onClick={download}
          ariaLabel="Download data table as CSV"
          icon={<Download className="h-3.5 w-3.5" />}
        >
          Download CSV
        </Button>
      </header>

      {selected ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label={selected.title}>
            <ol className="divide-y divide-border-hairline">
              {selected.rows.map((row, rowIndex) => (
                <li key={rowIndex} className="grid gap-2 px-3 py-3">
                  {selected.columns.map((column) => (
                    <dl key={column} className="grid grid-cols-[minmax(7rem,0.4fr)_1fr] gap-3 text-role-caption">
                      <dt className="truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
                        {column}
                      </dt>
                      <dd className="min-w-0 break-words text-text-default">
                        {row[column] == null ? '—' : String(row[column])}
                      </dd>
                    </dl>
                  ))}
                </li>
              ))}
            </ol>
          </div>
          <footer className="flex shrink-0 items-center justify-between border-t border-border-hairline px-3 py-1.5">
            <p className="text-role-micro text-text-faint">
              {selected.rows.length} row{selected.rows.length === 1 ? '' : 's'} · {selected.source === 'structured-answer' ? 'live data answer' : 'agent table'}
            </p>
            {artifacts.length > 1 ? (
              <label className="flex items-center gap-2 text-role-micro text-text-faint">
                Result
                <select
                  value={selected.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="max-w-56 rounded-md border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default"
                  aria-label="Select assistant data result"
                >
                  {artifacts.map((artifact) => (
                    <option key={artifact.id} value={artifact.id}>{artifact.title}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </footer>
        </>
      ) : (
        <div className="inset-empty flex flex-1 flex-col items-center justify-center text-center">
          <Sparkles className="h-5 w-5 text-text-faint" />
          <p className="mt-2 text-role-caption font-medium text-text-muted">Ask for an operational breakdown.</p>
          <p className="mt-1 max-w-sm text-role-caption text-text-faint">
            The answer stays in the chat. Database-backed rows appear here with one reusable CSV export.
          </p>
        </div>
      )}
    </section>
  );
}
