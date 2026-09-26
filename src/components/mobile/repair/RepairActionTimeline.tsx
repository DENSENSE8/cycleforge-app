'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { repairActionTypeToneClass } from '@/lib/repair-action-type-tone';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';
import {
  REPAIR_DONOR_SOURCE_COPY,
  repairActionLabel,
  type RepairActionRecord,
} from '@/lib/repair/repair-actions';
import { ticketPostView } from '@/lib/repair/repair-action-ticket-note';
import { formatMonthDayTimePST } from '@/utils/date';
import { Check, Clock, RefreshCw, Tool, Wrench, X } from '@/components/Icons';

interface Props {
  /** Newest first, from `useRepairActions`. */
  actions: RepairActionRecord[];
  loading: boolean;
  error: string | null;
  /** Action id to mark as just saved (the page passes the id the POST returned). */
  highlightId?: number | null;
  /** Re-post a failed ticket note; resolves to an error message, or null when it went through. */
  onRetryTicketPost: (actionId: number) => Promise<string | null>;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  replaced: RefreshCw,
  repaired: Wrench,
  cleaned: Tool,
  tested: Check,
  no_fix: X,
  awaiting_part: Clock,
};

/** The bench log: every saved action with its server stamp, parts in/out and serials. */
export function RepairActionTimeline({ actions, loading, error, highlightId = null, onRetryTicketPost }: Props) {
  const nowMs = Date.now();
  return (
    // Flat (operator 2026-09-25): a band, then full-bleed tone rows split by
    // one rule — no cards. The host mounts it straight in its divide column.
    <section className="divide-y divide-mode-rule">
      <DetailSectionHeading>
        What was repaired · {actions.length} action{actions.length === 1 ? '' : 's'}
      </DetailSectionHeading>

      {error && (
        <div className="bg-rose-50 px-mode-page py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {loading && actions.length === 0 && (
        <p className="bg-mode-panel px-mode-page py-6 text-center text-sm font-semibold text-text-soft">Loading…</p>
      )}

      {!loading && actions.length === 0 && !error && (
        <div className="bg-mode-panel px-mode-page py-6 text-center">
          <p className="text-sm font-semibold text-text-muted">No actions logged yet.</p>
          <p className="mt-1 text-role-caption text-text-soft">
            Use Log work below to record the first one.
          </p>
        </div>
      )}

      {actions.length > 0 && (
        <ul className="divide-y divide-mode-rule">
          {actions.map((a) => {
            const tone = repairActionTypeToneClass(a.action_type);
            const ActionIcon = TYPE_ICON[a.action_type] ?? Tool;
            const partALabel = a.action_type === 'replaced' ? 'Out' : 'Part';
            const partBLabel = a.action_type === 'awaiting_part' ? 'Needed' : 'In';
            return (
              <li
                key={a.id}
                className={`${tone} px-mode-page py-3 ${a.id === highlightId ? 'ring-2 ring-inset ring-emerald-400' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <ActionIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-text-default">
                        {repairActionLabel(a.action_type)}
                        {a.part_name ? (
                          <span className="ml-1.5 font-semibold text-text-muted">— {a.part_name}</span>
                        ) : null}
                      </p>
                      {/* Server-stamped on insert — never a typed or client-clock date. */}
                      <time dateTime={a.created_at} className="text-role-micro text-text-soft shrink-0">
                        {formatMonthDayTimePST(a.created_at)}
                      </time>
                    </div>

                    {a.old_sku || a.old_serial ? (
                      <PartLine label={partALabel} sku={a.old_sku} serial={a.old_serial} tone="out" />
                    ) : null}
                    {a.new_sku || a.new_serial ? (
                      <PartLine label={partBLabel} sku={a.new_sku} serial={a.new_serial} tone="in" />
                    ) : null}

                    {a.component_ref || a.component_value ? (
                      <FactLine label="Ref">
                        {a.component_ref ? <span className="font-mono font-semibold text-text-default">{a.component_ref}</span> : null}
                        {a.component_value ? <span className="text-text-muted">{a.component_value}</span> : null}
                        {a.component_qty != null && a.component_qty > 1 ? (
                          <span className="text-text-muted">× {a.component_qty}</span>
                        ) : null}
                      </FactLine>
                    ) : null}

                    {a.donor_source ? (
                      <FactLine label="From">
                        <span className="font-semibold text-text-default">
                          {REPAIR_DONOR_SOURCE_COPY[a.donor_source]?.label ?? a.donor_source}
                        </span>
                        {a.donor_ref ? <span className="font-mono text-text-muted">{a.donor_ref}</span> : null}
                        {a.stock_ledger_id != null ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800">
                            −{a.stock_qty ?? 1} {a.stock_bin_label ? `from ${a.stock_bin_label}` : 'stock'}
                          </span>
                        ) : null}
                      </FactLine>
                    ) : null}

                    {a.notes && (
                      <p className="mt-1.5 text-role-caption text-text-muted leading-snug whitespace-pre-wrap">
                        {a.notes}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-2 text-role-micro text-text-soft">
                      {a.staff_name && <span>{a.staff_name}</span>}
                      {a.duration_min != null && (
                        <>
                          {a.staff_name && <span className="text-text-faint">·</span>}
                          <span>{a.duration_min} min</span>
                        </>
                      )}
                    </div>

                    <TicketPostLine action={a} nowMs={nowMs} onRetry={onRetryTicketPost} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Where the entry stands on the linked helpdesk ticket: posted, posting, or failed with Retry. */
function TicketPostLine({
  action,
  nowMs,
  onRetry,
}: {
  action: RepairActionRecord;
  nowMs: number;
  onRetry: (actionId: number) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const view = ticketPostView(action, nowMs);
  if (!view) return null;

  if (view.kind === 'posted') {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-role-micro font-semibold text-emerald-700" data-testid="ticket-post-posted">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Posted to ticket{view.ticketId != null ? ` #${view.ticketId}` : ''}
      </p>
    );
  }
  if (view.kind === 'posting') {
    return <p className="mt-1.5 text-role-micro text-text-soft">Posting to ticket…</p>;
  }

  const retry = async () => {
    setBusy(true);
    setRetryError(null);
    try {
      setRetryError(await onRetry(action.id));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-role-micro" data-testid="ticket-post-failed">
      <span className="font-semibold text-rose-700">Failed — not on the ticket</span>
      <Button variant="secondary" size="sm" loading={busy} onClick={() => void retry()}>
        Retry
      </Button>
      <span className="basis-full text-text-soft">{retryError ?? view.error}</span>
    </div>
  );
}

/** A labelled fact row on a log entry (component, donor source) — same grid as the part rows. */
function FactLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-role-caption">
      <span className="w-12 shrink-0 font-semibold uppercase tracking-[0.12em] text-text-soft">{label}</span>
      {children}
    </div>
  );
}

/** One identified part on a log entry: which SKU (temporary flagged) and exactly which serial. */
function PartLine({
  label,
  sku,
  serial,
  tone,
}: {
  label: string;
  sku: string | null;
  serial: string | null;
  tone: 'out' | 'in';
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-role-caption">
      <span className="w-12 shrink-0 font-semibold uppercase tracking-[0.12em] text-text-soft">{label}</span>
      {sku ? (
        <span
          className={`rounded px-1.5 py-0.5 font-mono ${tone === 'out' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}
        >
          {sku}
        </span>
      ) : null}
      {isProvisionalSku(sku) ? (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Temporary</span>
      ) : null}
      {serial ? <span className="font-mono text-text-muted">SN {serial}</span> : null}
    </div>
  );
}
