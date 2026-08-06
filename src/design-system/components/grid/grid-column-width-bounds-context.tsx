'use client';

/**
 * Staff widthBounds for the active LedgerGrid surface — set by
 * {@link LedgerGridSurface}, read by header resize grips so every family
 * inherits clamps without each view forwarding a prop.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { ColumnWidthBound } from '@/components/ui/table-column-config/useColumnWidths';

const GridColumnWidthBoundsContext = createContext<
  Readonly<Record<string, ColumnWidthBound>>
>({});

export function GridColumnWidthBoundsProvider({
  boundsByKey,
  children,
}: {
  boundsByKey: Readonly<Record<string, ColumnWidthBound>>;
  children: ReactNode;
}) {
  return (
    <GridColumnWidthBoundsContext.Provider value={boundsByKey}>
      {children}
    </GridColumnWidthBoundsContext.Provider>
  );
}

/** Per-column staff min/max clamps for the surrounding grid surface. */
export function useGridColumnWidthBoundsContext(): Readonly<
  Record<string, ColumnWidthBound>
> {
  return useContext(GridColumnWidthBoundsContext);
}
