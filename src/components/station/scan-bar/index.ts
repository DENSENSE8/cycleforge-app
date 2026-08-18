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
 *
 * Only CROSS-MODULE consumers are re-exported here. Siblings inside this folder
 * import each other directly (`./scan-stance`, `./scan-esc-block`, …), so a
 * pass-through nothing outside imports is dead weight and trips the knip gate.
 */

export { ScanBandShell } from './ScanBandShell';
export { StationScanBar, type StationScanBarProps } from './StationScanBar';
export { ThemedStationScanBar, type ThemedStationScanBarProps } from './ThemedStationScanBar';
export { StationScanModeRail, type StationScanModeDefinition } from './StationScanModeRail';
export { isScanPreview, useScanStance } from './scan-stance';
export { useScanModeRelease } from './useScanModeRelease';
export { classifyPreviewFromArmed } from './preview-classify';
export { useScanTypeKeybinds } from './useScanTypeKeybinds';
// ScanBandGlowHost: import from `./ScanBandGlowHost` (not this barrel) — keeps
// the glow host out of the light scan-bar re-export graph.
export * from './tokens';
