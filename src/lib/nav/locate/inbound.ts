/**
 * Inbound locator — the Unbox Check as a locate answer. The verdict per ref is
 * `reconcileCheck` over the Check rows (`checkZohoReceived`) and the
 * `view=reconcile` lines (the warehouse-only fallback), exactly what the
 * Inbound ledger's `?ref_in=` / `?recon=` read. Bucket ids are the recon
 * statuses (`received`, `not_received`) so `?recon=` keeps filtering the
 * ledger, plus `exceptions` — a ref whose lines sit in the Exceptions view
 * (`ReconEntry.exception.inView`); it keeps its status bucket too. A badge
 * with nothing in that view (several POs, lookup failed, Zoho cap) stays in
 * `detail`: the Exceptions list would not show it.
 */

import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  RECON_STATUS_LABELS,
  reconcileCheck,
  rowRefKeys,
  type RefSelection,
} from '@/lib/receiving/reconcile';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** The Check's own gate (`POST …/check-zoho-received`) and the ledger's. */
export const INBOUND_LOCATE_PERMISSION = 'receiving.view';

export const INBOUND_BUCKET_IDS = ['received', 'not_received', 'exceptions'] as const;
type InboundBucketId = (typeof INBOUND_BUCKET_IDS)[number];

const INBOUND_BUCKETS: Readonly<Record<InboundBucketId, Omit<NavLocateBucket, 'id' | 'count'>>> = {
  // Verdicts over the paste — their list is the ledger under the page's own `?recon=`.
  received: { label: RECON_STATUS_LABELS.received, tone: 'success', href: null },
  not_received: { label: RECON_STATUS_LABELS.not_received, tone: 'warning', href: null },
  exceptions: { label: 'Exceptions', tone: 'danger', href: `${INCOMING_SURFACE_ROUTE}?lane=exceptions` },
};

export interface InboundLocateDeps {
  /** The Unbox Check rows for these refs (every bucket of its answer). */
  check(refs: readonly string[]): Promise<CheckZohoReceivedRow[]>;
  /** `GET /api/receiving-lines?view=reconcile&ref_in=…` rows. */
  lines(refs: readonly string[]): Promise<ReceivingLineRow[]>;
}

export async function locateInbound(
  selection: Pick<RefSelection, 'refs' | 'keys'>,
  deps: InboundLocateDeps,
): Promise<{ buckets: NavLocateBucket[]; entries: NavLocateEntry[] }> {
  const [checkRows, lineRows] =
    selection.refs.length > 0
      ? await Promise.all([deps.check(selection.refs), deps.lines(selection.refs)])
      : [[], []];
  const recon = reconcileCheck({ ...selection, truncated: 0 }, checkRows, lineRows);
  // Found nowhere = the branch `reconcileCheck` answers "No match anywhere" /
  // "Checking…": no Check row, or a no-match the warehouse knows nothing of.
  const checked = new Map(checkRows.map((row) => [canonicalizeTrackingKey(row.tracking), row]));
  const lineKeys = new Set(lineRows.flatMap(rowRefKeys));
  const counts: Record<InboundBucketId, number> = { received: 0, not_received: 0, exceptions: 0 };
  const entries = recon.map((entry): NavLocateEntry => {
    const row = checked.get(entry.key);
    const nowhere = !row || (row.reason === 'no_match' && !row.local?.known && !lineKeys.has(entry.key));
    const buckets: InboundBucketId[] = nowhere
      ? []
      : entry.exception?.inView
        ? [entry.status, 'exceptions']
        : [entry.status];
    for (const id of buckets) counts[id] += 1;
    const title = entry.poNumber
      ? [`PO ${entry.poNumber}`, entry.vendor].filter(Boolean).join(' · ')
      : entry.vendor;
    const reason = entry.exception?.reason;
    return {
      ref: entry.ref,
      buckets,
      title: title || null,
      detail: nowhere ? null : reason && reason !== entry.detail ? `${entry.detail} · ${reason}` : entry.detail,
      recordHref: null,
    };
  });
  return {
    buckets: INBOUND_BUCKET_IDS.map((id) => ({ id, ...INBOUND_BUCKETS[id], count: counts[id] })),
    entries,
  };
}
