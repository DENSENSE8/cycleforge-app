/** Station scan bar — master module. */

export { ScanBandShell } from './ScanBandShell';
export { StationScanBar, type StationScanBarProps } from './StationScanBar';
export { ThemedStationScanBar, type ThemedStationScanBarProps } from './ThemedStationScanBar';
export { StationScanModeRail, type StationScanModeDefinition } from './StationScanModeRail';
// The stance has exactly TWO writers, and neither commits anything:
export { isScanPreview, setScanStance, useScanStance } from './scan-stance';
export { useScanModeRelease } from './useScanModeRelease';
// ScanBandGlowHost: import from `./ScanBandGlowHost` (not this barrel) — keeps
// the glow host out of the light scan-bar re-export graph.
export * from './tokens';
