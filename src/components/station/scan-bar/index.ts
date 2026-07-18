/**
 * Station scan bar — master module.
 *
 * Layers (outer → inner):
 *   1. `ScanBandShell` (`@/components/sidebar/receiving/ReceivingScanBands`) —
 *      flush 40px sidebar band (Unbox / Shipping / Testing / Packing / …). Do
 *      not wrap this bar in vertical padding at call sites.
 *   2. {@link ThemedStationScanBar} — staff theme border + focus ring + right inset
 *   3. {@link StationScanBar} — input, icon slot, hotkey gear, sweep
 *   4. {@link ./tokens.ts} — padding, height, icon geometry (single knob)
 *
 * Domain wrappers (TestingScanBar, ReceivingUnboxScanBar, ShippingScanBar) supply
 * mode lists + submit logic; they should not re-declare chrome classes.
 */

export { StationScanBar, type StationScanBarProps } from './StationScanBar';
export { ThemedStationScanBar, type ThemedStationScanBarProps } from './ThemedStationScanBar';
export { StationScanLeadingIcon } from './StationScanLeadingIcon';
export { StationScanModeRail, type StationScanModeDefinition } from './StationScanModeRail';
export * from './tokens';
