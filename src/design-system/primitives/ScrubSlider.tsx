'use client';

/**
 * A drag-to-scrub value slider — the first consumer of the cursor scrub
 * channel, and the house's only slider.
 *
 * The value is stated TWICE and that is deliberate: once in the DOM beside the
 * label, where touch, keyboard and screen-reader users read it, and again on
 * the cursor mid-drag, where the eye already is. Delete the DOM copy and the
 * control becomes mouse-only.
 *
 * Pointer capture, not a window listener: the drag has to survive the hand
 * overshooting the track, which is most of what scrubbing IS. The cursor
 * readout survives with it because the scrub channel is a module store rather
 * than something read off the hovered element.
 *
 * Keyboard is not an afterthought — arrows step, shift-arrows take a coarse
 * step, Home/End pin the ends. `role="slider"` with the three aria-value
 * attributes is what makes it a slider to anything that is not a mouse.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { cursorMorphTarget, useCursorScrub } from '@/design-system/motion';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function ScrubSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  coarseStep = 10,
  format = (v: number) => String(v),
  className,
  'data-testid': testId = 'scrub-slider',
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shift+arrow travel. */
  coarseStep?: number;
  /** Owns the units — the cursor never guesses what the number means. */
  format?: (value: number) => string;
  className?: string;
  'data-testid'?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const labelId = useId();

  const clamp = useCallback(
    (next: number) => {
      const snapped = Math.round(next / step) * step;
      return Math.min(max, Math.max(min, snapped));
    },
    [min, max, step],
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;
      const box = track.getBoundingClientRect();
      if (box.width === 0) return value;
      const ratio = (clientX - box.left) / box.width;
      return clamp(min + ratio * (max - min));
    },
    [clamp, min, max, value],
  );

  // Mid-drag the cursor carries the exact number, so the eye never leaves the
  // hand. The same number stays painted beside the label below.
  useCursorScrub({ active: scrubbing, label, value: format(value) });

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const travel = event.shiftKey ? coarseStep : step;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(clamp(value - travel));
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(clamp(value + travel));
    else if (event.key === 'Home') onChange(min);
    else if (event.key === 'End') onChange(max);
    else return;
    event.preventDefault();
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)} data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span id={labelId} className="text-role-caption text-text-muted">
          {label}
        </span>
        {/* The DOM copy. Never remove it to lean on the cursor readout. */}
        <span className="text-role-caption tabular-nums text-text-default" data-testid={`${testId}-value`}>
          {format(value)}
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        data-scrubbing={scrubbing ? '' : undefined}
        {...cursorMorphTarget(label)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setScrubbing(true);
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!scrubbing) return;
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setScrubbing(false);
        }}
        onPointerCancel={() => setScrubbing(false)}
        className={cn(
          cornerClass('pill'),
          'relative h-2 w-full cursor-ew-resize bg-surface-sunken',
          focusRing('control', 'accent'),
        )}
      >
        <div
          className={cn(cornerClass('pill'), 'absolute inset-y-0 left-0 bg-surface-inverse')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
