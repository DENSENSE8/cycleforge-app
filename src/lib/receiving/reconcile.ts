/**
 * Inbound reconciliation — "which of THESE did we actually receive?".
 *
 * An operator pastes a vendor's list of order and tracking numbers into the
 * Inbound Find. The list rides the URL as `?ref_in=` (the operator's own
 * strings, so the popout shows what they pasted). Two reads answer it:
 *
 * - the VERDICT per number is the Unbox station's Check
 *   (`POST /api/receiving-lines/incoming/check-zoho-received`): the ERP answer
 *   crossed with the warehouse's own dock-scan / unbox state;
 * - the EVIDENCE is every receiving line those numbers name, whatever its lane
 *   (`GET /api/receiving-lines?view=reconcile`), painted in the ledger.
 *
 * Physical-first (the rule `deliveredUnscannedBaseSql` states): a dock scan or
 * an unbox is what makes a delivery received. Zoho's PO status never decides
 * or labels a number — one with nothing scanned reads its carrier/physical fact.
 */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS, parseTrackingKeys } from '@/lib/receiving/tracking-paste';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** The pasted list. One name, imported — never re-typed at a call site. */
export const REF_IN_PARAM = 'ref_in';

/** The status filter over the pasted list. */
export const RECON_PARAM = 'recon';

/** The reason filter inside one status (`?recon=` must be set for it to apply). */
export const RECON_REASON_PARAM = 'recon_reason';

/** One reconcile fetch holds every matched line (the list route's ceiling). */
export const RECONCILE_ROW_LIMIT = 500;

/** Said above the list when a paste names more lines than one fetch holds. */
export const RECONCILE_CAP_NOTE = `Only the first ${RECONCILE_ROW_LIMIT} lines are shown`;

/**
 * A pasted list's STATUSES — received or not. "Needs a person" is not a third
 * status: it is the Exceptions VIEW, and a number that belongs there carries an
 * {@link ReconEntry.exception} badge instead.
 */
export const RECON_STATUSES = ['received', 'not_received'] as const;
export type ReconStatus = (typeof RECON_STATUSES)[number];

export const RECON_STATUS_LABELS: Readonly<Record<ReconStatus, string>> = {
  received: 'Received',
  not_received: 'Not received',
};

export function parseReconParam(raw: string | null | undefined): ReconStatus | null {
  const value = String(raw ?? '').trim().toLowerCase();
  return (RECON_STATUSES as readonly string[]).includes(value) ? (value as ReconStatus) : null;
}

/**
 * WHY a pasted number sits in its status — the triage axis inside a status.
 * Derived in the same branch that sets the status, never a second engine.
 */
export const RECON_REASONS = [
  'unboxed',
  'scanned',
  'received_here',
  'delivered_not_scanned',
  'in_transit',
  'open_po',
  'warehouse_owed',
  'no_match',
  'ambiguous',
  'lookup_failed',
] as const;
export type ReconReason = (typeof RECON_REASONS)[number];

/** Each reason's words — the entry's `detail` and the reason chip's label. */
export const RECON_REASON_LABELS: Readonly<Record<ReconReason, string>> = {
  unboxed: 'Unboxed',
  scanned: 'Scanned at dock',
  received_here: 'Received here',
  delivered_not_scanned: 'Delivered · not scanned',
  in_transit: 'In transit',
  open_po: 'Ordered · no tracking',
  warehouse_owed: 'Warehouse record · not received',
  no_match: 'No match anywhere',
  ambiguous: 'Several POs match',
  lookup_failed: 'Lookup failed',
};

/** The one status each reason belongs to. */
export const RECON_REASON_STATUS: Readonly<Record<ReconReason, ReconStatus>> = {
  unboxed: 'received',
  scanned: 'received',
  received_here: 'received',
  delivered_not_scanned: 'not_received',
  in_transit: 'not_received',
  open_po: 'not_received',
  warehouse_owed: 'not_received',
  no_match: 'not_received',
  ambiguous: 'not_received',
  lookup_failed: 'not_received',
};

/** `?recon_reason=` → a reason of `status`; a reason of another status (or none) filters nothing. */
export function parseReconReasonParam(raw: string | null | undefined, status: ReconStatus | null): ReconReason | null {
  if (!status) return null;
  const value = String(raw ?? '').trim().toLowerCase();
  if (!(RECON_REASONS as readonly string[]).includes(value)) return null;
  const reason = value as ReconReason;
  return RECON_REASON_STATUS[reason] === status ? reason : null;
}

export interface RefSelection {
  /** The operator's strings, deduped by canonical key, capped — the popout's rows. */
  refs: string[];
  /** Canonical (upper-alnum) keys, index-aligned with {@link refs}. */
  keys: string[];
  /** Unique numbers the cap dropped. */
  truncated: number;
}

const EMPTY: RefSelection = { refs: [], keys: [], truncated: 0 };

/**
 * A paste (newline / comma / semicolon / tab separated) → the capped
 * selection. Same splitter and the same cap as the Check
 * ({@link CHECK_ZOHO_RECEIVED_MAX_INPUTS}), because the Check is what answers it.
 */
