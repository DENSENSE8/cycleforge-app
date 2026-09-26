'use client';

/** A compound row WITH its entity's row-anchored action plane. */

import { useCallback, useRef, useState } from 'react';
import { CompoundRow, type CompoundRowProps } from './CompoundRow';
import { applyCompoundRowPlaneGutterClick } from './compound-row-plane';
import type { TableRowPlane } from '@/components/tables/table-surface-binding';

interface CompoundPlaneRowProps<Row, C extends { key: string; width: string }>
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

  /** The gutter click, with the plane wired in. */
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
