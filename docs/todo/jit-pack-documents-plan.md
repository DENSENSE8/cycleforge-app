# JIT pack documents — Print-on-Pack-Confirm

**Status:** Phase 4 shipped (Phases 1–3 shipped)  
**Created:** 2026-07-30  
**Research:** `docs/research/gemini-briefing-jit-pack-documents.md` + Gemini PoPC response  
**Companion canvas:** workspace `canvases/jit-pack-documents-gap.canvas.tsx`

## Verdict

Industry standard is **Print-on-Pack-Confirm (PoPC)**: generate/buy labels early, print only after pack verification. Cycle Forge grows the existing `documents` + `document_entity_links` SoT — no second print engine. Manuals bridge then migrate (not big-bang).

## Phases

| Phase | Ship | Outcome |
|-------|------|---------|
| **1** | Pack→print bridge | On ORDERS pack confirm, Station calls `POST /api/orders/[id]/documents/print`; resolve ORDER/SHIPMENT `shipping_label` + `packing_slip`, dispatch via PrintNode PDF (browser iframe fallback), ledger + idempotent reprint, Station card |
| **2** | Bundle resolver + manuals bridge | Print bundle unions outbound docs + `product_manuals` by SKU of packed serials; still read-only on manuals table |
| **3** | Manuals → documents | `document_type='manual'`, expand `document_entity_links` to `SKU` / `SERIAL_UNIT` per polymorphic contract; Testing cutover; deprecate manuals writes |
| **4** | Pre-buy on pack-ready | When order hits TESTED/pack-ready, async buy/fetch docs; pack only dispatches print (true generation vs print split) |

## Phase 1 scope (this cut)

- `document_print_jobs` ledger (mirror of `label_print_jobs` for outbound PDFs)
- `printer_profiles.default_for` gains `outbound`
- Domain: `resolvePrintBundle` + `dispatchPrintBundle` under `src/lib/documents/`
- Hook: StationPacking after ORDERS pack (`printBundleSuggested`) → `POST /api/orders/[id]/documents/print` (keeps packing-logs txn short; print failure never rolls back pack)
- `POST /api/orders/[id]/documents/print` for first print + explicit reprint
- StationPacking: print status card + Reprint
- KPIs via audits: `order.document.bundle_print` / `order.document.bundle_reprint`

## Non-goals (Phase 1)

- Migrating `product_manuals`
- Expanding `document_entity_links` entity types
- Wave-release product
- Replacing Labels workbench buy/fetch
- Merging pack evidence photos into documents

## KPI mapping (instrument in Phase 1+)

| Metric | Event |
|--------|--------|
| Eager-print waste | `LABEL_PURCHASED` / bundle print vs scan-out |
| Pack→print latency | packer_logs.created_at → document_print_jobs.created_at |
| Missing-doc rate | bundle status `missing` |
| Reprint rate | `is_reprint=true` jobs |
| FTR | packing-logs with zero unpack/edit |


## Phase 2 scope (this cut)

- Bridge: `listAssignedManualsForOrder` matches assigned `product_manuals` by order sku / item_number / sku_catalog_id
- `document_print_jobs` gains `product_manual_id` + `document_type='manual'` (nullable `document_id`)
- Pack print bundle dispatches manuals with labels/slips; missing labels still print manuals
- Browser fallback via `/api/product-manuals/[id]/content` + `printPackBundleFallback`
- Manuals without fetchable `source_url` are `skipped` (not a hard pack failure)

## Phase 3 scope (this cut)

- Expand `document_entity_links` CHECK to `ORDER|SHIPMENT|SKU|SERIAL_UNIT` + parent-delete triggers (incl. ORDER/SHIPMENT gap close)
- Backfill: promote assigned `product_manuals` with `source_url` + `sku_catalog_id` → `documents` (`document_type='manual'`) + SKU link
- Domain: `manual-documents.ts` — `promoteProductManualToDocument` / `listManualDocumentsForSku|Order` / unlink
- Pack dual-read: `listAssignedManualsForOrder` prefers documents SoT, falls back to Phase 2 bridge
- Pair/unpair (`receiving-lines/.../manuals`) dual-writes promote + unlink
- Testing bundle dual-read + optional `document_id` on ManualRow
- `document_print_jobs` source CHECK: manuals may use `document_id` and/or `product_manual_id`
- Drizzle: `documentEntityLinks` model
- **Not this cut (Phase 3b):** full deprecation of product_manuals write path / library upload cutover

## Phase 4 scope (this cut)

- Domain: `ensureOutboundDocsForOrder` — list missing `shipping_label`/`packing_slip`, call `fetchOutboundDocuments` only
- **No auto postage buy** (irreversible) — Labels workbench remains the buy path
- Hook: `scheduleEnsureOutboundDocsOnPackReady` via Next `after()` on tech scan + add-serial (`publishOrderTested` paths)
- Cron reconciler: `GET /api/cron/documents/ensure-outbound` every 15m for pack-ready orders still missing docs
- Pack print path unchanged (resolve + dispatch only)
