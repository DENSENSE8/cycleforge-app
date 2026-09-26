import { z } from 'zod';
import { ParcelSchema, ShipAddressSchema } from '@/lib/shipping/shipstation/rate-request';

/** The intake buys the problem-order labels; outbound belongs to To-ship. */
const IntakePurposeSchema = z.enum(['return', 'replacement']);

/** A typed order number — the reference a label is recorded under. */
export const IntakeRefSchema = z.string().trim().min(2).max(64);

/** POST /api/shipping/label-intake/rates — rate a reference-only label. */
export const LabelIntakeRatesBody = z.object({
  purpose: IntakePurposeSchema,
  shipTo: ShipAddressSchema,
  parcel: ParcelSchema,
});

/** POST /api/shipping/label-intake/purchase — buy a reference-only label. */
export const LabelIntakePurchaseBody = z.object({
  ref: IntakeRefSchema,
  purpose: IntakePurposeSchema,
  rateId: z.string().trim().min(1),
  carrierId: z.string().trim().min(1),
  serviceCode: z.string().trim().min(1),
  /** Idempotency key minted once per intended purchase. */
  clientEventId: z.string().trim().min(8).max(128),
  shipTo: ShipAddressSchema,
  parcel: ParcelSchema,
});

/** POST /api/shipping/label-intake/pair — attach reference labels to the order. */
export const LabelIntakePairBody = z.object({
  ref: IntakeRefSchema,
  orderId: z.number().int().positive(),
});
