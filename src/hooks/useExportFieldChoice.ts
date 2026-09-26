'use client';

/** The org-wide export column choice for one table. */

import { useCallback, useEffect, useState } from 'react';
import { readStoredExportFieldIds } from '@/lib/tables/export/export-fields';

const ENDPOINT = '/api/tables/export-fields';

export function useExportFieldChoice(tableId: string | null): {
  chosenFieldIds: string[] | null;
  setChosenFieldIds: (next: string[]) => void;
} {
  const [chosen, setChosen] = useState<string[] | null>(null);

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${ENDPOINT}?tableId=${encodeURIComponent(tableId)}`);
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setChosen(readStoredExportFieldIds(json?.fieldIds));
      } catch {
        // A stored choice is an accelerator; failing to read it means the
        // defaults, which is exactly what the blind download always did.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  const setChosenFieldIds = useCallback(
    (next: string[]) => {
      setChosen(next);
      if (!tableId) return;
      void (async () => {
        try {
          await fetch(ENDPOINT, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tableId, fieldIds: next }),
          });
        } catch (error) {
          console.error('[useExportFieldChoice] write failed:', error);
        }
      })();
    },
    [tableId],
  );

  return { chosenFieldIds: chosen, setChosenFieldIds };
}
