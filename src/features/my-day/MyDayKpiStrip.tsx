'use client';

/**
 * Today's due-horizon band — **Overdue · Due today · Upcoming**.
 *
 * Archetype: a **Monitor rollup region inside a Workbench page**, the same
 * arrangement `/dashboard` has (`OutboundKpiStrip` above the board). It composes
 * the house `KpiStrip` / `KpiTile` anatomy — eyebrow → hero, no second gauge
 * language — so Today reads as one family with the dashboards.
 *
 * **Why these three and not the obvious four.** A personal daily surface counts
 * WHEN work is due; that is what Zoho Projects' My Work (Overdue · Today ·
 * Upcoming), Asana's My Tasks and Monday's My Work all converge on. The
 * candidates that did not survive:
 *  · `Assigned` / `Needs attention` — already the lane tab counts, on the same
 *    screen. A KPI hero restating a tab is the duplication `display/workbench.md`
 *    warns about, and the two desync the moment a lane's predicate changes.
 *  · `Closed today` — there is no completion signal anywhere in `MyDayFeed`.
 *    Inventing one would be a placeholder metric; it waits for backend B0–B3.
 *  · `Unassigned` — real, org-wide, and shown nowhere, but it is a DISPATCH
 *    number about the team, not about this operator's day. Zoho puts exactly
 *    that number on a project dashboard rather than on My Work.
 *
 * **The honest limit, stated rather than hidden:** only work orders carry a
 * `deadlineAt`. Interrupts have none, so they count toward no tile — the band
 * measures the dated half of the day and the Needs-attention lane carries the
 * rest. `MyDayDueHorizon` returns `null` for them instead of folding them into
 * `upcoming`, which would claim a due date the record does not have.
 *
 * One settle gate: Today has exactly one source (`useMyDayFeed`), so there is no
 * second query to reflow under the operator — but the skeleton still reserves
 * the band's geometry so the grid below does not jump when counts land.
 *
 * Tiles filter through `?filter=` (a param `/` already owns), never local state,
 * so a filtered band is shareable and survives reload — Monitor filter-only, no
 * durable selection (`contextual-display.md`).
 */

import { KpiStrip, MONITOR_KPI_TILE_CLASS } from '@/design-system/components/monitor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  MY_DAY_DUE_HORIZONS,
  myDayDueHorizonLabel,
  type MyDayDueHorizon,
} from '@/lib/my-day/my-day-tasks';

/** Hero tone per horizon — overdue is the only one that is a problem. */
const HERO_TONE: Record<MyDayDueHorizon, string> = {
  overdue: 'text-text-danger',
  due_today: 'text-text-default',
  upcoming: 'text-text-muted',
};

const EXPLAINER: Record<MyDayDueHorizon, string> = {
  overdue: 'Tasks whose due date has passed (warehouse day).',
  due_today: 'Tasks due today.',
  upcoming: 'Tasks due after today.',
};

interface MyDayKpiStripProps {
  counts: Record<MyDayDueHorizon, number>;
  loading: boolean;
  /** The horizon currently narrowing the table, from `?filter=`. */
  active: MyDayDueHorizon | null;
  /** Toggle a horizon — the caller writes `?filter=`. */
  onToggle: (horizon: MyDayDueHorizon) => void;
}

export function MyDayKpiStrip({ counts, loading, active, onToggle }: MyDayKpiStripProps) {
  if (loading) {
    // Reserve the real geometry rather than showing a spinner — the grid below
    // must not jump when the counts settle (`display/workbench.md` → the four
    // settled states).
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-hidden>
        {MY_DAY_DUE_HORIZONS.map((horizon) => (
          <div key={horizon} className={cn(MONITOR_KPI_TILE_CLASS, 'animate-pulse')}>
            <div className="h-3 w-20 rounded bg-surface-hover" />
            <div className="mt-3 h-8 w-12 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <KpiStrip
      // Three tiles, so override the strip's 4-col default — a trailing empty
      // cell reads as a tile that failed to load.
      className="lg:grid-cols-3"
      items={MY_DAY_DUE_HORIZONS.map((horizon) => ({
        label: myDayDueHorizonLabel(horizon),
        value: (
          <HoverTooltip label={EXPLAINER[horizon]} focusable={false} asChild>
            <span>{counts[horizon]}</span>
          </HoverTooltip>
        ),
        valueClassName: HERO_TONE[horizon],
        onOpen: () => onToggle(horizon),
        active: active === horizon,
      }))}
    />
  );
}
