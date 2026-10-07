/**
 * The Fulfilled read's real collaborators (`NavFulfilledDeps`): the one
 * enumeration statement over the database in a single round trip, the
 * Records statement for the kept orders' lines, the org's carrier sync
 * health, the viewer's unread @mentions on the answered lines, and the
 * clock. Kept apart from `./service.ts` so the domain imports no database
 * client and its tests run DB-free.
 */

import { buildFulfilledSql, fulfilledPackageRowOf } from '@/lib/nav/fulfilled/sql';
import type { NavFulfilledDeps } from '@/lib/nav/fulfilled/service';
import { buildRecordsSql, recordLineRowOf } from '@/lib/nav/records/sql';
import { ORDER_NOTE_MENTIONED } from '@/lib/notifications/event-vocabulary';
import { logger } from '@/lib/observability/logger';
import { carrierSyncHealth } from '@/lib/shipping/carrier-sync-health-read';
import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import { getCurrentPSTDateKey } from '@/utils/date';

/** The lines carrying an unread @mention for the viewer. */
const MENTIONS_SQL = `
  SELECT DISTINCT i.entity_id::int AS order_id
    FROM staff_inbox_items i
   WHERE i.staff_id = $2
     AND i.entity_type = 'order'
     AND i.event_key = $3
     AND i.state = 'unread'
     AND i.entity_id = ANY($1::bigint[])`;

const NO_MENTIONS: ReadonlySet<number> = new Set();

export const navFulfilledDeps: NavFulfilledDeps = {
  rows: async (orgId, window, q) => {
    const { sql, params } = buildFulfilledSql(orgId, window, q);
    return (await tenantQueryOneTrip(orgId, sql, params)).rows.map(fulfilledPackageRowOf);
  },
  recordLines: async (orgId, orderIds, viewerStaffId) => {
    const { sql, params } = buildRecordsSql(orgId, {
      outbound: true,
      inbound: false,
      axis: 'shipped',
      fromAt: null,
      toBefore: null,
      event: null,
      eventBy: null,
      eventFromAt: null,
      eventToBefore: null,
      find: null,
      refs: [],
      viewerStaffId,
      orderIds,
    });
    return (await tenantQueryOneTrip(orgId, sql, params)).rows.map(recordLineRowOf);
  },
  // The list answers without it: a failed health read is logged and the field left off.
  syncHealth: (orgId) =>
    carrierSyncHealth(orgId).catch((error: unknown) => {
      logger.warn({ orgId, error: error instanceof Error ? error.message : String(error) }, '[nav.fulfilled] carrier sync health read failed');
      return null;
    }),
  // The list answers without it too: a failed mention read leaves the rows without the dot.
  mentions: async (orgId, orderRowIds, viewerStaffId) => {
    try {
      const { rows } = await tenantQuery(orgId, MENTIONS_SQL, [orderRowIds, viewerStaffId, ORDER_NOTE_MENTIONED]);
      return new Set(rows.map((row) => Number(row.order_id)));
    } catch (error) {
      logger.warn({ orgId, error: error instanceof Error ? error.message : String(error) }, '[nav.fulfilled] mention read failed');
      return NO_MENTIONS;
    }
  },
  today: getCurrentPSTDateKey,
  now: () => new Date(),
};
