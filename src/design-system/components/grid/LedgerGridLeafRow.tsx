'use client';

/**
 * `LedgerGridLeafRow` — structural SoT for one spreadsheet leaf row.
 *
 * Owns the repeated ritual every family used to copy: columnar shell +
 * `ledgerRowFillClass` + CSS grid template + map columns → `renderCell`.
 * Domain cell registries stay outside — pass `renderCell(col, { last, rule })`.
 *
 * Interaction attrs (`role`, `onClick`, `aria-*`, data-* hooks) pass through
 * via standard div props so plane-split select / open-record stay per family.
 */

import {
  Fragment,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import type {
  GridSurfaceCapabilities,
  LedgerGridColumnModel,
} from '@/design-system/components/grid/grid-surface-descriptor';
import { ledgerGridRowShellClass } from '@/design-system/components/grid/grid-cell-chrome';
import { cn } from '@/utils/_cn';

export interface LedgerGridLeafCellMeta {
  /** True when this is the last visible column (drop trailing hairline). */
  last: boolean;
  /** `!last` — convenience for `ledgerGridCell({ rule })`. */
  rule: boolean;
}

export interface LedgerGridLeafRowProps<C extends LedgerGridColumnModel>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Rendered AFTER the cells, inside the row element.
   *
   * The row-anchored action plane and nothing else: a panel that must position
   * against the row (not against a cell, which would park it on top of the
   * columns the operator is reading) has to be a descendant of it. It is not a
   * track and it takes no grid space — it is absolutely positioned by whatever
   * mounts it.
   *
   * This is deliberately narrow. It is NOT a slot for family markup: the cells
   * are still the only thing that paints row content, and the engine is the
   * only caller (`CompoundPlaneRow`), which takes the plane from the BINDING.
   */
  children?: ReactNode;
  /** The row element — what a plane anchors to. */
  ref?: Ref<HTMLDivElement>;
  columns: readonly C[];
  /** CSS `grid-template-columns` from the surface's `*GridTemplate(columns)`. */
  template: string;
  selected: boolean;
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
  /** Optional triage wash — gated by `capabilities.rowTriageFlags`. */
  flagClass?: string | null;
  /**
   * When false, skip the shared scroll-min shell width var (rare). Default
   * true — every airtable LedgerGrid leaf shares `--cf-orders-grid-w`.
   */
  scrollMinContent?: boolean;
  /** Override mobile stacking (almost always false under LedgerGrid). */
  isMobile?: boolean;
  renderCell: (column: C, meta: LedgerGridLeafCellMeta) => ReactNode;
}

export function LedgerGridLeafRow<C extends LedgerGridColumnModel>({
  columns,
  template,
  selected,
  capabilities,
  flagClass,
  scrollMinContent = true,
  isMobile = false,
  renderCell,
  children,
  ref,
  className,
  style,
  ...rest
}: LedgerGridLeafRowProps<C>) {
  const mergedStyle: CSSProperties = {
    gridTemplateColumns: template,
    ...style,
  };

  return (
    <div
      // The neutral row marker the airtable skin keys its BOTTOM-rule language
      // off. It used to key off `[data-order-row-id]`, so Receiving and Incoming
      // stamped an ORDERS-named attribute on rows that have no order, purely to
      // be matched — and any family that did not know the trick (Tasks) fell
      // outside the language and kept a container hairline the others had moved
      // onto their cells. That is a 1px row-height difference between two tables
      // mounting the identical column model, which is exactly what must not
      // happen. Every row this shell renders now says "I am a grid row" in a
      // word that belongs to no family.
      data-grid-row=""
      ref={ref}
      {...rest}
      className={cn(
        // The ROW HOVER GROUP every gutter face reaches for.
        // `GridSelectSquareFace` is scoped to `group-hover/row`, and only
        // `OrdersQueueTableRow` declared it — so on every family that mounts
        // this shared shell the hover-revealed select square (and, since
        // 2026-09-15, the status ⇄ check swap) had no group to hover: the box
        // only appeared on keyboard focus or a no-hover pointer. One token, and
        // the engine's own claim ("`group/row` is declared by the row shell",
        // GridRowCheckbox) is true on every peer instead of one.
        'group/row',
        ledgerGridRowShellClass(isMobile, { scrollMinContent }),
        ledgerRowFillClass({ selected, flagClass, capabilities }),
        className,
      )}
      style={mergedStyle}
    >
      {columns.map((col, i) => {
        const last = i === columns.length - 1;
        return (
          <Fragment key={col.key}>{renderCell(col, { last, rule: !last })}</Fragment>
        );
      })}
      {children}
    </div>
  );
}
