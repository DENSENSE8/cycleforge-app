/**
 * The incoming delivery record's AT-A-GLANCE status — the pipeline a purchase
 * walks from the order to the warehouse (ordered → tracking → carrier →
 * delivered → door scan → unboxed → received) with who / when per step, and
 * the loud alerts (pairing, wrong destination, carrier trouble, claims) — read
 * only from the delivery's own `receiving_lines` rows (the PO's loaded lines)
 * and the details read's shipment. A step paints only when it applies; a
 * missing stamp is `todo` (not yet) or `unrecorded` (the flow moved past it
 * without a stamp) — never invented. Painted by `ReceivingStatusStrip`.
 */

import type { ReceivingLineRow } from './receiving-line-row';
import type { ReceivingStatusAlert, ReceivingStatusStep } from './receiving-status-strip';

/** The details read's shipment fields the strip needs (`DetailsResponse['shipment']`). */
export interface IncomingRecordShipment {
  tracking_number: string | null;
  carrier: string | null;
  latest_status_category: string | null;
  is_delivered: boolean | null;
  delivered_at: string | null;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

/** Latest non-empty stamp (ISO / pg strings compare as dates). */
function latest(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const stamp = text(value);
    if (!stamp) continue;
    const ms = Date.parse(stamp);
    if (Number.isFinite(ms) && ms > bestMs) {
      best = stamp;
      bestMs = ms;
    }
  }
  return best;
}

function firstText(values: ReadonlyArray<string | null | undefined>): string | null {
  for (const value of values) {
    const face = text(value);
    if (face) return face;
  }
  return null;
}

