'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRailEditMode } from '@/components/sidebar/rail-edit-mode';
import {
  mergeRailUpdatePatch,
  orderRailRowsByActivity,
  railActivitySortMs,
  type SidebarRailShellProps,
} from './sidebar-rail-shared';
import {
  parseReceivingPrependedDetail,
  receivingPrependMatchesRail,
} from '@/lib/queries/receiving-queries';
import { useRefreshSignal } from '@/lib/refresh/bus';
import type { RefreshDomain } from '@/lib/refresh/domains';

/** Stable empty tuple so a rail without domains keeps a constant subscription key. */
const EMPTY_DOMAINS: readonly RefreshDomain[] = [];

/** Stable empty exclusion set — a fresh `new Set()` each render would defeat memo identity. */
const EMPTY_EXCLUDED: ReadonlySet<number> = new Set();

/**
 * Debounce/defer window for the reconciling refetch triggered by refresh events.
 * A single mutation often fires a BURST of broad `app-refresh-data` events, and
 * firing the invalidate eagerly races the write's `after()` side-effects
 * (returning a transient empty). Coalesce the burst and let the write settle,
 * then refetch once. Optimistic prepend/update/delete events already gave the
 * instant feedback; this path is only reconciliation, so a small delay is free.
 */
const RAIL_REFRESH_DEBOUNCE_MS = 350;

/**
 * Owns the generic sidebar-rail engine: data fetch + local mirror, optimistic
 * update/delete/group-delete event listeners, refresh-event invalidation,
 * top-N + pinned-selection, package grouping + collapse, keyboard nav +
 * roving focus, edit-mode range/shift selection, and navigate-event stepping.
 * Returns a controller bag the thin {@link SidebarRailShell} renders from.
 */
