'use client';

import { AnchoredLayer } from '@/design-system';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useIsMobile } from '@/hooks/_ui';
import { IconButton } from '@/design-system/primitives';
import { ClipboardList } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { GOAL_PANEL_SHELL_CLASS, STATION_LABEL, toneFor } from './goal-chip/goal-chip-shared';
import { useHeaderGoalChip } from './goal-chip/useHeaderGoalChip';
import { useNextWorkOrder } from './goal-chip/useNextWorkOrder';
import { GoalRing } from './goal-chip/GoalRing';
import { GoalPopover } from './goal-chip/GoalPopover';
import { NextWorkOrderRow } from './goal-chip/NextWorkOrderRow';
import { GoalPanelHomeCta } from './goal-chip/GoalPanelHomeCta';
import { ThrowTaskRow } from './goal-chip/ThrowTaskRow';
import { HEADER_ICON_BTN_CLASS, HEADER_ICON_BTN_OPEN_CLASS, HEADER_ICON_WRAP } from './header-shell';

/**
 * The header's **pace-and-next** button — one control for "how is today going"
 * and "what is next", opening one panel. Throw a task lives here too: the
 * account ⋯ menu is daily identity actions, not a second task drawer.
 *
 * ## Why they share a button
 *
 * They were two header occupants answering adjacent questions an operator asks
 * in the same breath, and each was thin on its own: the goal was a bare ring
 * with its counts in a tooltip, and the work order was an icon with no count
 * that rendered nothing at all whenever you were already on its record. One
 * button, one panel, one glance. Throw is a third adjacent question — "hand
 * this to a colleague" — and it is not "Add a task" on the personal to-do list.
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
 * - No goal and no work order, but the operator can throw (`work_orders.claim`)
 *   → the same clipboard glyph. Throw's discovery CTA lives in this panel, so
 *   the chip stays up whenever throw is reachable — never a hidden door.
 * - None of those, once both halves have settled → nothing. Absent, never
 *   disabled.
 *
 * ## Mobile is a SHEET, not the same 290px popover shrunk
 *
 * `MobileTopBar` mounts this exact component, so the panel has to work on a
 * phone — and an anchored 290px card hanging off a 390px bar is a desktop
 * artifact, not a mobile surface. Under `md` the same `GoalPopover` renders
 * inside {@link BottomSheet} (the house responsive-overlay SoT) in its `sheet`
 * stance: full width, drag-to-dismiss, 44px rows and 44px menu items.
 *
 * `surface` is a **required prop with no default** on the panel — a second host
 * cannot inherit the wrong density by omission, and the compiler names every
 * mount that has not answered.
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
  const isMobile = useIsMobile();
  const { has } = useAuth();
  const canThrow = has('work_orders.claim');

  const hasGoal = Boolean(g.user && g.goals && g.active && g.activeGoal && g.view);

  // Persistent header chrome paints an idle face through the first fetch rather
  // than popping in after it (source-of-truth.md → GlobalHeader zones). Once
  // both halves have settled empty *and* throw is not reachable, it hides.
  if (!g.user) return null;
  if (!hasGoal && !wo.top && !wo.loading && !canThrow) return null;

  if (!hasGoal) {
    const tip = wo.top
      ? `Next — ${wo.top.title}`
      : canThrow
        ? 'Throw a task'
        : 'Your next work order';
    const panelOpen = g.open && Boolean(wo.top || canThrow);
    return (
      <div ref={g.wrapRef} className={HEADER_ICON_WRAP} data-header-goal-chip>
        <HoverTooltip label={tip} asChild>
          <IconButton
            size="md"
            ariaLabel={tip}
            aria-expanded={g.open}
            disabled={!wo.top && !canThrow}
            onClick={() => g.setOpen((o) => !o)}
            className={cn(HEADER_ICON_BTN_CLASS, g.open && HEADER_ICON_BTN_OPEN_CLASS)}
            icon={<ClipboardList className={cn('h-4 w-4', wo.top || canThrow ? 'text-text-muted' : 'text-text-faint')} />}
          />
        </HoverTooltip>
        {isMobile ? (
          <BottomSheet open={panelOpen} onClose={g.closePopover} title="Up next">
            <div className="pb-2">
              {canThrow ? <ThrowTaskRow onOpen={g.closePopover} /> : null}
              {wo.top ? <NextWorkOrderRow top={wo.top} onNavigate={g.closePopover} /> : null}
              <GoalPanelHomeCta onNavigate={g.closePopover} />
            </div>
          </BottomSheet>
        ) : (
          <AnchoredLayer
            open={panelOpen}
            onClose={g.closePopover}
            anchorRef={g.wrapRef}
            placement="bottom-end"
            gap={0}
          >
            <div className={GOAL_PANEL_SHELL_CLASS}>
              {canThrow ? <ThrowTaskRow onOpen={g.closePopover} /> : null}
              {wo.top ? <NextWorkOrderRow top={wo.top} onNavigate={g.closePopover} /> : null}
              <GoalPanelHomeCta onNavigate={g.closePopover} />
            </div>
          </AnchoredLayer>
        )}
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
    <div ref={g.wrapRef} className={HEADER_ICON_WRAP} data-header-goal-chip>
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

      {isMobile ? (
        <BottomSheet open={g.open} onClose={g.closePopover}>
          <GoalPopover
            g={g}
            view={view}
            tone={tone}
            chipCount={chipCount}
            hasSwitch={hasSwitch}
            workOrder={wo.top}
            canThrow={canThrow}
            onNavigate={g.closePopover}
            surface="sheet"
          />
        </BottomSheet>
      ) : (
        <AnchoredLayer open={g.open} onClose={g.closePopover} anchorRef={g.wrapRef} placement="bottom-end" gap={0}>
          <GoalPopover
            g={g}
            view={view}
            tone={tone}
            chipCount={chipCount}
            hasSwitch={hasSwitch}
            workOrder={wo.top}
            canThrow={canThrow}
            onNavigate={g.closePopover}
            surface="popover"
          />
        </AnchoredLayer>
      )}
    </div>
  );
}
