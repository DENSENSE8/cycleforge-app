'use client';

/**
 * Ops attention KPI band — **workbench SoT** for station / outbound flex-wrap
 * KPI strips (Unbox, Testing, Shipping, Pack, Labels, To-ship, …).
 *
 * Distinct from Monitor {@link KpiStrip} (2×2 → 4-col CSS grid for rollup
 * zones). This band is a flex-wrap row of {@link KpiTile}s with shared
 * empty / error chrome so domain strips stop forking `TILE_BAND_CLASS`.
 *
 * `density="band"` = industrial Band 2 flush (gap-0, denser cells, flush
 * empty/error). Default keeps the legacy card-strip spacing for gradual ports.
 */

import type { ReactNode } from 'react';
import { RefreshCw } from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import {
  MONITOR_KPI_BAND_CELL_CLASS,
  MONITOR_KPI_BAND_CLASS,
  MONITOR_KPI_BAND_STRIP_CLASS,
} from './shell';

/** Flex-wrap attention band — tiles grow to fill the row (card altitude). */
const OPS_KPI_BAND_CLASS = 'flex flex-wrap gap-3';

/** Default cell: grow, min basis ~10rem (station workbenches, card altitude). */
const OPS_KPI_CELL_CLASS = 'min-w-0 grow basis-40';

/** Tighter cell for denser card strips (Ready / FBA). */
const OPS_KPI_CELL_COMPACT_CLASS = 'min-w-0 grow basis-32';

type OpsKpiBandDensity = 'default' | 'band';

export function OpsKpiBand({
  children,
  className,
  density = 'default',
  'aria-label': ariaLabel = 'Attention metrics',
}: {
  children: ReactNode;
  className?: string;
  density?: OpsKpiBandDensity;
  'aria-label'?: string;
}) {
  return (
    <div
      className={cn(
        density === 'band' ? MONITOR_KPI_BAND_STRIP_CLASS : OPS_KPI_BAND_CLASS,
        className,
      )}
      role="group"
      aria-label={ariaLabel}
      data-ops-kpi-density={density}
    >
      {children}
    </div>
  );
}

export function OpsKpiBandCell({
  children,
  className,
  compact = false,
  density = 'default',
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  density?: OpsKpiBandDensity;
}) {
  const cell =
    density === 'band'
      ? MONITOR_KPI_BAND_CELL_CLASS
      : compact
        ? OPS_KPI_CELL_COMPACT_CLASS
        : OPS_KPI_CELL_CLASS;
  return <div className={cn(cell, className)}>{children}</div>;
}

export function OpsKpiBandEmpty({
  title = 'All clear.',
  description,
  icon,
  density = 'default',
}: {
  title?: string;
  description: ReactNode;
  icon?: ReactNode;
  density?: OpsKpiBandDensity;
}) {
  const band = density === 'band';
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        band
          ? 'rounded-none border-0 border-y border-dashed border-border-hairline bg-transparent px-2 py-1'
          : 'gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5',
      )}
    >
      {icon ?? <AnimatedCheck size={band ? 16 : 20} />}
      <div className="min-w-0">
        <p
          className={cn(
            'font-semibold text-text-default',
            band ? 'text-role-micro' : 'text-role-caption',
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            'font-semibold uppercase tracking-widest text-text-faint',
            band ? 'mt-0 text-role-micro' : 'mt-0.5 text-role-eyebrow',
          )}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

export function OpsKpiBandError({
  message = "Couldn't load metrics.",
  onRetry,
  density = 'default',
}: {
  message?: string;
  onRetry: () => void;
  density?: OpsKpiBandDensity;
}) {
  const band = density === 'band';
  return (
    <div
      className={cn(
        'text-center',
        band
          ? 'rounded-none border-0 border-y border-dashed border-rose-200 bg-rose-50/80 px-2 py-2'
          : 'rounded-xl border border-dashed border-border-danger bg-fill-danger px-4 py-8',
      )}
    >
      <p
        className={cn(
          'font-semibold text-text-danger',
          band ? 'text-role-micro text-rose-700' : 'text-role-caption',
        )}
      >
        {message}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Skeleton placeholder matching {@link KpiTile} `density="band"` geometry. */
export function OpsKpiBandSkeletonTile({ density = 'band' }: { density?: OpsKpiBandDensity }) {
  const band = density === 'band';
  return (
    <div className={cn(band ? MONITOR_KPI_BAND_CLASS : undefined, 'h-full')}>
      <div className={cn('flex items-start justify-between', band ? 'gap-1' : 'gap-3')}>
        <div className={cn('rounded-full bg-surface-strong', band ? 'h-2 w-12' : 'h-2.5 w-16')} />
        <div className={cn('rounded-full bg-surface-strong', band ? 'h-2 w-6' : 'h-2.5 w-8')} />
      </div>
      <div className={cn('rounded bg-surface-strong', band ? 'mt-0 h-5 w-10' : 'mt-2 h-7 w-14')} />
    </div>
  );
}
