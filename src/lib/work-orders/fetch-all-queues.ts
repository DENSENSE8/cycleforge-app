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
 *
 * **The five queues run CONCURRENTLY, and that is the whole performance story
 * here.** This used to await `getOrders` first and only then `Promise.all` the
 * other four, which made the fan-out two serial waves for no reason: the queues
 * are independent, and none of them reads the orders result.
 *
 * The cost is per-QUERY latency, not row volume — measured on the dogfood tenant
 * 2026-08-02, each leg sits between 350ms and 1.0s regardless of what it
 * returns (`getSkuStockWorkOrders` takes 736ms to return ONE row;
 * `listTechQueueItemsForStaff` takes ~1.0s to return zero). So serializing waves
 * costs a full round-trip each time, while narrowing a result set buys almost
 * nothing. Keep new queues inside the same `Promise.all`.
 *
 * The pool is `PG_POOL_MAX` (default 5), so beyond that these queue rather than
 * truly parallelise — still strictly better than an imposed serial wave.
 */
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
