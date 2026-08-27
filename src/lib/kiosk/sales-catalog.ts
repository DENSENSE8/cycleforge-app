/**
 * Retail (non-repair) catalog for the kiosk Buy/Sell left rail.
 * Pure helpers: `sales-catalog-pure.ts`. This module owns the projection reads.
 */

import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import type { RepairCategoryLevel } from '@/lib/repair/ecwid-repair-catalog';
import {
  filterRetailProducts,
  resolveRetailCategoryLevelFrom,
} from './sales-catalog-pure';

export { filterRetailProducts, resolveRetailCategoryLevelFrom } from './sales-catalog-pure';

/** Projection-first retail product list for the kiosk sales rail. */
export async function loadRetailProductsForOrg(orgId: OrgId) {
  const { loadProjectedListings } = await import('@/lib/repair/catalog-projection');
  const listings = await loadProjectedListings(orgId);
  return filterRetailProducts(listings);
}

/** Projection-first retail category level for the kiosk sales rail. */
export async function loadRetailCategoryLevelForOrg(
  orgId: OrgId,
  parentId: string | null,
): Promise<RepairCategoryLevel> {
  const { loadProjectedCategories } = await import('@/lib/repair/catalog-projection');
  const categories = await loadProjectedCategories(orgId);
  if (categories.length === 0) {
    return {
      roots: [{ id: null, name: 'Catalog' }],
      currentParentId: null,
      breadcrumbs: [],
      categories: [],
      message: 'No retail catalog projected yet. Run the catalog projection sync.',
    };
  }
  return resolveRetailCategoryLevelFrom(categories, parentId);
}
