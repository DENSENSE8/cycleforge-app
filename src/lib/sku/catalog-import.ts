/**
 * Catalog items import — a product list (a Zoho "Items" export, or any CSV
 * with a SKU and a name) read into the SKU identity source of truth,
 * `sku_catalog` (sku-identity-law.ts). Pure: the route plans on the server
 * with the catalog and the Zoho items mirror in hand; the Products desk
 * paints the plan and downloads the cleaned file.
 *
 * The rules, in order:
 *   1. A row whose name starts with `[OLD]` is a retired item — dropped.
 *   2. A SKU of 1–4 digits gets its leading zeros back (`1113` → `01113`):
 *      USAV numeric SKUs are five digits and a spreadsheet strips the zeros.
 *      A short SKU that already exists as written (`36`) is kept.
 *   3. A SKU the catalog lacks is added with the row's name as its title.
 *      A SKU the catalog has is never retitled — the catalog title is owned
 *      in CycleForge — a different name is reported as a title conflict.
 *   4. The Zoho item id is the row's when it reads as one (a spreadsheet turns
 *      the 19-digit id into `5.62341E+18`), else the items mirror's for the
 *      SKU; it lands in `catalog_external_ids`, never as the key.
 */

/** `Item Name` / `item_name` / `ITEMNAME` → `itemname`. */
const canonicalHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

export const CATALOG_IMPORT_OLD_PREFIX = '[OLD]';
export const NUMERIC_SKU_WIDTH = 5;
export const CATALOG_IMPORT_MAX_ROWS = 10_000;

/** One row as the file states it, after column mapping. */
export interface CatalogImportInputRow {
  sku: string;
  title: string;
  zohoItemId?: string | null;
  upc?: string | null;
  ean?: string | null;
}

export const CATALOG_IMPORT_OUTCOMES = ['new', 'title_differs', 'present', 'old', 'no_sku', 'no_title', 'duplicate'] as const;
export type CatalogImportOutcome = (typeof CATALOG_IMPORT_OUTCOMES)[number];

export const CATALOG_IMPORT_OUTCOME_LABELS: Readonly<Record<CatalogImportOutcome, string>> = {
  new: 'New',
  title_differs: 'Title differs',
  present: 'In catalog',
  old: 'Old, dropped',
  no_sku: 'No SKU',
  no_title: 'No title',
  duplicate: 'Duplicate SKU',
};

export interface CatalogImportPlanRow {
  /** 1-based row of the file (the header is row 0). */
  line: number;
  rawSku: string;
  /** The SKU the catalog keys on — `rawSku` with its zeros restored. */
  sku: string;
  padded: boolean;
  title: string;
  outcome: CatalogImportOutcome;
  /** The catalog's own title, when the SKU is already there. */
  catalogTitle: string | null;
  zohoItemId: string | null;
  upc: string | null;
  ean: string | null;
}

export type CatalogImportSummary = Record<CatalogImportOutcome, number> & { rows: number; padded: number };

export interface CatalogImportPlan {
  rows: CatalogImportPlanRow[];
  summary: CatalogImportSummary;
}

/** What the planner needs from the database — the route reads it, a test fakes it. */
export interface CatalogImportContext {
  /** Catalog titles by exact SKU (this org). */
  catalogTitles: ReadonlyMap<string, string>;
  /** Zoho items mirror ids by exact SKU (this org). */
  mirrorItemIds: ReadonlyMap<string, string>;
}

const trimmed = (value: string | null | undefined): string => String(value ?? '').trim();
const normTitle = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
/** A real Zoho item id: digits only, long — never the spreadsheet's `5.62341E+18`. */
const ZOHO_ITEM_ID_RE = /^\d{10,}$/;

export function isRetiredTitle(title: string): boolean {
  return trimmed(title).toUpperCase().startsWith(CATALOG_IMPORT_OLD_PREFIX);
}

/** Rule 2. `isKnown` answers whether a SKU already exists exactly as written. */
export function normalizeCatalogSku(raw: string, isKnown: (sku: string) => boolean): string {
  const sku = trimmed(raw);
  return /^\d{1,4}$/.test(sku) && !isKnown(sku) ? sku.padStart(NUMERIC_SKU_WIDTH, '0') : sku;
}

