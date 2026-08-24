/**
 * Metric tone intent — the pure vocabulary shared by every KPI/metric surface.
 *
 * Rescued out of `@/design-system/components/monitor` (Warehouse-OS): the
 * metric BUILDERS live in the domain (`outbound-metrics`, `unbox-metrics`,
 * `testing-metrics`, `shipping-metrics`) and only the tile RENDERS.
 */
export type MetricIntent = 'good' | 'warn' | 'bad' | 'neutral';
