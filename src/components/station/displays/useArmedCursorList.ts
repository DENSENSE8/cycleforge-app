/** Absolute armed-cursor list — character-select navigation waist. */

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';

function seedCursorId(
  orderedIds: readonly string[],
  activeId: string | null | undefined,
  prev: string | null,
): string | null {
  if (orderedIds.length === 0) return null;
  if (prev && orderedIds.includes(prev)) return prev;
  if (activeId && orderedIds.includes(activeId)) return activeId;
  return orderedIds[0] ?? null;
}

function isEditableOutsideList(
  el: EventTarget | null,
  root: HTMLElement | null,
): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (root?.contains(el)) return false;
  return isEditableKeyTarget(el);
}

export function useArmedCursorList({
  orderedIds,
  activeId = null,
  rootRef,
  rowRefs,
  regionActive = false,
}: {
  orderedIds: readonly string[];
  /** Last committed / opened id — seeds cursor; distinct from armed paint. */
  activeId?: string | null;
  rootRef: RefObject<HTMLElement | null>;
  rowRefs: RefObject<Map<string, HTMLElement>>;
  /**
   * When true (Displays Right owns keyboard), claim ↑↓ / Home / End on window
   * capture so the cursor moves without a prior Tab into a row.
   */
  regionActive?: boolean;
}) {
  const prevActiveIdRef = useRef(activeId);
  const didMountFocusRef = useRef(false);
  /** Suppress the follow-up `click` after a primary `pointerdown` commit. */
  const pointerCommitGuardRef = useRef(false);

  const [cursorId, setCursorId] = useState<string | null>(() =>
    seedCursorId(orderedIds, activeId, null),
  );

  useEffect(() => {
    const activeChanged = prevActiveIdRef.current !== activeId;
    prevActiveIdRef.current = activeId;

    setCursorId((prev) => {
      if (orderedIds.length === 0) return null;
      if (activeChanged && activeId && orderedIds.includes(activeId)) {
        return activeId;
      }
      return seedCursorId(orderedIds, activeId, prev);
    });
  }, [orderedIds, activeId]);

  useEffect(() => {
    if (didMountFocusRef.current) return;
    if (!cursorId || orderedIds.length === 0) return;
    if (isEditableOutsideList(document.activeElement, rootRef.current)) return;

    didMountFocusRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      rowRefs.current?.get(cursorId)?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [cursorId, orderedIds.length, rootRef, rowRefs]);

  /**
   * Move the armed cursor. Default focuses the row (list ownership). Pass
   * `{ focus: false }` from a sibling filter box so ↑↓ paint the arm without
   * yanking focus out of the input (MasterNav / Displays filter golden).
   */
  const moveCursorTo = useCallback(
    (nextId: string, opts?: { focus?: boolean }) => {
      setCursorId(nextId);
      const el = rowRefs.current?.get(nextId);
      if (!el) return;
      if (opts?.focus === false) {
        el.scrollIntoView({ block: 'nearest' });
        return;
      }
      el.focus();
    },
    [rowRefs],
  );

  /**
   * Commit → navigate / run verb in the **same turn**. `onCommit` runs first so
   * the right rail paints before any armed-chevron cursor update. Never delays
   * for hit-marker juice (that withhold is banned on the right rail).
   */
  const commitArmed = useCallback((id: string, onCommit: (id: string) => void) => {
    onCommit(id);
    setCursorId(id);
  }, []);

  /**
   * Primary-button pointerdown commit — same turn as keyboard Enter. Sets a
   * guard so the trailing `click` does not double-fire.
   */
  const handleCommitPointerDown = useCallback(
    (
      e: ReactPointerEvent,
      id: string,
      onCommit: (id: string) => void,
    ): void => {
      if (e.button !== 0) return;
      pointerCommitGuardRef.current = true;
      commitArmed(id, onCommit);
    },
    [commitArmed],
  );

  /**
   * Click commit for a11y / Space — no-ops when pointerdown already committed.
   */
  const handleCommitClick = useCallback(
    (id: string, onCommit: (id: string) => void): void => {
      if (pointerCommitGuardRef.current) {
        pointerCommitGuardRef.current = false;
        return;
      }
      commitArmed(id, onCommit);
    },
    [commitArmed],
  );

  /**
   * Arrow / Home / End wrap. Caller handles Enter/Space commit before calling.
   * Returns true when the event was consumed.
   */
  const handleNavKeyDown = useCallback(
    (e: ReactKeyboardEvent, id: string): boolean => {
      const key = e.key;
      if (
        key !== 'ArrowDown' &&
        key !== 'ArrowUp' &&
        key !== 'Home' &&
        key !== 'End'
      ) {
        return false;
      }

      if (orderedIds.length === 0) return false;

      const idx = orderedIds.indexOf(id);
      if (idx === -1) return false;

      let nextIdx: number;
      if (key === 'Home') nextIdx = 0;
      else if (key === 'End') nextIdx = orderedIds.length - 1;
      else if (key === 'ArrowDown') nextIdx = (idx + 1) % orderedIds.length;
      else nextIdx = (idx - 1 + orderedIds.length) % orderedIds.length;

      const nextId = orderedIds[nextIdx];
      e.preventDefault();
      e.stopPropagation();
      if (nextId == null || nextId === id) return true;
      moveCursorTo(nextId);
      return true;
    },
    [moveCursorTo, orderedIds],
  );

  /**
   * ↑↓ / Home / End from a sibling filter field — same wrap math as row /
   * region listeners, but never steals input focus. Enter / Esc stay in the
   * host (commit / clear filter). Returns true when consumed.
   */
  const handleFilterNavKeyDown = useCallback(
    (e: ReactKeyboardEvent): boolean => {
      const key = e.key;
      if (
        key !== 'ArrowDown' &&
        key !== 'ArrowUp' &&
        key !== 'Home' &&
        key !== 'End'
      ) {
        return false;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (orderedIds.length === 0) return false;

      const fromId =
        (cursorId && orderedIds.includes(cursorId) ? cursorId : null) ??
        orderedIds[0] ??
        null;
      if (fromId == null) return false;

      const idx = orderedIds.indexOf(fromId);
      if (idx === -1) return false;

      let nextIdx: number;
      if (key === 'Home') nextIdx = 0;
      else if (key === 'End') nextIdx = orderedIds.length - 1;
      else if (key === 'ArrowDown') nextIdx = (idx + 1) % orderedIds.length;
      else nextIdx = (idx - 1 + orderedIds.length) % orderedIds.length;

      const nextId = orderedIds[nextIdx];
      e.preventDefault();
      e.stopPropagation();
      if (nextId == null) return true;
      moveCursorTo(nextId, { focus: false });
      return true;
    },
    [cursorId, moveCursorTo, orderedIds],
  );

  // Region-owned ↑↓ — same wrap math as row onKeyDown, but without requiring
  // focus inside a button first (pointer into Displays column claims Right).
  useEffect(() => {
    if (!regionActive) return;

    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'Home' &&
        e.key !== 'End'
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyTarget(e.target)) return;
      if (orderedIds.length === 0) return;

      const fromId =
        (cursorId && orderedIds.includes(cursorId) ? cursorId : null) ??
        orderedIds[0] ??
        null;
      if (fromId == null) return;

      const idx = orderedIds.indexOf(fromId);
      if (idx === -1) return;

      let nextIdx: number;
      if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = orderedIds.length - 1;
      else if (e.key === 'ArrowDown') nextIdx = (idx + 1) % orderedIds.length;
      else nextIdx = (idx - 1 + orderedIds.length) % orderedIds.length;

      const nextId = orderedIds[nextIdx];
      e.preventDefault();
      e.stopPropagation();
      if (nextId == null || nextId === fromId) return;
      moveCursorTo(nextId);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [regionActive, orderedIds, cursorId, moveCursorTo]);

  return {
    cursorId,
    setCursorId,
    /** @deprecated Always null — commit no longer delays for hit-marker juice. */
    commitId: null as string | null,
    commitArmed,
    handleCommitPointerDown,
    handleCommitClick,
    moveCursorTo,
    handleNavKeyDown,
    handleFilterNavKeyDown,
  };
}
