# HANDOFF — Warehouse stock: totes, many places, record/toast/search (2026-09-30)

Paste the **Prompt** below into the next session. Detail rows for everything that landed:
`docs/design-system/HANDOFF-inventory-records.md` §1 (last three rows).

## Prompt

> Continue the Inventory › Warehouse stock work in `/home/michaelgarisek/Projects/cycleforge-lanes/prod`
> (branch `prod/worktree-2026-09-11`, last pushed `b62035743`, live in production on
> https://app.cycleforge.ai as Vercel project `cycleforge-app`, deployment `cycleforge-36o5jez6p`).
> Read `docs/design-system/HANDOFF-warehouse-totes-2026-09-30.md` and
> `docs/design-system/HANDOFF-inventory-records.md` §1 first. Work only on :3050 (AGENTS.md §1).
> Take the **Open items** below in order. For each one: fix it, prove it on :3050 with a throwaway Playwright
> script (`storageState: tests/.auth/admin.json`, never `/api/auth/signin`, keep writes net-zero), then run
> `pnpm verify:fast`. Ask the owner before items marked **owner**.

## What is live (verified on :3050, then deployed to prod)

- **Stock record** (`/inventory/stock?open=…`):
  - The header shows the stock count, then the product title.
  - The item card shows photo, title (above the SKU), the SKU, and the location line: room · the exact tote/bin chip (no glyph; copies the dashed face `C-02-01-2-00`) · how it is held · home tote.
- **Home tote** (`stock/StockPairBin.tsx`) has three parts:
  - a pill: **Home tote**, or `Home <face>` when the home is another tote;
  - **Pair tote** for this record's own tote;
  - an always-on picker (**Switch home tote** / **Pair a tote**).
  - It writes `POST /api/update-sku-location`, and the match is exact after trim and case-fold.
- **One SKU, many places** (`stock/StockLocationsGroup.tsx`) is mounted on every stock record, the SKU exception record and the SKU page (`/inventory?sku=`).
  - It reads `GET /api/sku-stock/[sku]/bins`.
  - Each row has `StockQtySlider` (− · StopSlider · + · number) and **Set N**, which writes put/take as the difference.
  - **Add location** takes a tote or bin plus a qty slider, then does a `put` with `BIN_ADD`.
- **Totes as stock places**:
  - `GET/POST /api/stock-places` and `src/lib/inventory/stock-places.ts`.
  - A tote (`handling_units`, `H-{id}`) gets a `locations` row the first time it's used: `barcode = name = code`, `location_kind = 'OTHER'`.
  - `useStockPlaceOptions` merges totes and barcoded bins for every picker, including Add stock.
- **SKU exception record** is remade on `RecordGroup` cards, and the description has a drag grip.
- **Photo tile** (`StockPhotoTile`): when there's no photo, Upload and Phone sit inside the tile.
- **Shared parts**:
  - `AnchoredLayer`/`Popover`/`SearchableSelectField` flip up, cap the list to the space left, and scroll.
  - The root toaster is bigger, has a lifetime bar and no spinner.
  - ⌘K finds totes (`/tote/[id]`) and SKUs (`/inventory?sku=`).
  - The header search stays sharp while the rest of the header recedes (`GlobalHeader.tsx` `RECEDE_WHILE_FINDING`).

## Open items

1. **Tote barcode collides across orgs (real risk).** `locations_barcode_key` and `locations_name_key` are GLOBAL unique indexes. Once org A's `H-12` becomes a stock place, org B's `H-12` gets a 409 ("Another location already uses H-12") forever. Pick a scheme that's scoped per org: for example keep `name` = code, keep the scan resolving by `(org, code)`, and make the barcode org-unique, or change the index to `(organization_id, barcode)` with a migration (`skill://db-migration-author`). Check every `getLocationByBarcode` caller before changing the index.
2. **`location_kind='OTHER'` vs a real `TOTE` kind.** Right now a tote is identified only by matching its barcode to `handling_units.code`. Consider a dated migration next to `src/lib/migrations/2026-08-09_locations_location_kind.sql` that adds `'TOTE'` to `locations_location_kind_check`. Then set `TOTE_LOCATION_KIND = 'TOTE'`, backfill the existing tote rows (location 742, `H-1`), and check that inventory surfaces filtering on `location_kind` (bins overview, map, cycle counts) either show or exclude totes on purpose.
3. **Wording overreach.** `STOCK_SOURCE_LABEL.bin` became "Loose (tote count)". That label describes how a shelf was counted; **owner**: keep it, or revert to "Loose (bin count)" and use "tote" only in pairing UI.
4. **Description grip duplicates a house part.** `DragResizeGrip` in `sku-exceptions/SkuExceptionEvidenceSections.tsx` is hand-rolled. The house resize is `OmnichannelComposerDock` with `manualResize` (used by `StockAddForm`), but that's a native corner handle, which the owner couldn't find. **owner**: promote the grip into the design system (and add it to the dock), or swap to the dock.
5. **Slider shape.** `StopSlider` is built for bounded runs; `StockQtySlider` stretches its range to `max(10, 2×count, count+10, typed)` and keeps a number field. Watch rows with very large counts (hundreds of stops). Cap the range or step by 5/10 above ~200.
6. **Pairing with zero stock isn't supported.** Pairing a tote means putting at least 1 in it. Every read path filters `qty <> 0`. If the owner wants a SKU linked to a tote without stock, the read side (`getBinLocationsBySku`, the loader, the pickers) must include qty-0 rows first; don't ship only the write.
7. **The pre-push hook failed and was skipped** (`--no-verify`, owner's instruction). `verify:fast` was green; run full `pnpm verify` and fix or name whatever it fails.
8. **Dead server branch:** `PATCH /api/sku-stock/[sku]` `action:'location'` has no client left (the SKU page now uses `StockPairBin`). **owner**: delete it. Note: a non-barcoded free-text `sku_stock.location` still displays, but can't be set again from the new control.
9. **Toast:** Sonner 2.0.7 never auto-closes a `loading` toast, so a promise that never settles leaves one forever. The bar also restarts from full if a hovered toast is later updated in place.
10. **Search subtitle** shows the raw home barcode (`C0201200`). Format it with `skuExceptionLocationFace` in `src/lib/search/global-entity-search.ts`.
11. `src/lib/toast-theme.ts` plus its test are unused (the live theme is `src/design-system/components/toast-theme.ts`). Delete them.

## Data touched in the lane DB (kept on purpose)

- Tote `H-1` now has a stock `locations` row (id 742, kind OTHER).
- `TMP-H5YM4-K68X4` home tote = `C0201200` (`C-02-01-2-00`), which is where its 25 units sit.
- Every count, put/take and home-switch probe was reversed (net zero). The audit and ledger rows remain.

## Commits (all pushed with `--no-verify` and include every session's in-flight work, by owner request)

`7912d596c` main change · merge of `5685cb39f` (another session's kiosk fix) · `101b1bd76` merge ·
`4bcbafdd5` title above SKU and sliders · `b62035743` header search stays sharp.
