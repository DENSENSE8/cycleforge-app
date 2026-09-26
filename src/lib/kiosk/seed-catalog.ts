/** Server-side seed of the kiosk catalog's FIRST page — the pure half. */

import type { OrgId } from '@/lib/tenancy/constants';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';

/** How many tiles the seed carries. */
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

/** The first catalog page for a paired tablet, or `null` — never a throw, except for Next's dynamic-usage signal (see above). */
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
