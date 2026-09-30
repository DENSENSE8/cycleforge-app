'use client';

import { X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';

/**
 * The ONE header of a phone job's list and its walk (owner 2026-09-29; first
 * `/m/pick`, then `/m/qc`): Close far left, the job as a segmented bar in the
 * middle (one segment per unit of work: done filled, the one in hand in ink),
 * Skip far right. No words — the counts live in the bar's ARIA only ("3 of 41
 * picked", "3 of 625 tested"). A list screen passes neither verb: the bar alone.
 */
export function JobProgress({
  done,
  total,
  doneWord,
  active,
  onClose,
  onSkip,
  skipDisabled,
}: {
  done: number;
  total: number;
  /** The ARIA's verb for a finished unit: "picked", "tested". */
  doneWord: string;
  /** Index of the unit in hand (0-based, over the same `total`). */
  active?: number;
  onClose?: () => void;
  onSkip?: () => void;
  skipDisabled?: boolean;
}) {
  return (
    <div
      className={`flex min-h-12 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card py-1 pr-mode-page ${onClose ? 'pl-1' : 'pl-mode-page'}`}
      data-testid="job-progress"
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
        current={done}
        goal={total}
        segments={total > 0 ? total : undefined}
        activeSegment={active}
        ariaLabel={`${done} of ${total} ${doneWord}`}
        showPercentage={false}
        showRemaining={false}
        className="min-w-0 flex-1"
      />
      {onSkip ? (
        <Button variant="secondary" size="md" radius="pill" onClick={onSkip} disabled={skipDisabled} data-testid="job-skip">
          Skip
        </Button>
      ) : null}
    </div>
  );
}