export function useSidebarRail<TRow>({
  queryKey, fetchFn, updateEvent, deleteEvent, deleteGroupEvent, refreshEvents, refreshDomains,
  restoreEvent, restoreGroupEvent,
  navigateEvent,
  excludedIds = EMPTY_EXCLUDED, includeRow, loadSnapshot, persistSnapshot,
  selectedId, selectedRow = null, leadingRow = null, limit = 25,
  autoSelectFirstWhenEmpty = false,
  canAutoSelectFirst,
  pinSelectedLead = true,
  preserveServerOrder = false,
  getId, getGroupId, getActivityAt, getReconcileId, getRowDisabled, onSelect,
}: SidebarRailShellProps<TRow>) {
  // Render identity: the durable key the React list reconciles by. Prefer the
  // caller's reconcile id (e.g. a client-minted `client_event_id` that survives
  // an optimistic stub → resolved-row swap) so the row UPDATES in place instead
  // of unmount+remount; fall back to the numeric `id`.
  const reconcileKey = useCallback(
    (r: TRow): string | number => (getReconcileId ? getReconcileId(r) : getId(r)),
    [getReconcileId, getId],
  );
  const queryClient = useQueryClient();
  // Pencil-toggle multi-select (provided by the owning panel; inactive default
  // when no provider). While active, row clicks toggle checkboxes instead of
  // opening the workspace.
  const editMode = useRailEditMode();
  // Shift-select anchor: the id of the last row whose checkbox was toggled by a
  // plain click. A shift-click then applies the clicked row's NEW state to the
  // whole visible range between anchor and click (Gmail-style). Anchored by id,
  // not index, so live feed reordering can't silently shift the range.
  const editAnchorIdRef = useRef<number | null>(null);
  useEffect(() => { editAnchorIdRef.current = null; }, [editMode.active]);

  const { data, isPending, isFetching, isPlaceholderData, dataUpdatedAt } = useQuery<TRow[]>({
    queryKey,
    queryFn: fetchFn,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  const sortRowsByActivity = useCallback((rows: TRow[]): TRow[] => {
    return orderRailRowsByActivity(rows, {
      preserveServerOrder,
      getActivityAt,
      getId,
    });
  }, [preserveServerOrder, getActivityAt, getId]);

  const [localRows, setLocalRows] = useState<TRow[] | null>(null);
  // Mirror query data. For the SAME queryKey, keep the prior rows while a refetch
  // is in flight (prevents unfound flicker during invalidate/refetch). But when
  // the queryKey itself changes, clear immediately so rows from the previous feed
  // can't render under the new feed's label.
  const queryKeySig = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const prevKeySigRef = useRef<string>(queryKeySig);
  // Once this feed has rendered real rows, never swap back to the full skeleton
  // on background refetch — that remount kills stagger + hover popovers and
  // reads as a loading↔loaded flash. Also never blank an established list on an
  // empty refetch (tracking / shipment.changed invalidates race to [] often);
  // genuine removals arrive via delete / group-delete events only.
  const hadRowsForKeyRef = useRef(false);
  useEffect(() => {
    const keyChanged = prevKeySigRef.current !== queryKeySig;
    if (keyChanged) {
      prevKeySigRef.current = queryKeySig;
      hadRowsForKeyRef.current = false;
    }
    if (Array.isArray(data)) {
      const sorted = sortRowsByActivity(data);
      // Never-self-blank: keep prior rows when an established feed refetches empty.
      if (sorted.length === 0 && !keyChanged && hadRowsForKeyRef.current) {
        return;
      }
      setLocalRows(sorted);
      // Persist non-empty settled rows only — never overwrite an Upstash seed with [].
      // Skip placeholder data: during a key change `keepPreviousData` briefly
      // returns the PREVIOUS feed's rows, which must not be saved for this feed.
      if (persistSnapshot && !isPlaceholderData && sorted.length > 0) {
        persistSnapshot(sorted);
      }
      return;
    }
    if (keyChanged) {
      setLocalRows(null);
    }
  }, [
    data, dataUpdatedAt, isPlaceholderData, sortRowsByActivity, queryKeySig,
    persistSnapshot,
  ]);

  // First-mount cold-reload seed. Fetches the viewer's last-known rows (a fast
  // server read) and paints them while the heavy authoritative query resolves —
  // so a reload fills in quickly instead of waiting the full round-trip. Async
  // (unlike the old localStorage seed). Snapshot-enabled rails keep their
  // settled chrome visible while the seed races the authoritative fetch, then
  // reconcile in place. One-shot: once live data or a key change arrives, the
  // mirror effect above owns `localRows`.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !loadSnapshot) return;
    seededRef.current = true;
    if (Array.isArray(data)) return; // authoritative rows already present
    let cancelled = false;
    void loadSnapshot().then((snap) => {
      if (cancelled || !snap || snap.length === 0) return;
      setLocalRows((prev) => {
        if (prev != null) return prev; // authoritative already won the paint
        hadRowsForKeyRef.current = true;
        return sortRowsByActivity(snap);
      });
    });
    return () => { cancelled = true; };
    // Keyed on loadSnapshot identity only (memoized by the provider); data is
    // read fresh inside and the one-shot guard prevents a re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSnapshot]);

  useEffect(() => {
    if (!updateEvent) return;
    const handlePatch = (event: Event) => {
      const updated = (event as CustomEvent<{ id?: number } & Partial<TRow>>).detail;
      if (!updated || typeof updated.id !== 'number') return;
      setLocalRows((rows) => {
        if (!rows) return rows;
        const idx = rows.findIndex((r) => getId(r) === updated.id);
        if (idx < 0) return rows;
        const existing = rows[idx];
        // Never let a Testing-style full by-id dump (or any patch that can't
        // reproduce this feed's getActivityAt axis) blank the rail age / reorder.
        const merged = mergeRailUpdatePatch(existing, updated as Partial<TRow>, getActivityAt);
        const prevMs = getActivityAt ? railActivitySortMs(getActivityAt(existing)) : 0;
        const nextMs = getActivityAt ? railActivitySortMs(getActivityAt(merged)) : prevMs;
        const next = rows.slice();
        next[idx] = merged;
        // Re-sort only when the feed's activity axis actually moved — partial
        // by-id refreshes must not shuffle rows that still share the same stamp.
        return nextMs !== prevMs ? sortRowsByActivity(next) : next;
      });
    };
    window.addEventListener(updateEvent, handlePatch);
    return () => window.removeEventListener(updateEvent, handlePatch);
  }, [updateEvent, getId, getActivityAt, sortRowsByActivity]);

  // Ids removed via `deleteEvent`/`deleteGroupEvent`. These MUST outlive the
  // refetch: `app-refresh-data` invalidates the query right after a delete, but
  // that refetch can race the server (eventually-consistent read / GET cache not
  // yet evicted for this view) and hand back the just-deleted rows. The
  // data-mirror effect would then write them straight back into `localRows`. So
  // we keep a sticky suppression set and filter against it in `allRows`/the pin
  // below — display stays correct no matter what the refetch returns. Receiving
  // ids/receiving_ids are monotonic DB serials (never reused), so suppressing
  // for the lifetime of the mounted rail is safe; the set resets on remount.
  // Events only fire on a CONFIRMED server delete, so a suppressed id is never a
  // false positive.
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [deletedGroupIds, setDeletedGroupIds] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    if (!deleteEvent) return;
    const handleDelete = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail;
      if (!detail || typeof detail.id !== 'number') return;
      const id = detail.id;
      setLocalRows((rows) => (rows ? rows.filter((r) => getId(r) !== id) : rows));
      setDeletedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    };
    window.addEventListener(deleteEvent, handleDelete);
    return () => window.removeEventListener(deleteEvent, handleDelete);
  }, [deleteEvent, getId]);

  // Whole-carton delete: drop every row sharing the removed group id at once.
  // Carries the group id (e.g. receiving_id) as a bare-number detail, so a
  // carton removed from the detail panel clears all its lines from the rail
  // immediately instead of waiting for the refetch.
  useEffect(() => {
    if (!deleteGroupEvent || !getGroupId) return;
    const handleGroupDelete = (event: Event) => {
      const groupId = Number((event as CustomEvent<unknown>).detail);
      if (!Number.isFinite(groupId)) return;
      setLocalRows((rows) => (rows ? rows.filter((r) => getGroupId(r) !== groupId) : rows));
      setDeletedGroupIds((prev) => (prev.has(groupId) ? prev : new Set(prev).add(groupId)));
    };
    window.addEventListener(deleteGroupEvent, handleGroupDelete);
    return () => window.removeEventListener(deleteGroupEvent, handleGroupDelete);
  }, [deleteGroupEvent, getGroupId]);

  // Undo. The suppression above is deliberately sticky, which is right for a
  // real delete and wrong for a reversible one (a per-staff dismiss): with the
  // id still suppressed, the refetch that follows an Undo would fetch the row
  // and then filter it straight back out. These clear the sticky set so the
  // row is allowed to return; the refetch itself is the caller's job.
  useEffect(() => {
    if (!restoreEvent) return;
    const handleRestore = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail;
      if (!detail || typeof detail.id !== 'number') return;
      setDeletedIds((prev) => {
        if (!prev.has(detail.id as number)) return prev;
        const next = new Set(prev);
        next.delete(detail.id as number);
        return next;
      });
    };
    window.addEventListener(restoreEvent, handleRestore);
    return () => window.removeEventListener(restoreEvent, handleRestore);
  }, [restoreEvent]);

  useEffect(() => {
    if (!restoreGroupEvent) return;
    const handleRestoreGroup = (event: Event) => {
      const groupId = Number((event as CustomEvent<unknown>).detail);
      if (!Number.isFinite(groupId)) return;
      setDeletedGroupIds((prev) => {
        if (!prev.has(groupId)) return prev;
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    };
    window.addEventListener(restoreGroupEvent, handleRestoreGroup);
    return () => window.removeEventListener(restoreGroupEvent, handleRestoreGroup);
  }, [restoreGroupEvent]);

  // Optimistic prepend — scan apply dispatches this with the freshly-matched rows
  // so the rail shows the new carton instantly instead of waiting for a full
  // refetch (which can take seconds on the heavy receiving-lines query).
  useEffect(() => {
    const handler = (event: Event) => {
      const parsed = parseReceivingPrependedDetail((event as CustomEvent<unknown>).detail);
      const { rows: detail, segments, scope } = parsed;
      if (!Array.isArray(detail) || detail.length === 0) return;
      if (!receivingPrependMatchesRail(queryKey, segments, scope)) return;
      setLocalRows((rows) => {
        const base = rows ?? [];
        const seenLine = new Set(base.map((r) => getId(r)));
        const seenCarton = getGroupId
          ? new Set(
              base
                .map((r) => getGroupId(r))
                .filter((id): id is number => id != null && Number.isFinite(id)),
            )
          : null;
        const fresh = detail.filter((r) => {
          if (seenLine.has(getId(r as TRow))) return false;
          if (seenCarton && getGroupId) {
            const gid = getGroupId(r as TRow);
            if (gid != null && seenCarton.has(gid)) return false;
          }
          return true;
        }) as TRow[];
        if (fresh.length === 0) return base.length > 0 ? base : null;
        return sortRowsByActivity([...fresh, ...base]);
      });
    };
    window.addEventListener('receiving-lines-prepended', handler);
    return () => window.removeEventListener('receiving-lines-prepended', handler);
  }, [getId, getGroupId, sortRowsByActivity, queryKey]);


  // Same debounced reconciliation, driven by refresh DOMAINS instead of raw
  // event names — the rail wakes only for writes that touched its data.
  const domainRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRefreshSignal(refreshDomains ?? EMPTY_DOMAINS, () => {
    if (domainRefreshTimer.current) clearTimeout(domainRefreshTimer.current);
    domainRefreshTimer.current = setTimeout(() => {
      domainRefreshTimer.current = null;
      queryClient.invalidateQueries({ queryKey });
    }, RAIL_REFRESH_DEBOUNCE_MS);
  });

  useEffect(() => {
    if (!refreshEvents || refreshEvents.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      // Debounce + defer the reconciling refetch (see RAIL_REFRESH_DEBOUNCE_MS):
      // coalesce a mutation's burst of refresh events and let its write settle,
      // so the refetch reads committed state instead of racing to a transient
      // empty. The optimistic delete/group-delete handlers still fire eagerly, so
      // real removals are instant; only the full reconciliation is deferred.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey });
      }, RAIL_REFRESH_DEBOUNCE_MS);
    };
    refreshEvents.forEach((ev) => window.addEventListener(ev, handler));
    return () => {
      if (timer) clearTimeout(timer);
      refreshEvents.forEach((ev) => window.removeEventListener(ev, handler));
    };
  }, [queryClient, queryKey, refreshEvents]);

  // Defensive: a queryKey collision (another useQuery caching a different shape
  // under the same key) can hand us a non-array `data`. Never let that crash
  // the whole sidebar — coerce to [] and render empty instead.
  const isRowDeleted = useCallback(
    (r: TRow) => {
      if (deletedIds.has(getId(r))) return true;
      if (getGroupId) {
        const g = getGroupId(r);
        if (g != null && deletedGroupIds.has(g)) return true;
      }
      return false;
    },
    [deletedIds, deletedGroupIds, getId, getGroupId],
  );
  // Drop deleted rows AND this viewer's dismissed rows (excludedIds), then any
  // facet keep-filter (`includeRow`). Both are filtered HERE, not in the
  // queryKey/fetch, so loading/changing them re-filters in place instead of
  // forcing a queryKey change that would blank the whole list to a skeleton.
  // Rows to render BEFORE the mirror effect has ever run — i.e. the server pass
  // and the first client render. `localRows` is written from a `useEffect`,
  // which does not run during SSR, so a rail whose data is already in the cache
  // (an RSC seed) still server-rendered "No packages yet" and only filled in
  // after hydration. On the Unbox bench that was the whole LCP: the largest
  // element on the page is a rail row's product title.
  //
  // This is a fallback, not a second source. The moment the effect commits,
  // `localRows` is non-null and owns the list forever after — so every rule the
  // effect encodes (never-self-blank on an empty refetch, clear-on-key-change,
  // snapshot persistence) is untouched. Those rules are all about the SECOND
  // and later updates; there is nothing yet to preserve on the first.
  const mirroredRows = localRows ?? (Array.isArray(data) ? sortRowsByActivity(data) : null);
  const baseRows = (Array.isArray(mirroredRows) ? mirroredRows : []).filter(
    (r) =>
      !isRowDeleted(r)
      && !excludedIds.has(getId(r))
      && (includeRow ? includeRow(r) : true),
  );
  // An optimistic leading row (e.g. the triage "importing" stub) renders at the
  // very top through the SAME row component. It is KEPT (not dropped) once the
  // feed catches up, and its single feed twin is dropped instead — matched by
  // exact `id` OR `reconcileKey`. This is what lets the stub reconcile to its
  // resolved row IN PLACE: the lead keeps a stable `reconcileKey` (its
  // client-minted id) across the swap, so React updates it rather than
  // remounting, and the authoritative feed row it merged into is suppressed
  // until the lead clears. Matching the EXACT twin (not the whole receiving_id
  // group) keeps sibling lines of a multi-line carton visible.
  const allRows = (() => {
    if (leadingRow == null) return baseRows;
    const leadId = getId(leadingRow);
    const leadKey = reconcileKey(leadingRow);
    const rest = baseRows.filter(
      (r) => getId(r) !== leadId && reconcileKey(r) !== leadKey,
    );
    return [leadingRow, ...rest];
  })();
  // `pinnedLead` marks that rows[0] is a selected row hoisted in from beyond the
  // top-N window (so the active line stays visible). `topCount` is the count of
  // genuine recent rows (excludes the pin) for the eyebrow headline.
  const { rows, topCount, pinnedLead } = useMemo(() => {
    const top = allRows.slice(0, limit);
    const base = { rows: top, topCount: top.length, pinnedLead: false };
    if (selectedId == null) return base;
    // Strict-order feeds (pinSelectedLead=false) never hoist the selected row —
    // the rail must read top→bottom by its sort axis (e.g. unbox rail by
    // unboxed_at) with no pin bounce on receive. See SidebarRailShellProps.
    if (!pinSelectedLead) return base;
    // Never resurrect a just-deleted line via the pin — covers both a directly
    // deleted line and the synthetic stub of a deleted carton (whose group id is
    // suppressed even though its negative stub id never hit `deletedIds`).
    if (deletedIds.has(selectedId)) return base;
    if (top.some((r) => getId(r) === selectedId)) return base;
    const fromDataset = allRows.find((r) => getId(r) === selectedId);
    const pin = fromDataset ?? selectedRow;
    if (!pin || getId(pin) !== selectedId) return base;
    if (isRowDeleted(pin)) return base;
    return { rows: [pin, ...top], topCount: top.length, pinnedLead: true };
  }, [allRows, limit, selectedId, selectedRow, getId, deletedIds, isRowDeleted, pinSelectedLead]);

  const grouped = useMemo(() => {
    type Info = { groupSize: number; groupIndex: number; groupId: number | null };
    const info: Info[] = rows.map(() => ({ groupSize: 1, groupIndex: 0, groupId: null }));
    if (!getGroupId) return info;
    let runStart = 0;
    for (let i = 1; i <= rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const prevG = prev != null ? getGroupId(prev) : null;
      const currG = curr != null ? getGroupId(curr) : null;
      // Never merge the hoisted pin (index 0) with the row below it: its
      // adjacency is an artifact of pinning, not a real package run.
      const sameGroup = curr != null && prev != null && prevG != null && prevG === currG
        && !(pinnedLead && i === 1);
      if (!sameGroup) {
        const size = i - runStart;
        const gid = rows[runStart] != null ? getGroupId(rows[runStart]) : null;
        for (let j = runStart; j < i; j++) info[j] = { groupSize: size, groupIndex: j - runStart, groupId: gid };
        runStart = i;
      }
    }
    return info;
  }, [rows, getGroupId, pinnedLead]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const toggleGroup = useCallback((groupId: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }, []);

  const listRef = useRef<HTMLUListElement | null>(null);
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  useEffect(() => { if (focusIndex >= rows.length) setFocusIndex(rows.length - 1); }, [rows.length, focusIndex]);

  // Row indices that actually render a button — collapsed package members render
  // nothing, so DOM button positions no longer map 1:1 to row indices. Keyboard
  // nav walks this list (skipping hidden rows) and focus targets a row by its
  // logical index via data-rail-index, not DOM position.
  const visibleIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const g = grouped[i];
      const hidden = g.groupId != null && collapsedGroups.has(g.groupId) && g.groupIndex > 0;
      if (!hidden) out.push(i);
    }
    return out;
  }, [rows.length, grouped, collapsedGroups]);

  // Header chevrons (or any external prev/next source) dispatch `navigateEvent`.
  // Walks the SAME visible order keyboard nav uses (skips collapsed group
  // members) so a chevron press never lands selection on a hidden row. With
  // nothing selected yet, prev/next both open the first rendered row.
  // When the selected line is a sibling not listed in a carton-deduped rail
  // (unbox Unboxed keeps one row per receiving_id), fall back to matching the
  // selected row's group id so PO-level chevrons still step.
  useEffect(() => {
    if (!navigateEvent) return;
    const handler = (event: Event) => {
      const direction = (event as CustomEvent<'prev' | 'next'>).detail;
      if (direction !== 'prev' && direction !== 'next') return;
      if (visibleIndices.length === 0) return;
      let curPos = visibleIndices.findIndex((i) => getId(rows[i]) === selectedId);
      if (curPos < 0 && getGroupId && selectedRow != null) {
        const selectedGroup = getGroupId(selectedRow);
        if (selectedGroup != null) {
          curPos = visibleIndices.findIndex((i) => getGroupId(rows[i]) === selectedGroup);
        }
      }
      if (curPos < 0) { onSelect(rows[visibleIndices[0]]); return; }
      const nextRowIdx = visibleIndices[curPos + (direction === 'prev' ? -1 : 1)];
      if (nextRowIdx == null) return; // already at an edge — no wrap
      onSelect(rows[nextRowIdx]);
    };
    window.addEventListener(navigateEvent, handler);
    return () => window.removeEventListener(navigateEvent, handler);
  }, [navigateEvent, rows, visibleIndices, selectedId, selectedRow, getId, getGroupId, onSelect]);

  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (!autoSelectFirstWhenEmpty) return;
    if (selectedId != null) {
      autoSelectedRef.current = true;
      return;
    }
    autoSelectedRef.current = false;
  }, [autoSelectFirstWhenEmpty, selectedId]);

  useEffect(() => {
    if (!autoSelectFirstWhenEmpty || autoSelectedRef.current) return;
    if (selectedId != null || isPending || rows.length === 0) return;
    if (canAutoSelectFirst && !canAutoSelectFirst()) return;
    autoSelectedRef.current = true;
    onSelect(rows[0]);
  }, [autoSelectFirstWhenEmpty, canAutoSelectFirst, selectedId, isPending, rows, onSelect]);

  if (rows.length > 0) {
    hadRowsForKeyRef.current = true;
  }

  const showSkeleton =
    isPending &&
    rows.length === 0 &&
    !hadRowsForKeyRef.current &&
    !loadSnapshot;

  const focusRow = useCallback((idx: number) => {
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`button[data-rail-row][data-rail-index="${idx}"]`);
    if (btn) btn.focus();
  }, []);

  // Edit-mode checkbox click. A plain click toggles the row and re-anchors;
  // shift-click applies the clicked row's NEW state to every visible row
  // between the anchor and the click (the industry-standard range select).
  const handleEditClick = useCallback((idx: number, withShift: boolean) => {
    const id = getId(rows[idx]);
    const anchorId = editAnchorIdRef.current;
    if (withShift && anchorId != null && anchorId !== id) {
      const anchorPos = visibleIndices.findIndex((i) => getId(rows[i]) === anchorId);
      const clickPos = visibleIndices.indexOf(idx);
      if (anchorPos >= 0 && clickPos >= 0) {
        const [lo, hi] = anchorPos <= clickPos ? [anchorPos, clickPos] : [clickPos, anchorPos];
        const ids = visibleIndices.slice(lo, hi + 1).map((i) => getId(rows[i]));
        editMode.setMany(ids, !editMode.selectedIds.has(id));
        editAnchorIdRef.current = id;
        return;
      }
    }
    editMode.toggle(id);
    editAnchorIdRef.current = id;
  }, [rows, visibleIndices, editMode, getId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    if (visibleIndices.length === 0) return;
    // Arrow/Home/End move focus only (roving tabindex); selection happens on
    // Enter/Space or click. Previously every arrow keypress dispatched onSelect,
    // opening the line in the workspace on each step. In edit mode, Shift+Arrow
    // additionally extends the checked range as focus moves (standard
    // multi-select keyboarding).
    const moveTo = (rowIdx: number, extend = false) => {
      if (extend && editMode.active && rowIdx >= 0 && rowIdx < rows.length) {
        const ids = [rowIdx, focusIndex]
          .filter((i) => i >= 0 && i < rows.length)
          .map((i) => getId(rows[i]));
        editMode.setMany(ids, true);
        editAnchorIdRef.current = getId(rows[rowIdx]);
      }
      setFocusIndex(rowIdx);
      focusRow(rowIdx);
    };
    const pos = visibleIndices.indexOf(focusIndex);
    if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(pos < 0 ? visibleIndices[0] : visibleIndices[Math.min(pos + 1, visibleIndices.length - 1)], e.shiftKey); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(pos < 0 ? visibleIndices[0] : visibleIndices[Math.max(pos - 1, 0)], e.shiftKey); }
    else if (e.key === 'Home') { e.preventDefault(); moveTo(visibleIndices[0]); }
    else if (e.key === 'End') { e.preventDefault(); moveTo(visibleIndices[visibleIndices.length - 1]); }
    else if ((e.key === 'Enter' || e.key === ' ') && focusIndex >= 0 && focusIndex < rows.length) {
      e.preventDefault();
      if (editMode.active) handleEditClick(focusIndex, e.shiftKey);
      else onSelect(rows[focusIndex]);
    }
  }, [rows, visibleIndices, focusIndex, focusRow, onSelect, editMode, getId, handleEditClick]);

  return {
    editMode,
    showSkeleton,
    isFetching,
    rows,
    getRowDisabled,
    topCount,
    grouped,
    collapsedGroups,
    toggleGroup,
    listRef,
    focusIndex,
    setFocusIndex,
    handleKeyDown,
    handleEditClick,
  };
}
