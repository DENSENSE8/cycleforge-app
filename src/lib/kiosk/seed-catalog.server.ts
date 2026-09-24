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
 * The first page is cached per (org, segment) for {@link SEED_REVALIDATE_SEC}.
 * The seed is PAINT, never truth — `aria-hidden` tiles that the live grid
 * replaces with its own fetch — so a minute of staleness costs nothing, while
 * the uncached read (a tenant transaction plus the price join) sat on the
 * LCP critical path of every page load: the tile photos cannot be requested
 * until this HTML chunk streams.
 *
 * Callers: `/kiosk/v2` (server entry). Affected API: none.
 * Schemas: the catalog projection, read-only.
 */

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
