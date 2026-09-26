'use client';

/** The React seam of the record cursor — the only place a collection surface and a right-rail panel touch each other. */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { FoldState, GroupedRenderOrder } from '@/lib/group-rows';
import { recordIdKey, resolveRecordCursor } from './cursor-model';
import type { CursorIntent, CursorScope, RecordCursor, RecordId } from './cursor-model';
import {
  RECORD_CURSOR_PRIORITY,
  getRecordCursorTop,
  getServerRecordCursorTop,
  publishRecordCursor,
  subscribeRecordCursor,
  updateRecordCursor,
} from './store';
import type { RecordCursorOpen } from './store';

// ─── Publish ─────────────────────────────────────────────────────────────────

interface PublishRecordCursorArgs<T> {
  /** Stable identity of this surface. Two mounts of the same grid on one route
   *  MUST differ here, or they overwrite each other's claim. */
  surfaceId: string;
  scope: CursorScope;
  /** The visibility / ownership claim. */
  enabled: boolean;
  /** Defaults to the grid tier; a rail passes `RECORD_CURSOR_PRIORITY.rail`. */
  priority?: number;
  order: GroupedRenderOrder<T>;
  folds?: FoldState;
  openId: RecordId | null;
  getId: (row: T) => RecordId;
  getGroupKey?: (row: T) => string | number | null;
  openGroupKey?: string | number | null;
  /** Open a record on this surface. */
  onOpen: (row: T, ctx: { intent: CursorIntent; revealFoldKey: string | null }) => void;
  /** Dismiss the open record. Omit when dismissal is owned elsewhere; the panel
   *  then falls back to its own close path rather than rendering a dead ✕. */
  onClose?: () => void;
}

/** Publish this surface's on-screen order as the cursor for its scope, and return the resolved cursor for local use (reveal-on-deep-link, a… */
export function usePublishRecordCursor<T>(args: PublishRecordCursorArgs<T>): RecordCursor {
  const {
    surfaceId,
    scope,
    enabled,
    priority = RECORD_CURSOR_PRIORITY.grid,
    order,
    folds,
    openId,
    getId,
    getGroupKey,
    openGroupKey,
    onOpen,
    onClose,
  } = args;

  const cursor = useMemo(
    () => resolveRecordCursor({ scope, order, folds, openId, getId, getGroupKey, openGroupKey }),
    [scope, order, folds, openId, getId, getGroupKey, openGroupKey],
  );

  // The store speaks ids; the surface's `onOpen` speaks rows. Resolve here so no
  // consumer ever holds a row object it would have to keep fresh.
  const rowsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const [, groups] of order) {
      for (const group of groups) {
        for (const row of group.rows) {
          const key = recordIdKey(getId(row));
          // First wins: a duplicated id is a data bug, and stepping to the row
          // the cursor's index actually names is the less surprising answer.
          if (key !== null && !map.has(key)) map.set(key, row);
        }
      }
    }
    return map;
  }, [order, getId]);

  // Latest-refs so the two published callbacks below can be `useCallback([])`.
  // See the module docblock: their identity is part of the store's emit gate.
  const rowsByIdRef = useRef(rowsById);
  rowsByIdRef.current = rowsById;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const open = useCallback<RecordCursorOpen>((id, ctx) => {
    const key = recordIdKey(id);
    if (key === null) return;
    const row = rowsByIdRef.current.get(key);
    // The order moved under an in-flight step (a refetch landed between the
    // panel's click and this call). Dropping it is right: opening a record this
    // surface no longer lists is how a queue ends up highlighting nothing.
    if (row === undefined) return;
    onOpenRef.current(row, ctx);
  }, []);

  const closeStable = useCallback(() => {
    onCloseRef.current?.();
  }, []);
  // Flips only between one stable function and `undefined`, so the claim effect
  // below does not re-publish on an unrelated render.
  const close = onClose ? closeStable : undefined;

  // 1. Claim the scope. Reads the cursor off the ref so a content change does
  //    not withdraw-and-republish.
  useEffect(() => {
    if (!enabled) return;
    return publishRecordCursor({
      surfaceId,
      scope,
      priority,
      cursor: cursorRef.current,
      open,
      close,
    });
  }, [enabled, surfaceId, scope, priority, open, close]);

  // 2. Refresh the content. `updateRecordCursor` no-ops when every field is
  //    equal and emits when any is, so this is safe to run on every render.
  useEffect(() => {
    if (!enabled) return;
    updateRecordCursor({ surfaceId, scope, priority, cursor, open, close });
  }, [enabled, surfaceId, scope, priority, cursor, open, close]);

  return cursor;
}

// ─── Consume ─────────────────────────────────────────────────────────────────

interface RecordCursorControls {
  /** Is any surface publishing this scope? */
  available: boolean;
  /** 1-based, in the fold-blind order; null when nothing resolvable is open. */
  position: number | null;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** Null when the publisher owns dismissal elsewhere. */
  onClose: (() => void) | null;
}

const NO_CURSOR: RecordCursorControls = {
  available: false,
  position: null,
  total: 0,
  onPrev: null,
  onNext: null,
  prevDisabled: true,
  nextDisabled: true,
  onClose: null,
};

/** Read the cursor for a scope. */
export function useRecordCursor(scope: CursorScope): RecordCursorControls {
  const getSnapshot = useCallback(() => getRecordCursorTop(scope), [scope]);
  const top = useSyncExternalStore(subscribeRecordCursor, getSnapshot, getServerRecordCursorTop);

  return useMemo(() => {
    if (!top) return NO_CURSOR;
    const { cursor, open, close } = top;
    const prevTarget = cursor.position === null ? cursor.first : cursor.prev;
    const nextTarget = cursor.position === null ? cursor.first : cursor.next;
    return {
      available: true,
      position: cursor.position,
      total: cursor.total,
      onPrev: prevTarget
        ? () => open(prevTarget.id, { intent: 'step', revealFoldKey: prevTarget.revealFoldKey })
        : null,
      onNext: nextTarget
        ? () => open(nextTarget.id, { intent: 'step', revealFoldKey: nextTarget.revealFoldKey })
        : null,
      prevDisabled: !prevTarget,
      nextDisabled: !nextTarget,
      onClose: close ?? null,
    };
  }, [top]);
}
