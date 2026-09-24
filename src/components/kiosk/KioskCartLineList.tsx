'use client';

/**
 * THE cart line list — every face that lists the cart's lines mounts this:
 * the cart's Cart step and the Keypad's Current sale. One list, one card, one
 * editor, one remove (operator 2026-09-24: "ensure no forks all under one cart
 * system for both sales, custom amount and repair service").
 *
 * The Keypad used to carry its own copy of this map — its own swipe row, its
 * own editor state, and its own remove, which diverged (a seen line routed to
 * the cart's void floor from one face and not the other). Now there is one.
 *
 * Lines are TOUCH CARDS (`SURFACE_LAW` §5): the card is the edit affordance,
 * its `−` at 1 asks Keep / Remove in place, and a sideways swipe offers Edit /
 * Remove. Removing needs no PIN and no reason (operator 2026-09-24: "no need
 * for pin to remove — dogfood must move fast").
 *
 * On a desk-held mirror a remove is the desk's verb, so the tablet offers none.
 *
 * Callers: `KioskCartLedger`, `KioskKeypadFace`. Affected API: none.
 * Schemas: `counter_session_lines` via the kiosk session store.
 */

import { useState, type ReactNode } from 'react';
import { KioskCartSwipeRow } from '@/components/kiosk/KioskCartSwipeRow';
import { KioskCartLineCard } from '@/components/kiosk/KioskCartLineCard';
import { KioskCartLineEditor } from '@/components/kiosk/KioskCartLineEditor';
import { useKioskSession, useKioskSessionActions } from '@/lib/kiosk/kiosk-session-store';
import { cn } from '@/utils/_cn';

export function KioskCartLineList({
  ariaLabel,
  empty,
  className,
}: {
  ariaLabel: string;
  /** Shown when the cart has no lines. Omitted → an empty list. */
  empty?: ReactNode;
  /** Layout only (padding, and whether this list scrolls on its own). */
  className?: string;
}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const canRemove = session.sharedSessionId === null;

  const edit = (lineId: string, toggle: boolean) => {
    actions.setPresentation({ lineId, catalog: null });
    setEditingLineId((prev) => (toggle && prev === lineId ? null : lineId));
  };
  const remove = (lineId: string) => {
    void actions.removeLine(lineId);
    setEditingLineId((prev) => (prev === lineId ? null : prev));
  };

  return (
    <div role="list" aria-label={ariaLabel} className={cn('flex w-full flex-col gap-2', className)}>
      {session.lines.length === 0
        ? empty
        : session.lines.map((line) => (
            <div role="listitem" key={line.id}>
              <KioskCartSwipeRow
                canRemove={canRemove}
                onEdit={() => edit(line.id, false)}
                onRemove={() => remove(line.id)}
              >
                <KioskCartLineCard
                  line={line}
                  open={editingLineId === line.id}
                  onOpen={() => edit(line.id, true)}
                  onQuantityChange={(quantity) => actions.updateLine(line.id, { quantity })}
                  onRemove={canRemove ? () => remove(line.id) : undefined}
                />
                {editingLineId === line.id && (
                  <KioskCartLineEditor
                    line={line}
                    onDone={() => setEditingLineId(null)}
                    onRemove={() => remove(line.id)}
                  />
                )}
              </KioskCartSwipeRow>
            </div>
          ))}
    </div>
  );
}
