/** Carrier shipment status vocabulary + the stalled-shipment rule. */

export type ShipmentStatusCategory =
  | 'LABEL_CREATED'
  | 'ACCEPTED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'RETURNED'
  | 'UNKNOWN';

export type CarrierCode = 'UPS' | 'USPS' | 'FEDEX';

const KNOWN_CATEGORIES: readonly ShipmentStatusCategory[] = [
  'LABEL_CREATED',
  'ACCEPTED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'RETURNED',
  'UNKNOWN',
];

function normalizeShipmentStatusCategory(
  value: string | null | undefined,
): ShipmentStatusCategory {
  const upper = String(value ?? '').toUpperCase();
  return (KNOWN_CATEGORIES as readonly string[]).includes(upper)
    ? (upper as ShipmentStatusCategory)
    : 'UNKNOWN';
}

export function isStalled(args: {
  isTerminal?: boolean | null;
  category?: ShipmentStatusCategory | string | null;
  latestEventAt?: string | null;
  stallHours?: number;
  /** Injectable clock — tests pin it; callers omit it. */
  now?: number;
}): boolean {
  if (args.isTerminal) return false;
  const cat = normalizeShipmentStatusCategory(args.category);
  if (cat === 'DELIVERED') return false;
  if (!args.latestEventAt) return false;
  const ms = (args.now ?? Date.now()) - new Date(args.latestEventAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms > (args.stallHours ?? 72) * 3_600_000;
}
