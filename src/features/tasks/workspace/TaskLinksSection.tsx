'use client';

/** Task evidence — **Linked records**: */

import { useState } from 'react';
import { ExternalLink, X } from '@/components/Icons';
import { CopyIconButton } from '@/design-system/primitives';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceSection,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { resolveThrowTargets, type ThrowTarget } from '@/lib/tasks/throw-targets';
import {
  TASK_LINK_KINDS,
  TASK_LINK_NOUN,
  type TaskLink,
  type TaskLinkCreateBody,
  type TaskLinkKind,
} from '@/lib/tasks/task-links-shared';
import { detectCarrier, getTrackingUrl } from '@/lib/tracking-format';
import { cn } from '@/utils/_cn';

const TICKET_SHAPE = /^#?\d{1,7}$/;

function guessKind(raw: string): TaskLinkKind {
  const value = raw.trim();
  if (TICKET_SHAPE.test(value)) return 'ticket';
  if (detectCarrier(value) !== 'Unknown') return 'tracking';
  return 'order';
}

const KIND_CODE: Readonly<Record<TaskLinkKind, string>> = { order: 'ORD', tracking: 'TRK', ticket: 'TKT' };

/** The record's context line, from the link's own enrichment. */
function linkContext(link: TaskLink): string | null {
  if (link.kind === 'ticket') {
    return [link.ticket?.subject, link.ticket?.status?.toUpperCase()].filter(Boolean).join(' · ') || null;
  }
  if (link.kind === 'tracking') {
    const carrier = [link.tracking?.carrier, link.tracking?.status?.replace(/_/g, ' ')].filter(Boolean).join(' · ');
    const order = link.order ? `→ Order ${link.order.orderNumber ?? link.order.id}` : 'No order matched';
    return [carrier, order].filter(Boolean).join(' · ');
  }
  if (!link.order) return null;
  const lines = link.order.lineCount > 1 ? `${link.order.lineCount} lines · ` : '';
  return `${lines}${link.order.title ?? link.order.sku ?? ''}` || null;
}

function linkHref(link: TaskLink): string | null {
  if (link.kind === 'tracking') return getTrackingUrl(link.label);
  if (link.kind === 'order' || link.order) return `/dashboard?order=${link.order?.id ?? link.entityId}`;
  return null;
}

