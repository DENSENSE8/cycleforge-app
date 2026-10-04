import type { WorkOrderRow } from '@/components/work-orders/types';
import { fetchAllWorkOrderQueues } from '@/lib/work-orders/fetch-all-queues';
import { compareWorkOrderRows, topWorkOrderForStaff } from '@/lib/work-orders/ranking';
import { listSupportFollowupsForStaff } from '@/lib/inbox/support-followups-queries';
import { listTechQueueItemsForStaff } from '@/lib/inbox/tech-queue-items';
import { countUnpairedListings } from '@/lib/inbox/unpaired-listing-count';
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

/** A queue card's count comes from ONE of two places: */
const QUEUE_SURFACE_LINKS: Array<{
  key: string;
  label: string;
  permission: string;
  href: string;
  match: (row: WorkOrderRow) => boolean;
  /** Count supplied by the caller rather than derived from `match`. */
  countFrom?: 'external';
  /** Render at zero. Default is to drop — a card reading "0" invents a story. */
  showAtZero?: boolean;
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
    label: 'Amazon Prep',
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
    countFrom: 'external',
    showAtZero: true,
  },
  {
    // Orders that named a product the catalog does not know.
    key: 'catalog_link',
    label: 'Needs item number',
    permission: 'packing.review',
    href: '/products?view=pairing',
    match: () => false,
    countFrom: 'external',
  },
];

function buildQueueCards(
  rows: WorkOrderRow[],
  permissions: Set<string>,
  externalCounts: Record<string, number>,
): MyDayQueueCard[] {
  const cards: MyDayQueueCard[] = [];

  for (const link of QUEUE_SURFACE_LINKS) {
    if (!permissions.has(link.permission)) continue;
    const count =
      link.countFrom === 'external'
        ? externalCounts[link.key] ?? 0
        : rows.filter((row) => isActionableRow(row) && link.match(row)).length;
    if (count === 0 && !link.showAtZero) continue;
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

  const canSeeWorkOrders = permissions.has('work_orders.view');
  // Gate the query on the same permission the card is filtered by, so an
  // operator who can never see the card never pays for its count.
  const canSeeCatalogLink = permissions.has('packing.review');

  // ONE concurrent wave, not three serial ones.
  const [allRows, techItems, supportItems, unpairedListings] = await Promise.all([
    canSeeWorkOrders
      ? fetchAllWorkOrderQueues(organizationId, { unified: true })
      : Promise.resolve<WorkOrderRow[]>([]),
    listTechQueueItemsForStaff(organizationId, staffId),
    listSupportFollowupsForStaff(organizationId, staffId),
    canSeeCatalogLink ? countUnpairedListings(organizationId) : Promise.resolve(0),
  ]);

  const assigned = canSeeWorkOrders
    ? [...allRows]
        .filter((row) => isMineRow(row, staffId))
        .sort(compareWorkOrderRows)
    : [];

  const doNext = canSeeWorkOrders ? topWorkOrderForStaff(allRows, staffId) : null;

  const interrupts = [
    ...mapSupportInterrupts(supportItems),
    ...mapTechInterrupts(techItems),
  ].sort((a, b) => b.createdAtMs - a.createdAtMs);

  const queueCards = buildQueueCards(allRows, permissions, {
    support: supportItems.length,
    catalog_link: unpairedListings,
  });

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