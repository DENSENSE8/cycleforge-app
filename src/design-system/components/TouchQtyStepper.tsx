'use client';

import { Minus, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

/**
 * The phone's quantity control: − · value · + as one flush band of three
 * full-height cells (`min-h-mode-hit-cta`, 48–56 px on touch). A tap target,
 * not a steering task — no slider tunnel, no precision drag (V2_OBJECT_FIRST §4 F3, F7).
 */
export function TouchQtyStepper({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  unit,
  label,
  disabled = false,
  testId,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Singular and plural noun under the value (`['label', 'labels']`, `['unit', 'units']`). */
  unit: readonly [singular: string, plural: string];
  /** The group's accessible name (`Labels to print`, `Quantity to move`). */
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  const cell = 'min-h-mode-hit-cta w-full shadow-none ring-0';
  const noun = value === 1 ? unit[0] : unit[1];
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 divide-x divide-mode-rule bg-mode-panel" data-testid={testId}>
      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        className={cell}
        icon={<Minus />}
        ariaLabel={`One fewer ${unit[0]}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <span aria-live="polite" aria-label={`${value} ${noun}`} className="flex flex-col items-center justify-center text-text-default">
        <span className="font-mono text-role-title font-semibold tabular-nums">{value}</span>
        <span className="text-role-caption text-text-muted">{noun}</span>
      </span>
      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        className={cell}
        icon={<Plus />}
        ariaLabel={`One more ${unit[0]}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      />
    </div>
  );
}
