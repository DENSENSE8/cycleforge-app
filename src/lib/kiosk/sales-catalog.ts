/** Retail (non-repair) CATEGORY tree for the kiosk Buy/Sell rail. */

import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import type { RepairCategoryLevel } from '@/lib/repair/ecwid-repair-catalog';
import { resolveRetailCategoryLevelFrom } from './sales-catalog-pure';

export { filterRetailProducts, resolveRetailCategoryLevelFrom } from './sales-catalog-pure';

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
