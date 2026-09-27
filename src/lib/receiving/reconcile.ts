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
 * an unbox is what makes a delivery received. A Zoho "received" with no scan
 * is the discrepancy worth a person — an exception, never a receipt.
 */

import { canonicalizeTrackingKey } from '@/lib/zoho/call-reduction';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS, parseTrackingKeys } from '@/lib/receiving/tracking-paste';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

/** The pasted list. One name, imported — never re-typed at a call site. */
export const REF_IN_PARAM = 'ref_in';

/** The status filter over the pasted list. */
export const RECON_PARAM = 'recon';

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
 * selection. Same splitter and the same cap as the Check, because the Check
 * is what answers it.
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
  /** Why, in the words a receiver acts on ("Delivered · not scanned"). */
  detail: string;
  poNumber: string | null;
  vendor: string | null;
  /**
   * Set when the number needs a person, whatever its status — the badge.
   * `inView` = its lines sit in the Exceptions view (the badge links there);
   * false for a number no line carries (nothing to open, only to chase).
   */
  exception: { reason: string; inView: boolean } | null;
}

type Verdict = Pick<ReconEntry, 'status' | 'detail' | 'exception'>;

const owed = (detail: string, exception: ReconEntry['exception'] = null): Verdict => ({
  status: 'not_received',
  detail,
  exception,
});

/**
 * One Check row → its status and reason. Received = the warehouse scanned or
 * unboxed it (physical-first). Everything else is still owed; the ERP saying
 * received with nothing opened here, or a number nothing identifies, is owed
 * AND an exception.
 */
export function reconOfCheckRow(row: CheckZohoReceivedRow): Verdict {
  const local = row.local;
  if (local?.unboxed) return { status: 'received', detail: 'Unboxed', exception: null };
  if (local?.scanned) return { status: 'received', detail: 'Scanned at dock', exception: null };
  const badge = (reason: string, inView: boolean) => owed(reason, { reason, inView });
  if (row.verdict === 'erp_ahead') return badge('Zoho received · never scanned', true);
  if (row.reason === 'ambiguous') return badge('Several POs match', false);
  if (row.reason === 'error') return badge('Lookup failed', false);
  if (row.reason === 'zoho_cap') return badge('Not checked · Zoho limit', false);
  if (row.reason === 'no_match' && !local?.known) return badge('No match anywhere', false);
  if (local?.delivered) return owed('Delivered · not scanned');
  if (local?.known) return owed('In transit');
  return owed(row.status ? `PO ${row.status}` : 'Open PO');
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
 * A number only the warehouse knows (a manual or marketplace receipt): the
 * Check's sources — the Zoho mirror, live Zoho, local shipments — never saw
 * it, but `view=reconcile` returned its lines. Same physical-first rule as
 * {@link reconOfCheckRow}: an unbox or a dock scan (or units received here)
 * is received; anything else is still owed.
 */
export function reconOfWarehouseRows(rows: readonly ReceivingLineRow[]): Verdict {
  if (rows.some((row) => Boolean(row.unboxed_at))) return { status: 'received', detail: 'Unboxed', exception: null };
  if (rows.some((row) => Boolean(row.received_at || row.scanned_at) || row.delivery_state === 'DELIVERED_NOT_UNBOXED')) {
    return { status: 'received', detail: 'Scanned at dock', exception: null };
  }
  if (rows.some((row) => Number(row.quantity_received) > 0 || row.delivery_state === 'RECEIVED')) {
    return { status: 'received', detail: 'Received here', exception: null };
  }
  if (rows.some((row) => row.delivery_state === 'DELIVERED_UNOPENED')) return owed('Delivered · not scanned');
  return owed('Warehouse record · not received');
}

/**
 * Check rows → one entry per pasted number, in the operator's paste order.
 * `lineRows` (the `view=reconcile` answer) settles numbers the Check found
 * nowhere but the warehouse has lines for.
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
    // The Check answers every key it was sent; a hole means it was not sent yet.
    if (!row) return { ref, key, ...owed('Checking…'), poNumber: null, vendor: null };
    const lines = linesFor(key);
    if (row.reason === 'no_match' && !row.local?.known && lines.length > 0) {
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

/** Pasted numbers per bucket. */
export function reconCounts(entries: readonly ReconEntry[]): Record<ReconStatus, number> {
  const counts: Record<ReconStatus, number> = { received: 0, not_received: 0 };
  for (const entry of entries) counts[entry.status] += 1;
  return counts;
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
 * The ledger under a status filter: a line stays when any pasted number it
 * carries sits in that bucket — the table shows exactly the deliveries the
 * sidebar counts.
 */
export function filterRowsByRecon<T extends ReceivingLineRow>(
  rows: readonly T[],
  entries: readonly ReconEntry[],
  status: ReconStatus,
): T[] {
  const keys = new Set(entries.filter((entry) => entry.status === status).map((entry) => entry.key));
  return rows.filter((row) => rowRefKeys(row).some((key) => keys.has(key)));
}
