/**
 * The replacement-label form's rate shop, pure: carrier chips, sort, built-in
 * coverage, parcel completeness, arrival dates, and the buyer email the
 * operator copies once the new label is bought.
 */

import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { rateTotal } from '@/lib/shipping/label-rate-choice';
import { addDaysToDateKey, toPSTDateKey } from '@/utils/date';

export { rateTotal };

export type RateSort = 'cheapest' | 'priciest' | 'fastest';
export type CoverageFilter = 'any' | 'includes_coverage' | 'no_coverage';

export const REPLACEMENT_REASONS: readonly { id: 'lost' | 'damaged' | 'wrong_item' | 'other'; label: string }[] = [
  { id: 'lost', label: 'Lost in transit' },
  { id: 'damaged', label: 'Arrived damaged' },
  { id: 'wrong_item', label: 'Wrong item sent' },
  { id: 'other', label: 'Other' },
];
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number]['id'];

/** Normalized carrier key → chip label for the carriers we fold together. */
const CARRIER_LABELS: Record<string, string> = { usps: 'USPS', ups: 'UPS', fedex: 'FedEx', dhl: 'DHL' };

const STORED_TO_KEY: Record<string, string> = {
  USPS: 'usps',
  UPS: 'ups',
  FEDEX: 'fedex',
  DHL_EXPRESS: 'dhl',
  DHL_ECOMMERCE: 'dhl',
};

export function carrierKey(rate: Pick<ShippingRateOption, 'carrierCode' | 'carrierName'>): string {
  const stored = shipStationCarrierToStored(rate.carrierCode);
  const folded = stored ? STORED_TO_KEY[stored] : undefined;
  if (folded) return folded;
  return (rate.carrierCode || rate.carrierName).trim().toLowerCase();
}

/** Carrier facets in first-seen order with counts; key = normalized carrier (stamps_com/usps → 'usps'). */
export function carrierFacets(rates: readonly ShippingRateOption[]): { key: string; label: string; count: number }[] {
  const facets = new Map<string, { key: string; label: string; count: number }>();
  for (const r of rates) {
    const key = carrierKey(r);
    const facet = facets.get(key);
    if (facet) facet.count += 1;
    else facets.set(key, { key, label: CARRIER_LABELS[key] ?? (r.carrierName || r.carrierCode), count: 1 });
  }
  return [...facets.values()];
}

/**
 * Declared-value coverage a service includes at no charge, by normalized carrier + service code.
 * Source: carrier published defaults (USPS DMM, UPS/FedEx tariffs) — verify against the ShipStation account terms.
 */
export const INCLUDED_COVERAGE: readonly { carrier: string; service: RegExp; usd: number }[] = [
  { carrier: 'usps', service: /^usps_priority_mail$/, usd: 100 },
  { carrier: 'usps', service: /^usps_priority_mail_express$/, usd: 100 },
  { carrier: 'usps', service: /^usps_ground_advantage$/, usd: 100 },
  { carrier: 'ups', service: /./, usd: 100 },
  { carrier: 'fedex', service: /./, usd: 100 },
];

/** Carrier-included declared-value coverage in USD for a rate, or null when the service includes none / unknown. */
export function includedCoverageUsd(rate: Pick<ShippingRateOption, 'carrierCode' | 'serviceCode'>): number | null {
  const key = carrierKey({ carrierCode: rate.carrierCode, carrierName: '' });
  const service = rate.serviceCode.trim().toLowerCase();
  const row = INCLUDED_COVERAGE.find((c) => c.carrier === key && c.service.test(service));
  return row ? row.usd : null;
}

function byDaysThenTotal(a: ShippingRateOption, b: ShippingRateOption): number {
  const da = a.deliveryDays;
  const db = b.deliveryDays;
  if (da != null && db != null && da !== db) return da - db;
  if (da == null && db != null) return 1;
  if (da != null && db == null) return -1;
  return rateTotal(a) - rateTotal(b);
}

/** Filter by carrier chips (empty set = all) and coverage, then sort. Never mutates `rates`. */
export function shopRates(
  rates: readonly ShippingRateOption[],
  opts: { carriers: ReadonlySet<string>; sort: RateSort; coverage: CoverageFilter },
): ShippingRateOption[] {
  const kept = rates.filter((r) => {
    if (opts.carriers.size > 0 && !opts.carriers.has(carrierKey(r))) return false;
    if (opts.coverage === 'any') return true;
    const covered = includedCoverageUsd(r) != null;
    return opts.coverage === 'includes_coverage' ? covered : !covered;
  });
  switch (opts.sort) {
    case 'cheapest':
      return kept.sort((a, b) => rateTotal(a) - rateTotal(b) || byDaysThenTotal(a, b));
    case 'priciest':
      return kept.sort((a, b) => rateTotal(b) - rateTotal(a) || byDaysThenTotal(a, b));
    case 'fastest':
      return kept.sort(byDaysThenTotal);
  }
}

const positive = (n: number | null): boolean => n != null && Number.isFinite(n) && n > 0;

/** Weight + all three dims positive finite ⇒ complete. */
export function parcelComplete(p: { weightOz: number | null; length: number | null; width: number | null; height: number | null }): boolean {
  return positive(p.weightOz) && positive(p.length) && positive(p.width) && positive(p.height);
}

/** Ounces as pounds, two decimals with trailing zeros trimmed: 52 → "3.25 lb", 48 → "3 lb". */
export function ozToLbText(oz: number): string {
  if (!Number.isFinite(oz)) return '';
  return `${Math.round((oz / 16) * 100) / 100} lb`;
}

/** Estimated arrival ISO date or null: estimatedDeliveryDate, else today + deliveryDays. `now` injected. */
export function rateArrival(rate: ShippingRateOption, now: Date): string | null {
  const est = /^\d{4}-\d{2}-\d{2}/.exec(rate.estimatedDeliveryDate?.trim() ?? '');
  if (est) return est[0];
  const days = rate.deliveryDays;
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  const today = toPSTDateKey(now);
  return (today && addDaysToDateKey(today, days)) || null;
}

const REASON_OPENERS: Record<ReplacementReason, string> = {
  lost: "Sorry your package went missing — we've shipped a replacement",
  damaged: "Sorry your package arrived damaged — we've shipped a replacement",
  wrong_item: "Sorry we sent you the wrong item — we've shipped the right one",
  other: "We've shipped a replacement",
};

/** Copy-paste buyer email body + subject for a new replacement tracking number. */
export function replacementTrackingEmail(input: {
  buyerName: string | null;
  orderNumber: string;
  carrierName: string;
  trackingNumber: string;
  trackingUrl: string | null;
  reason: ReplacementReason | null;
}): { subject: string; body: string } {
  const firstName = input.buyerName?.trim().split(/\s+/)[0] || 'there';
  const opener = REASON_OPENERS[input.reason ?? 'other'];
  const lines = [
    `Hi ${firstName},`,
    '',
    `${opener} for order ${input.orderNumber}. Here's your new tracking number:`,
    '',
    `Carrier: ${input.carrierName}`,
    `Tracking number: ${input.trackingNumber}`,
  ];
  const url = input.trackingUrl?.trim();
  if (url) lines.push(`Track it here: ${url}`);
  lines.push('', 'Thanks for your patience — let us know if there is anything else we can do.');
  return {
    subject: `Your new tracking number for order ${input.orderNumber}`,
    body: lines.join('\n'),
  };
}

/** Remember-last-carrier key (localStorage), per staff. */
export function lastCarrierStorageKey(staffId: number | null): string {
  return `cf.replacement-label.last-carrier.${staffId ?? 'anon'}`;
}
