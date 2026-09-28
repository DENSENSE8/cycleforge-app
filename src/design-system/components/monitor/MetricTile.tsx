'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { MONITOR_KPI_TILE_CLASS } from './shell';
import { MetricRing } from './MetricRing';
import { DeltaChip } from './DeltaChip';

/** Good / warn / bad / neutral — the "is this healthy?" signal for a metric. */
export type MetricIntent = 'good' | 'warn' | 'bad' | 'neutral';

/** Intent → theme functional text token (never a raw Tailwind hue). */
const INTENT_TEXT: Record<MetricIntent, string> = {
  good: 'text-text-success',
  warn: 'text-text-warning',
  bad: 'text-text-danger',
  neutral: 'text-text-info',
};

/**
 * The one intent→tone map, exported so sibling Monitor surfaces (the outbound
 * attention strip) tone their heroes/dots from the SAME source — never a
 * page-local fork of these four tokens.
 */
export function metricIntentTextClass(intent: MetricIntent): string {
  return INTENT_TEXT[intent];
}

export type MetricTileProps = {
  label: string;
  /** The hero readout shown in the ring center — "96%", "3.2h", or a count. */
  value: ReactNode;
  /** 0..1 gauge fill. */
  fraction: number;
  intent?: MetricIntent;
  /** A plain-English health word under the gauge — "On track" / "At risk". */
  status?: string;
  /** Optional signed % trend (renders a DeltaChip instead of `status`). */
  delta?: number;
  deltaInvert?: boolean;
  deltaVsLabel?: string;
  className?: string;
  /**
   * Drop the standalone card shell so the tile can sit as a chromeless gauge
   * INSIDE a `SectionCard` grid — the house "never nest cards as rows" rule. The
   * parent card owns the border/padding; the tile is just label → ring → status.
   */
  bare?: boolean;
  /** Monitor filter only (no durable selection). */
  onOpen?: () => void;
  /** Lit when this tile's Monitor filter is the active one (`?ostatus` on). */
  active?: boolean;
};

/** MetricTile — one KPI as a labelled radial gauge with a clear good/bad signal. */
export function MetricTile({
  label,
  value,
  fraction,
  intent = 'neutral',
  status,
  delta,
  deltaInvert,
  deltaVsLabel,
  className,
  bare = false,
  onOpen,
  active = false,
}: MetricTileProps) {
  const clickable = Boolean(onOpen);
  const toneClass = INTENT_TEXT[intent];
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 text-center',
        bare ? 'rounded-xl p-2' : MONITOR_KPI_TILE_CLASS,
        clickable &&
          'cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
        // Lit filter state — the house selection affordance (bg + inset ring only,
        // never a size shift), mirroring the toolbar legend's lit chip.
        active && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
        className,
      )}
      onClick={onOpen}
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
    >
      <p className="text-role-eyebrow text-text-soft">{label}</p>
      <MetricRing
        fraction={fraction}
        toneClass={toneClass}
        center={<span className={cn('text-lg font-semibold tabular-nums', toneClass)}>{value}</span>}
      />
      {delta !== undefined ? (
        <DeltaChip delta={delta} invert={deltaInvert} vsLabel={deltaVsLabel ?? 'vs last wk'} className="mt-0" />
      ) : status ? (
        <p className={cn('text-role-eyebrow', toneClass)}>{status}</p>
      ) : null}
    </div>
  );
}
