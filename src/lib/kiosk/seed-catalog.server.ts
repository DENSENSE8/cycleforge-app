import 'server-only';

/**
 * The real deps for {@link seedKioskCatalog} — cookies + the catalog read.
 *
 * Split from the pure module so `seed-catalog.ts` stays importable in a plain
 * `node --test` run: this file pulls `next/headers` (request-scoped) and the
 * device loader (which opens the DB pool), neither of which belongs in a unit
 * test of the resolution logic.
 *
 * It reads `searchKioskCatalog` DIRECTLY rather than fetching its own route:
 * an RSC calling its own HTTP endpoint pays a second request, a second auth
 * pass and a second serialization for data it already has the credentials to
 * read. The route stays the client's contract; this is the same function
 * underneath it, with `segment` applied the same way.
 *
 * Callers: `/kiosk/v2` (server entry). Affected API: none.
 * Schemas: the catalog projection, read-only.
 */

import { cookies } from 'next/headers';
import { KIOSK_COOKIE_NAME, loadKioskDeviceByToken } from '@/lib/auth/kiosk-device';
import { searchKioskCatalog } from '@/lib/kiosk/catalog-search';
import { toKioskCatalogResponse } from '@/lib/kiosk/catalog-request';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  KIOSK_SEED_PAGE_SIZE,
  seedKioskCatalog,
  type KioskCatalogSeed,
  type KioskSeedSegment,
} from '@/lib/kiosk/seed-catalog';

async function resolveOrgFromCookie(): Promise<OrgId | null> {
  const token = (await cookies()).get(KIOSK_COOKIE_NAME)?.value ?? null;
  if (!token) return null;
  const device = await loadKioskDeviceByToken(token);
  return (device?.organizationId as OrgId | undefined) ?? null;
}

async function readFirstPage(
  orgId: OrgId,
  segment: KioskSeedSegment,
): Promise<KioskCatalogWireProduct[]> {
  const page = await searchKioskCatalog(orgId, {
    query: null,
    barcode: null,
    categoryId: null,
    limit: KIOSK_SEED_PAGE_SIZE,
    offset: 0,
    segment,
  });
  return toKioskCatalogResponse(page).products;
}

/** First catalog page for the paired tablet, or null. Never throws. */
export function seedKioskCatalogForRequest(
  segment: KioskSeedSegment,
): Promise<KioskCatalogSeed | null> {
  return seedKioskCatalog(segment, {
    resolveOrg: resolveOrgFromCookie,
    readPage: readFirstPage,
    onError: (error) => console.warn('seedKioskCatalog failed; client will fetch', error),
  });
}
