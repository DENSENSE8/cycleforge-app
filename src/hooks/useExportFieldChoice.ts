'use client';

/**
 * The org-wide export column choice for one table.
 *
 * Same store and the same reasoning as `tableLayouts` and
 * `importMappingProfiles`: the `organizations.settings` passthrough bag, so no
 * migration — and org-wide rather than per-staffer because "what our export
 * contains" is a shape other people downstream depend on. A per-operator export
 * would mean two people sending the same supplier two different spreadsheets.
 *
 * Optimistic: the choice is applied locally the moment it is toggled and the
 * write follows. A failed write leaves the operator with the columns they
 * picked for this session and the org default next time — which is the honest
 * failure for a preference, and much better than a checkbox that springs back
 * while they are reading it.
 */

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
