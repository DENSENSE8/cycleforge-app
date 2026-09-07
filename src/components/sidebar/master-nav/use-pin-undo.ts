'use client';

/**
 * Unpin-with-undo for the MasterNav shelf.
 *
 * Unpinning is a DRAG now — the per-row X is gone (operator ruling 2026-09-05),
 * so the only way off the shelf is to drag a pin out of it. That gesture is
 * deliberate, but it shares its first 6px with a reorder: a drag meant to move
 * a pin one slot up, released a few pixels wide of the cluster, deletes an
 * arrangement the operator built by hand. The undo is what makes "out of the
 * shelf is off the shelf" affordable.
 *
 * The state lives HERE, not in `MasterNavPinnedCluster`, because the drop is
 * resolved by the DndContext owner (`SidebarNavList`) while the undo row paints
 * inside the cluster. One owner, two consumers — not two copies of a timer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { pinInputFromPinned } from '@/lib/quick-access/nav-pin';
import { displayQuickAccessLabel } from '@/lib/quick-access/page-label';
import type { PinnedPage } from '@/lib/quick-access/types';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';

/** How long the vacated slot keeps offering the pin back. */
const PIN_UNDO_WINDOW_MS = 12_000;

export type PinUndoOffer = {
  /** Display label of the pin that just left the shelf. */
  label: string;
  onUndo: () => void;
};

export function usePinUndo(): {
  /** Non-null while the last unpin can still be taken back. */
  undo: PinUndoOffer | null;
  /** Unpin `pin`, holding its slot open for {@link PIN_UNDO_WINDOW_MS}. */
  unpinWithUndo: (pin: PinnedPage, index: number) => void;
} {
  const { pinAt, unpin } = useQuickAccess();
  const [undoable, setUndoable] = useState<{ pin: PinnedPage; index: number } | null>(
    null,
  );
  const timer = useRef<number | null>(null);

  const forget = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setUndoable(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const unpinWithUndo = useCallback(
    (pin: PinnedPage, index: number) => {
      unpin(pin.id);
      if (timer.current !== null) window.clearTimeout(timer.current);
      setUndoable({ pin, index });
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setUndoable(null);
      }, PIN_UNDO_WINDOW_MS);
    },
    [unpin],
  );

  const onUndo = useCallback(() => {
    if (!undoable) return;
    const { pin, index } = undoable;
    forget();
    // The whole pin, converted once — never a hand-picked subset. A literal
    // here is what silently dropped `sessionId`, so taking back an accidental
    // unpin returned a session pin as a nameless Home row.
    pinAt(pinInputFromPinned(pin), index);
  }, [undoable, forget, pinAt]);

  return {
    undo: undoable
      ? { label: displayQuickAccessLabel(undoable.pin.href, undoable.pin.label), onUndo }
      : null,
    unpinWithUndo,
  };
}
