import type { WorkOrderRow } from '@/components/work-orders/types';
import { getIdentificationJob } from '@/lib/identification';
import {
  EMPTY_META_DASH,
  conditionGradeTableLabel,
  conditionLabel,
} from '@/lib/conditions';

export type MobileToShipTab = 'all' | 'assigned' | 'unassigned';

export const MOBILE_TO_SHIP_TABS: readonly { id: MobileToShipTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'unassigned', label: 'Unassigned' },
];

export function parseMobileToShipTab(raw: string | null | undefined): MobileToShipTab {
  if (raw === 'assigned' || raw === 'unassigned') return raw;
  return 'all';
}

export function isAssignedToShipRow(row: Pick<WorkOrderRow, 'techId' | 'packerId'>): boolean {
  return row.techId != null || row.packerId != null;
}

export function filterToShipByTab(
  rows: readonly WorkOrderRow[],
  tab: MobileToShipTab,
): WorkOrderRow[] {
  if (tab === 'all') return [...rows];
  if (tab === 'assigned') return rows.filter(isAssignedToShipRow);
  return rows.filter((row) => !isAssignedToShipRow(row));
}

/** Per-order identification claim — pick JobFace, then the picker session. */
export function mobileProcessOrderHref(row: Pick<WorkOrderRow, 'entityId'>): string {
  const pick = getIdentificationJob('pick');
  return pick?.claimPath(String(row.entityId)) ?? `/m/id/pick/${row.entityId}`;
}

/** Marketplace order id for last-8 chips — never the internal numeric pk. */
export function toShipOrderId(
  row: Pick<WorkOrderRow, 'orderId' | 'recordLabel' | 'entityId'>,
): string {
  const orderId = row.orderId?.trim();
  if (orderId) return orderId;
  const label = row.recordLabel?.trim();
  if (label) return label;
  return String(row.entityId);
}

export function toShipTrackingNumber(
  row: Pick<WorkOrderRow, 'trackingNumber'>,
): string | null {
  const tracking = row.trackingNumber?.trim();
  return tracking || null;
}

export type MobileToShipSort = 'deadline' | 'assignee' | 'order' | 'title';

export const MOBILE_TO_SHIP_SORTS: readonly { id: MobileToShipSort; label: string }[] = [
  { id: 'deadline', label: 'Ship by' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'assignee', label: 'Assigned' },
  { id: 'order', label: 'Order' },
];

export function parseMobileToShipSort(raw: string | null | undefined): MobileToShipSort {
  if (raw === 'assignee' || raw === 'order' || raw === 'title') return raw;
  return 'deadline';
}

export function isToShipOutOfStock(row: Pick<WorkOrderRow, 'outOfStock'>): boolean {
  return Boolean(String(row.outOfStock || '').trim());
}

function conditionSearchText(condition: string | null | undefined): string {
  const raw = String(condition ?? '').trim();
  if (!raw) return '';
  const labels = [
    conditionGradeTableLabel(raw),
    conditionLabel(raw, 'full'),
    conditionLabel(raw, 'compact'),
    conditionLabel(raw, 'pill'),
    conditionLabel(raw, 'label'),
    conditionLabel(raw, 'option'),
  ].filter((label) => label && label !== EMPTY_META_DASH);
  return [raw, ...labels].join('\n');
}

/** Find an order by product, category, condition, identifiers, or assignee. */
export function filterToShipByQuery(
  rows: readonly WorkOrderRow[],
  query: string | null | undefined,
  resolveName?: (id: number) => string,
): WorkOrderRow[] {
  const needle = query?.trim().toLowerCase() ?? '';
  if (!needle) return [...rows];
  return rows.filter((row) => {
    const fields = [
      row.title,
      row.catalogCategory ?? '',
      row.serialNumber ?? '',
      row.notes ?? '',
      row.accountSource ?? '',
      row.quantity ?? '',
      conditionSearchText(row.condition),
      toShipOrderId(row),
      toShipTrackingNumber(row) ?? '',
      row.sku ?? '',
      row.itemNumber ?? '',
      toShipPickerLabel(row, resolveName) ?? '',
      toShipPackerLabel(row, resolveName) ?? '',
    ].map((value) => value.toLowerCase());
    if (needle.length === 1) {
      return fields.some((value) =>
        value
          .split('\n')
          .map((part) => part.trim())
          .includes(needle),
      );
    }
    return fields.some((value) => value.includes(needle));
  });
}

function resolveStaffLabel(
  name: string | null | undefined,
  id: number | null | undefined,
  resolveName?: (id: number) => string,
): string | null {
  const named = name?.trim();
  if (named) return named;
  if (id == null) return null;
  const resolved = resolveName?.(id)?.trim();
  if (resolved && resolved !== '---') return resolved;
  return null;
}

/** Pick assignment — tester_id / tester_name on the unshipped feed. */
export function toShipPickerLabel(
  row: Pick<WorkOrderRow, 'techName' | 'techId'>,
  resolveName?: (id: number) => string,
): string | null {
  return resolveStaffLabel(row.techName, row.techId, resolveName);
}

/** Pack assignment — packer_id / packer_name (assigned), then packed_by_name. */
export function toShipPackerLabel(
  row: Pick<WorkOrderRow, 'packerName' | 'packerId'>,
  resolveName?: (id: number) => string,
): string | null {
  return resolveStaffLabel(row.packerName, row.packerId, resolveName);
}

/** First token of a staff label — the phone row has no room for a surname. */
export function toShipGivenName(label: string | null | undefined): string | null {
  const first = label?.trim().split(/\s+/)[0];
  return first || null;
}

/** Packer first (the ship assignment), then tester. Sort/fallback only. */
export function toShipAssigneeLabel(
  row: Pick<WorkOrderRow, 'techName' | 'packerName' | 'techId' | 'packerId'>,
  resolveName?: (id: number) => string,
): string | null {
  return toShipPackerLabel(row, resolveName) || toShipPickerLabel(row, resolveName);
}

export function sortToShipRows(
  rows: readonly WorkOrderRow[],
  sort: MobileToShipSort,
  resolveName?: (id: number) => string,
): WorkOrderRow[] {
  const next = [...rows];
  if (sort === 'assignee') {
    return next.sort((a, b) => {
      const nameA = toShipAssigneeLabel(a, resolveName) ?? '\uFFFF';
      const nameB = toShipAssigneeLabel(b, resolveName) ?? '\uFFFF';
      const cmp = nameA.localeCompare(nameB);
      return cmp !== 0 ? cmp : a.entityId - b.entityId;
    });
  }
  if (sort === 'order') {
    return next.sort((a, b) => {
      const cmp = toShipOrderId(a).localeCompare(toShipOrderId(b));
      return cmp !== 0 ? cmp : a.entityId - b.entityId;
    });
  }
  if (sort === 'title') {
    return next.sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      return cmp !== 0 ? cmp : a.entityId - b.entityId;
    });
  }
  return next.sort((a, b) => {
    const deadlineA = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
    const deadlineB = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (deadlineA !== deadlineB) return deadlineA - deadlineB;
    return a.entityId - b.entityId;
  });
}
