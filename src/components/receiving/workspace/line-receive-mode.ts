/** SoT for multi-qty Unbox line display modes. */

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

/** Which body an Unbox PO line's under-row capture entry mounts. */
type CaptureEntryMode =
  | 'capture-unit'
  | 'capture-rollup'
  | 'capture-stub'
  | 'unit-rows'
  | 'single';

interface CaptureEntryInput {
  /** Unbox centre: the bottom dock owns the wedge; this row is mouse go-back. */
  dockOwnsCapture: boolean;
  /**
   * @deprecated Kept for call-site autofocus facts only — no longer gates
   * whether the capture face mounts. Every editable Unbox line captures.
   */
  isActiveLine?: boolean;
  /** Units Displays flush chrome — never the capture row. */
  flush?: boolean;
  /** Units Displays explosion — one editable row per serial. */
  forceUnitRows?: boolean;
  receivingId: number | null;
  /** `null` = no line yet (empty unfound carton) → {@link CaptureEntryMode} stub. */
  lineId: number | null;
  quantityExpected: number;
  serialCount: number;
  forceUnitMode?: boolean;
}

/** THE gate for the Unbox capture row — call sites pass facts, never a derived `progressive` boolean. */
export function resolveCaptureEntry(input: CaptureEntryInput): CaptureEntryMode {
  const captures =
    input.dockOwnsCapture &&
    !input.flush &&
    input.receivingId != null &&
    input.receivingId > 0;

  if (captures) {
    if (input.lineId == null) return 'capture-stub';
    if (input.lineId > 0) {
      return resolveLineReceiveMode({
        quantityExpected: input.quantityExpected,
        serialCount: input.serialCount,
        forceUnitMode: input.forceUnitMode,
      }) === 'qtyRollup'
        ? 'capture-rollup'
        : 'capture-unit';
    }
  }

  if (input.forceUnitRows || input.quantityExpected > 1) return 'unit-rows';
  return 'single';
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
