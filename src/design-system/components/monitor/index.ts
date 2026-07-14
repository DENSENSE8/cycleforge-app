/**
 * Monitor rollup block registry — compose these; do not invent local card shells.
 * Rules: `.claude/rules/display/monitor-rollup-blocks.md`
 */

export {
  MONITOR_SECTION_CARD_CLASS,
  MONITOR_SECTION_CARD_SCROLL_CLASS,
  MONITOR_SECTION_CARD_PADDED,
  MONITOR_KPI_TILE_CLASS,
} from './shell';
export { SectionCard, type MonitorSectionCardProps } from './SectionCard';
export { KpiTile, type KpiTileProps } from './KpiTile';
export { KpiStrip, type KpiStripProps } from './KpiStrip';
export { MetricTile, metricIntentTextClass, type MetricTileProps, type MetricIntent } from './MetricTile';
export { MetricRing } from './MetricRing';
export { DeltaChip, type DeltaChipProps } from './DeltaChip';
export { MonitorListBlock, MonitorListRow, type MonitorListBlockProps, type MonitorListRowProps } from './MonitorListBlock';
export { MonitorPageShell, type MonitorPageShellProps } from './MonitorPageShell';
export { FilterBand, type FilterBandProps } from './FilterBand';
