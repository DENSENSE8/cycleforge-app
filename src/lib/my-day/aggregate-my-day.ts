import type { WorkOrderRow } from '@/components/work-orders/types';
import { fetchAllWorkOrderQueues } from '@/lib/work-orders/fetch-all-queues';
import { compareWorkOrderRows, topWorkOrderForStaff } from '@/lib/work-orders/ranking';
import { listSupportFollowupsForStaff } from '@/lib/inbox/support-followups-queries';
import { listTechQueueItemsForStaff } from '@/lib/inbox/tech-queue-items';
import { SURFACE_REGISTRY } from '@/lib/stations/surface-keys';
import { interruptHref } from './my-day-href';
import type { MyDayFeed, MyDayInterrupt, MyDayQueueCard } from './my-day-types';

function isAssignedRow(row: WorkOrderRow): boolean {
  return row.techId != null || row.packerId != null;
}

function isActionableRow(row: WorkOrderRow): boolean {
  return row.status !== 'DONE' && row.status !== 'CANCELED';
}

function isMineRow(row: WorkOrderRow, staffId: number): boolean {
  return (
    isActionableRow(row) &&
    (row.techId === staffId || row.packerId === staffId)
  );
}

const QUEUE_SURFACE_LINKS: Array<{
  key: string;
  label: string;
  permission: string;
  href: string;
  match: (row: WorkOrderRow) => boolean;
}> = [
  {
    key: 'orders',
    label: 'Orders',
    permission: 'dashboard.view',
    href: '/dashboard?unshipped',
    match: (row) => row.queueKey === 'orders',
  },
  {
    key: 'receiving',
    label: 'Arrival',
    permission: 'receiving.view',
    href: SURFACE_REGISTRY.triage.route,
    match: (row) =>
      row.queueKey === 'test_receiving' || row.entityType === 'RECEIVING',
  },
  {
    key: 'pack',
    label: 'Packing',
    permission: 'packing.view',
    href: SURFACE_REGISTRY.pack.route,
    match: (row) => row.queueKey === 'orders' && row.packerId == null,
  },
  {
    key: 'test',
    label: 'Testing',
    permission: 'tech.view',
    href: SURFACE_REGISTRY.test.route,
    match: (row) =>
      row.queueKey === 'test_returns' ||
      row.queueKey === 'test_receiving',
  },
  {
    key: 'fba',
    label: 'FBA prep',
    permission: 'fba.view',
    href: '/fba',
    match: (row) => row.queueKey === 'fba_shipments',
  },
  {
    key: 'support',
    label: 'Support',
    permission: 'integrations.zendesk',
    href: '/support',
    match: () => false,
  },
];

function buildQueueCards(
  rows: WorkOrderRow[],
  permissions: Set<string>,
  interruptCount: number,
): MyDayQueueCard[] {
  const cards: MyDayQueueCard[] = [];

  for (const link of QUEUE_SURFACE_LINKS) {
    if (!permissions.has(link.permission)) continue;
    const count =
      link.key === 'support'
        ? interruptCount
        : rows.filter((row) => isActionableRow(row) && link.match(row)).length;
    if (link.key !== 'support' && count === 0) continue;
    cards.push({
      key: link.key,
      label: link.label,
      count,
      href: link.href,
      permission: link.permission,
    });
  }

  return cards;
}

function mapTechInterrupts(items: Awaited<ReturnType<typeof listTechQueueItemsForStaff>>): MyDayInterrupt[] {
  return items.map((it) => {
    const isReturn = it.kind === 'return_pending_test';
    const interrupt: MyDayInterrupt = {
      id: `techq-${it.kind}-${it.receivingId}`,
      kind: it.kind,
      title: isReturn ? 'Return · needs testing' : 'Order · ready to ship',
      subtitle: it.trackingNumber
        ? `${isReturn ? 'Unboxed return' : 'Unboxed · pending order'} · ${it.trackingNumber}`
        : isReturn
          ? 'Unboxed return awaiting test'
          : 'Unboxed — pending order ready to ship',
      href: interruptHref({
        kind: it.kind,
        receivingId: it.receivingId,
        lineId: it.lineId ?? undefined,
      }),
      createdAtMs: it.unboxedAt ? new Date(it.unboxedAt).getTime() : Date.now(),
      receivingId: it.receivingId,
      lineId: it.lineId ?? undefined,
    };
    return interrupt;
  });
}

function mapSupportInterrupts(
  items: Awaited<ReturnType<typeof listSupportFollowupsForStaff>>,
): MyDayInterrupt[] {
  return items.map((it) => ({
    id: `support-${it.ticketId}`,
    kind: 'support_followup' as const,
    title: it.subject?.trim() || `Ticket #${it.ticketId}`,
    subtitle: `Follow up · assigned to ${it.assignedStaffName}`,
    href: interruptHref({ kind: 'support_followup', ticketId: it.ticketId }),
    createdAtMs: it.updatedAtMs,
    ticketId: it.ticketId,
  }));
}

export async function aggregateMyDayFeed(args: {
  organizationId: string;
  staffId: number;
  permissions: Set<string>;
}): Promise<MyDayFeed> {
  const { organizationId, staffId, permissions } = args;

  const allRows = permissions.has('work_orders.view')
    ? await fetchAllWorkOrderQueues(organizationId, { unified: true })
    : [];

  const assigned = permissions.has('work_orders.view')
    ? [...allRows]
        .filter((row) => isMineRow(row, staffId))
        .sort(compareWorkOrderRows)
    : [];

  const doNext = permissions.has('work_orders.view')
    ? topWorkOrderForStaff(allRows, staffId)
    : null;

  const [techItems, supportItems] = await Promise.all([
    listTechQueueItemsForStaff(organizationId, staffId),
    listSupportFollowupsForStaff(organizationId, staffId),
  ]);

  const interrupts = [
    ...mapSupportInterrupts(supportItems),
    ...mapTechInterrupts(techItems),
  ].sort((a, b) => b.createdAtMs - a.createdAtMs);

  const supportInterruptCount = supportItems.length;
  const queueCards = buildQueueCards(allRows, permissions, supportInterruptCount);

  const unassigned = allRows.filter(
    (row) => isActionableRow(row) && !isAssignedRow(row),
  ).length;

  return {
    doNext,
    assigned,
    interrupts,
    queueCards,
    counts: {
      assigned: assigned.length,
      interrupts: interrupts.length,
      unassigned,
    },
  };
}