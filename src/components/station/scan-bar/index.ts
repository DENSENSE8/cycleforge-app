/**
 * Station scan bar — master module.
 *
 * Layers (outer → inner):
 *   1. `ScanBandShell` (`@/components/sidebar/receiving/ReceivingScanBands`) —
 *      flush 40px sidebar band + {@link ScanBandGlowHost} (Framer glow).
 *   2. {@link ThemedStationScanBar} — staff theme border + focus ring + right inset
 *   3. {@link StationScanBar} — input, icon slot, hotkey gear, sweep
 *   4. {@link StationScanModeRail} — full-height flush mode segments (armed =
 *      solid surface-card, same plane as the work canvas)
 *   5. {@link ./tokens.ts} — padding, height, icon geometry (single knob)
 *
 * Domain wrappers (TestingScanBar, ReceivingUnboxScanBar, ShippingScanBar) supply
 * mode lists + submit logic; they should not re-declare chrome classes.
 */

export { StationScanBar, type StationScanBarProps } from './StationScanBar';
export { ThemedStationScanBar, type ThemedStationScanBarProps } from './ThemedStationScanBar';
export { StationScanLeadingIcon } from './StationScanLeadingIcon';
export { StationScanModeRail, type StationScanModeDefinition } from './StationScanModeRail';
// ScanBandGlowHost: import from `./ScanBandGlowHost` (not this barrel) — keeps
// the glow host out of the light scan-bar re-export graph.
export * from './tokens';
