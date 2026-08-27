'use client';

/**
 * Shared work-order assignment waist — staff options + the confirm write.
 *
 * `WorkOrderAssignmentCard` is a CAROUSEL over N rows (prev/next, per-row
 * drafts, confirm→advance), so the same machinery serves one record from the
 * order inspector and a whole multi-select from the dashboard bulk bar. Only the
 * post-confirm side-effect differs, which is what `onAssigned` is for.
 *
 * Extracted from `useShippedAssignment` when the dashboard selection bar needed
 * the identical staff load + PATCH: forking it would have been a second writer
 * to `/api/work-orders` with its own drift path.
 */

import { useCallback, useState } from 'react';
import { getPresentStaffForToday, type StaffMember } from '@/lib/staffCache';
import { staffHasRole } from '@/utils/staff';
import { toast } from '@/lib/toast';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { AssignmentConfirmPayload } from '@/components/work-orders/WorkOrderAssignmentCard';
import type { StaffOption } from '@/design-system/components/work-order-assignment/work-order-assignment-shared';
import { refreshDomain } from '@/lib/refresh/bus';

export function useWorkOrderAssignment({
  onAssigned,
}: {
  /** Fired after a successful write — patch local state, refetch, etc. */
  onAssigned?: (row: WorkOrderRow, payload: AssignmentConfirmPayload) => void;
} = {}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const technicianOptions: StaffOption[] = staff
    .filter((member) => staffHasRole(member, 'technician'))
    .map((member) => ({ id: Number(member.id), name: member.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const packerOptions: StaffOption[] = staff
    .filter((member) => staffHasRole(member, 'packer'))
    .map((member) => ({ id: Number(member.id), name: member.name }));

  /** Load today's present staff. Resolves false when the roster can't be read. */
  const loadStaff = useCallback(async (): Promise<boolean> => {
    try {
      setStaff(await getPresentStaffForToday());
      return true;
    } catch {
      toast.error('Failed to load staff');
      return false;
    }
  }, []);

  const confirmAssignment = useCallback(
    async (row: WorkOrderRow, payload: AssignmentConfirmPayload) => {
      const nextStatus = payload.status ?? (payload.techId && payload.packerId ? 'ASSIGNED' : 'OPEN');
      try {
        const res = await fetch('/api/work-orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: row.entityType,
            entityId: row.entityId,
            assignedTechId: payload.techId,
            assignedPackerId: payload.packerId,
            status: nextStatus,
            priority: row.priority,
            deadlineAt: payload.deadline,
            notes: row.notes,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.details || data?.error || 'Failed to save assignment');
        }
        refreshDomain('work-orders');
        onAssigned?.(row, payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save assignment');
      }
    },
    [onAssigned],
  );

  return { technicianOptions, packerOptions, loadStaff, confirmAssignment };
}
