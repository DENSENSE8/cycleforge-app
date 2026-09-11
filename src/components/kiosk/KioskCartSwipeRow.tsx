'use client';

/**
 * Mobile swipe-to-edit / swipe-to-void for a cart line.
 *
 * Callers: KioskCartLedger (only).
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

export function KioskCartSwipeRow({
  children,
  canVoid,
  onEdit,
  onVoid,
}: {
  children: ReactNode;
  canVoid: boolean;
  onEdit: () => void;
  onVoid: () => void;
}) {
  const startX = useRef(0);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = Math.min(0, event.clientX - startX.current);
    setDx(Math.max(-REVEAL_PX, next));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const revealed = Math.abs(dx) >= COMMIT_PX || open;
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
        {canVoid ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn('self-center text-text-danger', counterCorner('chip'))}
            onClick={onVoid}
          >
            Void
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
