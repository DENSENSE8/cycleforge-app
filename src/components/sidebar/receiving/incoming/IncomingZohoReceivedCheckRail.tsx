'use client';

/**
 * Manual Zoho received check — paste tracking numbers, get received vs not
 * received in Zoho, each row carrying the warehouse's own answer beside the
 * vendor's. Opened from the Incoming chrome Check CTA.
 *
 * Mounts as a non-modal push rail (`detail:incoming-zoho-received-check`).
 *
 * THREE buckets, not two. `error` (the ERP was unreachable), `zoho_cap` (we
 * chose not to look), `no_match` and `ambiguous` all mean *we do not know* —
 * filing them under "Not received in Zoho" asserts a fact the check never
 * established, and during a Zoho outage that heading would have claimed every
 * pasted tracking was still open.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Copy, Search } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { TextField, IconButton } from '@/design-system/primitives';
import {
  SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS,
  SidebarIntakeFormShell,
} from '@/design-system/components/sidebar-intake';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { formatDateTimePST } from '@/utils/date';
import { toast } from '@/lib/toast';
import type {
  CheckZohoReceivedRow,
  CheckZohoReceivedStats,
  CheckZohoReceivedVerdict,
  CheckZohoReceivedWatchState,
} from '@/lib/receiving/check-zoho-received';

type CheckResult = {
  received_in_zoho: CheckZohoReceivedRow[];
  not_received_in_zoho: CheckZohoReceivedRow[];
  undetermined: CheckZohoReceivedRow[];
  stats: CheckZohoReceivedStats;
};

function reasonLabel(reason: CheckZohoReceivedRow['reason']): string {
  switch (reason) {
    case 'matched':
      return 'matched';
    case 'no_match':
      return 'no PO match';
    case 'ambiguous':
      return 'ambiguous';
    case 'error':
      return 'lookup failed';
    case 'zoho_cap':
      return 'not looked up';
    default:
      return reason;
  }
}

/** Operator wording for the warehouse half — capability nouns, never table names. */
const WATCH_LABEL: Record<CheckZohoReceivedWatchState, string> = {
  delivered_unscanned: 'Delivered · not scanned',
  delivered_not_unboxed: 'Delivered · not unboxed',
  in_flight: 'In transit',
  done: 'Unboxed here',
  unknown: 'No local record',
};

/**
 * The reconciliation verdicts worth a chip. `open` and `settled` are the two
 * normal outcomes and say nothing an operator must act on, so they stay quiet —
 * a chip on every row is a chip on no row.
 */
const VERDICT_CHIP: Partial<
  Record<CheckZohoReceivedVerdict, { label: string; className: string; title: string }>
> = {
  erp_ahead: {
    label: 'No warehouse record',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    title:
      'The vendor side considers this PO received, but nothing here has been unboxed against it. No continuous feed reports this state — a Zoho-received PO is filtered out of Incoming and out of Delivered · not unboxed.',
  },
  warehouse_ahead: {
    label: 'Zoho behind',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    title:
      'The warehouse has already received this, but the vendor side has not caught up. Push to the purchasing source or re-sync.',
  },
};

function formatCopyBlock(rows: CheckZohoReceivedRow[]): string {
  return rows
    .map((r) => {
      const bits = [r.tracking];
      if (r.po_number) bits.push(`PO ${r.po_number}`);
      if (r.status) bits.push(r.status);
      if (r.reason !== 'matched') bits.push(reasonLabel(r.reason));
      if (r.local) bits.push(WATCH_LABEL[r.local.watch]);
      return bits.join('\t');
    })
    .join('\n');
}

async function copySection(label: string, rows: CheckZohoReceivedRow[]) {
  if (rows.length === 0) {
    toast.success(`No ${label} to copy`);
    return;
  }
  try {
    await navigator.clipboard.writeText(formatCopyBlock(rows));
    toast.success(`Copied ${rows.length} ${label}`);
  } catch {
    toast.error('Copy failed');
  }
}

