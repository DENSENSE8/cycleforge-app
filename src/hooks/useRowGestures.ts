'use client';

/** `useRowGestures` — the row model's keyboard half, bound to the TABLE, not the window. */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  extendTo,
  selectAll,
  selectOnlyAt,
  stepCursor,
  toggleAt,
  type SelectionAnchorState,
} from '@/lib/selection/selection-anchor';
import {
  suppressTableKey,
  type TableKeySuppression,
} from '@/lib/keyboard/table-key-layer';
import { rowGestureForKey, rowGestureKeyOf } from '@/lib/tables/row-gestures';

interface RowGestureHandlers {
  /** The selection changed — hand the new set to the surface's selection model. */
  onSelectionChange: (ids: ReadonlySet<number>) => void;
  /** Open the record under the cursor (double-click / Enter / `o`). */
  onOpen?: (id: number) => void;
  /** Escape with a record open. */
  onDismiss?: () => boolean;
}

interface UseRowGesturesOptions<T> extends RowGestureHandlers {
  /** Rows in DISPLAY order — what the operator sees, after sort and filter. */
  rows: readonly T[];
  getId: (row: T) => number;
  /** The live checked set, owned by the surface's selection model. */
  selectedIds: ReadonlySet<number>;
  /** Off for surfaces whose gutter is a verb rather than a selection. */
  enabled?: boolean;
}

interface RowGesturesApi {
  /** The row the keyboard cursor is on, or null before the first key. */
  cursorId: number | null;
  /** Point the cursor at a row — call from a row's `onFocus` / click. */
  setCursorId: (id: number | null) => void;
  /** Attach to the table's region root. */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Roving tab index — the cursor row is the window's ONE tab stop. */
  rowTabIndex: (id: number) => 0 | -1;
  /** The last key this hook declined, and why. For tests and diagnostics. */
  lastSuppression: () => TableKeySuppression | null;
}

export function useRowGestures<T>({
  rows,
  getId,
  selectedIds,
  onSelectionChange,
  onOpen,
  onDismiss,
  enabled = true,
}: UseRowGesturesOptions<T>): RowGesturesApi {
  const [cursorId, setCursorId] = useState<number | null>(null);
  const anchorRef = useRef<number | null>(null);
  const suppressionRef = useRef<TableKeySuppression | null>(null);

  const ids = useMemo(() => rows.map(getId), [rows, getId]);

  // Read through refs so the handler identity does not change on every row
  // render — a table re-renders constantly and this is on its scroll root.
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;

  const stateFor = useCallback(
    (): SelectionAnchorState => ({
      ids: idsRef.current,
      selected: selectedRef.current,
      anchorId: anchorRef.current,
    }),
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled) return;

      // The handler is on the region root, so focus is inside the table by
      // construction — but not necessarily outside a cell editor, and not
      // necessarily with the scanner disarmed.
      const suppression = suppressTableKey(
        {
          key: event.key,
          target: event.target,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
          defaultPrevented: event.defaultPrevented,
        },
        { layer: 'table', ownsFocus: true },
      );
      suppressionRef.current = suppression;
      if (suppression) return;

      const gesture = rowGestureForKey(rowGestureKeyOf(event));
      if (!gesture) return;

      const current = idsRef.current;
      const cursor = cursorId;

      switch (gesture.id) {
        case 'cursor-next':
        case 'cursor-prev': {
          const next = stepCursor(current, cursor, gesture.id === 'cursor-next' ? 1 : -1);
          if (next == null) return;
          event.preventDefault();
          setCursorId(next);
          return;
        }
        case 'cursor-first':
        case 'cursor-last': {
          const next = gesture.id === 'cursor-first' ? current[0] : current[current.length - 1];
          if (next == null) return;
          event.preventDefault();
          setCursorId(next);
          return;
        }
        case 'toggle-select': {
          if (cursor == null) return;
          event.preventDefault();
          const result = toggleAt(stateFor(), cursor);
          anchorRef.current = result.anchorId;
          if (result.changed) onSelectionChange(result.selected);
          return;
        }
        case 'extend-next':
        case 'extend-prev': {
          const target = stepCursor(
            current,
            cursor,
            gesture.id === 'extend-next' ? 1 : -1,
          );
          if (target == null) return;
          event.preventDefault();
          // The anchor defaults to where the cursor already is, so the FIRST
          // Shift+↓ selects the pair rather than only the row it lands on.
          if (anchorRef.current == null && cursor != null) anchorRef.current = cursor;
          const result = extendTo(stateFor(), target);
          anchorRef.current = result.anchorId;
          setCursorId(target);
          if (result.changed) onSelectionChange(result.selected);
          return;
        }
        case 'select-all': {
          event.preventDefault();
          const result = selectAll(stateFor());
          anchorRef.current = result.anchorId;
          if (result.changed) onSelectionChange(result.selected);
          return;
        }
        case 'open-record': {
          if (cursor == null || !onOpen) return;
          event.preventDefault();
          onOpen(cursor);
          return;
        }
        case 'dismiss': {
          event.preventDefault();
          // Ordering, not two meanings: never clear a selection the operator
          // can still see a form in front of.
          if (onDismiss?.()) return;
          if (selectedRef.current.size === 0) return;
          anchorRef.current = null;
          onSelectionChange(new Set());
          return;
        }
      }
    },
    [cursorId, enabled, onDismiss, onOpen, onSelectionChange, stateFor],
  );

  const rowTabIndex = useCallback(
    (id: number): 0 | -1 => {
      // Before the first key the FIRST row is the tab stop, so a keyboard user
      // arriving from the search field lands on a row rather than on nothing.
      const stop = cursorId ?? idsRef.current[0] ?? null;
      return id === stop ? 0 : -1;
    },
    [cursorId],
  );

  return {
    cursorId,
    setCursorId,
    onKeyDown,
    rowTabIndex,
    lastSuppression: () => suppressionRef.current,
  };
}

/** The pointer twin of {@link useRowGestures}' selection keys. */
function resolveRowPointerSelect(
  state: SelectionAnchorState,
  id: number,
  event: { shiftKey?: boolean },
  mode: 'toggle' | 'only' = 'toggle',
) {
  if (event.shiftKey) return extendTo(state, id);
  return mode === 'only' ? selectOnlyAt(state, id) : toggleAt(state, id);
}
