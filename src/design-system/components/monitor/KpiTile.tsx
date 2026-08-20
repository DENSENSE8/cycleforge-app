'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { MONITOR_KPI_BAND_CLASS, MONITOR_KPI_TILE_CLASS } from './shell';
import { DeltaChip } from './DeltaChip';

export type KpiTileDensity = 'monitor' | 'band';

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
   * Extra classes on the eyebrow label. Outbound band tiles pass
   * `normal-case tracking-normal` so "Units stuck" is not shouted as UNITS STUCK.
   */
  labelClassName?: string;
  /**
   * Hero scale. `default` = desk/rollup density (text-3xl). `wall` bumps the
   * hero + label for 3–5m unattended TV readability (HOME-OPS Phase C) — additive
   * only, so every existing Monitor tile is byte-identical.
   */
  size?: 'default' | 'wall';
  /**
   * Shell altitude. `monitor` (default) = Monitor `rounded-2xl p-4` island.
   * `band` = workbench Band 2 flush instrument (`MONITOR_KPI_BAND_CLASS`).
   * (Named `monitor`, not `card` — `density="card"` is banned by carton-context guards.)
   */
  density?: KpiTileDensity;
  /** Optional click → filter / open details (Monitor filters only — no durable selection). */
  onOpen?: () => void;
  /** Lit when this tile's Monitor filter is the active one (`?ostatus` on) — the
   *  house selection affordance (bg + inset ring only, never a size shift). */
  active?: boolean;
};

/**
 * KPI tile anatomy: eyebrow + compact delta (top-right) → hero number.
 * Compose inside {@link KpiStrip} / {@link OpsKpiBand}; do not nest cards inside the tile.
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
  labelClassName,
  size = 'default',
  density = 'monitor',
  onOpen,
  active = false,
}: KpiTileProps) {
  const clickable = Boolean(onOpen);
  const wall = size === 'wall';
  const band = density === 'band';

  return (
    <div
      className={cn(
        band ? MONITOR_KPI_BAND_CLASS : MONITOR_KPI_TILE_CLASS,
        wall && !band && 'p-5',
        clickable &&
          'cursor-pointer transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
        active && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
        className,
      )}
      data-kpi-density={density}
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
      <div className={cn('flex items-start justify-between', band ? 'gap-1' : 'gap-3')}>
        <p
          className={cn(
            'min-w-0 font-semibold uppercase tracking-widest text-text-soft',
            wall && !band ? 'text-role-caption' : band ? 'text-role-micro tracking-wide' : 'text-role-eyebrow',
            labelClassName,
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
          'font-semibold tabular-nums leading-none text-text-default',
          band ? 'mt-0.5 text-xl' : 'mt-1.5',
          !band && (wall ? 'text-5xl lg:text-6xl' : 'text-3xl'),
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}