export function parseRefList(input: string): RefSelection {
  const selection = parseTrackingKeys(input.replace(/\t/g, '\n'), CHECK_ZOHO_RECEIVED_MAX_INPUTS);
  if (selection.keys.length === 0) return EMPTY;
  return { refs: selection.display, keys: selection.keys, truncated: selection.truncated };
}

/** `?ref_in=` → the selection. Malformed input degrades to empty, never throws. */
export function parseRefInParam(raw: string | null | undefined): RefSelection {
  const value = String(raw ?? '').trim();
  return value ? parseRefList(value) : EMPTY;
}

/** The selection's refs → the `?ref_in=` value. */
export function serializeRefIn(refs: readonly string[]): string {
  return refs.join(',');
}

/** One pasted number, answered. */
export interface ReconEntry {
  /** The operator's string, as pasted. */
  ref: string;
  key: string;
  status: ReconStatus;
  /** Why it sits in {@link status}; `null` while {@link pending}. */
  reasonCode: ReconReason | null;
  /** Why, in the words a receiver acts on ("Delivered · not scanned"). */
  detail: string;
  /**
   * Not answered yet — the Check has not been asked, or live Zoho has not
   * reached it (`zoho_cap`). A pending number sits in no status and no count.
   */
  pending: boolean;
  poNumber: string | null;
  vendor: string | null;
  /**
   * Set when the number needs a person, whatever its status — the badge.
   * `inView` = its lines sit in the Exceptions view (the badge links there);
   * false for a number no line carries (nothing to open, only to chase).
   */
  exception: { reason: string; inView: boolean } | null;
}

type Verdict = Pick<ReconEntry, 'status' | 'reasonCode' | 'detail' | 'pending' | 'exception'>;

const verdict = (reasonCode: ReconReason, exception: ReconEntry['exception'] = null): Verdict => ({
  status: RECON_REASON_STATUS[reasonCode],
  reasonCode,
  detail: RECON_REASON_LABELS[reasonCode],
  pending: false,
  exception,
});

/** A reason that needs a person: its label is also the badge. */
const badged = (reasonCode: ReconReason, inView: boolean): Verdict =>
  verdict(reasonCode, { reason: RECON_REASON_LABELS[reasonCode], inView });

/** Asked, not answered: owed until the Check says otherwise, but in no bucket. */
const pendingVerdict = (detail: string): Verdict => ({
  status: 'not_received',
  reasonCode: null,
  detail,
  pending: true,
  exception: null,
});

/** Said for a number the Check has not answered yet. */
export const RECON_CHECKING_DETAIL = 'Checking…';

/**
 * The Check had no ERP answer for this number: nothing matched, or live
 * Zoho was never asked (`zoho_cap`, past its per-call cap). Either way our
 * own tables decide — the local facts here, the receiving lines in
 * {@link reconcileCheck}.
 */
function tablesDecide(row: CheckZohoReceivedRow): boolean {
  return row.reason === 'no_match' || row.reason === 'zoho_cap';
}

/**
 * One Check row → its status and reason. Received = the warehouse scanned or
 * unboxed it (physical-first). Everything else is still owed, by its physical
 * or carrier fact; a number nothing identifies is owed AND an exception.
 */
export function reconOfCheckRow(row: CheckZohoReceivedRow): Verdict {
  const local = row.local;
  if (local?.unboxed) return verdict('unboxed');
  if (local?.scanned) return verdict('scanned');
  if (row.reason === 'ambiguous') return badged('ambiguous', false);
  if (row.reason === 'error') return badged('lookup_failed', false);
  if (tablesDecide(row) && !local?.known) return badged('no_match', false);
  if (local?.delivered) return verdict('delivered_not_scanned');
  if (local?.known) return verdict('in_transit');
  return verdict('open_po');
}

/** Line delivery states the Exceptions view carries (`incomingExceptionCodeSql`). */
const LINE_EXCEPTION_STATES: Readonly<Partial<Record<NonNullable<ReceivingLineRow['delivery_state']>, string>>> = {
  WRONG_DESTINATION: 'Wrong destination',
  STALLED: 'Stalled',
  TRACKING_UNAVAILABLE: 'Tracking unavailable',
  CARRIER_MISMATCH: 'Carrier mismatch',
};

/** An owed number whose lines sit in an exception state → the badge. */
function lineException(lines: readonly ReceivingLineRow[]): ReconEntry['exception'] {
  for (const line of lines) {
    const reason = line.delivery_state ? LINE_EXCEPTION_STATES[line.delivery_state] : undefined;
    if (reason) return { reason, inView: true };
  }
  return null;
}

/**
 * A number the Check had no ERP answer for, that our receiving lines carry
 * (a manual or marketplace receipt, or one live Zoho was never asked about):
 * the lines are the answer. Same physical-first rule as
 * {@link reconOfCheckRow}: an unbox or a dock scan (or units received here)
 * is received; anything else is still owed.
 */
