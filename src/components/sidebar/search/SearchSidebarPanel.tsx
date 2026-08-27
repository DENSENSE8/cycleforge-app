'use client';

/**
 * `/search` context rail — the Unbox scan station's rail, fed by search.
 *
 * Zone 1 of the Search & Details station. Two bands: the station scan band, and
 * the recent rail beneath it.
 *
 * **This panel owns no rail.** It mounts {@link ReceivingFeedRail} with a
 * `feed=` id, exactly as the Unbox dock does — so the row anatomy, height,
 * status dot, age column, hover peek, grouping, stagger and keyboard nav are
 * the station's, not a second implementation that looks like it. It used to
 * hand `SidebarRecentRailBase` its own `renderRowMain` / `getStatusDot` /
 * `getCollapsePin*` / view-model module, which is how the rail ended up
 * painting bare typed strings with an empty second line, no peek, and a
 * different band height from the station it was supposed to mirror.
 *
 * The feed (`searchRecent`, `@/lib/receiving/rail/feeds`) is Unbox's own
 * `view=viewed` query off `/api/receiving-lines`. The rows are real receiving
 * lines, so they carry `catalog_product_title` and the rail's normal resolver
 * paints a PRODUCT TITLE — no endpoint, resolver or row adapter of our own.
 *
 * **The band both commits and filters.** Typing filters the rail beneath it;
 * Enter commits the query to `?q=` (dropping `?sel=`, since a new search is not
 * the old record) and records it as a recent. One field, because two boxes in a
 * 360px rail is how you get an operator typing into the wrong one.
 *
 * **Selection rides the station's own channel.** The rail's row click is the
 * shared `dispatchSelectLine`; this panel listens for it and turns the row's
 * entity ref into `?sel=` in place (`router.replace`, no navigation, so the
 * centre swaps without a reload). No `onSelect` prop, because the rail does not
 * take one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScanBandShell, ThemedStationScanBar } from '@/components/station/scan-bar';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { ReceivingFeedRail } from '@/components/sidebar/receiving/ReceivingFeedRail';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useAuth } from '@/contexts/AuthContext';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { pushStaffRecentClient } from '@/lib/search/staff-recents-client';
import {
  SEARCH_SEL_PARAM,
  formatSearchSel,
  parseSearchSel,
  type SearchSelection,
} from '@/lib/search/search-selection';

export function SearchSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffIdNum = user?.staffId ?? 0;
  const { theme: themeColor } = useStationTheme({ staffId: staffIdNum });

  const sel = useMemo(
    () => parseSearchSel(searchParams.get(SEARCH_SEL_PARAM)),
    [searchParams],
  );

  const [filterText, setFilterText] = useState('');
  /**
   * The rail highlights by row id, and the rows are the feed's (`-search_recents.id`),
   * which this panel never sees. So selection is tracked from the click that
   * caused it, and cleared whenever `?sel=` leaves — the two facts the highlight
   * is actually about.
   */
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  useEffect(() => {
    if (!sel) setSelectedLineId(null);
  }, [sel]);

  const setSelParam = useCallback(
    (next: SearchSelection | null, query?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set(SEARCH_SEL_PARAM, formatSearchSel(next.entityType, next.id));
        if (query?.trim()) params.set('q', query.trim());
      } else {
        params.delete(SEARCH_SEL_PARAM);
        if (query?.trim()) params.set('q', query.trim());
      }
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  /**
   * The rail dispatches `receiving-select-line` with the clicked row — the
   * station's own channel, which is why the rail needs no `onSelect` prop from
   * here. The rows are real receiving lines, so the record they open is simply
   * their carton: `?sel=receiving:{receiving_id}`, built from the row itself
   * and never parsed out of a stored URL.
   */
  useEffect(() => {
    const onSelectLine = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingLineRow | { row: ReceivingLineRow } | null>)
        .detail;
      const row =
        detail && typeof detail === 'object' && 'row' in detail
          ? (detail as { row: ReceivingLineRow | null }).row
          : (detail as ReceivingLineRow | null);
      if (!row) return;
      const receivingId = Number(row.receiving_id);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;
      setSelectedLineId(row.id);
      setSelParam({ entityType: 'receiving', id: receivingId });
    };
    window.addEventListener('receiving-select-line', onSelectLine);
    return () => window.removeEventListener('receiving-select-line', onSelectLine);
  }, [setSelParam]);

  const commitQuery = useCallback(() => {
    const value = filterText.trim();
    if (!value) return;
    // A new search is not the old record — never leave a stale `?sel=` painting
    // a detail the operator did not ask for.
    setSelectedLineId(null);
    setSelParam(null, value);
    // A query committed from the rail is a recent like any other. Without this
    // the rail was a read-only window onto a table nothing wrote, so an
    // operator's own searches never appeared in their own recents.
    pushStaffRecentClient({ query: value, scope: 'global' });
  }, [filterText, setSelParam]);

  return (
    // `bg-surface-card` (#ffffff in the light theme) — the rail paints its own
    // white plane rather than inheriting the canvas ground CONTEXT_PANEL_HOST
    // gives every other rail, so all three Search columns read as one sheet.
    // Scoped to this panel on purpose: flipping the shared host would repaint
    // every rail in the app.
    <div
      className="relative flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="search-sidebar-panel"
    >
      <ScanBandShell themeColor={themeColor}>
        <ThemedStationScanBar
          value={filterText}
          onChange={setFilterText}
          onSubmit={commitQuery}
          staffId={String(staffIdNum)}
          placeholder="Order, serial, tracking…"
          className="w-full"
          // Aligns the glyph/text to the rail's dot/title column below — the
          // same call every station band makes.
          leadingColumn="rail"
          data-testid="search-rail-find"
        />
      </ScanBandShell>
      <SidebarRailScrollport>
        <ReceivingFeedRail
          key="rail-search-recent"
          feed="searchRecent"
          selectedLineId={selectedLineId}
          filterText={filterText}
          emptyText={filterText.trim() ? 'No recent finds match' : 'No recent finds'}
        />
      </SidebarRailScrollport>
    </div>
  );
}
