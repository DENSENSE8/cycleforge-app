/**
 * A pasted Inbound number read as the sheet row it replaces — and more.
 *
 * The staff "Unreceived Tracking" sheet carried per row: PO date, vendor,
 * source, tracking, SKU, item, qty, total, a carrier note ("ETA 10/5",
 * "Delivered", "Signed for by: SANG") and a hand-coloured triage tag. This is
 * the same row from our own tables, physical-first: the verdict is what the
 * dock did (scanned / unboxed), quantities are what was counted, the carrier
 * note is what the carrier said. Pure — every face reads it the same way.
 */

import type { RecordStateFace } from '@/design-system/tokens/record';
import type { StateName } from '@/design-system/tokens/lifecycle';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReconEntry, ReconReason } from '@/lib/receiving/reconcile';
import { STATUS_CATEGORIES } from '@/lib/shipping/shipped-filter/shipped-filter-constants';

const STATUS_WORD = new Map<string, string>(STATUS_CATEGORIES.map((status) => [status.value, status.label]));

const DAY_MS = 86_400_000;

/** What the carrier last said, the sheet's "Notes" column. */
export type PastedCarrierFact =
  | { kind: 'delivered'; at: string | null; signedBy: string | null }
  | { kind: 'eta'; at: string }
  /** The carrier tried and failed to deliver (the sheet's "Delivery Attempt"). */
  | { kind: 'attempted'; count: number }
  | { kind: 'moving'; label: string }
  | { kind: 'no_tracking' }
  | { kind: 'unknown' };

export interface PastedNumberFacts {
  /** Purchase date (ISO) and whole days since it, at `now`. */
  ordered: { at: string; ageDays: number } | null;
  /** Vendor / account the purchase came from. */
  vendor: string | null;
  /** The lead item and how many lines the number holds. */
  item: { title: string | null; sku: string | null; lines: number };
  /** Units counted in against units bought, over every line. `expected` null = a line has no expected qty. */
  units: { received: number; expected: number | null };
  /** Σ unit price × qty bought. `partial` = some line has no price (the sum is a floor). */
  total: { dollars: number; partial: boolean } | null;
  /** The number the carrier tracks, when one is on file. */
  tracking: string | null;
  carrier: PastedCarrierFact;
}

const trimmed = (value: string | null | undefined): string | null => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

const latest = (values: readonly (string | null | undefined)[]): string | null =>
  values.reduce<string | null>((best, value) => {
    const at = trimmed(value);
    if (!at) return best;
    return best == null || Date.parse(at) > Date.parse(best) ? at : best;
  }, null);

const earliest = (values: readonly (string | null | undefined)[]): string | null =>
  values.reduce<string | null>((best, value) => {
    const at = trimmed(value);
    if (!at) return best;
    return best == null || Date.parse(at) < Date.parse(best) ? at : best;
  }, null);

