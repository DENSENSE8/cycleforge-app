/** Server bindings for {@link resolveScanObjectState}. */

import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getHandlingUnitById } from '@/lib/neon/handling-unit-queries';
import type { ScanObjectStateDeps } from './object-state';

/** Build the deps for one request's org. */
export function createScanObjectStateDeps(orgId: OrgId): ScanObjectStateDeps {
  return {
    getHandlingUnitStatus: async (id) =>
      (await getHandlingUnitById(id, pool, orgId))?.status ?? null,
  };
}
