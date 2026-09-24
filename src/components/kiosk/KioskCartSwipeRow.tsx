'use client';

/**
 * Mobile swipe-to-edit / swipe-to-void for a cart line.
 *
 * A TAP must stay a tap. The row used to take pointer capture on every
 * `pointerdown`, and a captured pointer's `click` is dispatched to the
 * capturing element — this wrapper — so the card inside never received it:
 * tapping a line opened nothing, and a repair line (no stepper) had no way to
 * its serial or its Remove (operator 2026-09-24: "I cannot click anything to
 * add a serial number … and I cannot remove the product"). Capture now starts
 * only once the finger has travelled {@link DRAG_START_PX} sideways.
 *
 * Callers: KioskCartLineList.
 * Affected API: none (local gesture).
 * Data schemas: none.
 * User: "full create read update delete that I would easily be able to edit with side swipes that are mobile friendly"
 */

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { counterCorner } from '@/app/kiosk/kiosk-counter-surface';
import { cn } from '@/utils/_cn';

const REVEAL_PX = 148;
const COMMIT_PX = 56;
/** Sideways travel before a press becomes a swipe. Below it, it is a tap. */
const DRAG_START_PX = 8;

export function KioskCartSwipeRow({
  children,
  canRemove,
  onEdit,
  onRemove,
}: {
  children: ReactNode;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const startX = useRef(0);
  /** The press in progress (pointer id), or null. */
  const pressing = useRef<number | null>(null);
  const dragging = useRef(false);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
    pressing.current = event.pointerId;
    dragging.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pressing.current !== event.pointerId) return;
    const travel = event.clientX - startX.current;
    if (!dragging.current) {
      if (Math.abs(travel) < DRAG_START_PX) return;
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDx(Math.max(-REVEAL_PX, Math.min(0, travel)));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pressing.current !== event.pointerId) return;
    pressing.current = null;
    if (!dragging.current) {
      // A tap: the card's own click handles it. A tap on a revealed row
      // also folds the actions away.
      if (open) {
        setOpen(false);
        setDx(0);
      }
      return;
    }
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const revealed = Math.abs(dx) >= COMMIT_PX;
    setOpen(revealed);
    setDx(revealed ? -REVEAL_PX : 0);
  };

  return (
    <div className="relative overflow-hidden" data-testid="kiosk-cart-swipe-row">
      <div
        className="absolute inset-y-0 right-0 flex items-stretch gap-1 pr-2"
        aria-hidden={dx === 0 && !open}
      >
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn('self-center', counterCorner('chip'))}
          onClick={onEdit}
        >
          Edit
        </Button>
        {canRemove ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn('self-center text-text-danger', counterCorner('chip'))}
            onClick={onRemove}
            data-testid="kiosk-cart-swipe-remove"
          >
            Remove
          </Button>
        ) : null}
      </div>
      <div
        className="relative bg-surface-card"
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
