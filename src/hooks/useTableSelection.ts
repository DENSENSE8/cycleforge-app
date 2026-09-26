'use client';

import { useEffect, useState } from 'react';
import { onSelectionTotal, selectionEventName } from '@/lib/selection/table-selection';

/** Collect the current selection for a table `scope`. */
export function useTableSelection<T>(
  scope: string,
  getKey?: (row: T) => string | number,
): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const incoming = (e as CustomEvent<T[]>).detail;
      const list = Array.isArray(incoming) ? incoming : [];
      if (!getKey) {
        setRows(list);
        return;
      }
      const byKey = new Map<string | number, T>();
      for (const row of list) byKey.set(getKey(row), row);
      setRows(Array.from(byKey.values()));
    };
    const name = selectionEventName(scope);
    window.addEventListener(name, handler);
    return () => window.removeEventListener(name, handler);
  }, [scope, getKey]);

  return rows;
}

/** Track the count of currently-selectable (visible) rows a table publishes via `emitSelectionTotal(scope, …)`. */
export function useTableSelectionTotal(scope: string): number {
  const [total, setTotal] = useState(0);

  useEffect(() => onSelectionTotal(scope, setTotal), [scope]);

  return total;
}
