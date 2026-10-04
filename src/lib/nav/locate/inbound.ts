/**
 * Inbound locator — the Unbox Check as a locate answer. The verdict per ref is
 * `reconcileCheck` over the Check rows (`checkZohoReceived`) and the
 * `view=reconcile` lines (the warehouse-only fallback), exactly what the
 * Inbound ledger's `?ref_in=` / `?recon=` read. Bucket ids are the recon
 * statuses (`received`, `not_received`) so `?recon=` keeps filtering the
 * ledger, plus `exceptions` — a ref whose lines sit in the Exceptions view
 * (`ReconEntry.exception.inView`); it keeps its status bucket too. A badge
 * with nothing in that view (several POs, lookup failed) stays in `detail`:
 * the Exceptions list would not show it. Each answered ref carries its
 * reason as the entry's `facet` (`?recon_reason=`). `detail` also says the
 * carrier's last word and the number's follow-up tag — the same words the
 * pasted ledger's row shows, so the popout and the list never disagree.
 */

import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { INBOUND_FOLLOWUP_LABELS, inboundFollowupKey, type InboundFollowup } from '@/lib/receiving/inbound-followups';
import { carrierFactOf, carrierFactText } from '@/lib/receiving/pasted-number-facts';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  RECON_PARAM,
  RECON_REASON_LABELS,
  RECON_STATUS_LABELS,
  REF_IN_PARAM,
  reconcileCheck,
  rowRefKeys,
  type ReconStatus,
  type RefSelection,
} from '@/lib/receiving/reconcile';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** The Check's own gate (`POST …/check-zoho-received`) and the ledger's. */
export const INBOUND_LOCATE_PERMISSION = 'receiving.view';

export const INBOUND_BUCKET_IDS = ['awaiting_tracking', 'received', 'not_received', 'exceptions'] as const;
type InboundBucketId = (typeof INBOUND_BUCKET_IDS)[number];

function inboundLedgerHref(status: ReconStatus, ref?: string): string {
  const params = new URLSearchParams({ [RECON_PARAM]: status });
  if (ref) params.set(REF_IN_PARAM, ref);
  return `${INCOMING_SURFACE_ROUTE}?${params.toString()}`;
}

const INBOUND_BUCKETS: Readonly<Record<InboundBucketId, Omit<NavLocateBucket, 'id' | 'count'>>> = {
  // The Incoming status chip's words — the list `?state=AWAITING_TRACKING` opens.
  awaiting_tracking: {
    label: 'Awaiting tracking',
    tone: 'warning',
    href: `${INCOMING_SURFACE_ROUTE}?state=AWAITING_TRACKING`,
  },
  // The ledger under `?recon=` — the same list the chips count. Null left Enter with nowhere to go.
  received: { label: RECON_STATUS_LABELS.received, tone: 'success', href: inboundLedgerHref('received') },
  not_received: { label: RECON_STATUS_LABELS.not_received, tone: 'warning', href: inboundLedgerHref('not_received') },
  exceptions: { label: 'Exceptions', tone: 'danger', href: `${INCOMING_SURFACE_ROUTE}?lane=exceptions` },
};

export interface InboundLocateDeps {
  /** The Unbox Check rows for these refs (every bucket of its answer). */
  check(refs: readonly string[]): Promise<CheckZohoReceivedRow[]>;
  /** `GET /api/receiving-lines?view=reconcile&ref_in=…` rows. */
  lines(refs: readonly string[]): Promise<ReceivingLineRow[]>;
  /** Incoming `?state=AWAITING_TRACKING` rows for these refs — the list the bucket opens. */
  awaiting(refs: readonly string[]): Promise<ReceivingLineRow[]>;
  /** The follow-up tags set on these canonical keys (`inboundFollowupKey`). */
  followups(keys: readonly string[]): Promise<InboundFollowup[]>;
}

export async function locateInbound(
  selection: Pick<RefSelection, 'refs' | 'keys'>,
  deps: InboundLocateDeps,
): Promise<{ buckets: NavLocateBucket[]; entries: NavLocateEntry[] }> {
  const [checkRows, lineRows, awaitingRows] =
    selection.refs.length > 0
      ? await Promise.all([deps.check(selection.refs), deps.lines(selection.refs), deps.awaiting(selection.refs)])
      : [[], [], []];
  const recon = reconcileCheck({ ...selection, truncated: 0 }, checkRows, lineRows);
  // Found nowhere = the branch `reconcileCheck` answers "No match anywhere":
  // no Check row, or no ERP answer and nothing in our tables.
  const checked = new Set(checkRows.map((row) => canonicalizeTrackingKey(row.tracking)));
  const awaitingKeys = new Set(awaitingRows.flatMap((row) => rowRefKeys(row)));
  // The ledger's lines per number — by every key a line answers to, as `reconcileCheck` reads them.
  const linesByKey = new Map<string, ReceivingLineRow[]>();
  for (const line of lineRows) {
    for (const key of rowRefKeys(line)) {
      const bucket = linesByKey.get(key);
      if (bucket) bucket.push(line);
      else linesByKey.set(key, [line]);
    }
  }
  const followupKeys = recon.map((entry) => inboundFollowupKey({ poNumber: entry.poNumber, ref: entry.ref }));
  const followups = followupKeys.length > 0 ? await deps.followups([...new Set(followupKeys)]) : [];
  const followupByKey = new Map(followups.map((followup) => [followup.key, followup]));
  const counts: Record<InboundBucketId, number> = {
    awaiting_tracking: 0,
    received: 0,
    not_received: 0,
    exceptions: 0,
  };
  const entries = recon.map((entry, index): NavLocateEntry => {
    const nowhere = !checked.has(entry.key) || entry.reasonCode === 'no_match';
    const buckets: InboundBucketId[] = [];
    // The list, not the in_transit facet. A ref the list holds is found.
    if (awaitingKeys.has(entry.key)) buckets.push('awaiting_tracking');
    if (!nowhere) {
      buckets.push(entry.status);
      if (entry.exception?.inView) buckets.push('exceptions');
    }
    for (const id of buckets) counts[id] += 1;
    const title = entry.poNumber
      ? [`PO ${entry.poNumber}`, entry.vendor].filter(Boolean).join(' · ')
      : entry.vendor;
    const reason = entry.exception?.reason;
    const carrierWord = carrierFactText(carrierFactOf(linesByKey.get(entry.key) ?? []), true);
    const followup = followupByKey.get(followupKeys[index]!);
    const words = nowhere
      ? []
      : [
          entry.detail,
          reason && reason !== entry.detail ? reason : null,
          // "Ordered · no tracking" / "In transit" already say it.
          carrierWord && !entry.detail.toLowerCase().includes(carrierWord.toLowerCase()) ? carrierWord : null,
          followup ? INBOUND_FOLLOWUP_LABELS[followup.tag] : null,
        ];
    return {
      ref: entry.ref,
      buckets,
      title: title || null,
      detail: words.filter(Boolean).join(' · ') || null,
      recordHref: nowhere ? null : inboundLedgerHref(entry.status, entry.ref),
      facet: entry.reasonCode ? { id: entry.reasonCode, label: RECON_REASON_LABELS[entry.reasonCode] } : null,
    };
  });
  return {
    buckets: INBOUND_BUCKET_IDS.map((id) => ({ id, ...INBOUND_BUCKETS[id], count: counts[id] })),
    entries,
  };
}
