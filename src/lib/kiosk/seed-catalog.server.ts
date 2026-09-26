import 'server-only';

/** The real deps for {@link seedKioskCatalog} — cookies + the catalog read. */

import { unstable_cache } from 'next/cache';
import { searchKioskCatalog } from '@/lib/kiosk/catalog-search';
import { toKioskCatalogResponse } from '@/lib/kiosk/catalog-request';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveKioskOrgForRequest } from '@/lib/kiosk/kiosk-request-org.server';
import {
  KIOSK_SEED_PAGE_SIZE,
  seedKioskCatalog,
  type KioskCatalogSeed,
  type KioskSeedSegment,
} from '@/lib/kiosk/seed-catalog';

const SEED_REVALIDATE_SEC = 60;

async function readFirstPageUncached(
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

function readFirstPage(orgId: OrgId, segment: KioskSeedSegment): Promise<KioskCatalogWireProduct[]> {
  return unstable_cache(readFirstPageUncached, ['kiosk-catalog-seed', orgId, segment], {
    revalidate: SEED_REVALIDATE_SEC,
    tags: ['kiosk-catalog-seed'],
  })(orgId, segment);
}

/** First catalog page for the paired tablet, or null. Never throws. */
export function seedKioskCatalogForRequest(
  segment: KioskSeedSegment,
): Promise<KioskCatalogSeed | null> {
  return seedKioskCatalog(segment, {
    resolveOrg: resolveKioskOrgForRequest,
    readPage: readFirstPage,
    onError: (error) => console.warn('seedKioskCatalog failed; client will fetch', error),
  });
}
