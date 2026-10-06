'use client';

/**
 * StopSlider — the one snapping range control. The value always lands on one
 * of `stops`; the slider's position is the stop's INDEX, so uneven runs
 * (1, 2, 5, 10 … 99) spread evenly under the thumb.
 *
 * P5 (owner 2026-10-03, NN/g sliders + Material discrete sliders): a slider is
 * for coarse, few-step choices, so
 *  - the shared blue rail (`bg-fill-info`) makes its editable progress clear;
 *    a dot at every stop keeps the snap points visible before a drag;
 *  - dots are deliberately smaller than the rail (6px on the 20px default
 *    rail; 4px on the compact 12px rail), so increments read as markers rather
 *    than a dashed track. The rail runs half its height past the thumb's
 *    travel at each end, so the first and last dots sit centred in the rail's
 *    rounded caps — never hanging off the end — and every dot sits exactly
 *    where the thumb (and the native input's thumb) lands for that stop;
 *  - hover is about ONE stop (owner 2026-10-05): the dot nearest the pointer
 *    grows and its value previews above it (or its chip lights up) — the rest
 *    stay still. Touch has no hover, so nothing grows under a finger;
 *  - the completed rail and selected chip use the semantic info fill; reached
 *    dots are light and future dots remain blue for legibility on either rail;
 *  - the thumb is a high-contrast neutral-gray disc with a quiet lift, large enough
 *    to grab without obscuring the increment markers;
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

import { useRef, useState, type PointerEvent } from 'react';
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
  /** Stop `i` along the thumb's travel — dots, thumb and the native input's thumb all share it. */
  const at = (i: number) => `${(last === 0 ? 1 : i / last) * 100}%`;
  /** Thumb radius in px — the travel's inset, so both endpoint thumbs stay inside the interaction band. */
  const inset = compact ? 16 : 20;
  const travel = reduceMotion ? { duration: 0 } : { duration: motionDuration.progressFill, ease: motionBezier.easeOut };
  const dotMotion = reduceMotion ? { duration: 0 } : { duration: motionDuration.progressFill, ease: motionBezier.easeOut };
  const dots = stops.length > 1 && stops.length <= MAX_STOP_DOTS;
  const chips = showStops && stops.length > 1;

  // The one stop under a hovering pointer (mouse / pen — touch never hovers).
  const travelRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const trackHover = (event: PointerEvent<HTMLDivElement>) => {
    const rect = travelRef.current?.getBoundingClientRect();
    if (disabled || event.pointerType === 'touch' || !rect || rect.width === 0 || last === 0) return;
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHoverIndex(Math.round(ratio * last));
  };
  // The thumb already names its own stop; a preview only speaks for another one.
  const preview = hoverIndex != null && hoverIndex !== index ? hoverIndex : null;

  return (
    <div className={cn('group flex w-full min-w-56 flex-col', disabled && 'opacity-50', className)}>
      {/* P5 — labels above the track, so the thumb (and the finger on it) never covers them. The
          end labels anchor to the band's edges so a long word ("Done") never spills out of it. */}
      {chips ? (
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
                    ? 'bg-fill-info font-semibold text-text-inverse'
                    : i === preview
                      ? 'bg-surface-sunken text-text-default'
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

      <div
        className={cn('relative w-full', compact ? 'h-12' : 'h-16')}
        onPointerMove={trackHover}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* The thumb's travel, inset by the thumb radius so the thumb's centre meets both ends. */}
        <div
          ref={travelRef}
          aria-hidden
          className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2', compact ? 'inset-x-4' : 'inset-x-5')}
        >
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-fill-info/35 ring-1 ring-inset ring-fill-info/40',
              compact ? '-inset-x-1.5 h-3' : '-inset-x-2.5 h-5',
            )}
          >
            {/* Fill = the left cap (always reached) + the travel scaled to the thumb. */}
            <span className={cn('absolute inset-y-0 left-0 bg-fill-info', compact ? 'w-1.5' : 'w-2.5')} />
            <motion.span
              className={cn('absolute inset-y-0 origin-left bg-fill-info', compact ? 'inset-x-1.5' : 'inset-x-2.5')}
              initial={false}
              animate={{ scaleX: fraction }}
              transition={travel}
            />
          </div>
          {/* P5 — a dot per stop, smaller than the rail: light markers remain visible on the filled
              portion, while future stops stay a deeper blue against the quieter blue rail. */}
          {dots
            ? stops.map((stop, i) => (
                <motion.span
                  key={stop}
                  style={{ left: at(i) }}
                  initial={false}
                  animate={{ scale: i === preview ? 1.9 : 1 }}
                  transition={dotMotion}
                  data-hovered={i === preview ? '' : undefined}
                  className={cn(
                    'absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors',
                    compact ? 'size-1' : 'size-1.5',
                    i <= index
                      ? i === preview ? 'bg-text-inverse' : 'bg-text-inverse/70'
                      : i === preview ? 'bg-text-info' : 'bg-fill-info',
                  )}
                />
              ))
            : null}
          {/* Without chips, the hovered stop says what a click there sets. */}
          {preview != null && !chips ? (
            <span
              className={cn(
                'absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-surface-card px-1.5 text-role-caption font-semibold tabular-nums text-text-default shadow-sm ring-1 ring-inset ring-border-default',
                compact ? '-top-5' : '-top-6',
              )}
              style={{ left: at(preview) }}
              data-testid={testId ? `${testId}-preview` : undefined}
            >
              {stopLabel(stops[preview]!)}
            </span>
          ) : null}
          <motion.div className="absolute inset-0" initial={false} animate={{ x: `${fraction * 100}%` }} transition={travel}>
            <span
              className={cn(
                // P5 — neutral-gray, lifted grab target; press-and-hold darkens the face (colour only, no
                // geometry); the ring is keyboard focus only.
                'absolute left-0 top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-strong shadow-sm ring-1 ring-inset ring-border-emphasis transition-[filter] duration-100',
                compact ? 'size-8' : 'size-10',
                !disabled && 'group-has-[input:active]:brightness-95',
                'group-has-[input:focus-visible]:ring-2 group-has-[input:focus-visible]:ring-fill-info group-has-[input:focus-visible]:ring-offset-2 group-has-[input:focus-visible]:ring-offset-surface-card',
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
              ? '[&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-8'
              : '[&::-webkit-slider-thumb]:size-10 [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:size-10',
            disabled && 'cursor-not-allowed',
          )}
          data-testid={testId}
        />
      </div>
    </div>
  );
}
