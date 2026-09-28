'use client';

/**
 * Session artifact renderers — the registry the view panel mounts.
 *
 * Every renderer takes a validated artifact (ui-artifacts.ts zod contract) and
 * renders READ-ONLY data. The single sanctioned interaction is attaching a row
 * (or a record) as a REFERENCE into the composer seed — entity + id, never the
 * data itself; the agent re-resolves through tools at answer time. No
 * renderer mutates anything: writes are agent tools or the reply-draft's
 * human Enter.
 */

import { useCallback, useState } from 'react';
import { Button, IconButton } from '@/design-system/primitives';
import { Check, ExternalLink, Send } from '@/components/Icons';
import { postTicketComment } from '@/lib/support/post-ticket-comment';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import type {
  ArtifactChart,
  ArtifactImportTriage,
  ArtifactRecord,
  ArtifactTable,
  ArtifactTicketReplyDraft,
  ArtifactTicketThread,
  ArtifactTimeline,
} from '@/lib/assistant/ui-artifacts';

// ─── table ───────────────────────────────────────────────────────────────────

export function cellText(value: string | number | boolean | null): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/**
 * Models key rows loosely against the declared columns ("DAY (PST)" vs "day").
 * Match keys by their normalized form (lowercase, alphanumerics only) so the
 * answer renders instead of printing a grid of blanks.
 */
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export function rowLookup(row: Record<string, unknown>): (col: string) => string | number | boolean | null {
  const byNorm = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) byNorm.set(normKey(k), v);
  return (col: string) => {
    const v = byNorm.get(normKey(col));
    return v == null ? null : (v as string | number | boolean | null);
  };
}

