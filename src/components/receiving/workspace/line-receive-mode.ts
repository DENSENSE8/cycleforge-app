/**
 * SoT for multi-qty Unbox line display modes.
 *
 * Industry WMS split: quantity roll-up for identical non-serialized commodities
 * vs unit-track when each physical unit needs identity (serial / per-unit grade).
 * Caps are UI-only — `ensureLineUnits` still materialises one DB row per expected unit.
 */

/** Hard cap on unit DOM rows rendered in the accordion (unit-track mode). */
export const UNIT_ROW_DISPLAY_CAP = 12;

type LineReceiveMode = 'qtyRollup' | 'unitTrack';

interface LineReceiveModeInput {
  quantityExpected: number;
  /** Scanned serials on the line — any serial forces unit-track. */
  serialCount: number;
  /** Operator explicitly chose "Track each unit" (session-local). */
  forceUnitMode?: boolean;
}

/**
 * Resolve the adaptive receive surface for a multi-qty PO line.
 *
 * Qty roll-up when expected qty exceeds the display cap, no serials yet, and
 * the operator has not forced unit mode. Otherwise unit-track (capped list).
 */
export function resolveLineReceiveMode(input: LineReceiveModeInput): LineReceiveMode {
  const qty = Math.max(0, Math.floor(input.quantityExpected) || 0);
  if (input.forceUnitMode) return 'unitTrack';
  if (input.serialCount > 0) return 'unitTrack';
  if (qty > UNIT_ROW_DISPLAY_CAP) return 'qtyRollup';
  return 'unitTrack';
}

/**
 * Sliding window of unit indices that stays within `cap` and keeps `selected`
 * visible. Scan-down workflows bias toward the start when selected is near 0.
 */
export function unitRowVisibleWindow(
  total: number,
  selectedIndex: number,
  cap: number = UNIT_ROW_DISPLAY_CAP,
): { start: number; end: number } {
  const n = Math.max(0, total);
  const c = Math.max(1, cap);
  if (n <= c) return { start: 0, end: n };
  const selected = Math.max(0, Math.min(selectedIndex, n - 1));
  const start = Math.max(0, Math.min(selected, n - c));
  return { start, end: start + c };
}
