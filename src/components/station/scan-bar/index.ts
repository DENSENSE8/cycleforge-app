/**
 * Station scan bar — master module.
 *
 * Layers (outer → inner):
 *   1. {@link ScanBandShell} — flush 40px sidebar band + {@link ScanBandGlowHost}
 *      (Framer glow).
 *   2. {@link ThemedStationScanBar} — staff theme border + focus + submit trace
 *   3. {@link StationScanBar} — full-bleed input + frosted absolute mode rail
 *   4. {@link StationScanModeRail} — full-height flush mode segments (armed =
 *      solid surface-card, same plane as the work canvas)
 *   5. {@link ./tokens.ts} — padding, height, icon geometry (single knob)
 *
 * Domain wrappers (TestingScanBar, ReceivingUnboxScanBar, ShippingScanBar) supply
 * mode lists + submit logic; they should not re-declare chrome classes.
 */

export { ScanBandShell } from './ScanBandShell';
export { StationScanBar, type StationScanBarProps } from './StationScanBar';
export { ThemedStationScanBar, type ThemedStationScanBarProps } from './ThemedStationScanBar';
export { StationScanLeadingIcon } from './StationScanLeadingIcon';
export { StationScanModeRail, type StationScanModeDefinition } from './StationScanModeRail';
export {
  type StationScanStance,
  getScanStance,
  isScanPreview,
  setScanStance,
  toggleScanStance,
  useScanStance,
  useToggleScanStance,
} from './scan-stance';
export { nextArmedMode, shouldHandleScanModeEsc } from './scan-mode';
export { useScanModeRelease } from './useScanModeRelease';
export {
  type StationScanPreviewClassification,
  type PreviewTypeSource,
  classifyPreviewFromArmed,
  formatPreviewLine,
  formatPreviewSource,
} from './preview-classify';
export { StationScanPreviewCard } from './StationScanPreviewCard';
export { getScanEscBlock, setScanEscBlock, consumeScanEscBlock } from './scan-esc-block';
// ScanBandGlowHost: import from `./ScanBandGlowHost` (not this barrel) — keeps
// the glow host out of the light scan-bar re-export graph.
export * from './tokens';
