'use client';

/**
 * Turn a sheet's formattable column list into the toolbar's Format handlers.
 *
 * Lives in the shell, not on the page, for the same reason Copy/Export/Print
 * do: every surface wiring its own bold handler is how bold ends up meaning
 * something slightly different on the sixth surface. A page passes the columns
 * it will let an operator format; everything else — which column is targeted,
 * what the marks currently read, and the optimistic write — happens here.
 *
 * ## Toggle semantics
 *
 * A mark toggles against the ACTIVE column's current value, and every write
 * sends the column's whole format. Sending one field would need the server to
 * merge, which is exactly where two people formatting the same column at the
 * same moment produce a row neither asked for.
 */

import { useCallback, useMemo } from 'react';
import { useSheetChrome } from '@/components/sheet/sheet-chrome-context';
import { formatFor, useColumnFormats } from '@/hooks/useColumnFormats';
import type { ColumnFormat } from '@/lib/tables/column-formats';
import type { SheetFormatHandlers } from '@/components/sheet/SheetToolbar';

/** A column an operator may format — key plus the label the picker shows. */
export interface SheetFormatColumn {
  key: string;
  label: string;
}

export interface SheetFormatState {
  handlers: SheetFormatHandlers;
  columns: readonly SheetFormatColumn[];
  activeColumnKey: string | null;
  setActiveColumnKey: (key: string | null) => void;
  /** Every column's format — the grid reads this to paint. */
  formats: ReturnType<typeof useColumnFormats>['formats'];
  clearAll: () => void;
}

export function useSheetFormat(
  tableId: string,
  columns: readonly SheetFormatColumn[] | undefined,
): SheetFormatState {
  const { activeColumnKey, setActiveColumnKey } = useSheetChrome();
  const { formats, setFormat, clearAll } = useColumnFormats(
    columns && columns.length > 0 ? tableId : null,
  );

  const list = useMemo(() => columns ?? [], [columns]);
  // Only a column still offered by the sheet may be the target: a saved active
  // column whose track was hidden since would otherwise let an operator paint
  // something they cannot see.
  const resolvedKey =
    activeColumnKey && list.some((c) => c.key === activeColumnKey) ? activeColumnKey : null;
  const current = formatFor(formats, resolvedKey);

  const write = useCallback(
    (patch: Partial<ColumnFormat>) => {
      if (!resolvedKey) return;
      setFormat(resolvedKey, { ...current, ...patch });
    },
    [current, resolvedKey, setFormat],
  );

  const handlers = useMemo<SheetFormatHandlers>(
    () => ({
      bold: current.bold,
      italic: current.italic,
      strike: current.strike,
      onToggleBold: () => write({ bold: !current.bold }),
      onToggleItalic: () => write({ italic: !current.italic }),
      onToggleStrike: () => write({ strike: !current.strike }),
      textColor: current.textColor,
      fillColor: current.fillColor,
      onTextColor: (swatch) => write({ textColor: swatch }),
      onFillColor: (swatch) => write({ fillColor: swatch }),
      align: current.align,
      onAlign: (align) => write({ align }),
      disabled: resolvedKey == null,
    }),
    [current, resolvedKey, write],
  );

  return {
    handlers,
    columns: list,
    activeColumnKey: resolvedKey,
    setActiveColumnKey,
    formats,
    clearAll,
  };
}
