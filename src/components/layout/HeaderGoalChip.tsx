'use client';

import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { ClipboardList } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { GOAL_PANEL_SHELL_CLASS, STATION_LABEL, toneFor } from './goal-chip/goal-chip-shared';
import { useHeaderGoalChip } from './goal-chip/useHeaderGoalChip';
import { useNextWorkOrder } from './goal-chip/useNextWorkOrder';
import { GoalRing } from './goal-chip/GoalRing';
import { GoalPopover } from './goal-chip/GoalPopover';
import { NextWorkOrderRow } from './goal-chip/NextWorkOrderRow';
import { HEADER_ICON_BTN_CLASS, HEADER_ICON_BTN_OPEN_CLASS, HEADER_ICON_WRAP } from './header-shell';

/**
 * The header's **pace-and-next** button — one control for "how is today going"
 * and "what is next", opening one panel.
 *
 * ## Why they share a button
 *
 * They were two header occupants answering adjacent questions an operator asks
 * in the same breath, and each was thin on its own: the goal was a bare ring
 * with its counts in a tooltip, and the work order was an icon with no count
 * that rendered nothing at all whenever you were already on its record. One
 * button, one panel, one glance.
 *
 * ## What this does NOT do — the ring did not absorb the work order
 *
 * The 2026-08-08 ring ruling stands and is the thing to re-read before
 * "simplifying" this: a ring encodes progress toward a target — a **bounded
 * fraction** — and a queue item has no denominator, so folding it into the arc
 * would mean inventing one. The arc still means today's scans against today's
 * goal and nothing else; the work order is a **row in the panel**. Sharing a
 * button is not sharing a metric.
 *
 * ## The closed face tells the truth about what is behind it
 *
 * - A goal exists → the ring, as before.
 * - No goal, but a work order → a clipboard glyph. A 0% ring on a day with no
 *   goal set would be chrome inventing a second story.
 * - Neither, once both have settled → nothing. Absent, never disabled.
 *
 * ## Corner mark is recurring-due only
 *
 * A recurring task coming due is time-critical and owns the corner with a rose
 * ping. A waiting work order is a standing fact already named in the tooltip
 * and panel row — no second corner mark on a 32px button (same argument that
 * rejected two rings in the header).
 */
export function HeaderGoalChip() {
  const g = useHeaderGoalChip();
  const wo = useNextWorkOrder();

  const hasGoal = Boolean(g.user && g.goals && g.active && g.activeGoal && g.view);

  // Persistent header chrome paints an idle face through the first fetch rather
  // than popping in after it (source-of-truth.md → GlobalHeader zones). Once
  // both halves have settled empty, it hides.
  if (!g.user) return null;
  if (!hasGoal && !wo.top && !wo.loading) return null;

  if (!hasGoal) {
    const tip = wo.top ? `Next — ${wo.top.title}` : 'Your next work order';
    return (
      <div ref={g.wrapRef} className={HEADER_ICON_WRAP}>
        <HoverTooltip label={tip} asChild>
          <IconButton
            size="md"
            ariaLabel={tip}
            aria-expanded={g.open}
            disabled={!wo.top}
            onClick={() => g.setOpen((o) => !o)}
            className={cn(HEADER_ICON_BTN_CLASS, g.open && HEADER_ICON_BTN_OPEN_CLASS)}
            icon={<ClipboardList className={cn('h-4 w-4', wo.top ? 'text-text-muted' : 'text-text-faint')} />}
          />
        </HoverTooltip>
        <AnchoredLayer
          open={g.open && !!wo.top}
          onClose={g.closePopover}
          anchorRef={g.wrapRef}
          placement="bottom-end"
          gap={0}
        >
          <div className={GOAL_PANEL_SHELL_CLASS}>
            {wo.top ? <NextWorkOrderRow top={wo.top} onNavigate={g.closePopover} /> : null}
          </div>
        </AnchoredLayer>
      </div>
    );
  }

  const view = g.view!;
  const chipCount =
    g.mode === 'scans'
      ? { value: view.scanCount, total: view.target, unit: 'scans' }
      : { value: view.done, total: view.total, unit: 'tasks' };
  const tone = toneFor(view.percent, chipCount.value);
  const hasSwitch = g.goals!.length > 1;
  const tip = `${STATION_LABEL[g.active!]} · ${chipCount.value}/${chipCount.total} ${chipCount.unit}${
    g.recurDue ? ' · recurring due' : ''
  }${wo.top ? ' · 1 work order' : ''}`;

  return (
    <div ref={g.wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={tip} asChild>
        <IconButton
          size="md"
          ariaLabel={`Daily goal — ${tip}`}
          aria-expanded={g.open}
          onClick={() => g.setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, g.open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<GoalRing percent={view.percent} color={tone.ring} size={16} strokeWidth={2} />}
        />
      </HoverTooltip>

      {/* Recurring-due corner ping only — see the docblock. */}
      {g.recurDue ? (
        <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        </span>
      ) : null}

      <AnchoredLayer open={g.open} onClose={g.closePopover} anchorRef={g.wrapRef} placement="bottom-end" gap={0}>
        <GoalPopover
          g={g}
          view={view}
          tone={tone}
          chipCount={chipCount}
          hasSwitch={hasSwitch}
          workOrder={wo.top}
          onNavigate={g.closePopover}
        />
      </AnchoredLayer>
    </div>
  );
}
