/**
 * Server bindings for {@link resolveScanObjectState}.
 *
 * Split from the core so the resolver unit-tests with zero network: the
 * `handling-unit-queries` import chain pulls in `@/lib/db`, which carries
 * `server-only` and a Neon driver. Same seam as `preview-scan-deps.ts`.
 */

import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getHandlingUnitById } from '@/lib/neon/handling-unit-queries';
import type { ScanObjectStateDeps } from './object-state';

/**
 * Build the deps for one request's org. `getHandlingUnitById` runs the lookup
 * through the GUC-wrapped tenant path (explicit `organization_id` predicate
 * under RLS), so one tenant's LPN id can never resolve another tenant's box —
 * and the lookup is a read, so there is no audit row and no idempotency key.
 */
export function createScanObjectStateDeps(orgId: OrgId): ScanObjectStateDeps {
  return {
    getHandlingUnitStatus: async (id) =>
      (await getHandlingUnitById(id, pool, orgId))?.status ?? null,
  };
}
