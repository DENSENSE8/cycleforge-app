/**
 * Visual scan-feedback bus — scan-band locus flash + matched-line pulse.
 *
 * Paired with {@link playScanTone} / {@link useScanFeedback}: audio/haptic stay
 * gated by settings; these CustomEvents always fire so the flat data floor still
 * gets instant outcome chrome after card borders are gone.
 *
 * Listeners:
 *   - {@link ScanBandGlowHost} → emerald / rose locus flash (~800ms)
 *   - {@link PoLineRow} → one-shot inset ring pulse on the matched line
 */

export type ScanVisualKind = 'success' | 'reject';

export const SCAN_BAND_FLASH_EVENT = 'cf:scan-band-flash';
export const SCAN_LINE_PULSE_EVENT = 'cf:scan-line-pulse';

export type ScanBandFlashDetail = { kind: ScanVisualKind };
export type ScanLinePulseDetail = { lineId: number };

/** Flash the station scan band (success = emerald, reject = rose). */
export function flashScanBand(kind: ScanVisualKind): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ScanBandFlashDetail>(SCAN_BAND_FLASH_EVENT, {
      detail: { kind },
    }),
  );
}

/** One-shot acknowledgement pulse on the flat PO line that matched the scan. */
export function pulseScanLine(lineId: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(lineId) || lineId <= 0) return;
  window.dispatchEvent(
    new CustomEvent<ScanLinePulseDetail>(SCAN_LINE_PULSE_EVENT, {
      detail: { lineId },
    }),
  );
}
