'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { MONITOR_KPI_TILE_CLASS } from './shell';
import { DeltaChip } from './DeltaChip';

export type KpiTileProps = {
  label: string;
  /** Hero number or preformatted string. */
  value: ReactNode;
  /** Optional signed % delta under the hero. */
  delta?: number;
  invertDelta?: boolean;
  /** Extra classes on the hero number (tone). Prefer theme text tokens. */
  valueClassName?: string;
  /** Optional footer under the tile (replaces default DeltaChip when set). */
  footer?: ReactNode;
  deltaVsLabel?: string;
  className?: string;
  /** Optional click → filter / open details (Monitor filters only — no durable selection). */
  onOpen?: () => void;
};

/**
 * KPI tile anatomy: eyebrow label → hero number → delta chip.
 * Compose inside {@link KpiStrip}; do not nest cards inside the tile.
 */
export function KpiTile({
  label,
  value,
  delta,
  invertDelta = false,
  valueClassName,
  footer,
  deltaVsLabel,
  className,
  onOpen,
}: KpiTileProps) {
  const clickable = Boolean(onOpen);

  return (
    <div
      className={cn(MONITOR_KPI_TILE_CLASS, clickable && 'cursor-pointer hover:bg-surface-hover', className)}
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
      <p className="text-eyebrow font-black uppercase tracking-widest text-text-soft">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-3xl font-black tabular-nums leading-none text-text-default',
          valueClassName,
        )}
      >
        {value}
      </p>
      {footer !== undefined ? (
        footer
      ) : delta !== undefined ? (
        <DeltaChip delta={delta} invert={invertDelta} vsLabel={deltaVsLabel} />
      ) : null}
    </div>
  );
}
