# Sheet import visibility + listing recovery — finish prompt

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/sheet-import-visibility-FINISH-PROMPT.md` and execute item 1.

Session of **2026-07-29/30**, lane `main` (WS-DOGFOOD). Everything below is
**uncommitted** in the working tree. Expand + contract migrations are **both
applied** (see §1). For Review · Missing item number smoke, use
[`sheet-import-review-queue-HANDOFF.md`](sheet-import-review-queue-HANDOFF.md).

---

## 0. The one thing to internalise

**`ux_sku_platform_ids_platform_sku` encodes a business rule that is false for a
reseller.** It asserts a SKU appears in at most one listing per platform+account.
A reseller multi-lists one product by design — `sku_catalog_id` 327 has 7
listings today. That constraint is what broke the Google Sheets import with a
unique violation.

It is also **tenant-blind** (no `organization_id`), so writers pre-check
org-scoped, find nothing, insert, and collide with a row RLS made invisible —
the exact failure documented in
`2026-07-29a_square_transactions_composite_unique.sql.gated`.

Do not "fix" this by widening the checks. The constraint itself is wrong.

---

## 1. Contract migration — DONE (2026-07-30)

Applied as `2026-07-29f_sku_platform_ids_tenant_contract.sql` (ungated from
`.gated`). Dropped both tenant-blind unique indexes. Expand half was already
applied. Defensive `CASE`/`EXISTS` in `order-catalog-link-chores.ts` removed —
fill is now `COALESCE(t.platform_sku, $2)`; `ON CONFLICT DO NOTHING` kept.

**Next for this lane:** sheet-import backlog §5 (telemetry / casing / Shopify
Nango) — pointer-only. Manual smoke of Missing item number queue lives in
[`sheet-import-review-queue-HANDOFF.md`](sheet-import-review-queue-HANDOFF.md).

---

## 2. What shipped (all uncommitted)

**The unique-violation fix**
- `order-catalog-link-chores.ts` — sku-fill guard + `ON CONFLICT DO NOTHING`.
- `2026-07-29f_*_expand.sql` **applied**; `*_contract.sql.gated` pending (item 1).

**Connector seam carries result detail** — the regression that made the importer
dialog render blank for every run.
- `SyncOutcome` gained `details` (opaque, provider-shaped) + `stats`.
  `orders-transfer.ts`'s header had named this the prerequisite for retiring the
  NDJSON routes; the popover was routed through the seam before it was done.
- `orders-transfer-outcome.ts` — pure mapper, split out of `orders-transfer.ts`
  because that module reaches `@/lib/db`'s `server-only` guard and is therefore
  untestable. Bundle-altitude recipe from `build-gotchas.md`.
- `useOrdersSync.ts` — stopped hardcoding `emptyTransferDetails()`.

**Skip visibility** — `SkippedRowsPanel` in `OrderSyncDialog.tsx`. Grouped by
reason, actionable first, order chip → title → platform.
- New reasons: `blankRow` (counted, never listed), `fbaShipment`.
- Ecwid rows render on the **Ecwid Direct tab**, not the sheet's skip list —
  one home per row (see §4).

**Listing-title recovery** — `batchResolveListingsByTitle` in
`sku-catalog-queries.ts` + `backfillItemNumbersFromListingTitles` in the job.
Fills a blank Item Number from an **exact** `sku_platform_ids.listing_title`
match, before the gate. Live effect on the 2026-07-29 tab: **12 → 21 importable
rows**.

---

## 3. The rules the recovery must keep

Breaking any of these silently corrupts real orders.

- **Exact only, never fuzzy.** A near-miss writes a WRONG listing id onto a real
  order, and `platform_item_id` is what orders join on.
- **Ambiguity is a refusal.** If a normalized title maps to >1 distinct
  `platform_item_id` in scope, leave it unresolved. This is not theoretical:
  `"USAV Bluetooth Adapter for Bose Acoustic Wave Music System II | CD-3000"`
  maps to two active eBay listings (`155737995965`, `364207289872`), and a
  `LIMIT 1` probe hid that. Uniqueness is decided in SQL via `ARRAY_AGG(DISTINCT …)`.
- **Resolve the LISTING, not the product.** `batchResolveSkuCatalogByTitles` →
  `batchPlatformItemIdsByCatalogIds` picks `ORDER BY id DESC` — the newest
  listing, wrong whenever a SKU is multi-listed. Never route recovery through it.
- **Only `noItemNumber` rows are candidates.** Blank padding, FBA shipments,
  Ecwid rows, and rows missing an order id or tracking are never resurrected.
- **Recovery is auditable**, never silent — green block in the dialog.

Why `listing_title` and not `sku_catalog`: 5,482 of 5,506 listing rows carry a
title; only 259 are paired to a catalog SKU.

---

## 4. Decisions already made — do not re-litigate

- **Ecwid rows live on the Ecwid tab.** The sheet panel shows a one-line pointer,
  not a duplicate list. Reason: the sheet said "these come in through the Ecwid
  connector" while that tab rendered nothing — a dead pointer.
- **Blank rows are counted, never listed.** Padding in a fix-queue is noise.
- **FBA shipment rows are not orders.** `^FBA[0-9A-Z]{6,}$`, checked before every
  other gate. One inbound shipment appears as one row per box (`FBA19KD6XX28` ×4
  with 4 UPS tracking numbers); importing them mints fake sales that then collapse
  onto one row under the account+source+order_id unique key.
- **The skip aggregate is computed, not hand-summed.** Adding `fbaShipment`
  without touching a hand-written sum under-reported the total by 4 on the first
  live run. The E2E now asserts `skippedRows === Σ(reasons)` and
  `processed + skipped === rowCount`.

---

## 5. Backlog

1. **Committed debug telemetry** — four `fetch('http://127.0.0.1:7336/ingest/…')`
   calls in `useOrdersSync.ts` and `OrderSyncDialog.tsx`, tagged
   `runId:'pre-fix'`. Committed to `HEAD`, not working-tree leftovers. Harmless
   in prod (caught), but should not ship.
2. **`account_source` casing splits data** — `eBay` (804 orders) vs `ebay` (68);
   same for `ecwid`/`(null)` and `amazon`/`Amazon` in
   `sku_platform_ids.account_name`, which is **part of the listing identity key**,
   so one listing can exist twice under two identities.
3. **The residual unrecoverable rows** — ambiguous or absent from the crosswalk.
   Needs the Item Number typed, or eBay/Amazon pulled from their connectors
   (which carry authoritative listing ids). The sheet is a lossy mirror.
4. **Shopify Nango dashboard config** — `shopify` is now in
   `NANGO_BACKED_PROVIDERS` (pinned by `registry-parity.test.ts`), but the hosted
   connect flow needs a Shopify integration with that config key and `read_orders`
   in the Nango dashboard. Until then orgs stay on the vault paste-key path,
   which `shopifyGraphql` now falls back to correctly.
5. **`unresolvedTrackingCount` is consistently non-zero** (16 on the 07-29 tab,
   5 on 07-30) and nothing surfaces it. Not investigated.

---

## 6. Traps that each cost a wrong conclusion

- **Querying via `TENANT_APP_DATABASE_URL` with no tenant GUC returns ZERO
  rows** — RLS, not an empty table. It made `sku_platform_ids` look empty when it
  had 5,504 rows. Use `DATABASE_URL` (owner) for inspection.
- **`server-only` blocks any script importing the job or `sku-catalog-queries`.**
  Run with `node --conditions=react-server --import tsx`, or import only the pure
  modules (`transfer-sheet-eligibility`, `orders/sources/google-sheet-rows`).
- **The chrome popover calls `/api/integrations/google_sheets/sync`**, NOT the
  legacy NDJSON `/api/google-sheets/transfer-orders` that the sidebar's
  `useOrdersImport` still uses. Watching the wrong route shows nothing.
- **`/dashboard` defaults to the OUTBOUND domain**, so `DashboardManagementPanel`
  never mounts. The import entry point is the chrome **IMPORT** button.
- **`TabSwitch` renders plain `<button>`s, not `role="tab"`.** A `role='tab'`
  locator matches nothing and blocks until the whole test times out.
- **Playwright deletes a passing test's artifact dir** — a screenshot saved under
  `test-results/` vanishes exactly when the run succeeds. Write to
  `playwright-report/`.
- **Repeated live imports pool-starve the dev server** (~2 min unresponsive,
  recovers on its own). Do not restart it — see `workflow-safety.md`.

---

## 7. Verify

```bash
npx tsx --test src/lib/jobs/transfer-sheet-eligibility.test.ts \
  src/lib/integrations/connectors/orders-transfer.test.ts \
  src/lib/integrations/registry-parity.test.ts     # 21 tests
npx playwright test tests/e2e/google-sheets-import-backfill.spec.ts --project=desktop
npm run verify                                      # before any commit
```

The E2E is a **documented dogfood-only exception** (`verify.md` → E2E runs
against the QA org): it exists because of production-shaped data the QA tenant
cannot reproduce. Assertions are shape-based, never count-based — the sheet
changes daily (46 rows on 07-29, 26 on 07-30).

**Known-good live shape, 2026-07-29 tab:**
`rowCount 46 = processed 21 + skipped 25`, `recoveredByTitle 9`,
`skippedNoItemNumber 5`, `skippedFbaShipment 4`.
