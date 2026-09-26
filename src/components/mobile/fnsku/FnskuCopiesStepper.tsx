'use client';

import { Minus, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { MAX_LABEL_COPIES } from '@/lib/print/labelCopies';

/**
 * How many FBA labels the hub's Reprint sends (operator 2026-09-25: "I must be
 * able to adjust the count of how many I'm printing"). − / count / +, 1 to
 * {@link MAX_LABEL_COPIES}; the dock's Reprint reads the count back
 * (`Reprint 3 labels`). Lives in the hub's `content` slot, above the Printer
 * door — a working value, not a fact, so it never goes on the card.
 *
 * Edge to edge like the dock: three flush cells, a mode rule between them.
 */
export function FnskuCopiesStepper({ copies, onCopies }: { copies: number; onCopies: (next: number) => void }) {
  const cell = 'min-h-mode-hit-cta w-full shadow-none ring-0';
  return (
    <div role="group" aria-label="Labels to print" className="grid grid-cols-3 divide-x divide-mode-rule bg-mode-panel">
      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        className={cell}
        icon={<Minus />}
        ariaLabel="One fewer label"
        disabled={copies <= 1}
        onClick={() => onCopies(copies - 1)}
      />
      <span
        aria-live="polite"
        aria-label={`${copies} ${copies === 1 ? 'label' : 'labels'}`}
        className="flex flex-col items-center justify-center text-text-default"
      >
        <span className="font-mono text-role-title font-semibold tabular-nums">{copies}</span>
        <span className="text-role-caption text-text-muted">{copies === 1 ? 'label' : 'labels'}</span>
      </span>
      <Button
        variant="secondary"
        size="lg"
        radius="flush"
        className={cell}
        icon={<Plus />}
        ariaLabel="One more label"
        disabled={copies >= MAX_LABEL_COPIES}
        onClick={() => onCopies(copies + 1)}
      />
    </div>
  );
}
