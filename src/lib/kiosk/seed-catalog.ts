/**
 * Server-side seed of the kiosk catalog's FIRST page — the pure half.
 *
 * ## Why this exists — a measured number, not a preference
 *
 * `/kiosk/v2` fetched its whole catalog client-side, so the initial HTML held
 * no product image at all. Lighthouse on a production build (2026-09-15):
 *
 *   LCP 1.9 s · timeToFirstByte 26 ms · resourceLoadDelay **3 538 ms**
 *   lcp-discovery → requestDiscoverable: FALSE
 *
 * The LCP element is a tile photo, and the browser could not start that request
 * until HTML → JS → the catalog route → the projection read had all completed
 * in sequence. Every millisecond of that chain was LCP. Making the first row
 * `loading="eager" fetchpriority="high"` fixed two of the three discovery
 * checks; only putting the URLs in the document fixes the third.
 *
 * ## Shape: seed for PAINT, never for truth
 *
 * The client still runs its own `mode=all` fetch on mount. That is deliberate:
 * the seed is a snapshot taken at request time, the client's is live, and the
 * image URLs are identical so React reconciles them without re-requesting a
 * byte. Paint comes from the seed, freshness from the fetch.
 *
 * Same posture as the repo's other seeds (`seedMobileReceivingFeed`,
 * `seedUnshippedQueue`): a seed NEVER blocks and NEVER throws. Any failure —
 * unpaired device, DB hiccup, cold projection — returns `null`, the surface
 * paints its skeleton, and the client fetches exactly as it does today. A seed
 * that can break a counter tablet is worse than no seed.
 *
 * This module is DB-free and cookie-free so both paths above are unit-tested
 * with injected deps; the real deps live in `seed-catalog.server.ts`.
 *
 * Callers: `seed-catalog.server.ts` → `/kiosk/v2`. Affected API: none.
 * Schemas: the catalog projection, read-only.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';

/**
 * How many tiles the seed carries.
 *
 * The grid's own page size is 24; the seed only has to cover the fold, and
 * every extra row is HTML weight on the critical path for a tile nobody has
 * scrolled to. One screen of an iPad-landscape grid is ~16.
 */
export const KIOSK_SEED_PAGE_SIZE = 16;

/** Which rail to seed — the same split the two catalog routes make. */
export type KioskSeedSegment = 'service' | 'retail';

export interface KioskCatalogSeed {
  products: KioskCatalogWireProduct[];
  segment: KioskSeedSegment;
}

export interface SeedKioskCatalogDeps {
  /** Resolve the device cookie to its org, or null when unpaired. */
  resolveOrg: () => Promise<OrgId | null>;
  /** Read the first catalog page for that org. */
  readPage: (orgId: OrgId, segment: KioskSeedSegment) => Promise<KioskCatalogWireProduct[]>;
  /** Failure sink. Injected so a test asserts the log without console noise. */
  onError?: (error: unknown) => void;
}

/**
 * The first catalog page for a paired tablet, or `null` — never a throw,
 * except for Next's dynamic-usage signal (see above).
 *
 * A `null` is the NORMAL case on an unpaired tablet and on any read failure;
 * the client fetch is the contract, this is only a head start.
 */
export async function seedKioskCatalog(
  segment: KioskSeedSegment,
  deps: SeedKioskCatalogDeps,
): Promise<KioskCatalogSeed | null> {
  try {
    const orgId = await deps.resolveOrg();
    if (!orgId) return null;
    const products = await deps.readPage(orgId, segment);
    if (products.length === 0) return null;
    return { products, segment };
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    // Loud in the log, silent on the glass — the surface must still paint.
    deps.onError?.(error);
    return null;
  }
}
