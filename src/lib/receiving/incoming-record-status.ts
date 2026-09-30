/** The incoming delivery record's alerts — what needs a person on an inbound purchase (unpaired, carrier trouble, claims…). */

import type { ReceivingLineRow } from './receiving-line-row';
import type { ReceivingStatusAlert } from './receiving-status-strip';

const text = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

function firstText(values: ReadonlyArray<string | null | undefined>): string | null {
  for (const value of values) {
    const face = text(value);
    if (face) return face;
  }
  return null;
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