function ResultRow({
  row,
  onShowInIncoming,
}: {
  row: CheckZohoReceivedRow;
  onShowInIncoming: (tracking: string) => void;
}) {
  const verdict = VERDICT_CHIP[row.verdict];
  const meta = [
    row.po_number ? `PO ${row.po_number}` : null,
    row.reference_number && row.reference_number !== row.tracking
      ? `ref ${row.reference_number}`
      : null,
    row.status ?? null,
    row.reason === 'matched' ? null : reasonLabel(row.reason),
  ].filter(Boolean);

  return (
    <li className="rounded-md bg-surface-card px-2 py-1.5 ring-1 ring-inset ring-border-soft">
      <div className="flex items-start justify-between gap-1.5">
        <p className="min-w-0 break-all font-mono text-role-caption text-text-default">
          {row.tracking}
        </p>
        <HoverTooltip label="Show in Incoming" focusable={false}>
          <IconButton
            size="xs"
            ariaLabel={`Show ${row.tracking} in Incoming`}
            icon={<Search className="h-3 w-3" />}
            onClick={() => onShowInIncoming(row.tracking)}
          />
        </HoverTooltip>
      </div>
      {meta.length > 0 ? (
        <p className="mt-0.5 text-role-micro text-text-muted">{meta.join(' · ')}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {row.local ? (
          <span className="inset-chip rounded bg-surface-canvas text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
            {WATCH_LABEL[row.local.watch]}
          </span>
        ) : null}
        {verdict ? (
          <HoverTooltip label={verdict.title} focusable={false}>
            <span
              className={`inset-chip rounded text-role-micro uppercase tracking-widest ring-1 ring-inset ${verdict.className}`}
            >
              {verdict.label}
            </span>
          </HoverTooltip>
        ) : null}
        {row.synced_at ? (
          <HoverTooltip
            label="Answered from the cached PO mirror, not a live lookup."
            focusable={false}
          >
            <span className="text-role-micro text-text-faint">
              as of {formatDateTimePST(row.synced_at)}
            </span>
          </HoverTooltip>
        ) : null}
      </div>
    </li>
  );
}

function ResultSection({
  title,
  hint,
  tone,
  rows,
  onShowInIncoming,
}: {
  title: string;
  hint?: string;
  tone: 'received' | 'open' | 'unknown';
  rows: CheckZohoReceivedRow[];
  onShowInIncoming: (tracking: string) => void;
}) {
  const headingClass =
    tone === 'received'
      ? 'text-emerald-700'
      : tone === 'open'
        ? 'text-amber-800'
        : 'text-text-muted';
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-role-eyebrow uppercase tracking-widest ${headingClass}`}>
          {title} · {rows.length}
        </h3>
        <IconButton
          size="sm"
          ariaLabel={`Copy ${title}`}
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => void copySection(title.toLowerCase(), rows)}
          disabled={rows.length === 0}
        />
      </div>
      {hint ? <p className="text-role-micro text-text-faint">{hint}</p> : null}
      {rows.length === 0 ? (
        <p className="text-role-caption text-text-faint">None</p>
      ) : (
        <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border-soft bg-surface-canvas/60 p-2">
          {rows.map((row) => (
            <ResultRow
              key={`${row.tracking}:${row.po_number ?? ''}:${row.reason}`}
              row={row}
              onShowInIncoming={onShowInIncoming}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function IncomingZohoReceivedCheckRail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [paste, setPaste] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaste('');
    setError(null);
    setResult(null);
    setSubmitting(false);
  }, [open]);

  /**
   * Filter the Incoming list to one tracking. Deliberately ONE at a time: the
   * list's `search` is a single ILIKE term, so a multi-tracking filter would
   * need a new list param — see the handoff PLAN, Phase 2. The rail stays open
   * (it pushes, it does not float), so the result list and the filtered table
   * are on screen together.
   */
  const showInIncoming = useCallback(
    (tracking: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(RECEIVING_HISTORY_URL_PARAMS.q, tracking);
      params.delete('state');
      params.delete('page');
      router.replace(`${receivingSurfaceBasePath(pathname)}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const canSubmit = paste.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving-lines/incoming/check-zoho-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackings: paste }),
      });
      const data = (await res.json().catch(() => null)) as
        | (CheckResult & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Check failed (${res.status})`);
      }
      setResult({
        received_in_zoho: data.received_in_zoho ?? [],
        not_received_in_zoho: data.not_received_in_zoho ?? [],
        undetermined: data.undetermined ?? [],
        stats: data.stats,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Check failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:incoming-zoho-received-check"
      onClose={onClose}
      modal={false}
      ariaLabel="Check Zoho received"
    >
      <SidebarIntakeFormShell
        title="Check Zoho received"
        subtitle="Paste tracking numbers"
        subtitleAccent="blue"
        onClose={onClose}
        footer={
          /* ds-raw-button: SidebarIntakeFormShell footer CTA twin of IncomingImportEbayOverlay */
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            className={`ds-raw-button ${SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS}`}
          >
            {submitting ? 'Checking…' : 'Check'}
          </button>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Tracking numbers"
            value={paste}
            onChange={setPaste}
            multiline
            rows={8}
            autoFocus
            tone="neutral"
            mono
          />
          {error ? (
            <p className="text-role-caption font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-role-caption text-text-faint">
              One per line (or comma-separated). Looks up purchase-order reference numbers —
              cached mirror first, then live. Max 100.
            </p>
          )}

          {result ? (
            <div className="space-y-4 border-t border-border-soft pt-3">
              <p className="text-role-micro text-text-muted">
                {result.stats.unique_count} unique · {result.stats.mirror_hits} cached ·{' '}
                {result.stats.zoho_lookups} live
                {result.stats.errors > 0 ? ` · ${result.stats.errors} failed` : ''}
              </p>

              {result.stats.erp_ahead > 0 ? (
                <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-role-caption text-rose-700 ring-1 ring-inset ring-rose-200">
                  {result.stats.erp_ahead} received upstream with no warehouse record — these
                  appear on no watch list today.
                </p>
              ) : null}
              {result.stats.warehouse_ahead > 0 ? (
                <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-role-caption text-amber-800 ring-1 ring-inset ring-amber-200">
                  {result.stats.warehouse_ahead} received here but not upstream.
                </p>
              ) : null}

              <ResultSection
                title="Received in Zoho"
                tone="received"
                rows={result.received_in_zoho}
                onShowInIncoming={showInIncoming}
              />
              <ResultSection
                title="Not received in Zoho"
                tone="open"
                rows={result.not_received_in_zoho}
                onShowInIncoming={showInIncoming}
              />
              <ResultSection
                title="Couldn't determine"
                hint="No matching PO, an ambiguous match, a failed lookup, or past the live-lookup cap. These are unknown — not open."
                tone="unknown"
                rows={result.undetermined}
                onShowInIncoming={showInIncoming}
              />
            </div>
          ) : null}
        </div>
      </SidebarIntakeFormShell>
    </DetailStackRailRegistrar>
  );
}
