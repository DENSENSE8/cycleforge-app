'use client';

/**
 * The Fulfilled board's first level of disclosure, in the Live feed's
 * headline style: what needs a hand now (and how many of those are over
 * their threshold), the named pressures — Late, Stalled, No movement — each
 * only when it says something, the check-ins due, and what the carriers
 * delivered in the window — and, only when true, one quiet line that a
 * carrier's sync is failing (`fulfilledSyncWarning`); then a dot that says how fresh the answer is.
 */

import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cn } from '@/utils/_cn';
import type { FulfilledHeadlineFigures } from './fulfilled-board-model';

export function FulfilledHeadline({ figures, syncWarning }: { figures: FulfilledHeadlineFigures; syncWarning: string | null }) {
  const pressing = figures.actNowOver > 0;
  const rows = [
    {
      id: 'act',
      label: 'Act now',
      value: figures.actNow,
      tone: pressing ? STATE_TONE_CLASSES.danger.text : 'text-text-default',
      labelTone: pressing ? STATE_TONE_CLASSES.danger.text : 'text-text-muted',
      note: pressing ? `${figures.actNowOver} over` : null,
      show: true,
    },
    { id: 'late', label: 'Late', value: figures.late, tone: STATE_TONE_CLASSES.warning.text, labelTone: STATE_TONE_CLASSES.warning.text, note: null, show: figures.late > 0 },
    { id: 'stalled', label: 'Stalled', value: figures.stalled, tone: STATE_TONE_CLASSES.warning.text, labelTone: STATE_TONE_CLASSES.warning.text, note: null, show: figures.stalled > 0 },
    {
      id: 'no-movement',
      label: 'No movement',
      value: figures.noMovement,
      tone: STATE_TONE_CLASSES.danger.text,
      labelTone: STATE_TONE_CLASSES.danger.text,
      note: null,
      show: figures.noMovement > 0,
    },
    { id: 'check-ins', label: 'Check-ins due', value: figures.checkInsDue, tone: 'text-text-default', labelTone: 'text-text-muted', note: null, show: true },
    { id: 'delivered', label: 'Delivered', value: figures.delivered, tone: STATE_TONE_CLASSES.success.text, labelTone: 'text-text-muted', note: null, show: true },
  ];
  return (
    <div className="flex flex-col gap-1" data-testid="fulfilled-board-headline">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      {rows
        .filter((row) => row.show)
        .map((row) => (
          <div key={row.id} data-figure={row.id}>
            <p className={cn('whitespace-nowrap text-xs font-medium uppercase tracking-wider', row.labelTone)}>{row.label}</p>
            <p className="flex items-baseline gap-2">
              <span className={cn('text-3xl font-semibold tabular-nums tracking-tight', row.tone)}>
                <AnimatedStat value={row.value} />
              </span>
              {row.note ? <span className={cn('whitespace-nowrap text-sm font-semibold tabular-nums', STATE_TONE_CLASSES.danger.text)}>{row.note}</span> : null}
            </p>
          </div>
        ))}
      </div>
      {syncWarning ? (
        <p className={cn('text-xs font-medium', STATE_TONE_CLASSES.warning.text)} role="status" data-testid="fulfilled-board-sync-warning">
          {syncWarning}
        </p>
      ) : null}
    </div>
  );
}

/** How fresh the answer is: a dot that pulses while the window is being re-read, and when it last arrived. */
export function FreshnessDot({ updatedAt, now, fetching }: { updatedAt: number; now: number | null; fetching: boolean }) {
  const minutes = now != null && updatedAt ? Math.max(0, Math.floor((now - updatedAt) / 60_000)) : null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-text-muted" aria-live="polite" data-testid="fulfilled-board-freshness">
      <span className="relative flex size-2">
        {/* `now` is null through hydration, so the pulse waits for the mount. */}
        <span className={cn('absolute inline-flex size-full rounded-full opacity-75', STATE_TONE_CLASSES.success.dot, fetching && now != null && 'animate-ping')} />
        <span className={cn('relative inline-flex size-2 rounded-full', STATE_TONE_CLASSES.success.dot)} />
      </span>
      {fetching ? 'Updating…' : minutes == null ? 'Updated' : minutes < 1 ? 'Updated just now' : `Updated ${minutes}m ago`}
    </span>
  );
}
