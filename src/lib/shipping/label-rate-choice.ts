/**
 * The chat's label vocabulary, parsed server-side so the model never does unit
 * math or types a price: "2 lb" / "32 oz" / "1.2 kg" → ounces, "12x10x4 in" →
 * dimensions, and "the cheapest" / "fastest" / "USPS Priority" → exactly one
 * rate of a fresh server quote (or a refusal naming the choices).
 */

import type { Parcel, ShippingRateOption } from '@/lib/shipping/shipstation/types';

const OZ_PER: Record<string, number> = {
  oz: 1, ounce: 1, ounces: 1,
  lb: 16, lbs: 16, pound: 16, pounds: 16,
  g: 0.035274, gram: 0.035274, grams: 0.035274,
  kg: 35.274, kgs: 35.274, kilo: 35.274, kilos: 35.274, kilogram: 35.274, kilograms: 35.274,
};

/**
 * "2 lb", "2lb 4oz", "32 oz", "1.2 kg" → ounces (2 decimals). A number without
 * a unit is refused (null) — "2" could be pounds or ounces, so we ask.
 */
export function parseParcelWeightOz(text: string): number | null {
  const parts = [...text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kilos?|kgs?)\b/g)];
  if (parts.length === 0) return null;
  let oz = 0;
  for (const m of parts) oz += Number(m[1]) * OZ_PER[m[2]];
  return oz > 0 && oz <= 150 * 16 ? Math.round(oz * 100) / 100 : null;
}

/** "12x10x4", "12 x 10 x 4 in", "30×20×10 cm" → dimensions (inches unless cm is said). */
export function parseParcelDimensions(text: string): NonNullable<Parcel['dimensions']> | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(cm|centimet(?:er|re)s?|in|inch(?:es)?|")?/i.exec(text);
  if (!m) return null;
  const [length, width, height] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!(length > 0 && width > 0 && height > 0)) return null;
  return { length, width, height, unit: m[4] && /^c/i.test(m[4]) ? 'centimeter' : 'inch' };
}

/** The price a rate actually charges: shipping plus the surcharges reported beside it. */
export function rateTotal(rate: Pick<ShippingRateOption, 'amount' | 'otherAmount'>): number {
  return Math.round((rate.amount + (rate.otherAmount ?? 0)) * 100) / 100;
}

/** Cheapest by total; fastest by delivery days (ties → cheaper), null when no rate reports days. */
export function markRates(rates: readonly ShippingRateOption[]): { cheapest: string | null; fastest: string | null } {
  let cheapest: ShippingRateOption | null = null;
  let fastest: ShippingRateOption | null = null;
  for (const r of rates) {
    if (!cheapest || rateTotal(r) < rateTotal(cheapest)) cheapest = r;
    if (r.deliveryDays != null) {
      const fd = fastest?.deliveryDays;
      if (fd == null || r.deliveryDays < fd || (r.deliveryDays === fd && rateTotal(r) < rateTotal(fastest!))) fastest = r;
    }
  }
  return { cheapest: cheapest?.rateId ?? null, fastest: fastest?.rateId ?? null };
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type RateChoice =
  | { ok: true; rate: ShippingRateOption }
  | { ok: false; reason: 'no_rates' | 'no_match' | 'ambiguous'; candidates: ShippingRateOption[] };

/**
 * One rate of the quote for what the operator said: "cheapest", "fastest", a
 * service code, or words of the carrier + service ("usps priority"). Words must
 * all appear; several matches → the cheapest only when every match is the same
 * service, else ambiguous.
 */
export function chooseRate(rates: readonly ShippingRateOption[], choice: string): RateChoice {
  if (rates.length === 0) return { ok: false, reason: 'no_rates', candidates: [] };
  const said = fold(choice);
  const marks = markRates(rates);
  const byId = (id: string | null) => rates.find((r) => r.rateId === id);
  if (/\b(cheapest|lowest|least expensive)\b/.test(said) && byId(marks.cheapest)) return { ok: true, rate: byId(marks.cheapest)! };
  if (/\b(fastest|quickest|soonest)\b/.test(said) && byId(marks.fastest)) return { ok: true, rate: byId(marks.fastest)! };
  const exact = rates.filter((r) => fold(r.serviceCode) === said || fold(r.serviceName) === said || fold(`${r.carrierName} ${r.serviceName}`) === said);
  const words = said.split(' ').filter((w) => w.length > 0 && !['the', 'a', 'label', 'rate', 'one', 'buy', 'with', 'via'].includes(w));
  const matches = exact.length > 0
    ? exact
    : words.length === 0
      ? []
      : rates.filter((r) => {
          const hay = fold(`${r.carrierName} ${r.carrierCode} ${r.serviceName} ${r.serviceCode}`).split(' ');
          return words.every((w) => hay.some((h) => h === w || h.startsWith(w)));
        });
  if (matches.length === 0) return { ok: false, reason: 'no_match', candidates: [...rates] };
  const services = new Set(matches.map((r) => `${r.carrierId}|${r.serviceCode}`));
  if (matches.length > 1 && services.size > 1) return { ok: false, reason: 'ambiguous', candidates: matches };
  return { ok: true, rate: [...matches].sort((a, b) => rateTotal(a) - rateTotal(b))[0] };
}

export function formatMoney(amount: number, currency: string): string {
  return currency.toUpperCase() === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}
