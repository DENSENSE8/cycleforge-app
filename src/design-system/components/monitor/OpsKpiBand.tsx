'use client';

/**
 * Ops attention KPI band — **workbench SoT** for station / outbound flex-wrap
 * KPI strips (Unbox, Testing, Shipping, Pack, Labels, …).
 *
 * Distinct from Monitor {@link KpiStrip} (2×2 → 4-col CSS grid for rollup
 * zones). This band is a flex-wrap row of {@link KpiTile}s with shared
 * empty / error chrome so domain strips stop forking `TILE_BAND_CLASS`.
 */

import type { ReactNode } from 'react';
import { RefreshCw } from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/** Flex-wrap attention band — tiles grow to fill the row. */
const OPS_KPI_BAND_CLASS = 'flex flex-wrap gap-3';

/** Default cell: grow, min basis ~10rem (station workbenches). */
const OPS_KPI_CELL_CLASS = 'min-w-0 grow basis-40';

/** Tighter cell for denser strips (Ready / FBA). */
const OPS_KPI_CELL_COMPACT_CLASS = 'min-w-0 grow basis-32';

export function OpsKpiBand({
  children,
  className,
  'aria-label': ariaLabel = 'Attention metrics',
}: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={cn(OPS_KPI_BAND_CLASS, className)} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function OpsKpiBandCell({
  children,
  className,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? OPS_KPI_CELL_COMPACT_CLASS : OPS_KPI_CELL_CLASS, className)}>
      {children}
    </div>
  );
}

export function OpsKpiBandEmpty({
  title = 'All clear.',
  description,
  icon,
}: {
  title?: string;
  description: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-surface-card px-4 py-5">
      {icon ?? <AnimatedCheck size={20} />}
      <div className="min-w-0">
        <p className="text-role-caption font-semibold text-text-default">{title}</p>
        <p className="mt-0.5 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          {description}
        </p>
      </div>
    </div>
  );
}

export function OpsKpiBandError({
  message = "Couldn't load metrics.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-danger bg-fill-danger px-4 py-8 text-center">
      <p className="text-role-caption font-semibold text-text-danger">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}
