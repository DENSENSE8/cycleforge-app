'use client';

/**
 * The ± counter for one paired SKU on a scanned location. Identity belongs to
 * the host record (the stock position sheet header), never repeated here.
 */

import { Minus, Plus, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import type { LocationBindContent } from './location-bind-types';

export function LocationQtyStrip({
  content,
  pendingDelta,
  onBump,
  onCancelPending,
  onOpenKeypad,
}: {
  content: LocationBindContent;
  /** Uncommitted signed delta for this SKU. Zero when settled. */
  pendingDelta: number;
  /** Returns false when the clamp refused the tap (would go below zero). */
  onBump: (step: number) => boolean;
  onCancelPending: () => void;
  onOpenKeypad: () => void;
}) {
  const live = Math.max(0, content.qty + pendingDelta);
  const hasPending = pendingDelta !== 0;

  return (
    <div className="flex flex-col gap-2">
      {/* The pending line only exists while a burst is uncommitted. */}
      {hasPending && (
        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            className={cn(
              'text-role-caption font-semibold tabular-nums',
              pendingDelta < 0 ? 'text-rose-600' : 'text-emerald-600',
            )}
          >
            {pendingDelta < 0 ? '−' : '+'}
            {Math.abs(pendingDelta)} from {content.qty}
          </span>
          <IconButton
            type="button"
            size="md"
            radius="flush"
            ariaLabel={`Cancel pending change to ${content.sku}`}
            icon={<X className="h-4 w-4" />}
            onClick={onCancelPending}
            className="text-text-muted"
          />
        </div>
      )}

      {/* Keypad left of the minus: */}
      <div className="flex items-stretch gap-2">
        <Button
          variant="ghost"
          size="lg"
          radius="surface"
          className="shrink-0"
          ariaLabel={`Type an exact quantity for ${content.sku}`}
          onClick={onOpenKeypad}
        >
          123
        </Button>
        <Button
          variant="secondary"
          size="lg"
          radius="surface"
          className="flex-1"
          icon={<Minus />}
          ariaLabel={`Remove one ${content.sku}`}
          disabled={live === 0}
          onClick={() => onBump(-1)}
        />
        <span
          aria-live="polite"
          aria-label={`${live} on hand`}
          className="flex w-20 shrink-0 items-center justify-center font-mono text-role-title font-semibold tabular-nums text-text-default"
        >
          {live}
        </span>
        <Button
          variant="primary"
          size="lg"
          radius="surface"
          className="flex-1"
          icon={<Plus />}
          ariaLabel={`Add one ${content.sku}`}
          onClick={() => onBump(1)}
        />
      </div>
    </div>
  );
}