const humanize = (value: string): string => {
  const words = value.replaceAll('_', ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function deriveIncomingSteps(
  lines: readonly ReceivingLineRow[],
  shipment: IncomingRecordShipment | null,
): ReceivingStatusStep[] {
  const steps: ReceivingStatusStep[] = [];
  const first = lines[0] ?? null;

  const orderedAt = firstText(lines.map((line) => line.po_date));
  if (orderedAt) {
    // A purchase date is a civil day, not a moment — shown as the day key, not a 12:00 AM stamp.
    steps.push({ key: 'ordered', label: 'Ordered', state: 'done', who: null, at: null, detail: orderedAt.slice(0, 10) });
  }

  // Step details stay one short word — the strip cell is narrow; the vendor,
  // tracking number and confidence read in full in the record's aside / alerts.
  const tracking = text(shipment?.tracking_number) ?? firstText(lines.map((line) => line.tracking_number));
  const carrier = text(shipment?.carrier) ?? firstText(lines.map((line) => line.carrier));
  steps.push({
    key: 'tracking',
    label: 'Tracking',
    state: tracking ? 'done' : 'todo',
    who: null,
    at: null,
    detail: tracking ? carrier : null,
  });

  const deliveredAt = text(shipment?.delivered_at) ?? latest(lines.map((line) => line.delivered_at));
  const delivered = deliveredAt != null || Boolean(shipment?.is_delivered) || lines.some((line) => line.is_delivered);
  const doorAt = latest(lines.map((line) => line.received_at ?? line.scanned_at));
  const unboxedAt = latest(lines.map((line) => line.unboxed_at));
  const items = lines.filter((line) => line.id > 0);
  const receivedLines = items.filter((line) => text(line.received_done_at));
  const pastDoor = doorAt != null || unboxedAt != null || receivedLines.length > 0;

  if (!delivered && tracking) {
    const status = text(shipment?.latest_status_category) ?? firstText(lines.map((line) => line.shipment_status));
    steps.push({
      key: 'carrier',
      label: 'Carrier',
      state: status ? 'partial' : 'todo',
      who: null,
      at: latest(lines.map((line) => line.shipment_latest_event_at)),
      detail: status ? humanize(status) : null,
    });
  }
  steps.push({
    key: 'delivered',
    label: 'Delivered',
    state: delivered ? 'done' : pastDoor ? 'unrecorded' : 'todo',
    who: null,
    at: deliveredAt,
    detail: null,
  });

  const unboxOnly = lines.some((line) => line.unbox_only_intake);
  steps.push({
    key: 'scanned',
    label: 'Door scan',
    state: doorAt ? 'done' : unboxedAt || receivedLines.length > 0 ? 'unrecorded' : 'todo',
    who: firstText(lines.map((line) => line.received_by_name ?? line.scanned_by_name)),
    at: doorAt,
    detail: !doorAt && unboxOnly ? 'Unbox-only intake' : null,
  });

  steps.push({
    key: 'unboxed',
    label: 'Unboxed',
    state: unboxedAt ? 'done' : receivedLines.length > 0 ? 'unrecorded' : 'todo',
    who: firstText(lines.map((line) => line.unboxed_by_name)),
    at: unboxedAt,
    detail: null,
  });

  if (items.length > 0) {
    steps.push({
      key: 'received',
      label: 'Received',
      state: receivedLines.length === 0 ? 'todo' : receivedLines.length >= items.length ? 'done' : 'partial',
      who: null,
      at: latest(receivedLines.map((line) => line.received_done_at)),
      detail: items.length > 1 ? `${receivedLines.length}/${items.length}` : null,
    });
  }

  return steps;
}

const CARRIER_ALERT: Readonly<Record<string, ReceivingStatusAlert>> = {
  STALLED: { key: 'stalled', tone: 'danger', label: 'Carrier stalled — no movement on the tracking' },
  CARRIER_MISMATCH: { key: 'carrier-mismatch', tone: 'danger', label: 'Carrier mismatch — tracking does not match the carrier' },
  TRACKING_UNAVAILABLE: { key: 'tracking-unavailable', tone: 'warning', label: 'Tracking unavailable from the carrier' },
  AWAITING_TRACKING: { key: 'awaiting-tracking', tone: 'warning', label: 'No tracking attached yet' },
};

export function deriveIncomingAlerts(
  lines: readonly ReceivingLineRow[],
  paired: boolean,
): ReceivingStatusAlert[] {
  const alerts: ReceivingStatusAlert[] = [];
  if (!paired || lines.some((line) => line.pairing_state === 'UNFOUND')) {
    alerts.push({ key: 'unpaired', tone: 'danger', label: 'Unpaired — no purchase order linked' });
  }
  if (lines.some((line) => line.wrong_destination)) {
    alerts.push({ key: 'wrong-destination', tone: 'danger', label: 'Delivered to the wrong destination' });
  }
  const carrier = new Set<string>();
  for (const line of lines) {
    const alert = line.delivery_state ? CARRIER_ALERT[line.delivery_state] : undefined;
    if (alert && !carrier.has(alert.key)) {
      carrier.add(alert.key);
      alerts.push(alert);
    }
  }
  if (lines.some((line) => line.tracking_confidence === 'seller_reported')) {
    alerts.push({ key: 'seller-reported', tone: 'warning', label: 'Tracking is seller-reported, not carrier-confirmed' });
  }
  if (lines.some((line) => line.delivery_state === 'DELIVERED_UNOPENED' && line.delivered_age_band === 'gt_48h')) {
    alerts.push({ key: 'delivered-unscanned', tone: 'warning', label: 'Delivered over 48 hours ago — not door-scanned' });
  }
  if (lines.some((line) => line.removed_written_off)) alerts.push({ key: 'written-off', tone: 'danger', label: 'Written off' });
  else if (lines.some((line) => line.removed_aged_out)) alerts.push({ key: 'aged-out', tone: 'warning', label: 'Aged out of the inbound queue' });
  const tickets = [...new Set(lines.map((line) => text(line.zendesk_ticket)).filter(Boolean))];
  if (tickets.length > 0) alerts.push({ key: 'claim', tone: 'warning', label: `Claim ticket ${tickets.join(', ')}` });
  const claimBy = firstText(lines.map((line) => line.claim_by_date));
  if (claimBy) alerts.push({ key: 'claim-by', tone: 'warning', label: `File an item-not-received claim by ${claimBy}` });
  return alerts;
}