/** Every SKU a planner may look up for these rows: as written and zero-padded. */
export function catalogImportLookupSkus(rows: readonly Pick<CatalogImportInputRow, 'sku'>[]): string[] {
  const skus = new Set<string>();
  for (const row of rows) {
    const sku = trimmed(row.sku);
    if (!sku) continue;
    skus.add(sku);
    if (/^\d{1,4}$/.test(sku)) skus.add(sku.padStart(NUMERIC_SKU_WIDTH, '0'));
  }
  return [...skus];
}

export function planCatalogImport(rows: readonly CatalogImportInputRow[], context: CatalogImportContext): CatalogImportPlan {
  const isKnown = (sku: string) => context.catalogTitles.has(sku) || context.mirrorItemIds.has(sku);
  const seen = new Set<string>();
  const planned = rows.map((input, index): CatalogImportPlanRow => {
    const rawSku = trimmed(input.sku);
    const title = trimmed(input.title);
    const sku = rawSku ? normalizeCatalogSku(rawSku, isKnown) : '';
    const ownId = trimmed(input.zohoItemId);
    const catalogTitle = sku ? (context.catalogTitles.get(sku) ?? null) : null;
    const base = {
      line: index + 1,
      rawSku,
      sku,
      padded: sku !== rawSku,
      title,
      catalogTitle,
      zohoItemId: (ZOHO_ITEM_ID_RE.test(ownId) ? ownId : null) ?? (sku ? (context.mirrorItemIds.get(sku) ?? null) : null),
      upc: trimmed(input.upc) || null,
      ean: trimmed(input.ean) || null,
    };
    let outcome: CatalogImportOutcome;
    if (isRetiredTitle(title)) outcome = 'old';
    else if (!sku) outcome = 'no_sku';
    else if (!title) outcome = 'no_title';
    else if (seen.has(sku)) outcome = 'duplicate';
    else if (catalogTitle == null) outcome = 'new';
    else outcome = normTitle(catalogTitle) === normTitle(title) ? 'present' : 'title_differs';
    if (outcome !== 'old' && sku) seen.add(sku);
    return { ...base, outcome };
  });
  const summary = Object.fromEntries(CATALOG_IMPORT_OUTCOMES.map((outcome) => [outcome, 0])) as CatalogImportSummary;
  summary.rows = planned.length;
  summary.padded = 0;
  for (const row of planned) {
    summary[row.outcome] += 1;
    if (row.padded && row.outcome !== 'old') summary.padded += 1;
  }
  return { rows: planned, summary };
}

const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * The file as it should have been: the `[OLD]` rows gone, each SKU with its
 * zeros, the Zoho item id column restored from the plan. Every other column
 * is the file's own. `plan.rows[i]` is `rawRows[i]`.
 */
export function cleanedCatalogCsv(
  headers: readonly string[],
  rawRows: readonly Record<string, string>[],
  mapping: { sku?: string; zohoItemId?: string },
  plan: CatalogImportPlan,
): string {
  const lines = [headers.map(csvCell).join(',')];
  rawRows.forEach((raw, index) => {
    const row = plan.rows[index];
    if (!row || row.outcome === 'old') return;
    const cells = headers.map((header) => {
      if (mapping.sku && header === mapping.sku) return row.sku;
      if (mapping.zohoItemId && header === mapping.zohoItemId) return row.zohoItemId ?? '';
      return raw[header] ?? '';
    });
    lines.push(cells.map(csvCell).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
}

/** Header → field, for the columns a product list carries (Zoho export names first). */
export const CATALOG_IMPORT_HEADER_ALIASES: Readonly<Record<keyof CatalogImportInputRow, readonly string[]>> = {
  sku: ['sku', 'skucode', 'itemsku', 'sellersku'],
  title: ['name', 'itemname', 'producttitle', 'title', 'productname'],
  zohoItemId: ['itemid', 'zohoitemid'],
  upc: ['upc', 'upccode', 'barcode'],
  ean: ['ean', 'eancode', 'gtin'],
};

/** Best-effort header binding — per field, the header matching its most preferred alias. */
export function autoMapCatalogImportHeaders(headers: readonly string[]): Partial<Record<keyof CatalogImportInputRow, string>> {
  const mapping: Partial<Record<keyof CatalogImportInputRow, string>> = {};
  for (const field of Object.keys(CATALOG_IMPORT_HEADER_ALIASES) as (keyof CatalogImportInputRow)[]) {
    for (const alias of CATALOG_IMPORT_HEADER_ALIASES[field]) {
      const hit = headers.find((header) => canonicalHeader(header) === alias);
      if (hit) {
        mapping[field] = hit;
        break;
      }
    }
  }
  return mapping;
}
