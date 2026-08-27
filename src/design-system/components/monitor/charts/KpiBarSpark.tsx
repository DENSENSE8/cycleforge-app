'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/utils/_cn';
import { DEFAULT_SERIES_TONE } from './chart-theme';

interface KpiBarSparkPoint {
  at: string;
  value: number;
  label?: string;
}

interface KpiBarSparkProps {
  points: KpiBarSparkPoint[];
  /** Hex stroke/fill — defaults to primary series tone. */
  color?: string;
  height?: number;
  className?: string;
  /** Hover shows value · label above the lit bar (ignored when `variant="embedded"`). */
  interactive?: boolean;
  onSelect?: (at: string) => void;
  activeAt?: string | null;
  /**
   * Fires on bar enter/leave/focus/blur with the bucket `at` (or `null`).
   * Compact `KpiChartCard` owns the header readout via this callback.
   */
  onHoverAt?: (at: string | null) => void;
  /**
   * `default` — internal hover readout above the bars.
   * `embedded` — no readout line; parent card owns date/value (compact KPI cells).
   */
  variant?: 'default' | 'embedded';
}

/**
 * Compact vertical bar spark for KPI cards — no axes.
 * Default: hover readout above the lit bar. Embedded: display-only glow;
 * parent listens via `onHoverAt`.
 */
export function KpiBarSpark({
  points,
  color = DEFAULT_SERIES_TONE,
  height = 56,
  className,
  interactive = true,
  onSelect,
  activeAt = null,
  onHoverAt,
  variant = 'default',
}: KpiBarSparkProps) {
  const [hoverAt, setHoverAt] = useState<string | null>(null);
  const peak = Math.max(1, ...points.map((p) => p.value));
  const litAt = hoverAt ?? activeAt;
  const hovered = litAt ? points.find((p) => p.at === litAt) : null;
  const embedded = variant === 'embedded';
  const showReadout = !embedded;

  const bars = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        h: Math.max(p.value > 0 ? 2 : 0, Math.round((p.value / peak) * (height - 4))),
      })),
    [points, peak, height],
  );

  const setLit = (at: string | null) => {
    setHoverAt(at);
    onHoverAt?.(at);
  };

  if (points.length === 0) {
    return (
      <div
        className={cn('flex items-end justify-center text-role-eyebrow text-text-faint', className)}
        style={{ height }}
      >
        No series
      </div>
    );
  }

  return (
    <div className={cn('relative flex w-full flex-col', className)}>
      {showReadout ? (
        hovered ? (
          <p className="mb-0.5 truncate text-center text-role-eyebrow font-semibold tabular-nums text-text-soft">
            {hovered.value.toLocaleString()}
            {hovered.label ? ` · ${hovered.label}` : ''}
          </p>
        ) : (
          <p className="mb-0.5 h-3.5" aria-hidden />
        )
      ) : null}
      <div
        className="relative flex w-full items-end gap-px"
        style={{ height }}
        role="img"
        aria-label="KPI series"
      >
        {/* Faint baseline — painted first so bars stack above without a z-index token. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 border-b border-dashed border-border-soft/70"
          aria-hidden
        />
        {bars.map((bar) => {
          const lit = litAt === bar.at;
          const dimmed = litAt != null && !lit;
          const zero = bar.value === 0;
          const barH = lit && zero ? 2 : bar.h || 1;
          return (
            <div
              key={bar.at}
              role={onSelect ? 'button' : undefined}
              className={cn(
                'relative min-w-0 flex-1 rounded-t-sm transition-[opacity,box-shadow,background-color] duration-150',
                onSelect ? 'cursor-pointer' : 'cursor-default',
              )}
              style={{
                height: barH,
                backgroundColor: lit ? 'var(--ds-color-text-primary)' : color,
                opacity: zero && !lit ? 0.12 : lit ? 1 : dimmed ? 0.22 : 0.7,
                boxShadow: lit
                  ? '0 0 6px color-mix(in srgb, var(--ds-color-text-primary) 40%, transparent)'
                  : undefined,
              }}
              aria-label={`${bar.value} at ${bar.label ?? bar.at}`}
              tabIndex={onSelect || interactive ? 0 : undefined}
              onMouseEnter={interactive ? () => setLit(bar.at) : undefined}
              onMouseLeave={interactive ? () => setLit(null) : undefined}
              onFocus={interactive ? () => setLit(bar.at) : undefined}
              onBlur={interactive ? () => setLit(null) : undefined}
              onClick={
                onSelect
                  ? (e) => {
                      e.stopPropagation();
                      onSelect(bar.at);
                    }
                  : undefined
              }
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(bar.at);
                      }
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
