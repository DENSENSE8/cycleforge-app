'use client';

/**
 * Today's due-horizon refine — **Overdue · Today · Upcoming** — as chrome, not
 * as a body band.
 *
 * Replaces `MyDayKpiStrip` (deleted 2026-08-01). The band was a Monitor rollup
 * region inside a Workbench page, the same arrangement `/dashboard` has, and it
 * was the single largest consumer of vertical space above the grid. A KPI hero
 * claims "this is a metric worth reading"; these three are a **facet** the
 * operator clicks to narrow the table, and the surface already proved that by
 * wiring them to `?filter=` rather than to a drill-out. A facet belongs beside
 * the other refine controls, at chrome scale.
 *
 * **Why these stay a filter and did NOT become tabs.** The obvious reading of
 * "collapse the KPI into tab badges" is to append Overdue / Today / Upcoming to
 * the lane strip. That would be wrong twice over:
 *  · The lane tabs are a *different axis*. Lane (`?scope=`) and horizon
 *    (`?filter=`) compose — "Assigned **and** overdue" is a real question an
 *    operator asks, and one mutually-exclusive strip cannot express it. The
 *    lane tabs would also have to give up their own counts to carry horizon
 *    counts, which is a straight loss.
 *  · `display/workbench-ops-queue.md` → *Tabs vs. saved views* draws the line
 *    on who defines the set: a tab is a **system lifecycle state** whose
 *    addition would need a migration; a different combination of params the
 *    surface already reads is a filter. Due horizon is derived in the client
 *    from `deadlineAt`, so it is a filter by that test.
 *
 * So the KPI's *altitude* moved (body → chrome) and its *cardinality* did not.
 * Urgency survives as tone on the Overdue chip rather than as a hero number —
 * which is what a badge is for.
 *
 * Geometry is state-invariant: the lit state adds `ring-inset` + a fill, never
 * padding or weight, so toggling cannot shift the band's baseline
 * (`ui-design-system.md` → one-row anatomy).
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  MY_DAY_DUE_HORIZONS,
  myDayDueHorizonShortLabel,
  type MyDayDueHorizon,
} from '@/lib/my-day/my-day-tasks';

const EXPLAINER: Record<MyDayDueHorizon, string> = {
  overdue: 'Tasks whose due date has passed (warehouse day).',
  due_today: 'Tasks due today.',
  upcoming: 'Tasks due after today.',
};

/** Idle tone. Overdue is the only horizon that is a problem, so it is the only one that colours. */
function idleToneClass(horizon: MyDayDueHorizon, count: number): string {
  if (horizon === 'overdue' && count > 0) {
    return 'text-text-danger hover:bg-rose-50';
  }
  return 'text-text-muted hover:bg-surface-hover hover:text-text-default';
}

interface MyDayDueHorizonChipsProps {
  counts: Record<MyDayDueHorizon, number>;
  loading: boolean;
  /** The horizon currently narrowing the table, from `?filter=`. */
  active: MyDayDueHorizon | null;
  /** Toggle a horizon — the caller writes `?filter=`. */
  onToggle: (horizon: MyDayDueHorizon) => void;
}

export function MyDayDueHorizonChips({
  counts,
  loading,
  active,
  onToggle,
}: MyDayDueHorizonChipsProps) {
  return (
    <div className="flex min-w-0 items-center gap-0.5" data-testid="my-day-due-horizon">
      {MY_DAY_DUE_HORIZONS.map((horizon) => {
        const count = counts[horizon];
        const isActive = active === horizon;
        return (
          <HoverTooltip key={horizon} label={EXPLAINER[horizon]} focusable={false} asChild>
            {/* ds-raw-button: HoverTooltip asChild Slot — IconButton would disturb the clone */}
            <button
              type="button"
              // A toggle, not a link: clicking the lit chip clears the refine,
              // so the band is its own escape hatch.
              aria-pressed={isActive}
              onClick={() => onToggle(horizon)}
              className={cn(
                'ds-raw-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 transition-colors',
                focusRing('control', 'accent'),
                isActive
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-400'
                  : idleToneClass(horizon, count),
              )}
            >
              <span className="truncate text-role-caption font-medium">
                {myDayDueHorizonShortLabel(horizon)}
              </span>
              {loading ? (
                // Reserve the count's box rather than collapsing it — the chips
                // must not re-flow the band when the feed settles.
                <span
                  aria-hidden
                  className="h-3 w-3 animate-pulse rounded bg-surface-hover"
                />
              ) : (
                <span className="text-role-micro tabular-nums text-text-soft">{count}</span>
              )}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
