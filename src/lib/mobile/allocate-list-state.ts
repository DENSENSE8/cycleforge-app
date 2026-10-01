import type { WorkOrderRow } from '@/components/work-orders/types';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { resolveOutboundSlaCountdown } from '@/lib/shipping/outbound-sla';
import { getDaysLateNullable } from '@/utils/date';

export type AllocateSort = 'sla' | 'newest' | 'location' | 'platform' | 'quantity';
export type AllocateDensity = 'high' | 'comfortable';

export const ALLOCATE_SORTS: readonly { id: AllocateSort; label: string }[] = [
  { id: 'sla', label: 'SLA' },
  { id: 'newest', label: 'Newest' },
  { id: 'location', label: 'Location' },
  { id: 'platform', label: 'Platform' },
  { id: 'quantity', label: 'Quantity' },
] as const;

export function parseAllocateSort(value: string | null | undefined): AllocateSort {
  return ALLOCATE_SORTS.some((option) => option.id === value) ? value as AllocateSort : 'sla';
}

export function parseAllocateDensity(value: string | null | undefined): AllocateDensity {
  return value === 'comfortable' ? 'comfortable' : 'high';
}

const dateMs = (value: string | null | undefined, fallback: number): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const quantityOf = (row: Pick<WorkOrderRow, 'quantity'>): number => {
  const parsed = Number.parseInt(String(row.quantity ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const locationOf = (row: Pick<WorkOrderRow, 'storageLocations'>): string =>
  formatOutboundStoragePath(row.storageLocations) || '\uffff';

/** Stable, deterministic ordering for the mobile Allocate queue. */
export function sortAllocateRows<T extends WorkOrderRow>(rows: readonly T[], sort: AllocateSort): T[] {
  return [...rows].sort((a, b) => {
    let compared = 0;
    if (sort === 'newest') compared = dateMs(b.createdAt, b.entityId) - dateMs(a.createdAt, a.entityId);
    else if (sort === 'location') compared = locationOf(a).localeCompare(locationOf(b));
    else if (sort === 'platform') compared = String(a.accountSource ?? '').localeCompare(String(b.accountSource ?? ''));
    else if (sort === 'quantity') compared = quantityOf(b) - quantityOf(a);
    else compared = dateMs(a.deadlineAt, Number.MAX_SAFE_INTEGER) - dateMs(b.deadlineAt, Number.MAX_SAFE_INTEGER);
    return compared || a.entityId - b.entityId;
  });
}

/** Exact deadlines get a countdown; date-only ship-bys remain honest civil-day labels. */
export function allocateSlaLabel(
  deadlineAt: string | null | undefined,
  fallback: string,
  nowMs: number,
): string {
  const exact = resolveOutboundSlaCountdown(deadlineAt, nowMs);
  if (exact.exact) {
    // Hour counts stop scanning well once they cross multiple days. Preserve
    // exact minute/hour language near the deadline, then compact the long tail.
    const longHours = /^(Late )?(\d+)h(?: \d+m)?(?: remaining)?$/.exec(exact.label);
    if (longHours && Number(longHours[2]) >= 48) {
      const days = Math.floor(Number(longHours[2]) / 24);
      const prefix = longHours[1] ?? '';
      return prefix ? `${prefix}${days}d` : `${days}d remaining`;
    }
    return exact.label;
  }
  const daysLate = getDaysLateNullable(deadlineAt);
  if (daysLate && daysLate > 0) return `Late ${daysLate}d`;
  return fallback;
}
