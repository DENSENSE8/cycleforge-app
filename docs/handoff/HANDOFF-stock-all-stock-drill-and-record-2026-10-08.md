# HANDOFF — Inventory › Stock: All stock, address drill, record face, Print label (2026-10-08)

Supersedes the view list in `HANDOFF-stock-sidebar-contract-2026-10-08.md` (four views → one).

## Sidebar (`/inventory/stock`)

- **One view: All stock.** Overview (`InventoryGlance`), Needs replenishment, Low stock and Out of stock
  are retired (`sidebar-navigation.ts` stock children, `NAV_PAGE_DECLS.stock`, parity, route params
  `view/rsku/rtab/rstatus/counted/excludeAisle/excludeStatus`). Low / out of stock stay reachable as the
  **Stock health** facet. The replenish workspace still lives at `/inventory?section=replenish`.
- The single view still paints its block under `‹ Inventory` (`NavSwitcherMenu`: one row = a static
  block, no chevron or menu). Stock is the only one-view page today.
- **No Include / Exclude switch** on any stock facet; **Cycle count facet removed** (the `counted-asc`
  *sort* stays).
- **Address drill:** Room › Aisle › Bay › Level › Position (`NAV_FACET_GROUPS['stock.all']`, new
  `parent` field on `NavFilterGroupSchema` / `NavFacetGroupDecl`). A step paints only once its parent
  holds a value; picking folds the row to its chip and opens the next step; changing a step clears every
  step under it (`NavFilters` `drillDescendantParams`). Each step is single-pick. Position 00 reads
  "Whole level" (the level's own sentinel). Server: `getStockByLocation` filters `aisle/bay/level/position`
  from `row_label` (aisle-bay) / `col_label` (level-position) before the cap;
  `parseLocationStockAddressScope` drops a part whose parent is missing.

## Stock record

- Verbs: **Print label** (new, `l`) · Products (· Pair to SKU on a TMP). The **Inventory** and
  **Stocked by bin** verbs are gone. Their destinations (`ByBinView` / `BySkuView` via
  `/inventory?bin=` / `?sku=`) are kept by operator ruling: every scanned location / SKU label lands there.
- Item card: the photo is the identity at `size-56` (`StockPhotoTile size="hero"`). The count is a **flush
  corner tab**: a black block in the Item card's own top-right corner (`-top-px -right-px` over the hairline,
  the card's `overflow-hidden` rounds its outer corner, square inner corner, no ring). Its ink is **red** when
  out (≤ 0), **yellow** when low (≤ min), **white** in stock, with no "on hand" words. The Item `RecordGroup`
  is `relative`. The tab is on the open record only; list cards keep "N on hand".
- Upload · Phone: inside/under the photo only while the SKU has **no linked cover**
  (`cover_photo_url == null`); once linked they sit on the right of the **Photos · N** header
  (`StockPhotoVerbs face="header"`, `SkuExceptionPhotosSection action`, `SkuExceptionFacts photoActions`).

## Print label (4×6)

`StockLabelPopover` / `StockLabelSteps`: Image → Notes → Preview & print under `MobileStepProgress`.
Label (`src/lib/print/stockLabel.ts`), top-aligned: the primary photo at full width, the title (0.3in), the
SKU (small, 0.14in), then **Notes** and its value. No barcode, QR or location. Print goes to the print
station (`stock_label` job carrying `labels[]`, ≤ 100 per job, `usePrintStations.sendStockLabels`).
Browser print uses `printDocuments` with a 4×6 `@page`. Notes are remembered per SKU in localStorage
(`cf.stockLabelNotes:<org>:<SKU>`, per browser).

**Bulk:** the All stock selection bar has **Print label** (`StockBulkLabelPopover`): "N labels" (one per
selected card, primary photo, no notes; cards with no SKU or an empty place are skipped and counted), then
**Print all** or Browser print. The **trash** icon at the far right replaces Delete bins / Delete TMP. It
deletes empty bins and zero-stock TMP placeholders after one confirm that shows the breakdown.

Limits: enrolled print-station devices (`PrintStationDevice.tsx`) only print 2×1 / FBA labels and refuse
this job. Pick another station or use Browser print. Only same-origin photos print.

Concurrent work: another session moved `StockRecordActions` into an "Actions" panel
(`RecordActionStrip face="panel"`, at 01:54–02:00). The label popover anchors to that panel.

## Owed — runtime check when `lane-prod` is pinned on :3050

Checked on :3050: the sidebar drill, the corner tab (flush: tab and card share their top and right edges),
the bulk bar (Print label · trash at the far right), the bulk popover ("3 labels · 1 skipped"), and all
three single-label steps. The lane then switched again, before the larger title/notes text could be seen.

1. Press `l` on a record, walk to step 3, and check the preview: full-width photo, a large title, a small
   SKU, then Notes. Print → station toast. Browser print → 4×6 dialog. Reopen: notes are pre-filled.
2. Select cards → Print label → Print all. One page per card, no notes.
3. Trash with mixed selected cards: the confirm names the breakdown and the cards it skips.
