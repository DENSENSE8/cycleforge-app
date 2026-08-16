'use client';

import { useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { nestedCornerClass } from '@/design-system/tokens/radius';
import {
  dateKeyFromParts,
  formatDateKeyMedium,
  formatTime12hPST,
  isDateKey,
  toPSTDateKey,
} from '@/utils/date';
import { MONITOR_KPI_TILE_CLASS } from './shell';
import { metricIntentTextClass, type MetricIntent } from './MetricTile';
import {
  GaugeDonut,
  KpiBarSpark,
  MultiSeriesLineChart,
  paletteTone,
  DEFAULT_SERIES_TONE,
  type GaugeSegment,
} from './charts';
import type { UnboxKpiViz } from '@/lib/receiving/unbox-metrics';

type KpiChartCardProps = {
  id: string;
  label: string;
  value: string;
  intent?: MetricIntent;
  tooltip?: string;
  /**
   * Chart body mode. Ignored when `density="compact"` — compact always uses a
   * tiny spark (or none), never gauge / line / tall bars.
   */
  viz?: UnboxKpiViz;
  series: { at: string; value: number }[];
  breakdown: { key: string; label: string; value: number }[];
  active?: boolean;
  filterable?: boolean;
  onOpen?: () => void;
  className?: string;
  /**
   * `default` — Monitor rollup card (hero + optional pie/line/bars).
   * `compact` — Usage-strip cell (micro label · modest value · tiny spark).
   *
   * Compact rest face = **metric label + aggregate value**. On bar hover/focus
   * the top line swaps to the bucket stamp (`Jul 11, 2026 · 10:00 AM`) and the
   * hero to that bar’s value; leave/blur restores the rest face. Spark bars are
   * display-only (card click still toggles the filter).
   */
  density?: 'default' | 'compact';
};

function formatBucketLabel(at: string): string {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return at;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/**
 * Hover header stamp — date + time, e.g. `Jul 11, 2026 · 10:00 AM`.
 * Daily UTC-midnight buckets keep the UTC civil day (+ 12:00 AM); hourly /
 * instant buckets use the warehouse wall clock.
 */
function formatHoverBucketDate(at: string): string {
  if (isDateKey(at)) {
    return formatDateKeyMedium(at, { weekday: 'none', withYear: true });
  }
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return at;

  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  if (isUtcMidnight) {
    const key = dateKeyFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (!key) return at;
    return `${formatDateKeyMedium(key, { weekday: 'none', withYear: true })} · 12:00 AM`;
  }

  const key = toPSTDateKey(d);
  const datePart = key
    ? formatDateKeyMedium(key, { weekday: 'none', withYear: true })
    : '';
  const timePart = formatTime12hPST(d, { withSeconds: false });
  if (!datePart) return timePart || at;
  if (!timePart || timePart === 'N/A' || timePart === '—') return datePart; // ds-allow-na: legacy date sentinel reader
  return `${datePart} · ${timePart}`;
}

/**
 * KPI card: eyebrow + hero + viz body (tiles · bars · pie · line), or compact
 * Usage-strip density for workbench Band 2.
 * Clickable when `onOpen` is set — Monitor/Workbench filter affordance only.
 */
export function KpiChartCard({
  id,
  label,
  value,
  intent = 'neutral',
  tooltip,
  viz = 'tiles',
  series,
  breakdown,
  active = false,
  filterable = false,
  onOpen,
  className,
  density = 'default',
}: KpiChartCardProps) {
  const compact = density === 'compact';
  const clickable = Boolean(onOpen) && filterable;
  const tone = metricIntentTextClass(intent);
  const [hoverAt, setHoverAt] = useState<string | null>(null);
  const hoveredPoint =
    compact && hoverAt ? series.find((p) => p.at === hoverAt) ?? null : null;
  const segments: GaugeSegment[] = breakdown.map((b, i) => ({
    key: b.key,
    label: b.label,
    value: b.value,
    color: paletteTone(i),
  }));
  const hasBreakdown = segments.some((s) => s.value > 0);
  const hasSeries = series.some((p) => p.value > 0);

  const spark = hasSeries ? (
    <KpiBarSpark
      className={compact ? 'mt-1.5' : 'mt-2'}
      height={compact ? 28 : 48}
      variant={compact ? 'embedded' : 'default'}
      points={series.map((p) => ({
        at: p.at,
        value: p.value,
        label: formatBucketLabel(p.at),
      }))}
      onHoverAt={compact ? setHoverAt : undefined}
      // Compact: bars are display-only — card click owns `?ukpi=` filter.
      // Default density may still select via the spark when filterable.
      onSelect={!compact && clickable ? () => onOpen?.() : undefined}
    />
  ) : null;

  const body = compact
    ? spark
    : viz === 'tiles'
      ? null
      : viz === 'pie' && hasBreakdown
        ? (
            <GaugeDonut
              className="mt-1"
              segments={segments}
              centerLabel={label}
              size={112}
              thickness={10}
              interactive
              onSelect={clickable ? () => onOpen?.() : undefined}
              activeKey={active ? id : null}
            />
          )
        : viz === 'line' && hasSeries
          ? (
              <MultiSeriesLineChart
                className="mt-1"
                height={72}
                yTicks={2}
                area
                legend={false}
                xLabels={series.map((p) => formatBucketLabel(p.at))}
                series={[
                  {
                    key: id,
                    label,
                    color: DEFAULT_SERIES_TONE,
                    points: series.map((p) => p.value),
                  },
                ]}
              />
            )
          : viz === 'bars' || (viz === 'pie' && !hasBreakdown) || (viz === 'line' && !hasSeries)
            ? spark
            : null;

  const topLine = hoveredPoint ? formatHoverBucketDate(hoveredPoint.at) : label;
  const heroValue = hoveredPoint ? hoveredPoint.value.toLocaleString() : value;

  const card = (
    <div
      className={cn(
        compact
          ? cn(
              'flex h-full min-w-0 flex-col border border-border-soft bg-surface-card p-2',
              nestedCornerClass('card', 0.5),
            )
          : cn(MONITOR_KPI_TILE_CLASS, 'flex h-full min-h-[9.5rem] flex-col'),
        clickable &&
          'cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
        active && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
        className,
      )}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      data-kpi-id={id}
      data-density={compact ? 'compact' : undefined}
    >
      <p
        className={cn(
          'min-w-0 font-semibold text-text-faint',
          compact
            ? 'tracking-wide text-role-micro'
            : 'tracking-widest text-text-soft text-role-eyebrow',
          // Metric labels stay uppercase; hover dates keep title case (`Jul 11, 2026`).
          !hoveredPoint && 'uppercase',
        )}
      >
        {topLine}
      </p>
      <p
        className={cn(
          'mt-0.5 font-semibold tabular-nums leading-none text-text-default',
          compact ? 'text-role-title' : 'mt-1 text-2xl',
          (intent === 'warn' || intent === 'bad') && tone,
        )}
      >
        {heroValue}
      </p>
      {body ? (
        <div className={cn('min-h-0', compact ? '' : 'mt-auto flex-1 pt-1')}>{body}</div>
      ) : null}
    </div>
  );

  return tooltip ? (
    <HoverTooltip label={tooltip} focusable className="block h-full">
      {card}
    </HoverTooltip>
  ) : (
    card
  );
}
