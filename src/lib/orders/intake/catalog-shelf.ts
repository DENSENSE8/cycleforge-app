/**
 * The two shelves one sales order draws from — the storefront's SALES items
 * and its REPAIR SERVICES — because a customer orders both on one call. Same
 * catalog core as the counter (`searchKioskCatalog`), split the way the
 * counter splits it: `retail` vs `service` segment (a repair service is an
 * `…-RS` SKU), each with its own curated favorites list. Shared by the staff
 * catalog routes (`/api/orders/intake/catalog/*?shelf=`) and both faces.
 */

import { isRepairSku } from '@/utils/sku';

export type CatalogShelf = 'sales' | 'repair';

export const CATALOG_SHELVES: ReadonlyArray<{ id: CatalogShelf; label: string }> = [
  { id: 'sales', label: 'Sales' },
  { id: 'repair', label: 'Repair service' },
];

/** `?shelf=` → shelf; anything else is Sales (the routes' historical default). */
export function parseCatalogShelf(raw: string | null | undefined): CatalogShelf {
  return raw === 'repair' ? 'repair' : 'sales';
}

/** The catalog segment a shelf reads (`searchKioskCatalog` `segment`). */
export function shelfSegment(shelf: CatalogShelf): 'retail' | 'service' {
  return shelf === 'repair' ? 'service' : 'retail';
}

/** The curated favorites list a shelf lands on — the counter's own lists. */
export function shelfFavoritesWorkspace(shelf: CatalogShelf): 'sales' | 'repair' {
  return shelf === 'repair' ? 'repair' : 'sales';
}

/** Which shelf a cart line came from, read off its SKU — a repair service is `…-RS`. */
export function shelfOfSku(sku: string | null | undefined): CatalogShelf {
  return isRepairSku(sku) ? 'repair' : 'sales';
}
