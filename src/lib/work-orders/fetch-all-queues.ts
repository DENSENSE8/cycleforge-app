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

type FetchAllQueuesOpts = {
  /** When true, always merge receiving/repair/FBA/stock queues (My Day + mine). */
  unified?: boolean;
};

/** Single SoT for all work-order queue rows — used by /api/work-orders and /api/ops-plans/inbox when OPS_PLANS_UNIFIED_INBOX is enabled. */
export async function fetchAllWorkOrderQueues(
  orgId: string,
  opts?: FetchAllQueuesOpts,
): Promise<WorkOrderRow[]> {
  const fetchOrders = () => safeFetch('getOrders', () => getOrders(orgId));

  // Caller already knows the answer (My Day always does) — skip the flag read
  // and start all five together.
  if (opts?.unified === true) {
    const [orders, receiving, repairs, fba, stock] = await Promise.all([
      fetchOrders(),
      safeFetch('getReceiving', () => getReceivingWorkOrders(orgId)),
      safeFetch('getRepairs', () => getRepairWorkOrders(orgId)),
      safeFetch('getFba', () => getFbaWorkOrders(orgId)),
      safeFetch('getSkuStock', () => getSkuStockWorkOrders(orgId)),
    ]);
    return [...orders, ...receiving, ...repairs, ...fba, ...stock];
  }
  if (opts?.unified === false) return fetchOrders();

  // Flag unknown: resolve it ALONGSIDE the orders query rather than in front of
  // it — the flag read does not decide whether orders are needed, only whether
  // the other four are.
  const [orders, unified] = await Promise.all([
    fetchOrders(),
    isOpsPlansUnifiedInbox(orgId),
  ]);
  if (!unified) return orders;

  const [receiving, repairs, fba, stock] = await Promise.all([
    safeFetch('getReceiving', () => getReceivingWorkOrders(orgId)),
    safeFetch('getRepairs', () => getRepairWorkOrders(orgId)),
    safeFetch('getFba', () => getFbaWorkOrders(orgId)),
    safeFetch('getSkuStock', () => getSkuStockWorkOrders(orgId)),
  ]);
  return [...orders, ...receiving, ...repairs, ...fba, ...stock];
}
