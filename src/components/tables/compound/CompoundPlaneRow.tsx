'use client';

/**
 * A compound row WITH its entity's row-anchored action plane.
 *
 * ## The last reason a family owned a row
 *
 * `CompoundRow` paints every compound cell, but it had nowhere to put a panel
 * that opens BESIDE a picked row — so To-ship mapped the columns itself and
 * mounted its CYC-82 assign manifold by hand. That is `OrdersQueueTableRow`:
 * 1300 lines whose desktop branch is `CompoundRow` with more props, kept alive
 * by a panel and a click rule.
 *
 * Both are engine concerns now. The panel is declared once per ENTITY on
 * `TableSurfaceBinding.rowPlane` (see its docblock for why the binding and not
 * a mount), and the click rule that opens it is
 * {@link applyCompoundRowPlaneGutterClick} — the CYC-82 gesture, which three
 * unrelated surfaces already obeyed before it had a shared home.
 *
 * This component owns the two things a hook cannot: the per-row `open` state
 * and the row element ref the plane anchors to.
 *
 * A binding with no `rowPlane` renders the plain shared row and pays nothing —
 * no state, no ref, no wrapper.
 */

import { useCallback, useRef, useState } from 'react';
import { CompoundRow, type CompoundRowProps } from './CompoundRow';
import { applyCompoundRowPlaneGutterClick } from './compound-row-plane';
import type { TableRowPlane } from '@/components/tables/table-surface-binding';

export interface CompoundPlaneRowProps<Row, C extends { key: string; width: string }>
  extends CompoundRowProps<C> {
  /** The row this plane acts on. */
  row: Row;
  /** The ENTITY's registered plane, or undefined for a family with none. */
  rowPlane?: TableRowPlane<Row>;
}

export function CompoundPlaneRow<Row, C extends { key: string; width: string }>({
  row,
  rowPlane,
  select,
  ...rowProps
}: CompoundPlaneRowProps<Row, C>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const onToggle = select?.onToggle;

  /**
   * The gutter click, with the plane wired in.
   *
   * The checkbox ALWAYS toggles — opening the plane is a side-effect of
   * becoming selected, never a substitute for the toggle, and shift stays the
   * range walk. Without a registered plane the toggle is handed through
   * untouched, so a family with no plane behaves exactly as it did.
   */
  const handleToggle = useCallback(
    (event: { shiftKey: boolean }) => {
      if (!onToggle) return;
      if (!rowPlane) {
        onToggle(event);
        return;
      }
      applyCompoundRowPlaneGutterClick({
        isChecked: select?.checked === true,
        shiftKey: event.shiftKey,
        onToggle,
        onOpenMenu: () => setOpen(true),
        onCloseMenu: close,
      });
    },
    [onToggle, rowPlane, select?.checked, close],
  );

  if (!rowPlane) {
    return <CompoundRow<C> {...rowProps} select={select} />;
  }

  const Plane = rowPlane.Component;
  return (
    <CompoundRow<C>
      {...rowProps}
      ref={anchorRef}
      select={select ? { ...select, onToggle: onToggle ? handleToggle : undefined } : undefined}
      plane={<Plane row={row} open={open} onClose={close} anchorRef={anchorRef} />}
    />
  );
}
