import type { WorkOrderRow } from '@/components/work-orders/types';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';

/** Deadline banding for the staffer's own queue (`/m/work`) — R-FLOW-3. */

export type DeadlineBand = 'overdue' | 'today' | 'upcoming' | 'none';

/** Render order: most urgent first — must-ship-today never below the fold. */
export const DEADLINE_BAND_ORDER: readonly DeadlineBand[] = ['overdue', 'today', 'upcoming', 'none'];

export const DEADLINE_BAND_LABEL: Record<DeadlineBand, string> = {
  overdue: 'Overdue',
  today: 'Must ship today',
  upcoming: 'Upcoming',
  none: 'No deadline',
};

/** Classify one deadline into its band relative to `todayKey` (defaults to the warehouse's current civil date; injectable for tests). */
export function classifyDeadlineBand(
  deadlineAt: string | null | undefined,
  todayKey: string = getCurrentPSTDateKey(),
): DeadlineBand {
  const deadlineKey = toPSTDateKey(deadlineAt);
  if (!deadlineKey || !todayKey) return 'none';
  if (deadlineKey < todayKey) return 'overdue';
  if (deadlineKey === todayKey) return 'today';
  return 'upcoming';
}

/** The staffer's own actionable rows. */
export function filterAssignedToStaff(rows: WorkOrderRow[], staffId: number): WorkOrderRow[] {
  return rows.filter(
    (row) =>
      (row.techId === staffId || row.packerId === staffId) &&
      row.status !== 'DONE' &&
      row.status !== 'CANCELED',
  );
}

/** Inside a band: priority asc → deadline asc (missing last) → entityId asc. */
export function compareWithinBand(a: WorkOrderRow, b: WorkOrderRow): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const deadlineA = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
  const deadlineB = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (deadlineA !== deadlineB) return deadlineA - deadlineB;
  return a.entityId - b.entityId;
}

export interface DeadlineBandGroup {
  band: DeadlineBand;
  label: string;
  rows: WorkOrderRow[];
}

/**
 * Group rows into deadline bands, sorted within each band, returned in band
 * order with empty bands omitted (the page renders only headers that have
 * rows under them).
 */
export function bandWorkOrderRows(
  rows: WorkOrderRow[],
  todayKey: string = getCurrentPSTDateKey(),
): DeadlineBandGroup[] {
  const byBand = new Map<DeadlineBand, WorkOrderRow[]>();
  for (const row of rows) {
    const band = classifyDeadlineBand(row.deadlineAt, todayKey);
    const bucket = byBand.get(band);
    if (bucket) bucket.push(row);
    else byBand.set(band, [row]);
  }
  const groups: DeadlineBandGroup[] = [];
  for (const band of DEADLINE_BAND_ORDER) {
    const bucket = byBand.get(band);
    if (!bucket || bucket.length === 0) continue;
    groups.push({ band, label: DEADLINE_BAND_LABEL[band], rows: [...bucket].sort(compareWithinBand) });
  }
  return groups;
}

/** Homepage preview size — three most urgent assigned orders in the inset group. */
export const ASSIGNED_ORDERS_HOME_PREVIEW = 3;

/**
 * Shipping/to-ship assignments only. The mine list mixes repairs, FBA, stock
 * and receiving; the homepage "Orders" group and `/m/work` view-all are the
 * per-staff display of orders assigned from the to-ship table.
 */
export function assignedOrderRows(rows: readonly WorkOrderRow[]): WorkOrderRow[] {
  return rows.filter((row) => row.entityType === 'ORDER');
}

/**
 * Flatten deadline bands (overdue → today → upcoming → none) and take the
 * first `limit` rows. Homepage SoT for "three most urgent."
 */
export function takeMostUrgentWorkOrders(
  rows: readonly WorkOrderRow[],
  limit: number = ASSIGNED_ORDERS_HOME_PREVIEW,
  todayKey?: string,
): WorkOrderRow[] {
  if (limit <= 0) return [];
  return bandWorkOrderRows([...rows], todayKey).flatMap((group) => group.rows).slice(0, limit);
}

/** Phone order detail — marketplace `order_id`, falling back to the numeric pk. */
export function mobileAssignedOrderHref(row: Pick<WorkOrderRow, 'orderId' | 'entityId'>): string {
  const key = row.orderId?.trim() || String(row.entityId);
  return `/m/orders/${encodeURIComponent(key)}`;
}
