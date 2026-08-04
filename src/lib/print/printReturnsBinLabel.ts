/**
 * Returns testing bin — 2×1" thermal label.
 *
 * Thin re-export over {@link ./printSpecialBinLabel} so existing Unbox /
 * staging callers keep their import path.
 */

export {
  returnsBinPayloadToFace,
  printReturnsBinLabel,
} from '@/lib/print/printSpecialBinLabel';
