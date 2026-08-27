/**
 * Monitor / analytics SVG chart primitives — hand-built (no chart npm).
 * Compose these from Unbox Band 2 + Operations Analytics; do not fork local twins.
 */

export { GaugeDonut, type GaugeSegment } from './GaugeDonut';
export { MultiSeriesLineChart, type LineSeries } from './MultiSeriesLineChart';
export { KpiBarSpark } from './KpiBarSpark';
export { useMeasuredWidth } from './use-measured-width';
/** Theme tokens — prefer `@/design-system/components/monitor/charts/chart-theme`. */
export { DEFAULT_SERIES_TONE, paletteTone } from './chart-theme';
