'use client';

/** `LedgerGridLeafRow` — structural SoT for one spreadsheet leaf row. */

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
  /** Rendered AFTER the cells, inside the row element. */
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
      // The neutral row marker the airtable skin keys its BOTTOM-rule language off.
      data-grid-row=""
      ref={ref}
      {...rest}
      className={cn(
        // The ROW HOVER GROUP every gutter face reaches for.
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
