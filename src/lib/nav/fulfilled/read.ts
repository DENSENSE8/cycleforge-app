/**
 * The Fulfilled read's real collaborators (`NavFulfilledDeps`): the one
 * enumeration statement over the database in a single round trip, the org's
 * carrier sync health, and the clock. Kept apart from `./service.ts` so the
 * domain imports no database client and its tests run DB-free.
 */

import { buildFulfilledSql, fulfilledPackageRowOf } from '@/lib/nav/fulfilled/sql';
import type { NavFulfilledDeps } from '@/lib/nav/fulfilled/service';
import { logger } from '@/lib/observability/logger';
import { carrierSyncHealth } from '@/lib/shipping/carrier-sync-health-read';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { getCurrentPSTDateKey } from '@/utils/date';

export const navFulfilledDeps: NavFulfilledDeps = {
  rows: async (orgId, window, q) => {
    const { sql, params } = buildFulfilledSql(orgId, window, q);
    return (await tenantQueryOneTrip(orgId, sql, params)).rows.map(fulfilledPackageRowOf);
  },
  // The list answers without it: a failed health read is logged and the field left off.
  syncHealth: (orgId) =>
    carrierSyncHealth(orgId).catch((error: unknown) => {
      logger.warn({ orgId, error: error instanceof Error ? error.message : String(error) }, '[nav.fulfilled] carrier sync health read failed');
      return null;
    }),
  today: getCurrentPSTDateKey,
  now: () => new Date(),
};
