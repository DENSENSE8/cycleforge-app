'use client';

import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { HEADER_ICON_CLUSTER, HEADER_ICON_GAP } from './header-shell';

/**
 * Matches `RightRailHost` at rest — min width keeps icons column-aligned with
 * the detail panel.
 */
const HEADER_RAIL_WIDTH = 'min-w-[420px]';

/**
 * Persistent **actions** zone of the {@link GlobalHeader} (far-right).
 *
 * STRIPPED 2026-09-06 (operator: "starting fresh"): the add menu (+), the
 * pace-and-next goal chip, the activity inbox, and the phone companion button
 * are GONE from the header. The session surface is the product; the header
 * carries Find (⌘K) only. The removed doors return as the pinned home-board
 * idea matures (docs/todo/design-system-ideas-LOOP.md — home board, per-staff
 * watchers, EOD rollups): they were standing chrome for data the assistant now
 * answers on demand. The assistant door remains the floating circle + ⌘J.
 *
 * **Find follows the navigator (2026-09-05).** There is exactly ONE header
 * search icon at any time. With the spine OPEN, Search is the spine's second
 * row and the icon sits here on the right rail. With the spine CLOSED, the
 * icon moves to the header's LEFT cluster, beside the toggle, where every
 * agent desktop app puts it — so `showFind` is false in that state. Both
 * doors dispatch `COMMAND_BAR_OPEN_EVENT`: one palette, one chord.
 *
 * **Desktop only.** Mobile mounts no part of this component.
 */
export function GlobalHeaderActions({ showFind = true }: { showFind?: boolean }) {
  const { user } = useAuth();

  if (!user) return null;

  // Order: add · pace-and-next (goal ring) · inbox · phone (far-right).
  // Stretch the row to the header beam so icon washes lock flush.
  return (
    <div
      className={cn(
        'flex h-full shrink-0 items-stretch justify-end',
        HEADER_ICON_GAP,
        HEADER_RAIL_WIDTH,
      )}
    >
      <div
        className={HEADER_ICON_CLUSTER}
        data-header-zone="actions"
      >
        {/* Find (⌘K), unless the closed spine has taken it to the left
            cluster. Everything else returns with the home-board idea
            (docs/todo/design-system-ideas-LOOP.md). Stripped 2026-09-06. */}
        {showFind ? <GlobalHeaderSearch /> : null}
      </div>
    </div>
  );
}
