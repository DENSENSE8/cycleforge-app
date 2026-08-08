/**
 * Returns testing bin — 2×1" thermal label face.
 *
 * Thin re-export over {@link ./printSpecialBinLabel}. Print from Inventory ›
 * Locations (special-bin 2×1 / Bins reprint); Unbox chrome no longer one-clicks
 * this face (Check unreceived orders owns that Band 1 slot).
 */

export { returnsBinPayloadToFace } from '@/lib/print/printSpecialBinLabel';
