'use client';

/**
 * Time to pack — ONE drag control for a SKU's standard pack time.
 * The operator's ask (2026-09-15): *"a slider like time to pack 10 15 20 25 30
 */

import {
  MAX_PACK_STOP_INDEX,
  PACK_STANDARD_MINUTE_STOPS,
  formatPackMinutes,
  minutesForStopIndex,
  stopIndexForMinutes,
  tierForMinutes,
} from '@/lib/packing/pack-standard-stops';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const TIER_LABEL = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large' } as const;

const FIRST_STOP = PACK_STANDARD_MINUTE_STOPS[0];
const LAST_STOP = PACK_STANDARD_MINUTE_STOPS[MAX_PACK_STOP_INDEX];

export function PackTimeSlider({
  minutes,
  onMinutes,
  disabled,
  className,
}: {
  /** Current standard time in whole minutes (any value — it snaps to a stop). */
  minutes: number;
  onMinutes: (minutes: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const index = stopIndexForMinutes(minutes);
  const snapped = minutesForStopIndex(index);
  const tier = tierForMinutes(snapped);

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {/* Read-out above the track: the number the drag is choosing, plus the
          tier it rolls up to, so the operator sees the consequence. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-text-default">
          {formatPackMinutes(snapped)}
        </span>
        <span className="text-role-eyebrow text-text-soft">
          {TIER_LABEL[tier]}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={MAX_PACK_STOP_INDEX}
        step={1}
        value={index}
        disabled={disabled}
        aria-label="Time to pack"
        aria-valuetext={formatPackMinutes(snapped)}
        onChange={(e) => onMinutes(minutesForStopIndex(Number(e.target.value)))}
        className={cn(
          'h-9 w-full min-w-0 cursor-pointer accent-[var(--ds-color-accent-text)]',
          focusRing('field', 'accent'),
          disabled && 'cursor-not-allowed opacity-50',
        )}
      />

      {/* Endpoints name the range so the thumb position means something before
          the operator drags it. */}
      <div className="flex items-center justify-between text-role-micro tabular-nums text-text-soft">
        <span>{formatPackMinutes(FIRST_STOP)}</span>
        <span>{formatPackMinutes(LAST_STOP)}</span>
      </div>
    </div>
  );
}
