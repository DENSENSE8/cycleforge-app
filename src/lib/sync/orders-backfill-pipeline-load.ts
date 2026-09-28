/**
 * DB-backed deps for {@link runOrdersBackfillPipeline}. Kept off the pure
 * module so unit tests never import the Neon pool.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import { listConnections } from '@/lib/integrations/connectors/connections';
import { syncConnection } from '@/lib/integrations/connectors/orchestrator';
import { listOrderSyncMenuSources } from '@/lib/integrations/order-sync-menu';
import { syncOrderExceptionsToOrders } from '@/lib/orders-exceptions';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { startImportRun } from './import-record';
import { importRecordDeps } from './import-record-load';
import {
  runOrdersBackfillPipeline,
  type OrdersBackfillDeps,
  type OrdersBackfillOpts,
} from './orders-backfill-pipeline';

const deps: OrdersBackfillDeps = {
  // The To-ship menu's list IS the run order; permissions are the caller's
  // concern (cron = system, header = checked before this runs).
  listOrderProviders: async (orgId) => [
    ...new Set((await listOrderSyncMenuSources(orgId, () => true, { listConnections })).map((s) => s.provider)),
  ],
  syncProvider: (orgId, provider, opts) => syncConnection(orgId, provider as IntegrationProvider, opts),
  resolveExceptions: async (orgId) => {
    const result = await syncOrderExceptionsToOrders(undefined, orgId);
    if (result.matched > 0) await invalidateAllOrdersApiCaches([], orgId);
    return result;
  },
  startImportRun: (orgId, meta) => startImportRun(orgId, meta, importRecordDeps),
};

export function loadOrdersBackfillPipeline(orgId: OrgId, opts?: OrdersBackfillOpts) {
  return runOrdersBackfillPipeline(orgId, deps, opts);
}
