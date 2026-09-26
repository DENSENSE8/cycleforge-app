'use client';

/** Persist packing-checklist ticks (packing-checklist-plan Phase 2). */

import { useCallback } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { PackingTickKind, PackingTickOrigin } from '@/lib/packing/packing-checks';

export type { PackingTickKind };

export function usePackingCheckPersist() {
  /**
   * Returns true when persisted (or when there is nothing to persist — a
   * SKU-only scan has no order row); false when the write failed and the
   * caller should roll back its optimistic tick.
   */
  const persistTick = useCallback(
    async (
      orderRowId: number | null | undefined,
      kind: PackingTickKind,
      stepId: number,
      checked: boolean,
      origin: PackingTickOrigin = 'acknowledgement',
    ): Promise<boolean> => {
      if (!orderRowId || orderRowId <= 0) return true; // SKU-only scan — local-only tick
      try {
        const res = await fetch(`/api/orders/${orderRowId}/packing-checks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            stepId,
            checked,
            origin,
            clientEventId: safeRandomUUID(),
          }),
        });
        if (!res.ok) {
          console.warn('[packing-checks] tick persist failed', res.status);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('[packing-checks] tick persist failed', err);
        return false;
      }
    },
    [],
  );

  return { persistTick };
}
