import type { WorkOrderRow, WorkStatus } from '@/components/work-orders/types';

/** Shared work-order ranking SoT. */
function workStatusRank(value: WorkStatus): number {
  if (value === 'IN_PROGRESS') return 0;
  if (value === 'ASSIGNED') return 1;
  if (value === 'OPEN') return 2;
  if (value === 'DONE') return 3;
  return 4;
}

export function compareWorkOrderRows(a: WorkOrderRow, b: WorkOrderRow): number {
  const deadlineA = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
  const deadlineB = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;

  if ((a.stockLevel ?? null) != null || (b.stockLevel ?? null) != null) {
    const stockA = a.stockLevel ?? Number.MAX_SAFE_INTEGER;
    const stockB = b.stockLevel ?? Number.MAX_SAFE_INTEGER;
    if (stockA !== stockB) return stockA - stockB;
  }
  if (workStatusRank(a.status) !== workStatusRank(b.status)) {
    return workStatusRank(a.status) - workStatusRank(b.status);
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (deadlineA !== deadlineB) return deadlineA - deadlineB;
  return a.entityId - b.entityId;
}

/**
 * The single most important work order for an operator: filter to rows the
 * operator owns (tester OR packer) that are still actionable, then take the
 * top of the shared ranking.
 */
export function topWorkOrderForStaff(rows: WorkOrderRow[], staffId: number): WorkOrderRow | null {
  const mine = rows.filter(
    (row) =>
      (row.techId === staffId || row.packerId === staffId) &&
      row.status !== 'DONE' &&
      row.status !== 'CANCELED',
  );
  if (mine.length === 0) return null;
  return [...mine].sort(compareWorkOrderRows)[0] ?? null;
}
