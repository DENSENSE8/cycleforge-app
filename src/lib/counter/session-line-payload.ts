/**
 * Payload validation per line type.
 *
 * The line routes used to cast `Record<string, unknown>` straight to
 * `KioskLinePayload`, which type-checks only because a cast is a promise rather
 * than a check — and the promise was false: a REPAIR line posted with no
 * `productModel` / `serialNumber` / `price` would have been stored, and the
 * failure would have surfaced at submit, in front of a customer, as a repair
 * intake that cannot be created.
 *
 * Each shape mirrors its interface in `cart-line.ts`. Unknown keys are
 * STRIPPED rather than passed through: this payload is echoed to a
 * customer-facing display, so an unrecognised field is one nobody has decided
 * is safe to show.
 */

import { z } from 'zod';
import type { KioskLinePayload, KioskLineType } from '@/lib/kiosk/cart-line';

const RetailPayloadSchema = z.object({
  variationId: z.string().max(120).nullable().default(null),
  sku: z.string().trim().max(120).default(''),
});

const RepairPayloadSchema = z.object({
  productType: z.string().max(120).nullish(),
  productModel: z.string().trim().min(1).max(200),
  sourceSku: z.string().max(120).nullish(),
  repairReasons: z.array(z.string().max(120)).max(20).optional(),
  repairNotes: z.string().max(2_000).nullish(),
  serialNumber: z.string().trim().max(120),
  passcode: z.string().max(64).nullish(),
  imei: z.string().max(64).nullish(),
  notes: z.string().max(2_000).nullish(),
  price: z.string().max(32),
  signatureDataUrl: z.string().max(2_000_000).nullish(),
  signatureStrokes: z.unknown().optional(),
});

const BuybackPayloadSchema = z.object({
  imei: z.string().trim().max(64),
  grade: z.string().max(32).nullish(),
  notes: z.string().max(2_000).nullish(),
});

/**
 * Validate an inbound payload against its line type.
 *
 * Returns `null` on a mismatch so the caller answers 400 — never a partial
 * payload, and never a cast.
 */
export function parseLinePayload(
  type: KioskLineType,
  raw: unknown,
): KioskLinePayload | null {
  const schema =
    type === 'REPAIR'
      ? RepairPayloadSchema
      : type === 'BUYBACK'
        ? BuybackPayloadSchema
        : RetailPayloadSchema;

  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as KioskLinePayload) : null;
}
