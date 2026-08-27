'use client';

import { Fragment } from 'react';
import { SerialChip, TrackingChip } from '@/components/ui/CopyChip';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { formatDatePST, formatStageClockTimePST } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { cn } from '@/utils/_cn';
import type { Milestone, MilestoneScan } from './milestone-pipeline-types';
import {
  hasMilestoneStamp,
  selectVisibleMilestones,
} from './select-visible-milestones';

/** Title line offset — the height the rail threads on every stage. */
const RAIL_TOP = 'top-[29px]';

/**
 * What the station read, as a trail.
 *
 * When a stage was stamped by reading a code, the honest answer is not the word
 * "Serial scan" — it is WHICH code. Each read is its own row, threaded by a
 * dotted rail, so a multi-unit stage reads as the sequence of reads it was.
 *
 * Values render through the HOUSE copy chips, never a local last-8.
 * `SerialChip` / `TrackingChip` derive their own display from the raw value,
 * carry their own tone and mark, and bring copy + hover-full-value with them. A
 * hand-rolled `.slice(-8)` beside them looks identical until the day the house
 * rule changes and the copy stops following.
 */
function ScanTrail({ scans }: { scans: MilestoneScan[] }) {
  if (scans.length === 0) return null;
  const threaded = scans.length > 1;
  return (
    <span className="mt-1 block">
      {scans.map((scan, i) => (
        <span
          key={`${scan.kind}-${scan.value}-${i}`}
          className={cn('flex items-stretch', threaded && 'gap-1')}
        >
          {threaded ? (
            <span className="flex w-2 shrink-0 flex-col items-center">
              {i < scans.length - 1 ? (
                <span
                  className="mt-4 w-px flex-1 border-l border-dashed border-border-soft"
                  aria-hidden
                />
              ) : null}
            </span>
          ) : null}
          <span className="min-w-0">
            {scan.kind === 'serial' ? (
              <SerialChip
                value={scan.value}
                width="w-fit max-w-full"
                dense
                // Flush with the timestamp above — default chip `px-1.5` would
                // indent the barcode past the date's left edge.
                outerPad="flush"
              />
            ) : scan.kind === 'tracking' ? (
              <TrackingChip
                value={scan.value}
                carrierHint={scan.carrier ?? null}
                width="w-fit max-w-full"
                dense
                outerPad="flush"
              />
            ) : (
              <span className="block text-role-eyebrow uppercase tracking-widest text-text-faint">
                {scan.value}
              </span>
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * A record's progress across stations — one left-to-right run, one anatomy.
 *
 * Every stage is the same four things: WHO did it (their face), WHAT stage it
 * was (past tense + the station's glyph), WHEN, and WHAT they read to stamp it.
 * A stage that has not happened shows the queue it is waiting in instead.
 *
 * Callers may pass the full station path; only stamped stages plus the true
 * next queue render — skipped holes and dim future stages are dropped, so a
 * two-stamp order stretches edge to edge rather than padding a blank third.
 *
 * ## Why this is not the wizard stepper
 *
 * `LinearWorkflowStepper` walks a FORM (Service → Issue → Contact → Review):
 * position only, no actor, no time, clickable. This walks a RECORD's history:
 * every stage carries a person and an instant. They were briefly the same
 * component with slot props bending one into the other, which is how a
 * component ends up with a `body` prop that replaces its own rendering. Two
 * nouns, two components, neither with a slot.
 *
 * ## The rail
 *
 * The rail runs THROUGH the title row — out of the stage name, across the
 * marker column, into the next stage — so it reads as one progression rather
 * than detached blocks. Two things make that work and both are load-bearing:
 * every stage keeps a same-size face box even when it has no face, and the
 * grid is `items-start` so the title line sits at a constant offset. Centre
 * them instead and a two-line stage and a four-line stage put the rail at
 * different heights.
 *
 * No layout animation (AGENTS.md).
 */
export function MilestonePipeline({
  milestones,
  ariaLabel,
  className,
}: {
  milestones: ReadonlyArray<Milestone>;
  ariaLabel: string;
  className?: string;
}) {
  // Re-render the instant the 12h/24h clock preference flips.
  useTimeFormat();

  const visible = selectVisibleMilestones(milestones);
  const done = visible.map((m) => hasMilestoneStamp(m.at));
  /** The live stage is the first without a stamp — exactly one, ever. */
  const activeIdx = done.indexOf(false);

  return (
    <nav aria-label={ariaLabel} className={cn('min-w-0', className)}>
      <ol className="flex w-full items-start">
        {visible.map((m, idx) => {
          const isDone = done[idx];
          const isActive = idx === activeIdx;
          const dim = !isDone && !isActive;
          const rule = (i: number) => (done[i] ? 'bg-blue-500' : 'bg-border-soft');

          return (
            <Fragment key={m.key}>
              {idx > 0 ? (
                // `min-w-6`, not `min-w-0`: a `flex-1` rail with no floor
                // collapses to nothing the moment the column is narrow, and the
                // run silently becomes detached blocks. The rail is what makes
                // them one progression — it must survive the squeeze even if
                // the labels have to. With two stages it is what stretches the
                // run edge to edge.
                <li aria-hidden className="min-w-6 flex-1 self-start pt-[29px]">
                  <span className={cn('block h-0.5 w-full rounded-full', rule(idx - 1))} />
                </li>
              ) : null}

              <li className="flex min-w-0 shrink-0 flex-col">
                <span className="grid grid-cols-[auto_1fr] items-start gap-x-2 text-left">
                  {/* Marker column. The rail crosses it at the title line's
                      height, so the face reads as a node ON the line rather
                      than a block interrupting it. */}
                  <span className="relative flex shrink-0 items-start">
                    {idx > 0 ? (
                      <span
                        className={cn(
                          'absolute inset-x-0 h-0.5 -translate-y-1/2 rounded-full',
                          RAIL_TOP,
                          rule(idx - 1),
                        )}
                        aria-hidden
                      />
                    ) : null}
                    {isDone && m.actor ? (
                      <span className="relative">
                        <StaffAvatar
                          staffId={m.actor.staffId}
                          name={m.actor.name || null}
                          size="lg"
                          alt=""
                        />
                      </span>
                    ) : (
                      // Same box, no mark — holds the title line at the height
                      // the rail expects on every stage.
                      <span className="h-11 w-11 shrink-0" aria-hidden />
                    )}
                  </span>

                  <span className="min-w-0">
                    {/* Line 1 — who, or what this is waiting for. */}
                    <span
                      className={cn(
                        'block truncate text-sm font-semibold',
                        isDone
                          ? 'text-text-default'
                          : isActive
                            ? 'text-blue-700'
                            : 'text-text-faint',
                      )}
                    >
                      {isDone ? m.actor?.name || m.detail || 'Unattributed' : m.readyLabel}
                    </span>

                    {/* Line 2 — the stage, its glyph, then the rail out. */}
                    <span
                      className={cn(
                        'flex w-full items-center gap-1 whitespace-nowrap text-sm font-semibold',
                        dim ? 'text-text-faint' : 'text-text-default',
                      )}
                    >
                      {m.label}
                      <span
                        className={cn(
                          'flex shrink-0 items-center',
                          isActive
                            ? 'text-blue-600'
                            : dim
                              ? 'text-text-faint/60'
                              : 'text-text-muted',
                        )}
                        aria-hidden
                      >
                        {m.icon}
                      </span>
                      {idx < visible.length - 1 ? (
                        <span
                          className={cn(
                            'ml-1 h-0.5 min-w-2 flex-1 rounded-full',
                            rule(idx),
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </span>

                    {/* Line 3 — when. One instant, one line. */}
                    {isDone ? (
                      <span className="block whitespace-nowrap text-role-caption tabular-nums text-text-muted">
                        {formatDatePST(m.at, { withLeadingZeros: true })},{' '}
                        {formatStageClockTimePST(m.at)}
                      </span>
                    ) : null}

                    {isDone ? <ScanTrail scans={m.scans ?? []} /> : null}
                  </span>
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
