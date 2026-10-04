import { z } from 'zod';
import { CATALOG_IMPORT_MAX_ROWS } from '@/lib/sku/catalog-import';

const cell = (max: number) => z.string().max(max).nullable().optional();

/** One mapped row of a product list — `sku` / `title` may be blank: the plan reports those rows. */
const CatalogImportRow = z.object({
  sku: z.string().max(200),
  title: z.string().max(500),
  zohoItemId: cell(64),
  upc: cell(64),
  ean: cell(64),
});

/** POST /api/sku-catalog/import — `apply: false` plans only; `apply: true` adds the plan's new SKUs. */
export const SkuCatalogImportBody = z.object({
  rows: z.array(CatalogImportRow).min(1).max(CATALOG_IMPORT_MAX_ROWS),
  apply: z.boolean().default(false),
});
