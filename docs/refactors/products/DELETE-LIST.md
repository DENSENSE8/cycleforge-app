# Products delete list — one way in, one catalog

Status: 2026-10-03. Sibling of `docs/refactors/receiving/DELETE-LIST.md`; this file owns
how a product gets INTO the catalog. Caller counts are `grep` over `src/` on the date above
(fetch URLs, imports, intent strings); a route with 0 fetchers may still be called by hand,
so each delete names its gate.

## 0. The rule

`sku_catalog` (org-scoped, keyed `sku_catalog.id`) is the product identity
(`src/lib/sku/sku-identity-law.ts`). A product enters it one of two ways, both on
Products › Catalog and both gated on `sku_stock.manage`:

| Verb | Surface | Writer |
|---|---|---|
| Add product (one item) | `AddProductOverlay` (header action `catalog:add-product`) | `POST /api/sku-catalog` |
| Import products CSV | `CatalogImportReview` (header action `catalog:import-csv`, `?import=csv`) | `POST /api/sku-catalog/import` |

Both apply the same SKU rule (`normalizeCatalogSku`: a 1–4 digit SKU gets its leading zeros
back unless it exists as written) and record a Zoho item id only in `catalog_external_ids`.
The import drops `[OLD]` rows, never retitles a catalog row, and offers the cleaned CSV.
Rules and tests: `src/lib/sku/catalog-import.ts`, `catalog-import.test.ts`.

Implicit creation (receiving, shipped submit, Ecwid exception sync, Zoho item sync) is a
side door. Each one should become "this SKU is not in the catalog → Add product".

## 1. Done in this change

- `scripts/backfill-catalog-from-zoho-csv.ts` deleted. Its cleaning and insert moved into
  `src/lib/sku/catalog-import*.ts` behind the Products UI. Its private `parseCsv` went with it;
  the UI reads files through `src/lib/tables/import/parse-csv.ts`.
- Dead header actions removed from Products › Pairing: `pairing:add-sku` and
  `pairing:pair-identifier` had no handler anywhere, so both buttons were permanently disabled
  (`NavPageActions` disables an intent nobody registers). Add product now lives on Catalog.

## 2. Next, in order

| # | Delete | Gate (measure first) | Evidence |
|---|---|---|---|
| P1 | Routes with 0 fetchers in `src`: `/api/sku-catalog/{unpaired-ecwid, pair-ecwid, by-item-number, search-unmatched, suggest-for-item, pair-suggestions, sync-ecwid-titles, sync-ecwid-products, run-migration}` | 30 days of access logs show no calls | Only comments, schemas and the identity-law allowlist name them (`components/products/pairing/types.ts:42`, `sku-identity-law.ts:183-184`) |
| P2 | `pending_skus` "create in Zoho" queue: `/api/pending-skus` (0 fetchers), `/api/sku-catalog/flag-missing` (0 fetchers), `queuePendingSku`, `trg_resolve_pending_sku` | Its server writers (`receive-line.ts`, `resolve-sku-catalog.ts`) point at Add product instead | The catalog is the master; nothing needs creating in Zoho first. The 2026-10-03 import resolved 42 queued rows by adding the SKU |
| P3 | `/api/zoho/items/sync` (0 callers, no cron) + `itemRepository.upsertMany → syncSkuCatalogFromItems` writing the catalog | Import products CSV is the only bulk way in; the `items` mirror stays read-only history for the crosswalk | A Zoho sync that writes `sku_catalog` is a second identity writer |
| P4 | Implicit `resolveOrCreateSkuCatalogId` in `shipped/submit`, `ecwid/sync-exception-tracking`, `receiving/line-catalog.ts` | Each caller surfaces "SKU not in catalog → Add product" instead of minting a row | Rows minted with whatever title the caller had; nobody reviews them |
| P5 | `upsertSkuCatalog`'s `ON CONFLICT … product_title = EXCLUDED.product_title` | Its callers (Add product reactivating an inactive row, eBay import, PATCH) agree on "never retitle silently" | The import already refuses to retitle; the single writer still can |
| P6 | Three per-family CSV staging hosts + rails (~1,900 lines): `outbound/orders/CsvImportStaging{Host,Rail}.tsx`, `sidebar/receiving/incoming/IncomingReturnsImportStaging{Host,Rail}.tsx`, `IncomingPoImportStagingHost.tsx` | One descriptor-driven host over `src/lib/tables/import/staging-store.ts` | The same grid, chips and confirm copied per family; `CatalogImportReview` deliberately did not add a fourth (its plan is the server's) |
| P7 | Private CSV readers: `/api/admin/fba-fnskus/upload` `parseCsv`, `/api/fba/fnskus/bulk` `splitCsvLine` | They read through `src/lib/tables/import/parse-csv.ts` | The naive split breaks on quoted commas |
| P8 | `/api/sku-catalog/pair` "compatibility shim" | Its 2 callers (`hooks/exceptions:262`, `lib/orders/exceptions-cta.ts:80`) call the pairing route directly | Self-labelled shim (`pair/route.ts:6`) |
| P9 | `scripts/import-bin-sheet.ts` + `lib/inventory/bin-sheet-import.ts` | A bin-sheet import kind on the same table-import seam, or confirmed one-off | Used only by the script and its test |
| P10 | Placeholder (TMP) creation from Stock "Add stock", mobile scan and repair parts | Each offers Add product (real SKU) first, TMP only when the SKU is unknown | Four UI paths mint `is_provisional` rows that later need a merge |

Left on purpose: `POST /api/sku-catalog/provisional` itself (a scan of an unknown barcode still
needs a placeholder) and the `items` mirror (the Zoho id crosswalk reads it).

## 3. Open

- Mobile: neither Add product nor Import products CSV exists on `/m/products` yet
  (`docs/mobile-first/SURFACE_LAW.md`). Add product is the first phone verb to port.
