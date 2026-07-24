'use client';

/**
 * Sales-hub mode rail — the sidebar switcher for Local Pickup · Sales.
 * Writes `?mode=` (default `sales` dropped) and clears the mode-scoped `?tab=`
 * + legacy `?category=` so each mode opens clean.
 *
 * Modes ≠ tabs: this rail lives in the sidebar; the per-mode table tabs live in
 * the main-pane header (`WalkInDeskHeader`). Repair is a Receiving surface
 * (`/repair`) — open it from the station hand-off, not this rail.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_WALK_IN_HISTORY_MODE,
  WALK_IN_HISTORY_MODE_ITEMS,
  WALK_IN_MODE_PERMISSION,
  parseWalkInHistoryMode,
  type WalkInHistoryMode,
} from '@/lib/walk-in/history-modes';

export function WalkInModeSlider() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();
  const { has } = useAuth();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));

  const items = useMemo(
    () =>
      WALK_IN_HISTORY_MODE_ITEMS.filter((item) => {
        const perm = WALK_IN_MODE_PERMISSION[item.id as WalkInHistoryMode];
        return perm == null || has(perm);
      }),
    [has],
  );

  const onChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('tab');
      params.delete('category');
      if (next === DEFAULT_WALK_IN_HISTORY_MODE) params.delete('mode');
      else params.set('mode', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return (
    <HorizontalButtonSlider
      items={items}
      value={mode}
      onChange={onChange}
      variant="nav"
      dense
      className="w-full"
      aria-label="Sales desk mode"
    />
  );
}
