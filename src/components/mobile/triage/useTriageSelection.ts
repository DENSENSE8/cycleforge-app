'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The row a triage list is "on" — the one the operator last opened — so the
 * 2px ink selection outline (BRIEF §4/§5) is waiting on it when they come back
 */
export function useTriageSelection(list: string): [string | null, (id: string) => void] {
  const key = `cf-m-triage-selected:${list}`;
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSelected(sessionStorage.getItem(key));
    } catch {
      // Private mode: the outline simply does not persist across the visit.
    }
  }, [key]);

  const select = useCallback(
    (id: string) => {
      setSelected(id);
      try {
        sessionStorage.setItem(key, id);
      } catch {
        // As above.
      }
    },
    [key],
  );

  return [selected, select];
}