export function reconOfWarehouseRows(rows: readonly ReceivingLineRow[]): Verdict {
  if (rows.some((row) => Boolean(row.unboxed_at))) return verdict('unboxed');
  if (rows.some((row) => Boolean(row.received_at || row.scanned_at) || row.delivery_state === 'DELIVERED_NOT_UNBOXED')) {
    return verdict('scanned');
  }
  if (rows.some((row) => Number(row.quantity_received) > 0 || row.delivery_state === 'RECEIVED')) {
    return verdict('received_here');
  }
  if (rows.some((row) => row.delivery_state === 'DELIVERED_UNOPENED')) return verdict('delivered_not_scanned');
  return verdict('warehouse_owed');
}

/**
 * Check rows → one entry per pasted number, in the operator's paste order.
 * `lineRows` (the `view=reconcile` answer) settles every number the ERP had
 * no answer for but the warehouse has lines for — our tables are the truth.
 */
export function reconcileCheck(
  selection: RefSelection,
  rows: readonly CheckZohoReceivedRow[],
  lineRows: readonly ReceivingLineRow[] = [],
): ReconEntry[] {
  const byKey = new Map<string, CheckZohoReceivedRow>();
  for (const row of rows) byKey.set(canonicalizeTrackingKey(row.tracking), row);
  let linesByKey: Map<string, ReceivingLineRow[]> | null = null;
  const linesFor = (key: string): readonly ReceivingLineRow[] => {
    if (!linesByKey) {
      linesByKey = new Map();
      for (const line of lineRows) {
        for (const lineKey of rowRefKeys(line)) {
          const bucket = linesByKey.get(lineKey);
          if (bucket) bucket.push(line);
          else linesByKey.set(lineKey, [line]);
        }
      }
    }
    return linesByKey.get(key) ?? [];
  };
  return selection.refs.map((ref, index) => {
    const key = selection.keys[index];
    const row = byKey.get(key);
    // The Check answers every key it was sent; a hole means it has not answered yet.
    if (!row) return { ref, key, ...pendingVerdict(RECON_CHECKING_DETAIL), poNumber: null, vendor: null };
    const lines = linesFor(key);
    if (tablesDecide(row) && !row.local?.known && lines.length > 0) {
      const lead = lines[0];
      const verdict = reconOfWarehouseRows(lines);
      return {
        ref,
        key,
        ...verdict,
        exception: verdict.status === 'not_received' ? lineException(lines) : null,
        poNumber: lead.zoho_purchaseorder_number || null,
        vendor: lead.vendor_name ?? null,
      };
    }
    const verdict = reconOfCheckRow(row);
    return {
      ref,
      key,
      ...verdict,
      exception: verdict.exception ?? (verdict.status === 'not_received' ? lineException(lines) : null),
      poNumber: row.po_number,
      vendor: row.vendor_name,
    };
  });
}

/** Answered numbers per status — a pending number counts nowhere yet. */
export function reconCounts(entries: readonly ReconEntry[]): Record<ReconStatus, number> {
  const counts: Record<ReconStatus, number> = { received: 0, not_received: 0 };
  for (const entry of entries) if (!entry.pending) counts[entry.status] += 1;
  return counts;
}

/** Answered numbers of `status` per reason, in {@link RECON_REASONS} order; reasons with none are left out. */
export function reconReasonCounts(
  entries: readonly ReconEntry[],
  status: ReconStatus,
): Array<{ reason: ReconReason; count: number }> {
  const counts = new Map<ReconReason, number>();
  for (const entry of entries) {
    if (entry.pending || entry.status !== status || !entry.reasonCode) continue;
    counts.set(entry.reasonCode, (counts.get(entry.reasonCode) ?? 0) + 1);
  }
  return RECON_REASONS.flatMap((reason) => {
    const count = counts.get(reason) ?? 0;
    return count > 0 ? [{ reason, count }] : [];
  });
}

/** The pasted numbers a status (and optional reason) keeps, in paste order. */
export function filterEntriesByRecon(
  entries: readonly ReconEntry[],
  status: ReconStatus,
  reason: ReconReason | null = null,
): ReconEntry[] {
  return entries.filter(
    (entry) => !entry.pending && entry.status === status && (reason === null || entry.reasonCode === reason),
  );
}

/** Every identifier on a line a vendor list may name, canonicalized. */
export function rowRefKeys(row: ReceivingLineRow): string[] {
  const keys: string[] = [];
  for (const value of [
    row.tracking_number,
    row.zoho_reference_number,
    row.zoho_purchaseorder_number,
    row.zoho_purchaseorder_id,
    row.source_order_id,
  ]) {
    const key = canonicalizeTrackingKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * The ledger under a status (and reason) filter: a line stays when any pasted
 * number it carries sits in that bucket — the table shows exactly the
 * deliveries the chips count.
 */
export function filterRowsByRecon<T extends ReceivingLineRow>(
  rows: readonly T[],
  entries: readonly ReconEntry[],
  status: ReconStatus,
  reason: ReconReason | null = null,
): T[] {
  const keys = new Set(filterEntriesByRecon(entries, status, reason).map((entry) => entry.key));
  return rows.filter((row) => rowRefKeys(row).some((key) => keys.has(key)));
}
