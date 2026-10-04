'use client';

/**
 * StopSlider — the one snapping range control. The value always lands on one
 * of `stops`; the slider's position is the stop's INDEX, so uneven runs
 * (1, 2, 5, 10 … 99) spread evenly under the thumb.
 *
 * P5 (owner 2026-10-03, NN/g sliders + Material discrete sliders): a slider is
 * for coarse, few-step choices, so
 *  - the track is large and neutral (`bg-surface-sunken`), with a dot at every
 *    stop — the snap points are visible before you drag; dots the value has
 *    reached take the fill colour;
 *  - the thumb is a flat solid fill (no ring, no shadow, no scale jump that
 *    would cover the dots); pressing and holding paints a flat darker face;
 *  - the focus ring is keyboard-only (`:focus-visible` on the native input) —
 *    a click never paints it;
 *  - the stop labels sit ABOVE the track, never under the thumb (a finger on
 *    a phone would hide a label below it);
 *  - the native `step=1` range snaps every drag to a stop index; an off-scale
 *    `value` paints at `nearestStopIndex`.
 *
 * Hit area: the whole band (48px; 32px `compact`) is the native range input
 * (invisible, on top), so a tap anywhere on the band jumps there and drags
 * from there. When the stops fit, each label is also a tappable chip.
 *
 * Fill and thumb travel by transform only (scaleX / translateX, Law M1),
 * timed by `motionDuration.progressFill`, off under reduced motion.
 */

import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, motionDuration } from '@/design-system/foundations/motion-presets';
import { cn } from '@/utils/_cn';

/** More stops than this and the chip row would crowd; the band alone carries the value. */
const MAX_STOP_CHIPS = 12;
/** More stops than this and the dots would fuse into a dashed line; the track alone carries them. */
const MAX_STOP_DOTS = 24;

export interface StopSliderProps {
  /** Ascending values the slider can land on. */
  stops: readonly number[];
  /** Current value; off-scale values paint at the nearest stop. */
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  /** Screen-reader value text, e.g. `n => \`${n} labels\``. */
  formatValue?: (value: number) => string;
  /** Chip text per stop; keep it short (`45`, not `45 minutes`). */
  stopLabel?: (value: number) => string;
  /** Show the tappable stop chips. Defaults on when the stops fit. */
  showStops?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  'data-testid'?: string;
}

/** Index of the stop nearest `value` (exact match first). */
export function nearestStopIndex(stops: readonly number[], value: number): number {
  const exact = stops.indexOf(value);
  if (exact >= 0) return exact;
  let best = 0;
  for (let i = 1; i < stops.length; i += 1) {
    if (Math.abs(stops[i] - value) < Math.abs(stops[best] - value)) best = i;
  }
  return best;
}

export function StopSlider({
  stops,
  value,
  onChange,
  ariaLabel,
  formatValue = String,
  stopLabel = String,
  showStops = stops.length <= MAX_STOP_CHIPS,
  disabled = false,
  className,
  compact = false,
  'data-testid': testId,
}: StopSliderProps) {
  const reduceMotion = useReducedMotion();
  const last = Math.max(stops.length - 1, 0);
  const index = nearestStopIndex(stops, value);
  const fraction = last === 0 ? 1 : index / last;
  const at = (i: number) => `${(last === 0 ? 1 : i / last) * 100}%`;
  /** Thumb radius in px — the track's inset, so a label's centre meets its dot. */
  const inset = compact ? 10 : 14;
  const travel = reduceMotion ? { duration: 0 } : { duration: motionDuration.progressFill, ease: motionBezier.easeOut };

  return (
    <div className={cn('group flex w-full min-w-0 flex-col', disabled && 'opacity-50', className)}>
      {/* P5 — labels above the track, so the thumb (and the finger on it) never covers them. The
          end labels anchor to the band's edges so a long word ("Done") never spills out of it. */}
      {showStops && stops.length > 1 ? (
        <div className="relative h-7">
          {stops.map((stop, i) => {
            const chosen = i === index;
            const edge = i === 0 ? { left: 0 } : i === last ? { right: 0 } : null;
            return (
              <button
                key={stop}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => stop !== value && onChange(stop)}
                style={edge ?? { left: `calc(${inset}px + (100% - ${inset * 2}px) * ${i / last})` }}
                className={cn(
                  // The chip paints 28px; `before:` lifts its hit area to the 44px touch floor without moving the band.
                  "absolute top-0 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-role-caption tabular-nums transition-colors before:absolute before:-inset-2 before:content-['']",
                  !edge && '-translate-x-1/2',
                  chosen
                    ? 'bg-fill-info/15 font-semibold text-text-info'
                    : i < index
                      ? 'text-text-default hover:bg-surface-sunken'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text-default',
                  disabled && 'cursor-not-allowed',
                )}
                aria-label={`${ariaLabel}: ${formatValue(stop)}`}
              >
                {stopLabel(stop)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={cn('relative w-full', compact ? 'h-8' : 'h-12')}>
        {/* Track + dots + fill + thumb, inset by the thumb radius so the thumb's centre meets both ends. */}
        <div aria-hidden className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2', compact ? 'inset-x-2.5' : 'inset-x-3.5')}>
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border-default',
              compact ? 'h-2' : 'h-3',
            )}
          >
            <motion.div
              className="absolute inset-0 w-full origin-left rounded-full bg-fill-info"
              initial={false}
              animate={{ scaleX: fraction }}
              transition={travel}
            />
          </div>
          {/* P5 — a dot per stop: gray ahead of the value, the fill colour once reached. Beads stand
              proud of the track so a reached dot still reads on the fill. */}
          {stops.length > 1 && stops.length <= MAX_STOP_DOTS
            ? stops.map((stop, i) => (
                <span
                  key={stop}
                  style={{ left: at(i) }}
                  className={cn(
                    'absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors',
                    compact ? 'size-2.5' : 'size-4',
                    i <= index ? 'bg-fill-info' : 'bg-border-emphasis',
                  )}
                />
              ))
            : null}
          <motion.div className="absolute inset-0" initial={false} animate={{ x: `${fraction * 100}%` }} transition={travel}>
            <span
              className={cn(
                // P5 — flat solid thumb; press-and-hold darkens the face (colour only, no geometry);
                // the ring is keyboard focus only.
                'absolute left-0 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-fill-info transition-[filter] duration-100',
                compact ? 'size-5' : 'size-7',
                !disabled && 'group-has-[input:active]:brightness-75',
                'group-has-[input:focus-visible]:ring-2 group-has-[input:focus-visible]:ring-fill-info/50 group-has-[input:focus-visible]:ring-offset-2 group-has-[input:focus-visible]:ring-offset-surface-card',
              )}
            />
          </motion.div>
        </div>
        {/* The real control spans the whole band; its thumb matches the painted one so a tap lands where it looks. */}
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-valuetext={formatValue(stops[index] ?? value)}
          onChange={(event) => {
            const next = stops[Number(event.target.value)];
            if (next !== undefined && next !== value) onChange(next);
          }}
          className={cn(
            'absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 outline-none',
            compact
              ? '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-5'
              : '[&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-7',
            disabled && 'cursor-not-allowed',
          )}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
