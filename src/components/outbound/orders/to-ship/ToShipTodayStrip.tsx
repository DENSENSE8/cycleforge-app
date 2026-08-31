'use client';

/**
 * To-ship's **today strip** — the desk's status overview, on entry, at zero
 * interactions.
 *
 * Three numbers and no fourth: what is open, what must go today, and what
 * already went. That is the whole shape the operator asked for
 * (`shipping-desk-to-ship-prep-shipped-PLAN.md` §3.2) and the reason it is a
 * STRIP and not a KPI band — a desk whose job is clearing a queue answers
 * "where do I stand" in one glance or it has spent a row for nothing.
 *
 * ## It costs no extra request
 *
 * Every number reads off the SAME `unshippedQueueCountsQuery` key the filter
 * popover already mounts, seeded server-side by `seedUnshippedQueue`. Adding a
 * second fetch for a status line would have made the overview the slowest thing
 * on the page.
 *
 * ## Shipped today is a HANDOFF, not a lens
 *
 * Clicking it navigates to the Shipped desk with today's window
 * ({@link shippedTodayHref}) instead of swapping this table into archive mode.
 * That is the whole IA split: To ship acts on open work, Shipped finds what
 * already left, and a queue that can quietly become a history table is the
 * thing being undone.
 *
 * ## Must ship is the one refine worth a chip
 *
 * The triage facets live in the table's filter popover, which is two
 * interactions deep. Late/at-risk is the one an operator reaches for every
 * shift, so it also rides here as a toggle — same `?late=1` URL contract, same
 * `applyToShipTriageFacet` writer, no second vocabulary.
 *
 * Not rendered in fullscreen: the operator pressed ⤢ to buy exactly these rows
 * back.
 */

import Link from 'next/link';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDeskStageOptional } from '@/components/desk/desk-stage-context';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import {
  applyToShipTriageFacet,
  getToShipTriageFacetFromSearch,
} from '@/utils/dashboard-search-state';
import { shippedTodayHref } from '@/lib/shipping/shipped-desk';
import { getCurrentPSTDateKey } from '@/utils/date';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const CELL =
  'inline-flex items-center gap-1.5 px-2 py-0.5 text-role-caption text-text-muted';
const VALUE = 'tabular-nums font-semibold text-text-default';

export function ToShipTodayStrip() {
  const stage = useDeskStageOptional();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;
  // Same key the filter popover mounts — one query answers both.
  const { data: counts } = useQuery(unshippedQueueCountsQuery({ staffId }));
  const activeFacet = getToShipTriageFacetFromSearch(searchParams);
  const mustShipActive = activeFacet === 'must_ship';

  const toggleMustShip = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    applyToShipTriageFacet(next, mustShipActive ? 'all' : 'must_ship');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [mustShipActive, pathname, router, searchParams]);

  // Nothing true to say yet — print no strip rather than three zeros that read
  // as an all-clear the desk has not actually earned.
  if (!counts) return null;
  if (stage?.fullscreen) return null;

  const mustShip = counts.mustShip ?? 0;
  const shippedToday = counts.shippedToday ?? 0;

  return (
    <div
      data-testid="to-ship-today-strip"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border-soft bg-surface-card px-2 py-1.5"
    >
      <span className={CELL}>
        Open<span className={VALUE}>{counts.total}</span>
      </span>
      <span aria-hidden className="h-3 w-px bg-border-soft" />
      <button
        type="button"
        onClick={toggleMustShip}
        aria-pressed={mustShipActive}
        data-testid="to-ship-today-must-ship"
        className={cn(
          'ds-raw-button transition-colors duration-100 ease-out',
          CELL,
          cornerClass('control'),
          focusRing('control'),
          mustShipActive
            ? 'bg-rose-50 text-rose-700'
            : 'hover:bg-surface-hover hover:text-text-default',
        )}
      >
        Must ship
        <span className={cn(VALUE, mustShipActive && 'text-rose-700')}>{mustShip}</span>
      </button>
      <span aria-hidden className="h-3 w-px bg-border-soft" />
      <Link
        href={shippedTodayHref(getCurrentPSTDateKey())}
        data-testid="to-ship-today-shipped"
        className={cn(
          CELL,
          cornerClass('control'),
          focusRing('control'),
          'transition-colors duration-100 ease-out hover:bg-surface-hover hover:text-text-default',
        )}
      >
        Shipped today<span className={VALUE}>{shippedToday}</span>
      </Link>
    </div>
  );
}
