'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { receivingSiblingsQueryKey } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';

interface SplitLineSerialArgs {
  receivingId: number;
  line: ReceivingLineRow;
  staffId: string;
  /** Extra refresh after cache invalidation (e.g. testing line-updated event). */
  onSuccess?: () => void;
}

/**
 * Split a line's first serial onto a brand-new unmatched row — the Testing
 * UNLINK path (wrong physical item). Creates the target via
 * `add-unmatched-line`, then re-homes membership with `serial-move`.
 */
export function useSplitLineSerial() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const split = useCallback(
    async ({ receivingId, line, staffId, onSuccess }: SplitLineSerialArgs): Promise<boolean> => {
      const lineSerials = (line.serials ?? []) as Array<{ id: number; serial_number: string }>;
      if (busy || lineSerials.length === 0) return false;

      setBusy(true);
      try {
        const created = await fetch('/api/receiving/add-unmatched-line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: receivingId,
            sku: line.sku ?? undefined,
            quantity_expected: 1,
            staff_id: Number(staffId) || undefined,
          }),
        });
        const cdata = await created.json().catch(() => null);
        const newLineId = cdata?.line?.id as number | undefined;
        if (!created.ok || !cdata?.success || !newLineId) {
          toast.error(cdata?.error || 'Could not create a new row to split into');
          return false;
        }

        const moveRes = await fetch('/api/receiving/serial-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_unit_id: lineSerials[0].id,
            target_receiving_line_id: newLineId,
            client_event_id: safeRandomUUID(),
          }),
        });
        const moveData = await moveRes.json().catch(() => null);
        const ok = Boolean(moveRes.ok && moveData?.success);
        toast[ok ? 'success' : 'error'](ok ? 'Split to its own row' : 'Could not split the serial');
        if (!ok) return false;

        void queryClient.invalidateQueries({ queryKey: receivingSiblingsQueryKey(receivingId) });
        void queryClient.invalidateQueries({ queryKey: ['receiving-lines'] });
        onSuccess?.();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not split the serial');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, queryClient],
  );

  return { split, busy };
}
