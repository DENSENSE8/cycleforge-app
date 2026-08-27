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
// The stance has exactly TWO writers, and neither commits anything:
//   1. the bar's own `ScanHotkeyControl` — the operator picking their mode;
//   2. leaving a preview (`ReceivingSidebarPanel`) — done looking, back to work.
// What stays banned is a writer that flips the stance AND submits, which is how
// a preview would become an unbox behind the operator (see the deleted
// `promoteToScan` / `receiving-preview-commit`).
export { isScanPreview, setScanStance, useScanStance } from './scan-stance';
export { useScanModeRelease } from './useScanModeRelease';
// ScanBandGlowHost: import from `./ScanBandGlowHost` (not this barrel) — keeps
// the glow host out of the light scan-bar re-export graph.
export * from './tokens';