export function TaskLinksSection({
  anchorLabel,
  anchorHref,
  links,
  loading,
  onAdd,
  onRemove,
  onOpenTicket,
}: {
  /** `Order 12345` — the record the task is ABOUT; null for a standalone task. */
  anchorLabel: string | null;
  anchorHref: string | null;
  links: readonly TaskLink[];
  loading: boolean;
  /** Resolves on success, throws the operator-facing refusal otherwise. */
  onAdd: (body: TaskLinkCreateBody) => Promise<unknown>;
  onRemove: (link: TaskLink) => void;
  /** Show a linked ticket's thread in the column. */
  onOpenTicket: (providerTicketId: number) => void;
}) {
  const [value, setValue] = useState('');
  /** Null = follow the guess; a click on the switch pins it. */
  const [pinnedKind, setPinnedKind] = useState<TaskLinkKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ThrowTarget[] | null>(null);

  const kind = pinnedKind ?? guessKind(value);

  const reset = () => {
    setValue('');
    setPinnedKind(null);
    setCandidates(null);
    setError(null);
  };

  const commit = async (body: TaskLinkCreateBody) => {
    setBusy(true);
    setError(null);
    try {
      await onAdd(body);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link that.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const raw = value.trim();
    if (!raw || busy) return;
    if (kind !== 'order') {
      await commit({ kind, value: raw });
      return;
    }
    // An order number is a SEARCH: a split shipment or a relisted order can
    // match several rows, and linking the first one silently is the wrong
    // order half the time. The scan decoder answers it, as it does for a throw.
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/scan/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: raw }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Could not look that order up (${res.status}).`);
      const seen = new Set<string>();
      const orders = resolveThrowTargets(data as Parameters<typeof resolveThrowTargets>[0]).filter((target) => {
        if (target.entityType !== 'order' || seen.has(target.label)) return false;
        seen.add(target.label);
        return true;
      });
      if (orders.length === 0) throw new Error(`No order matches “${raw}”.`);
      if (orders.length === 1) {
        setBusy(false);
        await commit({ kind: 'order', entityId: orders[0].entityId });
        return;
      }
      setCandidates(orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look that order up.');
    } finally {
      setBusy(false);
    }
  };

  const grouped = TASK_LINK_KINDS.map((k) => [k, links.filter((link) => link.kind === k)] as const);

  return (
    <EvidenceSection label={`Linked records · ${links.length + (anchorLabel ? 1 : 0)}`} testId="task-links">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div role="radiogroup" aria-label="What you are linking" className="grid grid-cols-3 gap-1">
          {TASK_LINK_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setPinnedKind(k)}
              className={cn(evidenceVerbClass(kind === k), 'min-h-0 py-1')}
            >
              {TASK_LINK_NOUN[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setCandidates(null);
              setError(null);
            }}
            placeholder="Paste an order #, tracking # or #ticket"
            aria-label={`${TASK_LINK_NOUN[kind]} to link`}
            className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS, 'min-w-0 flex-1')}
            data-testid="task-link-input"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className={evidenceVerbClass(true)} disabled={busy || !value.trim()}>
            {busy ? '…' : `Link ${TASK_LINK_NOUN[kind].toLowerCase()}`}
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-role-data text-mode-warn">
            {error}
          </p>
        ) : null}
        {candidates ? (
          <ul aria-label="Matching orders" className="flex flex-col border border-mode-rule">
            {candidates.map((candidate) => (
              <li key={candidate.entityId} className="border-b border-mode-rule last:border-b-0">
                <button
                  type="button"
                  onClick={() => void commit({ kind: 'order', entityId: candidate.entityId })}
                  className={cn('flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-mode-hover', focusRing('control'))}
                >
                  <span className={cn(RECORD_ID_CLASS, 'shrink-0 text-mode-ink')}>{candidate.label}</span>
                  <span className="min-w-0 flex-1 truncate text-role-data text-mode-muted">{candidate.sublabel}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <ul className="mt-3 flex flex-col" aria-label="Linked records">
        {anchorLabel ? (
          <LinkRow code="ANC" label={anchorLabel} context="What this task is about" href={anchorHref} />
        ) : null}
        {loading && links.length === 0 ? (
          <li className={cn(RECORD_LABEL_CLASS, 'py-2 text-mode-muted')}>Loading links…</li>
        ) : null}
        {grouped.flatMap(([, rows]) =>
          rows.map((link) => (
            <LinkRow
              key={link.id}
              code={KIND_CODE[link.kind]}
              label={link.kind === 'ticket' ? `#${link.label}` : link.label}
              copyValue={link.label}
              context={linkContext(link)}
              href={linkHref(link)}
              onOpenTicket={
                link.kind === 'ticket' && link.ticket?.providerTicketId != null
                  ? () => onOpenTicket(link.ticket?.providerTicketId as number)
                  : undefined
              }
              onRemove={() => onRemove(link)}
            />
          )),
        )}
      </ul>
    </EvidenceSection>
  );
}

function LinkRow({
  code,
  label,
  copyValue,
  context,
  href,
  onOpenTicket,
  onRemove,
}: {
  code: string;
  label: string;
  copyValue?: string;
  context: string | null;
  href: string | null;
  onOpenTicket?: () => void;
  onRemove?: () => void;
}) {
  const external = href?.startsWith('http') ?? false;
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex min-w-0 items-center gap-2 border-b border-mode-rule py-1.5 last:border-b-0">
      <span className={cn(RECORD_LABEL_CLASS, 'w-8 shrink-0 text-mode-muted')}>{code}</span>
      <div className="min-w-0 flex-1">
        <p className={cn(RECORD_ID_CLASS, 'select-all truncate text-mode-ink')}>{label}</p>
        {context ? <p className="truncate text-role-caption text-mode-muted">{context}</p> : null}
      </div>
      {copyValue ? (
        <CopyIconButton
          copied={copied}
          ariaLabel={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(copyValue).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        />
      ) : null}
      {onOpenTicket ? (
        <button type="button" className={cn(evidenceVerbClass(false), 'min-h-0 py-1')} onClick={onOpenTicket}>
          Thread
        </button>
      ) : null}
      {href ? (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          aria-label={`Open ${label}`}
          className={cn('inline-flex h-7 w-7 items-center justify-center text-mode-ink hover:bg-mode-hover', focusRing('control'))}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Unlink ${label}`}
          onClick={onRemove}
          className={cn('ds-raw-button inline-flex h-7 w-7 items-center justify-center text-mode-muted hover:bg-mode-hover hover:text-mode-ink', focusRing('control'))}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
