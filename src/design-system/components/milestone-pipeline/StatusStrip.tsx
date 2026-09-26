'use client';

/** FIND / confirmation status — rewrite of the station pipeline face. */

import { SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { formatDatePST, formatStageClockTimePST } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { cn } from '@/utils/_cn';
import type { Milestone, MilestoneScan } from './milestone-pipeline-types';
import {
  hasMilestoneStamp,
  selectVisibleMilestones,
} from './select-visible-milestones';

function StampScans({ scans }: { scans: MilestoneScan[] }) {
  const chips = scans.filter((scan) => scan.kind !== 'note');
  if (chips.length === 0) return null;
  return (
    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
      {chips.map((scan, i) =>
        scan.kind === 'serial' ? (
          <SerialChip
            key={`serial-${scan.value}-${i}`}
            value={scan.value}
            width="w-fit max-w-full"
            dense
            outerPad="flush"
          />
        ) : (
          <TrackingChip
            key={`tracking-${scan.value}-${i}`}
            value={scan.value}
            carrierHint={scan.carrier ?? null}
            width="w-fit max-w-full"
            dense
            outerPad="flush"
          />
        ),
      )}
    </span>
  );
}

export function StatusStrip({
  milestones,
  ariaLabel,
  className,
}: {
  milestones: ReadonlyArray<Milestone>;
  ariaLabel: string;
  className?: string;
}) {
  useTimeFormat();
  const visible = selectVisibleMilestones(milestones);
  const done = visible.map((m) => hasMilestoneStamp(m.at));

  return (
    <nav aria-label={ariaLabel} className={cn('min-w-0', className)}>
      <ol className="flex w-full items-start">
        {visible.map((m, idx) => {
          const isDone = done[idx];
          const isLast = idx === visible.length - 1;
          return (
            <li key={m.key} className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-6 items-center gap-2">
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                    isDone ? 'bg-blue-500' : 'bg-border-emphasis',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'min-w-0 truncate text-role-data font-semibold',
                    isDone ? 'text-text-default' : 'text-text-faint',
                  )}
                >
                  {isDone ? m.label : m.readyLabel}
                </span>
                {isDone ? (
                  <span className="flex shrink-0 items-center text-text-muted" aria-hidden>
                    {m.icon}
                  </span>
                ) : null}
                {isLast ? null : (
                  <span
                    className={cn(
                      'h-px min-w-4 flex-1 rounded-full',
                      isDone ? 'bg-blue-500' : 'bg-border-soft',
                    )}
                    aria-hidden
                  />
                )}
              </div>
              {isDone ? (
                <time
                  className="block whitespace-nowrap text-role-caption tabular-nums text-text-muted"
                  dateTime={m.at ?? undefined}
                >
                  {formatDatePST(m.at, { withLeadingZeros: true })},{' '}
                  {formatStageClockTimePST(m.at)}
                </time>
              ) : null}
              {isDone ? <StampScans scans={m.scans ?? []} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
