'use client';

/**
 * The ± counter for one paired SKU on a scanned location. Identity belongs to
 * the host record (the stock position sheet header), never repeated here. The
 * number between − and + is the door to the Take / Put keypad.
 */

import { Minus, Plus, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
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
  /** Opens the Take / Put keypad for a bulk change. */
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

      {/* Direction is colour (owner 2026-10-05): − is rose, + is emerald, both
          deepen to a solid fill under the thumb; the live count takes the colour
          of the uncommitted change. */}
      <div className="flex items-stretch gap-2">
        <Button
          variant="dangerSoft"
          size="xl"
          radius="surface"
          className="flex-1 active:bg-rose-600 active:text-white"
          icon={<Minus />}
          ariaLabel={`Remove one ${content.sku}`}
          disabled={live === 0}
          onClick={() => onBump(-1)}
          data-testid="stock-qty-minus"
        />
        <Button
          variant="ghost"
          size="xl"
          radius="surface"
          ariaLabel={`${live} on hand — open keypad`}
          onClick={onOpenKeypad}
          className={cn(
            'w-20 shrink-0 font-mono text-role-title tabular-nums underline decoration-dotted decoration-2 underline-offset-4',
            pendingDelta < 0 ? 'text-rose-600' : pendingDelta > 0 ? 'text-emerald-700' : stockQtyToneClass(live),
          )}
          data-testid="stock-qty-keypad"
        >
          <span aria-live="polite">{live}</span>
        </Button>
        <Button
          variant="successSoft"
          size="xl"
          radius="surface"
          className="flex-1 active:bg-emerald-600 active:text-white"
          icon={<Plus />}
          ariaLabel={`Add one ${content.sku}`}
          onClick={() => onBump(1)}
          data-testid="stock-qty-plus"
        />
      </div>
    </div>
  );
}
