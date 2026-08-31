/**
 * Order parcel resolution — how the parcel stored on `orders`
 * (`parcel_weight_oz` / `parcel_length_in` / `parcel_width_in` /
 * `parcel_height_in`) and a rate request's explicit body values combine into
 * the ONE `Parcel` the ShipStation engine quotes.
 *
 * Pure on purpose (no DB, no fetch), mirroring `rate-request.ts`: the
 * precedence rule is unit-testable and identical wherever it is applied.
 *
 * Precedence, most explicit first:
 *   weight  — body `weightOz` → stored `parcel_weight_oz` → engine fallback
 *             (the ShipStation-stored order weight, when the order is
 *             ShipStation-sourced)
 *   dims    — body `dimensions` → the stored trio (only when all three are
 *             present — two sides of a box rate worse than no box) → none
 *
 * No weight from any source → `null`: a 0 oz parcel is not a smaller quote,
 * it is a carrier error, so the caller refuses to rate instead.
 */

import { z } from 'zod';
import type { Parcel } from './types';

/** Same shape as `ParcelSchema.dimensions` — do not invent a second one. */
export const OrderRateDimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['inch', 'centimeter']),
});
export type OrderRateDimensions = z.infer<typeof OrderRateDimensionsSchema>;

/** The parcel columns as they come off an `orders` row (numeric → number). */
export interface StoredOrderParcel {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export function resolveOrderRateParcel(input: {
  stored: StoredOrderParcel;
  bodyWeightOz?: number | null;
  bodyDimensions?: OrderRateDimensions | null;
  /** Engine-side weight (ShipStation v1 order weight) when nothing local. */
  fallbackWeight?: Parcel['weight'] | null;
}): Parcel | null {
  const { stored, bodyWeightOz, bodyDimensions, fallbackWeight } = input;

  const weight: Parcel['weight'] | null =
    bodyWeightOz != null && bodyWeightOz > 0
      ? { value: bodyWeightOz, unit: 'ounce' }
      : stored.weightOz != null && stored.weightOz > 0
        ? { value: stored.weightOz, unit: 'ounce' }
        : fallbackWeight ?? null;

  if (!weight || !(weight.value > 0)) return null;

  const storedDims: Parcel['dimensions'] =
    stored.lengthIn != null && stored.lengthIn > 0
    && stored.widthIn != null && stored.widthIn > 0
    && stored.heightIn != null && stored.heightIn > 0
      ? {
          length: stored.lengthIn,
          width: stored.widthIn,
          height: stored.heightIn,
          unit: 'inch',
        }
      : null;

  const dimensions: Parcel['dimensions'] = bodyDimensions
    ? {
        length: bodyDimensions.length,
        width: bodyDimensions.width,
        height: bodyDimensions.height,
        unit: bodyDimensions.unit,
      }
    : storedDims;

  return dimensions ? { weight, dimensions } : { weight };
}
