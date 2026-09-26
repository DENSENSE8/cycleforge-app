'use client';

import { useCallback, useMemo, useState } from 'react';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';

export interface PhotoSelectMods {
  /** Shift was held — extend a contiguous range from the anchor. */
  shift?: boolean;
}

export interface PhotoSelection {
  /** Set of selected photo ids (persists across the client pages). */
  selected: Set<number>;
  /** Selected rows, resolved against the full loaded list, in list order. */
  selectedPhotos: LibraryPhoto[];
  /** Whether any selection UI (checkmarks, action bar) should be visible. */
  isActive: boolean;
  isSelected: (id: number) => boolean;
  /** Select/toggle a tile. */
  selectTile: (id: number, mods?: PhotoSelectMods) => void;
  /** Select every currently-loaded photo (the header "select all"). */
  selectAll: () => void;
  /** Replace the selection with an explicit id set — used by "select all matching filters", where the ids come from the server and may… */
  selectIds: (ids: number[]) => void;
  /** Toggle every id in a group — select all if any are unselected, else clear the group. */
  toggleGroupSelection: (ids: number[]) => void;
  /** Clear the whole selection. */
  clear: () => void;
  /** Ensure `id` is part of the selection set used for a drag payload: returns
   *  the ids to drag — the full selection if `id` is already in it, else just
   *  `[id]` (Finder-style "drag the unselected item alone, don't disturb the set"). */
  resolveDragIds: (id: number) => number[];
}

/** Owns multi-selection for the photo library: */
export function usePhotoSelection(photos: LibraryPhoto[]): PhotoSelection {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Anchor for Shift+click range extension (last individually-clicked tile)…
  const [anchorId, setAnchorId] = useState<number | null>(null);
  // …and whether that anchor click SELECTED (true) or DESELECTED (false), so a
  // following Shift+click paints the whole range with the same action.
  const [anchorSelecting, setAnchorSelecting] = useState(true);
  // The selection snapshot at the moment of the anchor click. Each Shift+click
  // re-derives from this baseline, so dragging the target back SHRINKS the range
  // (restoring tiles outside it) instead of leaving a painted tail behind.
  const [baseline, setBaseline] = useState<Set<number>>(new Set());

  // id → index in the flat sort order, for range math.
  const indexById = useMemo(
    () => new Map(photos.map((p, i) => [p.id, i] as const)),
    [photos],
  );

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selected.has(p.id)),
    [photos, selected],
  );

  const isSelected = useCallback((id: number) => selected.has(id), [selected]);

  const selectTile = useCallback(
    (id: number, mods: PhotoSelectMods = {}) => {
      const from = anchorId;
      // Shift+click: re-derive the selection from the anchor-click baseline, then paint the range [anchor, target] with the anchor's action…
      if (mods.shift && from != null && indexById.has(from) && indexById.has(id)) {
        const a = indexById.get(from)!;
        const b = indexById.get(id)!;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set(baseline);
        for (let i = lo; i <= hi; i++) {
          const pid = photos[i].id;
          if (anchorSelecting) next.add(pid);
          else next.delete(pid);
        }
        setSelected(next);
        return;
      }
      // Plain / Ctrl / Cmd click: toggle the single tile, then snapshot it as the
      // new baseline and record the anchor + whether this click selected it.
      const next = new Set(selected);
      let selecting: boolean;
      if (next.has(id)) {
        next.delete(id);
        selecting = false;
      } else {
        next.add(id);
        selecting = true;
      }
      setSelected(next);
      setBaseline(next);
      setAnchorId(id);
      setAnchorSelecting(selecting);
    },
    [anchorId, anchorSelecting, baseline, indexById, photos, selected],
  );

  const selectAll = useCallback(() => {
    const all = new Set(photos.map((p) => p.id));
    setSelected(all);
    setBaseline(all);
    setAnchorId(null);
  }, [photos]);

  const selectIds = useCallback((ids: number[]) => {
    const set = new Set(ids.filter((id) => Number.isFinite(id) && id > 0));
    setSelected(set);
    setBaseline(set);
    setAnchorId(null);
    setAnchorSelecting(true);
  }, []);

  const toggleGroupSelection = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      const next = new Set(selected);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      setSelected(next);
      setBaseline(next);
      setAnchorId(null);
    },
    [selected],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    setBaseline(new Set());
    setAnchorId(null);
    setAnchorSelecting(true);
  }, []);

  const resolveDragIds = useCallback(
    (id: number) => (selected.has(id) && selected.size > 0 ? [...selected] : [id]),
    [selected],
  );

  return {
    selected,
    selectedPhotos,
    isActive: selected.size > 0,
    isSelected,
    selectTile,
    selectAll,
    selectIds,
    toggleGroupSelection,
    clear,
    resolveDragIds,
  };
}
