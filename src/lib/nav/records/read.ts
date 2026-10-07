/**
 * The Records read's real collaborators (`NavRecordsDeps`): the one
 * enumeration statement in a single round trip, and the clock. Kept apart
 * from `./service.ts` so the domain imports no database client and its tests
 * run DB-free.
 */

import { buildRecordsSql, recordLineRowOf } from '@/lib/nav/records/sql';
import type { NavRecordsDeps } from '@/lib/nav/records/service';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { getCurrentPSTDateKey } from '@/utils/date';

export const navRecordsDeps: NavRecordsDeps = {
  rows: async (orgId, input) => {
    const { sql, params } = buildRecordsSql(orgId, input);
    return (await tenantQueryOneTrip(orgId, sql, params)).rows.map(recordLineRowOf);
  },
  today: getCurrentPSTDateKey,
  now: () => new Date(),
};
