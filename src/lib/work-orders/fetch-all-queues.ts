import type { WorkOrderRow } from '@/components/work-orders/types';
import { getOrders } from '@/lib/work-orders/queries';
import { isOpsPlansUnifiedInbox } from '@/lib/ops-plans/flags';
import {
  getReceivingWorkOrders,
  getRepairWorkOrders,
  getFbaWorkOrders,
  getSkuStockWorkOrders,
} from '@/lib/work-orders/queue-fetchers';

async function safeFetch<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[work-orders] ${label} failed:`, message);
    return [];
  }
}

export type FetchAllQueuesOpts = {
  /** When true, always merge receiving/repair/FBA/stock queues (My Day + mine). */
  unified?: boolean;
};

/**
 * Single SoT for all work-order queue rows — used by /api/work-orders and
 * /api/ops-plans/inbox when OPS_PLANS_UNIFIED_INBOX is enabled.
 */
export async function fetchAllWorkOrderQueues(
  orgId: string,
  opts?: FetchAllQueuesOpts,
): Promise<WorkOrderRow[]> {
  const orders = await safeFetch('getOrders', () => getOrders(orgId));
  const unified = opts?.unified ?? (await isOpsPlansUnifiedInbox(orgId));
  if (!unified) {
    return orders;
  }
  const [receiving, repairs, fba, stock] = await Promise.all([
    safeFetch('getReceiving', () => getReceivingWorkOrders(orgId)),
    safeFetch('getRepairs', () => getRepairWorkOrders(orgId)),
    safeFetch('getFba', () => getFbaWorkOrders(orgId)),
    safeFetch('getSkuStock', () => getSkuStockWorkOrders(orgId)),
  ]);
  return [...orders, ...receiving, ...repairs, ...fba, ...stock];
}
