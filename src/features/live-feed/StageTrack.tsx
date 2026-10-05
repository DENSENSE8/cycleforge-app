'use client';

/**
 * Where a package is on To pick → Picked → Packed → Scanned out.
 * - `StageTrack`: four segments, filled up to the package's stage in its hue —
 *   readable at a glance on a card.
 * - `StageTimeline`: the same four steps as a vertical record — who did each
 *   step, when, and how long it waited before the next.
 */

import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { PACKAGE_STAGE_META, PACKAGE_STAGES, type PackageStage } from '@/lib/live-feed/stages';
import type { PackageCard, PackageStep } from '@/lib/live-feed/types';
import { cn } from '@/utils/_cn';
import { formatMonthDayTimePST } from '@/utils/date';
import { STAGE_LOOK } from './stage-look';

export function StageTrack({ stage, className }: { stage: PackageStage; className?: string }) {
  const reached = PACKAGE_STAGES.indexOf(stage);
  const look = STAGE_LOOK[stage];
  return (
    <span
      role="img"
      aria-label={`${PACKAGE_STAGE_META[stage].label} — step ${reached + 1} of ${PACKAGE_STAGES.length}`}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {PACKAGE_STAGES.map((step, index) => (
        <span
          key={step}
          className={cn('h-1.5 w-3.5 rounded-full', index <= reached ? look.solid : 'bg-slate-200')}
        />
      ))}
    </span>
  );
}

const STEP_OF: Readonly<Record<PackageStage, keyof PackageCard['steps']>> = {
  to_pick: 'ordered',
  picked: 'picked',
  packed: 'packed',
  scanned_out: 'scannedOut',
};

/** `1h 05m` / `3d 4h` between two instants; null when either is missing or out of order. */
function gapLabel(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function StageTimeline({ card }: { card: PackageCard }) {
  const reached = PACKAGE_STAGES.indexOf(card.stage);
  return (
    <ol className="relative flex flex-col" data-testid="live-feed-timeline">
      {PACKAGE_STAGES.map((stage, index) => {
        const step: PackageStep = card.steps[STEP_OF[stage]];
        const done = index <= reached;
        const current = index === reached;
        const look = STAGE_LOOK[stage];
        const next = index < PACKAGE_STAGES.length - 1 ? card.steps[STEP_OF[PACKAGE_STAGES[index + 1]!]] : null;
        const gap = done && next?.at ? gapLabel(step.at, next.at) : null;
        return (
          <li key={stage} className="relative flex gap-3 pb-5 last:pb-0">
            {index < PACKAGE_STAGES.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 rounded-full',
                  index < reached ? look.solid : 'bg-slate-200',
                )}
              />
            ) : null}
            <span
              className={cn(
                'relative z-raised flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                done ? cn(look.solid, 'text-white') : 'bg-slate-100 text-slate-400',
              )}
            >
              <look.Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn('text-sm font-semibold', done ? 'text-slate-900' : 'text-slate-400')}>
                  {PACKAGE_STAGE_META[stage].step}
                  {current ? (
                    <span className={cn('ml-2 rounded-full px-1.5 py-0.5 text-role-micro font-semibold', look.tile)}>Now</span>
                  ) : null}
                </p>
                {gap ? <span className="shrink-0 text-xs tabular-nums text-slate-400">+{gap}</span> : null}
              </div>
              {done ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  {step.at ? <span className="tabular-nums">{formatMonthDayTimePST(step.at)}</span> : <span>Time not recorded</span>}
                  {step.staffId ? (
                    <>
                      <span aria-hidden>·</span>
                      <StaffAvatar staffId={step.staffId} name={step.staffName} size="xs" />
                      <span className="truncate font-medium text-slate-700">{step.staffName ?? 'Staff'}</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">Not yet</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
