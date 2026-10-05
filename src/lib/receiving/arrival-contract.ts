/**
 * Arrival pairing contract — tracking number → package → urgency → location,
 * then the unbox queue. The ONE wire shape for the phone web (`/m/*`), which
 * the iOS shell (CycleForgeShell) runs as-is. Client-safe: Zod schemas and
 * types only.
 *
 * Operator rulings 2026-10-04:
 * - The scan flow shows two states, Urgent / Not urgent. The four stored tiers
 *   stay underneath: Urgent writes tier 0, Not urgent writes tier 2, and a
 *   package reads as urgent when its tier is 0 or 1.
 * - A package pairs to ANY active location with a barcode (rack shelf, bin,
 *   floor spot). Urgency lives on the package, never on the shelf; a shelf's
 *   own arrival tier is only a suggestion, never a refusal.
 *
 * Urgency precedence (first answer wins):
 *   1. operator — `receiving_carton.priority_tier` set by hand;
 *   2. inbound_order — the most urgent tier of the orders on the package;
 *   3. derived — `resolveArrivalTier` facts (stock-out demand, return/claim,
 *      platform default);
 *   4. default — Not urgent.
 *
 * Routes:
 *   GET   /api/receiving/[id]/arrival          → ArrivalPackageResponse
 *   POST  /api/receiving/[id]/arrival          ArrivalActionBody → ArrivalPackageResponse
 *   GET   /api/receiving/unbox-next            → UnboxQueueResponse
 * Door intake stays `POST /api/receiving/lookup-po` (preview → intake in
 * `useArrivalStation`). Every failure is `{ success: false, error: string }`
 * with a 4xx/5xx status.
 */

import { z } from 'zod';

/** Stored tier an operator's "Urgent" writes. */
export const URGENT_TIER = 0;
/** Stored tier an operator's "Not urgent" writes, and the default. */
export const NOT_URGENT_TIER = 2;

/** Two-state reading of a stored 0..3 tier. */
export function tierIsUrgent(tier: number): boolean {
  return tier <= 1;
}

export const ArrivalUrgencySource = z.enum(['operator', 'inbound_order', 'derived', 'default']);
export type ArrivalUrgencySource = z.infer<typeof ArrivalUrgencySource>;

export const ArrivalUrgency = z.object({
  urgent: z.boolean(),
  /** The stored/derived 0..3 tier underneath. */
  tier: z.number().int().min(0).max(3),
  source: ArrivalUrgencySource,
  /** Operator words: "Marked urgent by hand", "Order PO-12 is High", "A waiting order needs an item in it". */
  reason: z.string(),
});
export type ArrivalUrgency = z.infer<typeof ArrivalUrgency>;

export const ArrivalLocationRef = z.object({
  id: z.number().int().positive(),
  /** The barcode printed on the label (`RK1-2`, `A-01-02-1-03`). */
  code: z.string(),
  /** Display name (`Rack 1 Shelf 2`). */
  name: z.string(),
});
export type ArrivalLocationRef = z.infer<typeof ArrivalLocationRef>;

export const ArrivalPackageItem = z.object({
  lineId: z.number().int().positive(),
  title: z.string(),
  sku: z.string().nullable(),
  quantity: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
});
export type ArrivalPackageItem = z.infer<typeof ArrivalPackageItem>;

export const ArrivalPackage = z.object({
  receivingId: z.number().int().positive(),
  tracking: z.string().nullable(),
  carrier: z.string().nullable(),
  /** Matched to a purchase (has lines or a linked order). False = "unfound". */
  found: z.boolean(),
  /** Platform token (`ebay`, `goodwill`, …) and its display label. */
  platform: z.string().nullable(),
  platformLabel: z.string().nullable(),
  orderNumber: z.string().nullable(),
  vendor: z.string().nullable(),
  /** ISO time the package came through the door. */
  doorReceivedAt: z.string().nullable(),
  items: z.array(ArrivalPackageItem),
  urgency: ArrivalUrgency,
  /** Where it sits now (the pairing), null while unpaired. */
  location: ArrivalLocationRef.nullable(),
});
export type ArrivalPackage = z.infer<typeof ArrivalPackage>;

export const ArrivalPackageResponse = z.object({ success: z.literal(true), package: ArrivalPackage });
export type ArrivalPackageResponse = z.infer<typeof ArrivalPackageResponse>;

// ─── Package actions ─────────────────────────────────────────────────────────

export const ArrivalActionBody = z.discriminatedUnion('action', [
  /** true = Urgent (tier 0), false = Not urgent (tier 2), null = clear the hand-set tier. */
  z
    .object({
      action: z.literal('urgency'),
      urgent: z.boolean().nullable(),
      clientEventId: z.string().trim().min(8).max(128),
    })
    .strict(),
  /** Pair to a scanned location label (any active location with that barcode). */
  z
    .object({
      action: z.literal('place'),
      scanned: z.string().trim().min(1).max(200),
      clientEventId: z.string().trim().min(8).max(128),
      /** Where the scan happened (`/m/r/12/place`) — ops-event provenance. */
      surface: z.string().trim().max(120).optional(),
    })
    .strict(),
]);
export type ArrivalActionBody = z.infer<typeof ArrivalActionBody>;

// ─── Unbox queue ─────────────────────────────────────────────────────────────

export const UnboxQueueItem = z.object({
  receivingId: z.number().int().positive(),
  urgency: ArrivalUrgency,
  location: ArrivalLocationRef.nullable(),
  tracking: z.string().nullable(),
  found: z.boolean(),
  platform: z.string().nullable(),
  platformLabel: z.string().nullable(),
  orderNumber: z.string().nullable(),
  vendor: z.string().nullable(),
  /** First item's title, for the row. */
  title: z.string().nullable(),
  lineCount: z.number().int().min(0),
  doorReceivedAt: z.string().nullable(),
});
export type UnboxQueueItem = z.infer<typeof UnboxQueueItem>;

/** Sorted: urgent first, then oldest door time first. */
export const UnboxQueueResponse = z.object({ success: z.literal(true), items: z.array(UnboxQueueItem) });
export type UnboxQueueResponse = z.infer<typeof UnboxQueueResponse>;
