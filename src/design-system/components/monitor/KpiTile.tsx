'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { MONITOR_KPI_TILE_CLASS } from './shell';
import { DeltaChip } from './DeltaChip';

export type KpiTileProps = {
  label: string;
  /** Hero number or preformatted string. */
  value: ReactNode;
  /** Optional signed % delta — renders compact top-right next to the label. */
  delta?: number;
  invertDelta?: boolean;
  /** Extra classes on the hero number (tone). Prefer theme text tokens. */
  valueClassName?: string;
  /**
   * @deprecated No longer rendered — status footers were the old third row.
   * Kept so call sites compile while strips stop passing them.
   */
  footer?: ReactNode;
  /** @deprecated Compact delta has no vs-label; kept for call-site compatibility. */
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
  /** Lit when this tile's Monitor filter is the active one (`?ostatus` on) — the
   *  house selection affordance (bg + inset ring only, never a size shift). */
  active?: boolean;
};

/**
 * KPI tile anatomy: eyebrow + compact delta (top-right) → hero number.
 * Compose inside {@link KpiStrip}; do not nest cards inside the tile.
 */
export function KpiTile({
  label,
  value,
  delta,
  invertDelta = false,
  valueClassName,
  footer: _footer,
  deltaVsLabel: _deltaVsLabel,
  className,
  size = 'default',
  onOpen,
  active = false,
}: KpiTileProps) {
  const clickable = Boolean(onOpen);
  const wall = size === 'wall';

  return (
    <div
      className={cn(
        MONITOR_KPI_TILE_CLASS,
        wall && 'p-5',
        clickable &&
          'cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
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
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            'min-w-0 font-semibold uppercase tracking-widest text-text-soft',
            wall ? 'text-role-caption' : 'text-role-eyebrow',
          )}
        >
          {label}
        </p>
        {delta !== undefined ? (
          <DeltaChip delta={delta} invert={invertDelta} compact />
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1.5 font-semibold tabular-nums leading-none text-text-default',
          wall ? 'text-5xl lg:text-6xl' : 'text-3xl',
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}