/** What the carrier last said for these lines (one line = that line's own package). */
export function carrierFactOf(lines: readonly ReceivingLineRow[]): PastedCarrierFact {
  if (lines.length === 0) return { kind: 'unknown' };
  const delivered = lines.filter((line) => line.is_delivered || trimmed(line.delivered_at));
  if (delivered.length > 0) {
    return {
      kind: 'delivered',
      at: latest(delivered.map((line) => line.delivered_at)),
      signedBy: delivered.map((line) => trimmed(line.shipment_signed_by)).find(Boolean) ?? null,
    };
  }
  if (lines.every((line) => !trimmed(line.tracking_number))) return { kind: 'no_tracking' };
  const attempts = Math.max(0, ...lines.map((line) => Number(line.shipment_delivery_attempts) || 0));
  if (attempts > 0) return { kind: 'attempted', count: attempts };
  const eta = earliest(lines.map((line) => line.shipment_estimated_delivery_at ?? line.expected_delivery_date));
  if (eta) return { kind: 'eta', at: eta };
  const status = lines.map((line) => trimmed(line.shipment_status)).find(Boolean);
  // The carrier's status category in words ("IN_TRANSIT" → "In transit"); an uncategorized one reads as given.
  return status ? { kind: 'moving', label: STATUS_WORD.get(status) ?? status } : { kind: 'unknown' };
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
const CALENDAR_DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 2" in the warehouse's day. A bare `YYYY-MM-DD` is a calendar day, never shifted by a timezone. */
export function shortDay(value: string): string {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return value;
  return (/^\d{4}-\d{2}-\d{2}$/.test(value) ? CALENDAR_DAY_FORMAT : DAY_FORMAT).format(at);
}

/**
 * The carrier's last word, the sheet's Notes column: "Delivered Oct 2 · signed MIKE", "ETA Oct 5". Null = nothing said.
 * `brief` fits the Compact row's column: the signer is left to the Full card, an attempt is one word.
 */
export function carrierFactText(fact: PastedCarrierFact, brief = false): string | null {
  switch (fact.kind) {
    case 'delivered':
      return `Delivered${fact.at ? ` ${shortDay(fact.at)}` : ''}${fact.signedBy && !brief ? ` · signed ${fact.signedBy}` : ''}`;
    case 'eta':
      return `ETA ${shortDay(fact.at)}`;
    case 'attempted': {
      const word = brief ? 'Attempted' : 'Delivery attempted';
      return fact.count === 1 ? word : `${word} ×${fact.count}`;
    }
    case 'moving':
      return fact.label;
    case 'no_tracking':
      return 'No tracking';
    case 'unknown':
      return null;
  }
}

/** The number's lines → its sheet row. `now` is injected so the age is testable. */
export function pastedNumberFacts(lines: readonly ReceivingLineRow[], entry: ReconEntry, now: Date): PastedNumberFacts {
  const lead = lines[0] ?? null;
  const orderedAt = earliest(lines.map((line) => line.po_date));
  let received = 0;
  let expected: number | null = 0;
  let dollars = 0;
  let priced = 0;
  for (const line of lines) {
    received += Math.max(0, Number(line.quantity_received) || 0);
    const bought = line.quantity_expected == null ? null : Math.max(0, Number(line.quantity_expected) || 0);
    expected = expected == null || bought == null ? null : expected + bought;
    const price = Number.parseFloat(String(line.unit_price ?? ''));
    if (Number.isFinite(price)) {
      dollars += price * (bought ?? Math.max(1, received));
      priced += 1;
    }
  }
  return {
    ordered: orderedAt
      ? { at: orderedAt, ageDays: Math.max(0, Math.floor((now.getTime() - Date.parse(orderedAt)) / DAY_MS)) }
      : null,
    vendor: trimmed(lead?.platform_account_label) ?? trimmed(lead?.vendor_name) ?? trimmed(entry.vendor),
    item: {
      title: trimmed(lead?.catalog_product_title) ?? trimmed(lead?.zoho_item_title) ?? trimmed(lead?.item_name),
      sku: trimmed(lead?.sku),
      lines: lines.length,
    },
    units: lines.length === 0 ? { received: 0, expected: null } : { received, expected },
    total: priced > 0 ? { dollars: Math.round(dollars * 100) / 100, partial: priced < lines.length } : null,
    tracking: lines.map((line) => trimmed(line.tracking_number)).find(Boolean) ?? null,
    carrier: carrierFactOf(lines),
  };
}

/** Units counted against units bought: none, some, or all. */
export type UnitsState = 'none' | 'partial' | 'all';

export function unitsState(units: PastedNumberFacts['units']): UnitsState {
  if (units.received <= 0) return 'none';
  if (units.expected != null && units.received < units.expected) return 'partial';
  return 'all';
}

const VERDICT_FACE: Readonly<Record<ReconReason, Omit<RecordStateFace, 'id' | 'label'>>> = {
  unboxed: { code: 'UNB', tone: 'success', icon: 'package-check' },
  scanned: { code: 'DCK', tone: 'fulfillment', icon: 'package-open' },
  received_here: { code: 'RCV', tone: 'success', icon: 'package-check' },
  delivered_not_scanned: { code: 'DSC', tone: 'danger', icon: 'inbox' },
  in_transit: { code: 'TRN', tone: 'info', icon: 'map-pin' },
  open_po: { code: 'ORD', tone: 'warning', icon: 'clock' },
  warehouse_owed: { code: 'OWE', tone: 'warning', icon: 'clock' },
  no_match: { code: 'NF', tone: 'danger', icon: 'package-x' },
  ambiguous: { code: 'AMB', tone: 'danger', icon: 'package-x' },
  lookup_failed: { code: 'ERR', tone: 'danger', icon: 'package-x' },
};

/**
 * The number's state face — the verdict in its own words ("Unboxed",
 * "Delivered · not scanned"), never a Zoho status. Opened boxes say how many
 * units were counted, so "received" only ever means units.
 */
export function pastedNumberStateFace(entry: ReconEntry, facts: PastedNumberFacts | null): RecordStateFace {
  if (entry.pending || !entry.reasonCode) {
    return { id: 'PASTED_PENDING', code: 'CHK', label: entry.detail, tone: 'neutral', icon: 'clock' };
  }
  const face = VERDICT_FACE[entry.reasonCode];
  let label = entry.detail;
  if (facts && facts.units.expected != null && facts.units.expected > 0 && (entry.reasonCode === 'unboxed' || entry.reasonCode === 'received_here')) {
    const state = unitsState(facts.units);
    label = `${entry.detail} · ${state === 'all' ? 'all' : `${facts.units.received} of ${facts.units.expected}`} received`;
    if (state !== 'all') return { id: `PASTED_${entry.reasonCode.toUpperCase()}`, ...face, label, tone: 'fulfillment' };
  }
  return { id: `PASTED_${entry.reasonCode.toUpperCase()}`, ...face, label };
}

/** The next step a number asks of the floor; null = nothing left. Verbs are `INCOMING_PIPELINE_VIEW.next`. */
export function pastedNumberNextStep(
  entry: ReconEntry,
  facts: PastedNumberFacts | null,
): { label: string; tone: StateName; blocked: boolean } | null {
  if (entry.pending || !entry.reasonCode) return null;
  const counted = facts ? unitsState(facts.units) : 'none';
  switch (entry.reasonCode) {
    case 'unboxed':
    case 'received_here':
      return counted === 'all' ? null : { label: 'Receive', tone: 'fulfillment', blocked: false };
    case 'scanned':
      return { label: 'Unbox', tone: 'fulfillment', blocked: false };
    case 'delivered_not_scanned':
      return { label: 'Investigate', tone: 'danger', blocked: true };
    case 'in_transit':
    case 'warehouse_owed':
      return { label: 'Monitor', tone: 'info', blocked: false };
    case 'open_po':
      return { label: 'Attach tracking', tone: 'warning', blocked: false };
    case 'no_match':
    case 'ambiguous':
    case 'lookup_failed':
      return { label: 'Resolve', tone: 'danger', blocked: true };
  }
}
