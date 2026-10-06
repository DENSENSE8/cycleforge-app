/** The org's carrier sync health — `carrierSyncHealthSql` in one round trip, summarized (`./carrier-sync-health.ts`, kept DB-free for tests). */

import { carrierSyncHealthSql, summarizeCarrierSyncHealth, type CarrierSyncHealth, type CarrierSyncHealthRow } from './carrier-sync-health';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';

export async function carrierSyncHealth(orgId: OrgId): Promise<CarrierSyncHealth[]> {
  const { rows } = await tenantQueryOneTrip<CarrierSyncHealthRow>(orgId, carrierSyncHealthSql(true), [orgId]);
  return summarizeCarrierSyncHealth(rows);
}