export function TableArtifact({ artifact }: { artifact: ArtifactTable }) {
  const [active, setActive] = useState(0);
  const rows = artifact.rows;
  const activeRow = rows[active] ?? null;

  const attach = useCallback(() => {
    if (!activeRow) return;
    const idCol = artifact.idColumn ?? 'id';
    const id = activeRow[idCol] ?? activeRow['id'];
    const subject = artifact.entityHint ? `${artifact.entityHint} ${id ?? `row ${active + 1}`}` : artifact.title;
    requestComposerSeed({ text: `Look at this ${subject}:`, autoSend: false });
  }, [activeRow, artifact.entityHint, artifact.idColumn, artifact.title, active]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-table>
      <div className="min-h-0 flex-1 overflow-auto" aria-label={artifact.title} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'j' || e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((n) => Math.min(n + 1, rows.length - 1));
          } else if (e.key === 'k' || e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((n) => Math.max(n - 1, 0));
          } else if (e.key === 'Enter' && activeRow) {
            e.preventDefault();
            attach();
          }
        }}
      >
        <table className="w-full border-collapse text-left text-role-caption">
          <thead className="sticky top-0 bg-surface-canvas">
            <tr>
              {artifact.columns.map((col) => (
                <th key={col} className="border-b border-border-hairline px-3 py-1.5 text-role-caption font-medium text-text-faint">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const lookup = rowLookup(row);
              return (
                <tr
                  key={i}
                  aria-current={i === active ? 'true' : undefined}
                  className={i === active ? 'bg-surface-hover' : 'hover:bg-surface-sunken'}
                  onClick={() => setActive(i)}
                >
                  {artifact.columns.map((col) => (
                    <td key={col} className="border-b border-border-hairline px-3 py-1.5 text-text-default">
                      {cellText(lookup(col))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div className="flex shrink-0 items-center justify-end border-t border-border-hairline px-3 py-1">
          <Button variant="ghost" size="sm" onClick={attach} ariaLabel="Attach row to composer">
            Ask about this row
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── timeline ────────────────────────────────────────────────────────────────

export function TimelineArtifact({ artifact }: { artifact: ArtifactTimeline }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5" aria-label={artifact.title}>
      <p className="mb-2 text-role-eyebrow text-text-faint">{artifact.subject}</p>
      <ol className="space-y-2">
        {artifact.items.map((item, i) => (
          <li key={i} className="flex gap-3 text-role-caption leading-5">
            <span className="w-36 shrink-0 text-text-faint">{item.at}</span>
            <span className="min-w-0">
              <span className="font-medium text-text-default">{item.actor ?? 'system'}</span>{' '}
              <span className="text-text-muted">{item.action}</span>
              {item.detail ? <span className="block text-text-faint">{item.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── ticket thread ───────────────────────────────────────────────────────────

export function TicketThreadArtifact({ artifact }: { artifact: ArtifactTicketThread }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5" aria-label={artifact.title}>
      {artifact.status ? (
        <p className="mb-2 text-role-eyebrow text-text-faint">Status: {artifact.status}</p>
      ) : null}
      <ol className="space-y-3">
        {artifact.messages.map((msg, i) => (
          <li
            key={i}
            className={
              msg.public
                ? 'mr-8 rounded-lg bg-surface-canvas px-3 py-2 ring-1 ring-inset ring-border-hairline'
                : 'mr-8 rounded-lg bg-surface-warning px-3 py-2 ring-1 ring-inset ring-border-warning'
            }
          >
            <p className="text-role-eyebrow text-text-faint">
              {msg.author}
              {msg.public ? ' · public' : ' · internal'}
              {msg.at ? ` · ${msg.at}` : ''}
            </p>
            <p className="whitespace-pre-wrap text-role-caption leading-5 text-text-default">{msg.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── ticket reply draft (the ONE interactive artifact — human sends) ─────────

export function TicketReplyDraftArtifact({ artifact, onSent }: { artifact: ArtifactTicketReplyDraft; onSent?: () => void }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    const result = await postTicketComment({
      ticketId: artifact.ticketId,
      body: artifact.body,
      isPublic: artifact.public,
    });
    if (result.ok) {
      setState('sent');
      onSent?.();
    } else {
      setState('failed');
      setError(result.error);
    }
  }, [artifact.body, artifact.public, artifact.ticketId, onSent, state]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-reply-draft>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <p className="whitespace-pre-wrap text-role-caption leading-5 text-text-default">{artifact.body}</p>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border-hairline px-3 py-1">
        <p className="text-role-eyebrow text-text-faint">
          {artifact.public ? 'Public reply' : 'Internal note'} · Enter to send
        </p>
        {state === 'sent' ? (
          <p className="flex items-center gap-1.5 text-role-caption font-medium text-text-success">
            <Check className="h-4 w-4" /> Sent
          </p>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={state === 'sending'}
            ariaLabel="Send reply"
            onClick={() => void send()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
          >
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        )}
      </div>
      {state === 'failed' && error ? <p className="px-3 pb-2 text-role-caption text-text-danger">{error}</p> : null}
    </div>
  );
}

// ─── chart ───────────────────────────────────────────────────────────────────

const BAR_HUES = ['fill-blue-500', 'fill-emerald-500', 'fill-amber-500', 'fill-rose-500', 'fill-violet-500'];

export function ChartArtifact({ artifact }: { artifact: ArtifactChart }) {
  const max = Math.max(...artifact.series.map((s) => Math.abs(s.value)), 1);
  const total = artifact.series.reduce((sum, s) => sum + Math.max(s.value, 0), 0) || 1;

  if (artifact.chartType === 'donut') {
    let acc = 0;
    const R = 52;
    const C = 2 * Math.PI * R;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6" aria-label={artifact.title}>
        <svg viewBox="0 0 140 140" className="h-44 w-44" role="img">
          {artifact.series.map((s, i) => {
            const frac = Math.max(s.value, 0) / total;
            const seg = (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                strokeWidth="18"
                className={BAR_HUES[i % BAR_HUES.length].replace('fill-', 'stroke-')}
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-acc * C}
                transform="rotate(-90 70 70)"
              />
            );
            acc += frac;
            return seg;
          })}
          <text x="70" y="74" textAnchor="middle" className="fill-current text-[13px] font-semibold text-text-default">
            {artifact.unit ?? ''}
          </text>
        </svg>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-role-caption text-text-muted">
          {artifact.series.map((s, i) => (
            <li key={i}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${BAR_HUES[i % BAR_HUES.length].replace('fill-', 'bg-')}`} />
              {s.label} {s.value}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const W = 640;
  const H = 220;
  const bw = artifact.chartType === 'bar' ? (W - 40) / artifact.series.length : 0;
  const pt = (i: number, v: number) => {
    const x = 20 + (artifact.chartType === 'bar' ? i * bw + bw / 2 : (i * (W - 40)) / Math.max(artifact.series.length - 1, 1));
    const y = H - 20 - (Math.abs(v) / max) * (H - 50);
    return `${x},${y}`;
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5" aria-label={artifact.title}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <line x1="20" y1={H - 20} x2={W - 20} y2={H - 20} className="stroke-border-hairline" />
        {artifact.chartType === 'bar'
          ? artifact.series.map((s, i) => (
              <g key={i}>
                <rect
                  x={20 + i * bw + bw * 0.15}
                  y={H - 20 - (Math.abs(s.value) / max) * (H - 50)}
                  width={bw * 0.7}
                  height={(Math.abs(s.value) / max) * (H - 50)}
                  className={BAR_HUES[i % BAR_HUES.length]}
                  rx="2"
                />
                <text x={20 + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-current text-[10px] text-text-faint">
                  {s.label}
                </text>
              </g>
            ))
          : (
            <>
              <polyline points={artifact.series.map((s, i) => pt(i, s.value)).join(' ')} fill="none" strokeWidth="2" className="stroke-blue-500" />
              {artifact.series.map((s, i) => (
                <circle key={i} cx={pt(i, s.value).split(',')[0]} cy={pt(i, s.value).split(',')[1]} r="3" className="fill-blue-500" />
              ))}
            </>
          )}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-role-caption text-text-muted">
        {artifact.series.map((s, i) => (
          <li key={i}>
            {s.label}: <span className="font-medium text-text-default">{s.value}</span>
            {artifact.unit ?? ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── import triage ───────────────────────────────────────────────────────────

/**
 * The order-import triage: accepted / needs-resolution / why, per pasted row.
 * The ONLY action is the human's — "Import N accepted" posts the projected
 * canonical rows to /api/orders/import-csv, the same chokepoint the import
 * desk uses, under the user's own session. Needs-resolution rows stay visible
 * so the operator can ask the agent to resolve them and re-triage.
 */
export function ImportTriageArtifact({ artifact }: { artifact: ArtifactImportTriage }) {
  const [state, setState] = useState<'idle' | 'importing' | 'imported' | 'failed'>('idle');
  const [result, setResult] = useState<string | null>(null);
  const acceptedRows = artifact.rows.filter((r) => r.status === 'accepted');
  const needsResolution = artifact.rows.filter((r) => r.status === 'needs_resolution');

  const importAccepted = useCallback(async () => {
    if (state !== 'idle' || acceptedRows.length === 0) return;
    setState('importing');
    try {
      const res = await fetch('/api/orders/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: artifact.acceptedRows,
          mapping: artifact.mapping,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { inserted?: number; updated?: number; skipped?: number; error?: string }
        | null;
      if (!res.ok || data === null) {
        setState('failed');
        setResult(data?.error ?? `Import failed (${res.status})`);
        return;
      }
      setState('imported');
      setResult(
        `Imported — ${data.inserted ?? 0} added, ${data.updated ?? 0} backfilled, ${data.skipped ?? 0} skipped.`,
      );
    } catch (err) {
      setState('failed');
      setResult(err instanceof Error ? err.message : 'Import failed');
    }
  }, [artifact.acceptedRows, artifact.mapping, state]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-import-triage>
      <div className="flex shrink-0 items-center gap-3 border-b border-border-hairline px-3 py-1.5">
        <span className="text-role-caption font-semibold text-text-success">
          {acceptedRows.length} accepted
        </span>
        <span className="text-role-caption font-semibold text-text-warning">
          {needsResolution.length} need resolution
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-role-caption">
          <thead className="sticky top-0 bg-surface-canvas">
            <tr>
              {['Order', 'Item number', 'Qty', 'Status', 'Why'].map((h) => (
                <th key={h} className="border-b border-border-hairline px-3 py-1.5 text-role-caption font-medium text-text-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {artifact.rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface-sunken">
                <td className="border-b border-border-hairline px-3 py-1.5 text-text-default">{row.orderNumber}</td>
                <td className="border-b border-border-hairline px-3 py-1.5 text-text-default">
                  {row.itemNumber || <span className="text-text-faint">—</span>}
                  {row.itemNumber ? null : row.itemTitle ? (
                    <span className="block text-role-micro text-text-faint">{row.itemTitle}</span>
                  ) : null}
                </td>
                <td className="border-b border-border-hairline px-3 py-1.5 text-text-default">{row.quantity || '—'}</td>
                <td className="border-b border-border-hairline px-3 py-1.5">
                  <span className={row.status === 'accepted' ? 'font-medium text-text-success' : 'font-medium text-text-warning'}>
                    {row.status === 'accepted' ? 'Accepted' : 'Needs resolution'}
                  </span>
                </td>
                <td className="border-b border-border-hairline px-3 py-1.5 text-text-faint">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-border-hairline px-3 py-1.5">
        <p className="text-role-eyebrow text-text-faint">
          {state === 'imported'
            ? result
            : state === 'failed'
              ? result
              : 'Enter imports the accepted rows'}
        </p>
        {state === 'imported' ? (
          <span className="flex items-center gap-1.5 text-role-caption font-medium text-text-success">
            <Check className="h-4 w-4" /> Done
          </span>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={state === 'importing' || acceptedRows.length === 0}
            ariaLabel="Import accepted orders"
            onClick={() => void importAccepted()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void importAccepted();
              }
            }}
          >
            <Send className="h-3.5 w-3.5" /> Import {acceptedRows.length} accepted
          </Button>
        )}
      </div>
      {state === 'failed' && result ? (
        <p className="px-3 pb-2 text-role-caption text-text-danger">{result}</p>
      ) : null}
    </div>
  );
}

// ─── record ──────────────────────────────────────────────────────────────────

export function RecordArtifact({ artifact, onOpen }: { artifact: ArtifactRecord; onOpen: (path: string) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5" aria-label={artifact.title}>
      <dl className="divide-y divide-border-hairline">
        {artifact.fields.map((f, i) => (
          <div key={i} className="flex gap-3 py-1.5 text-role-caption">
            <dt className="w-40 shrink-0 text-role-caption font-medium text-text-faint">
              {f.href ? (
                <a
                  href={f.href}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onOpen(f.href as string);
                  }}
                  className="underline-offset-2 hover:text-text-default hover:underline"
                  data-record-field-link
                >
                  {f.label}
                </a>
              ) : (
                f.label
              )}
            </dt>
            <dd className="min-w-0 text-text-default">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <IconButton
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          onClick={() => onOpen(artifact.path)}
          ariaLabel="Open record"
          title="Open record"
          size="sm"
          radius="control"
        />
      </div>
    </div>
  );
}

// ─── report ──────────────────────────────────────────────────────────────────

/**
 * The operator report lives in its own file — headline, KPI grid, section
 * tables, standards, notes — and is re-exported here so the view panel keeps
 * mounting every renderer from this one registry.
 */
export { ReportArtifact } from './ReportArtifact';
