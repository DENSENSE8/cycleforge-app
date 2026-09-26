'use client';

import { ledgerGridCell } from './grid-cell-chrome';
import { cn } from '@/utils/_cn';

/** The body cell for a trailing `_fill` track — the sole `1fr` on a LedgerGrid. */
export function GridFillCell({ className }: { className?: string }) {
  return (
    <div
      data-col="_fill"
      role="presentation"
      aria-hidden
      className={cn(ledgerGridCell({ rule: false }), 'min-h-0', className)}
    />
  );
}

/**
 * The one declaration of the trailing filler track. Spread it as the LAST entry
 * of a column model: `[...facts, GRID_FILL_COLUMN]`.
 */
export const GRID_FILL_COLUMN = {
  key: '_fill' as const,
  width: 'minmax(0rem, 1fr)',
  sortable: false,
  resizable: false,
};
