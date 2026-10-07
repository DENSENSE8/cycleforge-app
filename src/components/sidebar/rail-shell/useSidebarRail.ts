'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRailEditMode } from '@/components/sidebar/rail-edit-mode';
import {
  mergeRailUpdatePatch,
  orderRailRowsByActivity,
  type SidebarRailShellProps,
} from './sidebar-rail-shared';
import { useRefreshSignal } from '@/lib/refresh/bus';
import type { RefreshDomain } from '@/lib/refresh/domains';

/** Stable empty tuple so a rail without domains keeps a constant subscription key. */
const EMPTY_DOMAINS: readonly RefreshDomain[] = [];

/** Stable empty exclusion set — a fresh `new Set()` each render would defeat memo identity. */
const EMPTY_EXCLUDED: ReadonlySet<number> = new Set();

/** Debounce/defer window for the reconciling refetch triggered by refresh events. */
const RAIL_REFRESH_DEBOUNCE_MS = 350;

/** Owns the generic sidebar-rail engine. The React Query cache under `queryKey` is the ONLY row store: every optimistic write lands there. */
export function useSidebarRail<TRow>({
  queryKey, fetchFn, updateEvent, deleteEvent, deleteGroupEvent, refreshEvents, refreshDomains,
  restoreEvent, restoreGroupEvent,
  navigateEvent,
  excludedIds = EMPTY_EXCLUDED,
  selectedId, selectedRow = null, limit = 25,
  pinSelectedLead = true,
  preserveServerOrder = false,
  getId, getGroupId, getActivityAt, getRowDisabled, onSelect,
}: SidebarRailShellProps<TRow>) {
  const queryClient = useQueryClient();
  // Pencil-toggle multi-select (provided by the owning panel; inactive default
  // when no provider). While active, row clicks toggle checkboxes instead of
  // opening the workspace.
  const editMode = useRailEditMode();
  // Shift-select anchor:
  const editAnchorIdRef = useRef<number | null>(null);
  useEffect(() => { editAnchorIdRef.current = null; }, [editMode.active]);

  const { data, isPending, isFetching } = useQuery<TRow[]>({
    queryKey,
    queryFn: fetchFn,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  // Never-self-blank: an established feed that refetches empty keeps painting
  // its last rows (a transient empty page must not flash the rail away).
  const queryKeySig = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const lastRowsRef = useRef<{ keySig: string; rows: TRow[] } | null>(null);
  const sortedRows = useMemo<TRow[] | null>(() => {
    if (!Array.isArray(data)) return null;
    const sorted = orderRailRowsByActivity(data, { preserveServerOrder, getActivityAt, getId });
    const last = lastRowsRef.current;
    if (sorted.length === 0 && last?.keySig === queryKeySig && last.rows.length > 0) return last.rows;
    return sorted;
  }, [data, preserveServerOrder, getActivityAt, getId, queryKeySig]);
  useEffect(() => {
    if (sortedRows) lastRowsRef.current = { keySig: queryKeySig, rows: sortedRows };
  }, [sortedRows, queryKeySig]);

  // Optimistic by-id patch — merged straight into the query cache.
  useEffect(() => {
    if (!updateEvent) return;
    const handlePatch = (event: Event) => {
      const updated = (event as CustomEvent<{ id?: number } & Partial<TRow>>).detail;
      if (!updated || typeof updated.id !== 'number') return;
      queryClient.setQueryData<TRow[]>(queryKey, (rows) => {
        if (!Array.isArray(rows)) return rows;
        const idx = rows.findIndex((r) => getId(r) === updated.id);
        if (idx < 0) return rows;
        // Never let a Testing-style full by-id dump (or any patch that can't
        // reproduce this feed's getActivityAt axis) blank the rail age / reorder.
        const next = rows.slice();
        next[idx] = mergeRailUpdatePatch(rows[idx], updated as Partial<TRow>, getActivityAt);
        return next;
      });
    };
    window.addEventListener(updateEvent, handlePatch);
    return () => window.removeEventListener(updateEvent, handlePatch);
  }, [updateEvent, queryClient, queryKey, getId, getActivityAt]);

  // Ids removed via `deleteEvent`/`deleteGroupEvent` — a sticky display filter,
  // so a refetch racing the server delete cannot resurrect the row. The
  // dispatchers drop the rows from the cache themselves.
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<number>>(() => new Set());
  const [deletedGroupIds, setDeletedGroupIds] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    if (!deleteEvent) return;
    const handleDelete = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail;
      if (!detail || typeof detail.id !== 'number') return;
      const id = detail.id;
      setDeletedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    };
    window.addEventListener(deleteEvent, handleDelete);
    return () => window.removeEventListener(deleteEvent, handleDelete);
  }, [deleteEvent]);

  // Whole-carton delete:
  useEffect(() => {
    if (!deleteGroupEvent || !getGroupId) return;
    const handleGroupDelete = (event: Event) => {
      const groupId = Number((event as CustomEvent<unknown>).detail);
      if (!Number.isFinite(groupId)) return;
      setDeletedGroupIds((prev) => (prev.has(groupId) ? prev : new Set(prev).add(groupId)));
    };
    window.addEventListener(deleteGroupEvent, handleGroupDelete);
    return () => window.removeEventListener(deleteGroupEvent, handleGroupDelete);
  }, [deleteGroupEvent, getGroupId]);

  // Undo. The suppression above is deliberately sticky, which is right for a real delete and wrong for a reversible one (a per-staff dismiss):
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

  // Debounced reconciling refetch, driven by refresh DOMAINS — the rail wakes
  // only for writes that touched its data — or the rail's own `refreshEvents`.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey });
    }, RAIL_REFRESH_DEBOUNCE_MS);
  }, [queryClient, queryKey]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  useRefreshSignal(refreshDomains ?? EMPTY_DOMAINS, scheduleRefresh);

  useEffect(() => {
    if (!refreshEvents || refreshEvents.length === 0) return;
    refreshEvents.forEach((ev) => window.addEventListener(ev, scheduleRefresh));
    return () => refreshEvents.forEach((ev) => window.removeEventListener(ev, scheduleRefresh));
  }, [refreshEvents, scheduleRefresh]);

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
  // Drop deleted rows AND this viewer's dismissed rows (excludedIds).
  const allRows = useMemo(
    () => (sortedRows ?? []).filter((r) => !isRowDeleted(r) && !excludedIds.has(getId(r))),
    [sortedRows, isRowDeleted, excludedIds, getId],
  );
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

  // Row indices that actually render a button — collapsed package members render nothing, so DOM button positions no longer map 1:1 to row…
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

  const showSkeleton = isPending && rows.length === 0;

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
    // Arrow/Home/End move focus only (roving tabindex); selection happens on Enter/Space or click.
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
