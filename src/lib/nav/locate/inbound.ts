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
 * `facts` is the pasted list page's row (item, vendor, delivered, unboxed +
 * who by staff id, units) off the SAME reconcile lines — `pastedNumberFacts`,
 * the ledger's own reading — so the page needs no second read. `recordHref`
 * opens the number the way its Incoming card does (`recordDetailsHref`:
 * `/incoming?ref_in=<number>&openLine=<its line>`), never the carton's scan
 * station. A number found nowhere has no record (`null`).
 */

import type { NavLocateBucket, NavLocateEntry, NavLocateFacts, NavLocateStaff } from '@/lib/nav/context/schema';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { INBOUND_FOLLOWUP_LABELS, inboundFollowupKey, type InboundFollowup } from '@/lib/receiving/inbound-followups';
import { carrierFactOf, carrierFactText, duplicatePurchaseLineIds, pastedNumberFacts } from '@/lib/receiving/pasted-number-facts';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  RECON_PARAM,
  RECON_REASON_LABELS,
  RECON_STATUS_LABELS,
  reconcileCheck,
  rowRefKeys,
  type ReconEntry,
  type ReconStatus,
  type RefSelection,
} from '@/lib/receiving/reconcile';
import { INCOMING_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { recordDetailsHref } from '@/lib/records/record-details';
import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';

/** The Check's own gate (`POST …/check-zoho-received`) and the ledger's. */
export const INBOUND_LOCATE_PERMISSION = 'receiving.view';

export const INBOUND_BUCKET_IDS = ['awaiting_tracking', 'received', 'not_received', 'exceptions'] as const;
type InboundBucketId = (typeof INBOUND_BUCKET_IDS)[number];

function inboundLedgerHref(status: ReconStatus): string {
  return `${INCOMING_SURFACE_ROUTE}?${new URLSearchParams({ [RECON_PARAM]: status }).toString()}`;
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

/** Postgres `timestamptz::text` (`2026-08-24 16:00:42.771872-07`) — not a shape `Date.parse` is specified to read. */
const PG_TIMESTAMPTZ = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/;

/**
 * A fact's instant as ISO-8601 UTC (`2026-08-24T23:00:42.771Z`). The line feed
 * hands stamps over as Postgres text, ISO, or a stringified `Date`
 * (`carrierFactOf` reads them through `String()`); the wire speaks one form.
 */
function isoInstant(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const pg = PG_TIMESTAMPTZ.exec(text);
  const ms = pg
    ? Date.parse(`${pg[1]}T${pg[2]}${(pg[3] ?? '').slice(0, 4)}${pg[4]}:${pg[5] ?? '00'}`)
    : Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The latest unbox across a number's lines (ISO), and who did it — completion actor first, else who opened the carton. */
function latestUnbox(lines: readonly ReceivingLineRow[]): { at: string; by: NavLocateStaff | null } | null {
  let best: { at: string; by: NavLocateStaff | null } | null = null;
  for (const line of lines) {
    const at = isoInstant(line.unboxed_at);
    // ISO-8601 UTC strings order as their instants.
    if (!at || (best && at <= best.at)) continue;
    const doneName = line.unboxed_by_name?.trim() || null;
    const done = doneName || line.unboxed_by_id ? { id: line.unboxed_by_id ?? null, name: doneName } : null;
    const openedName = line.unbox_opened_by_name?.trim() || null;
    const opened = openedName || line.unbox_opened_by_id ? { id: line.unbox_opened_by_id ?? null, name: openedName } : null;
    best = { at, by: done ?? opened };
  }
  return best;
}

/**
 * A number's row facts off its reconcile lines (`pastedNumberFacts`, the
 * pasted ledger's reading). `lines` = the number's counted lines; `duplicates`
 * = the line ids left out as another line's twin of the same purchase.
 */
function inboundFacts(lines: readonly ReceivingLineRow[], duplicates: readonly number[], entry: ReconEntry, now: Date): NavLocateFacts {
  const sheet = lines.length > 0 ? pastedNumberFacts(lines, entry, now) : null;
  const unbox = latestUnbox(lines);
  return {
    section: 'inbound',
    title: sheet?.item.title ?? null,
    sku: sheet?.item.sku ?? null,
    tracking: sheet?.tracking ?? null,
    deliveredAt: sheet?.carrier.kind === 'delivered' ? isoInstant(sheet.carrier.at) : null,
    channelStatus: null,
    shipBy: null,
    pickedAt: null,
    pickedBy: null,
    packedAt: null,
    shippedAt: null,
    packer: null,
    po: entry.poNumber?.trim() || null,
    vendor: sheet?.vendor ?? (entry.vendor?.trim() || null),
    lines: lines.length,
    duplicates: [...duplicates],
    unboxedAt: unbox?.at ?? null,
    unboxedBy: unbox?.by ?? null,
    units: sheet && (sheet.units.expected != null || sheet.units.received > 0) ? sheet.units : null,
  };
}

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
  // A follow-up is keyed by the number's PO# or the ref itself
  // (`inboundFollowupKey`). The Check names the PO#s, so those tags are read
  // the moment it answers — alongside the line reads, not after them. Only a
  // PO# that the lines alone name is asked for afterwards.
  const asked = new Set<string>();
  const readFollowups = (keys: readonly string[]) => {
    const fresh = [...new Set(keys)].filter((key) => key && !asked.has(key));
    for (const key of fresh) asked.add(key);
    return fresh.length > 0 ? deps.followups(fresh) : Promise.resolve([]);
  };
  const checking = selection.refs.length > 0 ? deps.check(selection.refs) : Promise.resolve([]);
  const [checkRows, lineRows, awaitingRows, earlyFollowups] =
    selection.refs.length > 0
      ? await Promise.all([
          checking,
          deps.lines(selection.refs),
          deps.awaiting(selection.refs),
          checking.then((rows) =>
            readFollowups([...selection.keys, ...rows.map((row) => canonicalizeTrackingKey(row.po_number))]),
          ),
        ])
      : [[], [], [], []];
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
  const followups = [...earlyFollowups, ...(await readFollowups(followupKeys))];
  const followupByKey = new Map(followups.map((followup) => [followup.key, followup]));
  const counts: Record<InboundBucketId, number> = {
    awaiting_tracking: 0,
    received: 0,
    not_received: 0,
    exceptions: 0,
  };
  const now = new Date();
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
    // A purchase counts once: a twin line of the same purchase (`duplicatePurchaseLineIds`) is named, never read.
    const allLines = linesByKey.get(entry.key) ?? [];
    const duplicates = duplicatePurchaseLineIds(allLines);
    const lines = duplicates.size > 0 ? allLines.filter((line) => !duplicates.has(line.id)) : allLines;
    const carrierWord = carrierFactText(carrierFactOf(lines), true);
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
      recordHref: nowhere ? null : recordDetailsHref({ kind: 'receiving-number', ref: entry.ref, lineId: lines[0]?.id ?? null }),
      facet: entry.reasonCode ? { id: entry.reasonCode, label: RECON_REASON_LABELS[entry.reasonCode] } : null,
      facts: nowhere && lines.length === 0 ? null : inboundFacts(lines, [...duplicates], entry, now),
    };
  });
  return {
    buckets: INBOUND_BUCKET_IDS.map((id) => ({ id, ...INBOUND_BUCKETS[id], count: counts[id] })),
    entries,
  };
}
