'use client';

/**
 * A host-local check-set for a triage list whose selection lives nowhere else
 * (no shared selection plane, no bulk writer yet): the face's
 * {@link TriageSelectionPort} over a `Set` of record ids. Shift-click checks
 * one like a plain click. The set survives paging; select-all acts on the
 * visible page (the ids the face publishes).
 */

import { useMemo, useRef, useState } from 'react';
import type { TriageSelectionPort } from './TriageCardList';

export function useLocalTriageSelection<Row>(rowId: (row: Row) => number): TriageSelectionPort<Row> {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const visibleRef = useRef<readonly number[]>([]);
  return useMemo<TriageSelectionPort<Row>>(
    () => ({
      ids,
      toggle: (row) =>
        setIds((prev) => {
          const next = new Set(prev);
          const id = rowId(row);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
      toggleGroup: (groupIds, on) =>
        setIds((prev) => {
          const next = new Set(prev);
          for (const id of groupIds) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      setAll: (on) => setIds(on ? new Set(visibleRef.current) : new Set()),
      publishVisible: (visible) => {
        visibleRef.current = visible;
      },
    }),
    [ids, rowId],
  );
}
