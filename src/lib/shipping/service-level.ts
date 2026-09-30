/**
 * Which shipping speed an order carries, from the two strings ShipStation
 * gives us: the marketplace's `requestedShippingService` (what the buyer paid
 * for — Amazon `NextDay` / `SecondDay` / `Expedited`, eBay `USPSPriority`, free
 * text elsewhere) and the carrier `serviceCode` (`ups_next_day_air`,
 * `fedex_2day_one_rate`). The faster of the two wins. The words, colours and
 * the urgent rule live in the `SERVICE_LEVEL` token registry.
 */
import { SERVICE_LEVEL, type ServiceLevel } from '@cycleforge/design-tokens';

/** The levels the import marks urgent — straight from the registry. */
export const URGENT_SERVICE_LEVELS: readonly ServiceLevel[] = (Object.keys(SERVICE_LEVEL) as ServiceLevel[]).filter(
  (level) => SERVICE_LEVEL[level].urgent,
);

/** Lower-case letters and digits only: `USPS Priority Mail®` → `uspsprioritymail`. */
function compact(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** One service string → its level, or null when blank. Order matters: faster first. */
function classifyOne(raw: string | null | undefined): ServiceLevel | null {
  const s = compact(raw ?? '');
  if (!s) return null;
  if (/pickup/.test(s)) return 'pickup';
  // `usps_priority_mail_express` is the overnight tier; plain Priority Mail is not.
  if (/nextday|overnight|oneday|1day|mailexpress|expressmail/.test(s)) return 'nextDay';
  if (/secondday|2ndday|2day|twoday/.test(s)) return 'secondDay';
  if (/expedited/.test(s)) return 'expedited';
  if (/economy|free|value|mediamail/.test(s)) return 'economy';
  return 'standard';
}

/** The order's level: the fastest of what the buyer requested and the carrier service set on it. */
export function serviceLevelOf(input: {
  requested?: string | null;
  serviceCode?: string | null;
}): ServiceLevel | null {
  return fastestServiceLevel([classifyOne(input.requested), classifyOne(input.serviceCode)]);
}

/** The fastest level of several (a split order's ShipStation orders); null when none. */
export function fastestServiceLevel(levels: ReadonlyArray<ServiceLevel | null | undefined>): ServiceLevel | null {
  let best: ServiceLevel | null = null;
  for (const level of levels) {
    if (level && (best == null || SERVICE_LEVEL[level].rank > SERVICE_LEVEL[best].rank)) best = level;
  }
  return best;
}

/** Narrow a stored `orders.service_level` value (unknown text reads as none). */
export function asServiceLevel(raw: string | null | undefined): ServiceLevel | null {
  return raw != null && Object.hasOwn(SERVICE_LEVEL, raw) ? (raw as ServiceLevel) : null;
}

/** Ground-tier carrier services — never an honest answer to a paid-for fast level. */
const GROUND_SERVICE = /ground|firstclass|mediamail|parcelselect|homedelivery|smartpost|economy/;

/**
 * The label bought is slower than the service the buyer paid for: an urgent
 * level shipped on a ground-tier service (a SecondDay order labelled
 * `usps_ground_advantage`). Returns the operator words, or null when the label
 * honours the level (or there is no label yet).
 */
export function serviceDowngrade(
  level: ServiceLevel | null,
  labelServiceCode: string | null | undefined,
): { label: string } | null {
  if (!level || !SERVICE_LEVEL[level].urgent) return null;
  const code = compact(labelServiceCode ?? '');
  if (!code || !GROUND_SERVICE.test(code)) return null;
  return { label: `${SERVICE_LEVEL[level].label} → Ground` };
}
