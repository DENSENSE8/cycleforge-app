/** Payload validation per line type. */

import { z } from 'zod';
import type { KioskLinePayload, KioskLineType } from '@/lib/kiosk/cart-line';
import { SERIAL_LIST_MAX_CHARS } from '@/lib/kiosk/serial-list';

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
  // One unit may carry several serials, joined (`serial-list.ts`).
  serialNumber: z.string().trim().max(SERIAL_LIST_MAX_CHARS),
  passcode: z.string().max(64).nullish(),
  imei: z.string().max(64).nullish(),
  notes: z.string().max(2_000).nullish(),
  price: z.string().max(32),
  signatureDataUrl: z.string().max(2_000_000).nullish(),
  signatureStrokes: z.unknown().optional(),
  // An existing ticket brought into the visit. Kept, not stripped: without it a
  // mirrored linked line reads as a NEW unsigned drop-off and every signature
  // gate blocks a repair that was signed for when its ticket was written.
  linkedRepairId: z.number().int().positive().nullish(),
  linkedTicketNumber: z.string().trim().max(40).nullish(),
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
