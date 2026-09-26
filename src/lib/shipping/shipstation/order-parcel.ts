/** Order parcel resolution — how the parcel stored on `orders` (`parcel_weight_oz` / `parcel_length_in` / `parcel_width_in` /… */

import { z } from 'zod';
import type { Parcel } from './types';

/** Same shape as `ParcelSchema.dimensions` — do not invent a second one. */
export const OrderRateDimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['inch', 'centimeter']),
});
type OrderRateDimensions = z.infer<typeof OrderRateDimensionsSchema>;

/** The parcel columns as they come off an `orders` row (numeric → number). */
interface StoredOrderParcel {
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
