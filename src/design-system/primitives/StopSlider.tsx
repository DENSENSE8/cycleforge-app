'use client';

/**
 * StopSlider — the one snapping range control. The value always lands on one
 * of `stops`; the slider's position is the stop's INDEX, so uneven runs
 * (1, 2, 5, 10 … 99) spread evenly under the thumb.
 *
 * Hit area: the whole 44px band is the native range input (invisible, on top),
 * so a tap anywhere on the band jumps there and drags from there. When the
 * stops fit, each one is also a tappable chip under the track.
 *
 * Paint: a light info-tone track, a bright info fill, and a white thumb with
 * an info ring. Fill and thumb travel by transform only (scaleX / translateX,
 * Law M1), timed by `motionDuration.progressFill`, off under reduced motion.
 */

import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, motionDuration } from '@/design-system/foundations/motion-presets';
import { cn } from '@/utils/_cn';

/** More stops than this and the chip row would crowd; the band alone carries the value. */
const MAX_STOP_CHIPS = 12;

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
  'data-testid': testId,
}: StopSliderProps) {
  const reduceMotion = useReducedMotion();
  const last = Math.max(stops.length - 1, 0);
  const index = nearestStopIndex(stops, value);
  const fraction = last === 0 ? 1 : index / last;
  const travel = reduceMotion ? { duration: 0 } : { duration: motionDuration.progressFill, ease: motionBezier.easeOut };

  return (
    <div className={cn('group flex w-full min-w-0 flex-col', disabled && 'opacity-50', className)}>
      <div className="relative h-11 w-full">
        {/* Track + fill + thumb, inset by the thumb radius so the thumb's centre meets both ends. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-fill-info/15 ring-1 ring-inset ring-fill-info/25">
            <motion.div
              className="absolute inset-0 w-full origin-left rounded-full bg-fill-info"
              initial={false}
              animate={{ scaleX: fraction }}
              transition={travel}
            />
          </div>
          <motion.div className="absolute inset-0" initial={false} animate={{ x: `${fraction * 100}%` }} transition={travel}>
            <span
              className={cn(
                'absolute left-0 top-1/2 block size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-card shadow-md ring-[3px] ring-fill-info transition-transform duration-100',
                !disabled && 'group-hover:scale-110 group-active:scale-125',
                'group-has-[input:focus-visible]:ring-[5px] group-has-[input:focus-visible]:ring-offset-2 group-has-[input:focus-visible]:ring-offset-surface-card',
              )}
            />
          </motion.div>
        </div>
        {/* The real control spans the whole band; its thumb matches the painted one (size-6) so a tap lands where it looks. */}
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
            '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-6',
            disabled && 'cursor-not-allowed',
          )}
          data-testid={testId}
        />
      </div>

      {showStops && stops.length > 1 ? (
        <div className="relative mx-3 h-8">
          {stops.map((stop, i) => {
            const chosen = i === index;
            return (
              <button
                key={stop}
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => stop !== value && onChange(stop)}
                style={{ left: `${(last === 0 ? 1 : i / last) * 100}%` }}
                className={cn(
                  'absolute top-0 flex h-8 min-w-8 -translate-x-1/2 items-center justify-center rounded-full px-1.5 text-role-caption tabular-nums transition-colors',
                  chosen
                    ? 'bg-fill-info/15 font-semibold text-text-info'
                    : i < index
                      ? 'text-text-default hover:bg-fill-info/10'
                      : 'text-text-muted hover:bg-fill-info/10 hover:text-text-default',
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
    </div>
  );
}
