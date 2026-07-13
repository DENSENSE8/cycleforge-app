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
  /**
   * Hero scale. `default` = desk/rollup density (text-3xl). `wall` bumps the
   * hero + label for 3–5m unattended TV readability (HOME-OPS Phase C) — additive
   * only, so every existing Monitor tile is byte-identical.
   */
  size?: 'default' | 'wall';
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
  size = 'default',
  onOpen,
}: KpiTileProps) {
  const clickable = Boolean(onOpen);
  const wall = size === 'wall';

  return (
    <div
      className={cn(MONITOR_KPI_TILE_CLASS, wall && 'p-5', clickable && 'cursor-pointer hover:bg-surface-hover', className)}
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
      <p
        className={cn(
          'font-black uppercase tracking-widest text-text-soft',
          wall ? 'text-role-caption' : 'text-role-eyebrow',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 font-black tabular-nums leading-none text-text-default',
          wall ? 'text-5xl lg:text-6xl' : 'text-3xl',
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
