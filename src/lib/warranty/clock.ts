/** Warranty clock — the single source of truth for when a warranty starts and expires. */

export const DEFAULT_WARRANTY_DAYS = 30;
/** Days added to the packed/scanned date as an in-transit estimate when no
 *  carrier DELIVERED status is available. */
export const DELIVERY_ESTIMATE_DAYS = 4;

export type WarrantyClockBasis = 'DELIVERED' | 'PACKED_PLUS_ESTIMATE';

export interface WarrantyClockInput {
  /** Carrier DELIVERED timestamp (from shipping_tracking_numbers) — authoritative. */
  deliveredAt?: Date | string | null;
  /** Packed/scanned timestamp — fallback anchor when delivered is unknown. */
  packedScannedAt?: Date | string | null;
  /** Per-org warranty term in days. Defaults to DEFAULT_WARRANTY_DAYS. */
  warrantyDays?: number | null;
  /** Override the in-transit estimate (test seam). Defaults to DELIVERY_ESTIMATE_DAYS. */
  estimateDays?: number | null;
}

export interface WarrantyClockResult {
  /** When the warranty period begins, or null when neither anchor is known. */
  startsAt: Date | null;
  /** When the warranty period ends, or null when undeterminable. */
  expiresAt: Date | null;
  /** Which anchor drove the calculation. null when neither anchor is known. */
  basis: WarrantyClockBasis | null;
  /** The term actually applied (resolved, never null). */
  warrantyDays: number;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolvePositiveInt(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

/**
 * Compute the warranty window. Delivered wins; otherwise packed + estimate;
 * otherwise nothing can be computed (UI flags this as "unknown").
 */
export function computeWarranty(input: WarrantyClockInput): WarrantyClockResult {
  const warrantyDays = resolvePositiveInt(input.warrantyDays, DEFAULT_WARRANTY_DAYS);
  const estimateDays = resolvePositiveInt(input.estimateDays, DELIVERY_ESTIMATE_DAYS);

  const delivered = toDate(input.deliveredAt);
  const packed = toDate(input.packedScannedAt);

  let startsAt: Date | null = null;
  let basis: WarrantyClockBasis | null = null;

  if (delivered) {
    startsAt = delivered;
    basis = 'DELIVERED';
  } else if (packed) {
    startsAt = addDays(packed, estimateDays);
    basis = 'PACKED_PLUS_ESTIMATE';
  }

  const expiresAt = startsAt ? addDays(startsAt, warrantyDays) : null;
  return { startsAt, expiresAt, basis, warrantyDays };
}

/**
 * Whole days remaining until expiry relative to `now` (default: real clock).
 * Negative once expired; null when the window is undeterminable. UI-facing.
 */
export function daysUntilExpiry(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  const exp = toDate(expiresAt);
  if (!exp) return null;
  const ms = exp.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  // Future window:
  return ms >= 0 ? Math.ceil(days) : Math.floor(days);
}

/** True when the window is known and already past. */
export function isExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const exp = toDate(expiresAt);
  return exp ? exp.getTime() <= now.getTime() : false;
}

export interface ClockRecomputeDecision {
  /** Whether the stored clock should be written. */
  changed: boolean;
  /** True when the basis moved from provisional (or unknown) to DELIVERED. */
  flippedToDelivered: boolean;
}

/** Pure decision for the recompute sweep: */
export function decideClockRecompute(
  current: { basis: WarrantyClockBasis | null; expiresAt: Date | string | null },
  next: WarrantyClockResult,
): ClockRecomputeDecision {
  const currentExp = toDate(current.expiresAt);
  const nextExp = next.expiresAt;
  const sameExpiry =
    (currentExp == null && nextExp == null) ||
    (currentExp != null && nextExp != null && currentExp.getTime() === nextExp.getTime());
  const sameBasis = current.basis === next.basis;

  const flippedToDelivered = current.basis !== 'DELIVERED' && next.basis === 'DELIVERED';
  return { changed: !(sameExpiry && sameBasis), flippedToDelivered };
}
