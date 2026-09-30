'use client';

/**
 * Change a repair's status from its card (owner 2026-09-29) through the one
 * status writer the record uses — `PATCH /api/repair-service { id, status }`
 * (`updateRepairStatus`: `status_history` entry, the SLA start). The loaded
 * lists move at once; a refused write puts the old status back.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { toast } from '@/lib/toast';
import { qk } from '@/queries/keys';

export function useRepairStatusChange(): (repair: RSRecord, next: string) => Promise<void> {
  const queryClient = useQueryClient();
  const inbox = useActivityInboxOptional();
  return useCallback(
    async (repair: RSRecord, next: string) => {
      const previous = repair.status;
      if (previous === next) return;
      const paint = (status: string) =>
        queryClient.setQueriesData({ queryKey: qk.repairs.all }, (rows: unknown) =>
          Array.isArray(rows) ? (rows as RSRecord[]).map((row) => (row.id === repair.id ? { ...row, status } : row)) : rows,
        );
      await queryClient.cancelQueries({ queryKey: qk.repairs.all });
      paint(next);
      try {
        const res = await fetch('/api/repair-service', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: repair.id, status: next }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        inbox?.pushRepairStatusChange({ repairId: repair.id, previousStatus: previous, nextStatus: next });
      } catch {
        paint(previous);
        toast.error(`Could not set the repair to ${repairStatusOperatorLabel(next)}`);
      } finally {
        void queryClient.invalidateQueries({ queryKey: qk.repairs.all });
      }
    },
    [queryClient, inbox],
  );
}
