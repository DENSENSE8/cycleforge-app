'use client';

import { X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';

/**
 * The ONE header of every `/m/pick` screen (owner 2026-09-29): Close far left,
 * the walk as a segmented bar in the middle (one segment per order: picked
 * filled, the order in hand in ink), Skip far right. No words — the counts
 * live in the bar's ARIA only ("3 of 41 picked", `pickWalkProgress`). The list
 * screen passes neither verb: the bar alone.
 */
export function PickProgress({
  picked,
  total,
  active,
  onClose,
  onSkip,
  skipDisabled,
}: {
  picked: number;
  total: number;
  /** Index of the order in hand (0-based, over the same `total`). */
  active?: number;
  onClose?: () => void;
  onSkip?: () => void;
  skipDisabled?: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card py-1 pr-mode-page ${onClose ? 'pl-1' : 'pl-mode-page'}`}
      data-testid="pick-progress"
    >
      {onClose ? (
        <IconButton
          onClick={onClose}
          ariaLabel="Close"
          icon={<X className="h-6 w-6 text-text-default" />}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
        />
      ) : null}
      <ProgressBar
        current={picked}
        goal={total}
        segments={total > 0 ? total : undefined}
        activeSegment={active}
        ariaLabel={`${picked} of ${total} picked`}
        showPercentage={false}
        showRemaining={false}
        className="min-w-0 flex-1"
      />
      {onSkip ? (
        <Button variant="secondary" size="md" radius="pill" onClick={onSkip} disabled={skipDisabled} data-testid="pick-skip">
          Skip
        </Button>
      ) : null}
    </div>
  );
}
