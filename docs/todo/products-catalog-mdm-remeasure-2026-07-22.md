# Products Catalog MDM — remeasure (2026-07-22)

Post-`provider_item_id` migration snapshot (dogfood DB):

| Metric | Count |
|---|---|
| `sku_catalog` rows | 1,358 |
| Linked (`provider_item_id` set) | 98 |
| Unlinked | 1,260 |
| Active & linked | 16 |
| Active & unlinked | 198 |
| `pending_skus` PENDING | 20 |
| `fba_fnskus` total | 235 |
| `fba_fnskus` with `sku_catalog_id` | **0** |

## Implications

- Catalog default segment **Active & Linked** is intentionally sparse until inventory sync stamps `provider_item_id` (and/or more serial_units links land).
- **Unlinked / Pending** is the MDM debt surface — do not hide it.
- FBA crosswalk (sku-reconciliation Step C) is still unpaid: FNSKU expand UI is wired, but 0 rows hang off the hub yet.
- Hub union seed (Step A) + FK wiring (Step E) remain deferred; Catalog surfaces orphans rather than pretending completeness.

## Forward writers

- `syncSkuCatalogFromItems` / `ensureSkuCatalogEntry` / `upsertSkuCatalog` stamp `provider_item_id`.
- Join path: `sku_catalog.provider_item_id = items.zoho_item_id` (never SKU string).
