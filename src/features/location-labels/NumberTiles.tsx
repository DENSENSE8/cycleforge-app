'use client';

import { useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { pad2 } from '@/lib/barcode-routing';

/** Grow the grid this many tiles at a time when the number is past the last one. */
const MORE_STEP = 10;

/**
 * Pick one number with one tap: an ordered grid of hit-size tiles, 1 → `count`,
 * and a "More" tile that adds the next ten (up to 99). No typing, no slider.
 */
export function NumberTiles({
  label,
  value,
  onPick,
  count,
  min = 1,
  pad = true,
  none,
  disabled = false,
  testId,
}: {
  /** The group's accessible name (`Aisle`, `Through`). */
  label: string;
  value: number | undefined;
  onPick: (n: number) => void;
  /** How many tiles show before More. */
  count: number;
  min?: number;
  /** Two-digit faces (aisle 03); levels read bare (3). */
  pad?: boolean;
  /** An extra first tile that picks nothing (`No position`). */
  none?: { label: string; selected: boolean; onPick: () => void };
  disabled?: boolean;
  testId?: string;
}) {
  const [shown, setShown] = useState(() => Math.min(99, Math.max(count, value ?? 0)));
  const numbers = Array.from({ length: Math.max(0, shown - min + 1) }, (_, i) => min + i);
  return (
    <div role="group" aria-label={label} className="grid grid-cols-5 gap-2 px-mode-page py-3" data-testid={testId}>
      {none ? (
        <Button
          variant={none.selected ? 'primary' : 'secondary'}
          size="lg"
          radius="surface"
          className="col-span-2 min-h-mode-hit-cta"
          aria-pressed={none.selected}
          disabled={disabled}
          onClick={none.onPick}
        >
          {none.label}
        </Button>
      ) : null}
      {numbers.map((n) => (
        <Button
          key={n}
          variant={value === n ? 'primary' : 'secondary'}
          size="lg"
          radius="surface"
          className="min-h-mode-hit-cta px-0 font-mono tabular-nums"
          aria-pressed={value === n}
          ariaLabel={`${label} ${n}`}
          disabled={disabled}
          onClick={() => onPick(n)}
        >
          {pad ? pad2(n) : String(n)}
        </Button>
      ))}
      {shown < 99 ? (
        <Button
          variant="ghost"
          size="lg"
          radius="surface"
          className="min-h-mode-hit-cta px-0"
          disabled={disabled}
          onClick={() => setShown((s) => Math.min(99, s + MORE_STEP))}
        >
          More
        </Button>
      ) : null}
    </div>
  );
}
