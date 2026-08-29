'use client';

/**
 * The resolved column formats, published down to the cells that paint them.
 *
 * A context rather than a prop because the distance is long and every step of it
 * is domain code: `SheetView` → the page's grid host → `NonlinearTableHost` →
 * `LedgerGridSurface` → `LedgerGrid` → the family's row renderer → the cell.
 * Threading a formats map through six components, thirteen times over, would put
 * the same prop in ninety signatures — and every one of those is a place it can
 * be forgotten, which shows up as one surface where bold silently does nothing.
 *
 * The value is the map, not a hook with behaviour: reading is all a cell does,
 * and writing belongs to the toolbar.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  columnFormatClass,
  type ColumnFormatMap,
} from '@/lib/tables/column-formats';

const EMPTY: ColumnFormatMap = {};

const SheetFormatContext = createContext<ColumnFormatMap>(EMPTY);

export function SheetFormatProvider({
  formats,
  children,
}: {
  formats: ColumnFormatMap;
  children: ReactNode;
}) {
  return (
    <SheetFormatContext.Provider value={formats}>{children}</SheetFormatContext.Provider>
  );
}

/** Every column's format. Empty outside a sheet — never a throw. */
export function useSheetFormats(): ColumnFormatMap {
  return useContext(SheetFormatContext);
}

/**
 * One column's format as a class string, `''` when unformatted.
 *
 * The empty default is what keeps the border constraint diffable: an
 * unformatted grid emits byte-identical class strings to the ones it emitted
 * before this feature existed, so a before/after DOM diff shows nothing.
 */
export function useColumnFormatClass(columnKey: string): string {
  const formats = useContext(SheetFormatContext);
  const format = formats[columnKey];
  return useMemo(() => columnFormatClass(format), [format]);
}
