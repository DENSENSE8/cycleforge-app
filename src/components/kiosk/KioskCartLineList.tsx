'use client';

/**
 * THE cart line list — every face that lists the cart's lines mounts this:
 * editor, one remove (operator 2026-09-24: "ensure no forks all under one cart
 * Remove. Removing needs no PIN and no reason (operator 2026-09-24: "no need
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
