# Handoff — Live feed docs popover, round 2

> Paste everything below the line into a fresh agent session in
> `/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Written 2026-10-06 from operator rulings;
> do not re-ask them. Layout spec: `docs/refactors/live-feed/SPEC-docs-triage-popover.md`
> (read "Rulings round 2" — it is the contract).

---

Read `AGENTS.md` first and obey it: `:3050` only; lane lifecycle is operator-only; `verify:fast`
before "done"; other sessions edit this worktree — re-read before patching, commit only with
`git commit --only <paths>` and only when asked; never apply another session's migration.

## Where things stand (uncommitted, built in round 1, browser-verified)

- **Popover:** `src/features/live-feed/PrintPacketsDialog.tsx` ("Labels & paperwork"). It holds
  the identity strip, a rail or grid of orders, three tabs (label · slip · paperwork) and Print
  bottom right.
- **Pieces:** `src/features/live-feed/docs-triage/`
  - `doc-tabs.ts` (+ test): tab model.
  - `IdentityStrip.tsx`: order, tracking, buyer, ship-by and lines, plus the SKU confirm.
  - `DocTabBody.tsx`: the 26rem preview plus the slots.
  - `DocsMatrix.tsx`: grid view, with bulk-link of one manual to the ticked orders.
- **Card marks:** `src/features/live-feed/card-docs.tsx` shows three marks per card. The data
  comes from `src/lib/live-feed/load.ts` (`slip` / `paperwork` columns), using
  `G2_LINKED_DOCUMENT_EXISTS_SQL` / `G2_PRODUCT_PAPERWORK_EXISTS_SQL` in
  `src/lib/orders/g2-paperwork-sql.ts`.
- **SKU suggest/confirm:**
  - Server: `src/lib/orders/line-sku-suggest.ts`, `line-sku-suggest-contracts.ts` (+ test), and
    `src/app/api/orders/[id]/sku-suggestions/route.ts`.
  - UI: `src/features/labels-docs/orders/pane/LineSkuSuggest.tsx`.
  - Confirm writes `orders.sku` / `sku_catalog_id`. When the line has an item number it also
    teaches `sku_platform_ids` through `batchPair`. **Not yet exercised against data.**
- **Paperwork suggestions:**
  - Server: `src/lib/manuals/paperwork-suggest.ts`, `paperwork-suggest-contracts.ts`, and
    `src/app/api/orders/[id]/paperwork-suggestions/route.ts`. Ranking is key match first, then
    pg_trgm name similarity.
  - UI: `src/features/labels-docs/orders/pane/PaperworkSuggestions.tsx`.
- **Packet read:** `OrderPacket` gained `buyerName` and `shipment {trackingNumber, carrier}`
  (`order-packet-contracts.ts`, `order-packet-derive.ts`, `order-packets.ts`).
- **Search fix:** `/api/product-manuals/search` now also matches on the `sku` column.
- **Manifest:** `docs/security/route-permissions.json` was re-emitted with
  `node_modules/.bin/tsx scripts/audit-route-auth.ts --emit`. Re-run it for every new route.
- **Reference data:**
  - Order row 19611 (`19-15205-47811`, eBay, blank SKU) → suggests SKU 00822 by part number
    `360148-0010`.
  - Order `5067` (Ecwid): its text SKU `01241` is not in the catalog.
  - Label ingestion 66 is the one linked label; its PDF returns 200.

## The job — every item below, then verify in the browser

### 1. Bulk dock: "Open" text, no cursor
`src/features/live-feed/BulkBar.tsx` passes `dock.quick` with the `MousePointer2` icon, and
`RecordActionStrip` (`src/design-system/components/record-action-strip/RecordActionStrip.tsx`,
face `dock`) draws it as a round icon button.
- Show the **text "Open"** with lucide `Package` (open-box glyph `PackageOpen` if it reads better).
- Give `RecordActionDock.quick` a visible label instead of icon-only, without forking the strip.

### 2. Close button misaligned
The popover header is `py-3 items-center`. The Dialog's built-in close is
`absolute right-4 top-4` (`src/design-system/components/Dialog.tsx`), so it sits off the title's
centre line.
- Use the Dialog's own hide-close option, and render the close inside the header row, vertically
  centred with the title and the Orders|Grid toggle.
- Check against the docs dialog header at 1600×1000.

### 3. Full-screen sheet: rail | work | tall viewer (ruling)
Replace the 26rem in-flow preview.
- **Size:** the sheet is near full-viewport.
- **Columns:**
  - left rail (orders; only when there are 2+; fold-able);
  - work column (~40%: identity strip, tabs, suggestions, search results, verbs);
  - **right viewer**: full height, portrait, `DocumentPreviewFrame` / `FetchedPdfFrame`.
- **What the viewer shows:** the *selected* thing, which is a linked document **or a search
  result before linking**. It has a page/zoom affordance and an "Open in new tab" link.
- **Empty state:** says what is missing and how to get it.
- **Grid view:** keeps the full width. A cell opens the sheet on that order and tab.

### 4. Paperwork search + view in line (ruling: preview, then Link)
- **Search box:** the Product paperwork tab gets a library search box under the suggestions.
  Reuse `/api/product-manuals/search` (debounced). It replaces the hidden `LibraryPairPicker`
  dropdown for this surface.
- **Click a suggestion or result** → it opens in the right viewer. Nothing links on click.
- **Link button on the viewer:** pairs via `useLinePaperwork().pair` at `defaultPairScope`, SKU
  first. The button names the scope: "Link to SKU 00822 · 3 open orders".
- **Thumbnails:** use `thumbnail_url` when present.
- **Linked docs:** listed in the work column; selecting one shows it in the viewer.

### 5. Unpair and remove — label, slip, paperwork (operator: must be able to)
Every verb confirms, then offers Undo in the toast.

| Document | What exists | What to build |
|---|---|---|
| **Paperwork** | Unpair exists (`removeOrderManualHttp(lineId, manualId, 'unpair')`, Undo via `restorePairing` in `use-line-paperwork.ts`). Delete is `mode=delete`. | Surface **Unpair** and **Remove (delete file)** on the viewer and on each linked row. Today they are tiny icons inside `LinePaperworkSlot`. |
| **Slip** | `DELETE /api/documents/[id]` deletes the document (`deleteDocument` in `order-paperwork-client.ts`). | Add **Remove**. Check whether an unlink-only path exists (drop the `document_entity_links` row, keep the file). If not, ask the operator whether Remove = delete is enough. |
| **Label** | **Gap.** Nothing unpairs an APPLIED label from an order. `deleteUnlinkedLabelIngestion` (`src/lib/label-ingestions/ingestion-service.ts` ~l.262) refuses any label with `matched_order_id` or state APPLIED. | Build **Unpair label** (back to the waiting pool, QUARANTINED, `matched_order_id` NULL, its order `documents` link removed, audit row) and **Remove label** (unpair + delete). Uploaded label documents with no ingestion (`PacketLabelDocument`) remove through `DELETE /api/documents/[id]`. |

Questions for the operator before writing the label unpair:
- (a) When a label is unpaired, does its **tracking number come off the order** too, or stay?
- (b) Is an order that was **scanned out** on that label still allowed to unpair?

Read `src/lib/label-ingestions/apply.ts` first. Apply writes `shipping_tracking_numbers`,
`shipment_links` and `orders.shipment_id`, and links the document. Unpair must reverse exactly
what apply wrote, in one tenant transaction, guarded by row_version.

### 6. Shipping label upload works end to end (reported: "upload failed")
**Root cause, confirmed by reading:**
- `src/features/labels-docs/upload/use-label-uploads.ts:89` throws "Page N has no readable
  tracking number and cannot be paired."
- `confirmLabelIngestionOrder` (`ingestion-service.ts` ~l.364) also refuses with "No tracking
  number was read".
- `applyLabelIngestion` (`apply.ts` ~l.473) requires tracking (`EXACT_IDENTITY_INCOMPLETE`).

**Rulings:**
- **No tracking read → ask for it, allow skip.** Per page in the upload tray, show the page
  preview, a **Tracking number** field (carrier detected as typed: `detectCarrier` in
  `src/lib/shipping/normalize.ts` or `src/lib/tracking-format.ts`; pick one and say why), and two
  choices:
  - **File with tracking:** server-side, write the typed number onto the ingestion
    (`tracking_number_raw` / normalized via `normalizeTrackingNumber`, carrier; bump
    `row_version`; audit `operator_entered`), then the normal confirm → apply.
  - **File without tracking:** the label is linked and printable, and the order has no tracking
    yet. Apply cannot take it, so store the page bytes as an order `shipping_label` document
    (`storeOutboundDocumentFromBytes`, as `/api/orders/[id]/documents/upload` does) and remove
    the quarantined ingestion. Do it **server-side in one endpoint**, not as client fetch +
    re-upload.
- **Tracking already on a different order → warn, the operator chooses.** Show the label
  preview, this order and the other order (full numbers, platform, status), then:
  - **Move to this order:** detach that shipment from the other order;
  - **Keep on both:** one box, two orders;
  - **Cancel.**
- **This order already has a different tracking → warn:**
  - **Replace:** the new label becomes primary, the old shipment is detached and kept in history;
  - **Add as another box:** `apply.ts` already supports an additional package.
- **Same tracking already on this order** → say "Already on this order", then file the label
  with no tracking change.

**Shape:**
- Add one preflight read: `GET /api/v1/label-ingestions/[id]/file-check?orderId=&tracking=`,
  answering `{ tracking, source: 'label'|'typed'|null, otherOrders[], orderTracking[], sameAlready }`.
- Add one write: `POST /api/v1/label-ingestions/[id]/file-on-order` taking
  `{ orderId, expectedRowVersion, tracking?, carrier?, withoutTracking?, collision?: 'move'|'keep', existing?: 'replace'|'add' }`.
  The write reuses `confirmLabelIngestionOrder` + `applyLabelIngestion`; it never forks them.
- `fileLabelOnOrderHttp` and the upload hook route through it.
- A whole batch never fails because one page needs an answer. That page waits in the tray with
  its question.
- **Tests:** unit-test the preflight classification and the write's branches, then upload a real
  PDF in the browser (a no-tracking page and a colliding page). Use the operator's own test PDF,
  or ask for one; never invent a label.

### 7. SKU with platform + listing link; catalog search (rulings)
- **Platform name:** the SKU always shows its platform, e.g. "ECWID SKU 01241" or
  "EBAY Item # …", from `resolveMarketplaceChipIdentity` / `useOrderChannel`.
- **External link:** an external-link button opens **the listing on the platform**.
  - URL source: `sku_platform_ids.listing_url` for the line's item number or catalog SKU (stored
    by `batchPair`'s `listingUrl`).
  - Otherwise build it from the item number. There is an eBay pattern
    (`https://www.ebay.com/itm/<id>`), and Amazon `/dp/<ASIN>` when the item number is an ASIN.
  - Ecwid has no global pattern; use the stored URL, or hide the link and say so.
  - Look for an existing listing-URL builder first (`grep -rn "ebay.com/itm" src`).
- **Suggestions:** each suggested and searched catalog SKU also carries its listing link, so
  the operator can check before confirming.
- **Catalog search:** Confirm gains a catalog search (SKU or title). Reuse an existing
  sku-catalog search route; don't add a second.

### 8. Motion — purposeful, quick (ruling)
- Check `package.json` for `motion` / `framer-motion`. Use what is installed, and prefer
  `motion/react`.
- **What moves:**
  - tab-body cross-fade/slide (~150 ms);
  - viewer cross-fade on selection change;
  - a mark pops green when its document links;
  - rail/grid rows reorder with layout animation;
  - the sheet opens with a short scale+fade.
- **Accessibility:** honour `prefers-reduced-motion`. No animation on scroll.

## Quality-of-life additions (gathered; build after 1–8, each small)
1. **Keyboard:**
   - `1` `2` `3` switch tabs;
   - `J`/`K` move through orders in the rail;
   - `⌘↵` links the previewed document;
   - `P` prints the open tab;
   - `Esc` closes the viewer selection before the sheet.
2. **Next owed:** after a link succeeds, "Next owed →" jumps to the next order or tab still
   missing something. When the selection is complete, say so.
3. **Mismatch warning:** the identity strip flags when a label's ship-to name or tracking does
   not match the order's buyer or tracking, using the same evidence as the collision check.
4. **Rail progress:** a header count, "12 of 31 complete", and a filter by which tab is owed.
5. **Library reuse:** linking one manual offers "Also link to the other N orders with SKU X in
   this selection".
6. **Grid hover:** a cell in the grid shows a quick preview of the document on hover.
7. **Remember layout:** the rail-collapsed state and the last tab persist per viewer (try/catch
   `localStorage`).
8. **Print preview:** shows page count and stock per station before Print (`useDeskPress`
   already knows the routes).
9. **Copy:** every full number in the strip copies on click (already `RecordFullId`); add
   "Copy all" for order + tracking.
10. **Live refresh:** when another station links or prints, the open sheet re-reads (the Orders
    desk already listens to `publishOrderChanged`).

## Not to do
- No second writer for any document type. Pair, unpair, upload and print go through the existing
  writers named above, or the two new label endpoints.
- No typed free-text SKU field. SKUs are suggested or searched, then confirmed.
- Nothing links on click. Preview first.
- Don't touch the lane, ports, or other sessions' migrations. The three pending migrations
  (`2026-10-06_order_stage_facts_picked_source.sql`, `2026-10-06d_order_list_removals.sql`,
  `2026-10-06e_orders_account_source_canonical.sql`) need the operator's say-so.

## Done means
- `verify:fast` green, or every red line shown to be another session's.
- Unit tests for the new pure logic.
- `ds_critique` run on every touched UI file.
- A Playwright pass on `:3050` (repo Playwright from `node_modules/.pnpm/playwright@1.60.0`;
  pinless sign-in rotates staff 2/3/5/7/14) covering:
  - cards → sheet; viewer tall; close aligned; Open text in the dock;
  - paperwork search → preview → Link → Unpair → Undo;
  - slip Remove + Undo; label Unpair;
  - upload of a no-tracking page (typed and skipped);
  - a collision page;
  - SKU listing link opens.
- Screenshots sent to the operator, and a report of what was verified versus only built.

## Status — 2026-10-07 (round 2 built)

**Operator rulings (round 2 follow-up):**
- Label unpair: the tracking the label wrote comes off. Tracking that was on the order before the label stays.
- An order that was scanned out can still be unpaired; the confirm warns that it was scanned out.
- Slips and label documents without an ingestion get two verbs: **Unlink** (moves to the UNLINKED pool) and **Delete**.

**Migration:** `2026-10-07_label_ingestion_unpair_transition.sql` is applied (APPLIED → QUARANTINED only with every apply fact cleared). The operator also okayed applying `2026-10-06d_order_list_removals.sql`, which the runner had to apply first because files go in order.

**New writers:**
- `src/lib/label-ingestions/unpair.ts`: unpair, remove and an exact-restore Undo.
- Routes `/api/v1/label-ingestions/[id]/{unpair,unpair-check,unpair/undo,file-check,file-on-order}`.
- `src/lib/label-ingestions/file-on-order.ts`, plus `file-on-order-contracts.ts` for the pure classification.
- `unlinkOutboundDocument` and `POST /api/documents/[id]/unlink`.

**Verified in the browser on `:3050`:**
- Sheet layout and dock: three columns at 1600×1000; the close button sits on the title's centre line; the bulk dock shows "Open".
- Keyboard: `1`–`3`, `J`/`K` and both `Esc` presses.
- Paperwork: search → preview (nothing written) → Link → Unpair → Undo.
- Slip: Unlink → Undo and Delete → Undo.
- Label: Unpair → Undo with an exact restore (order 5067 / ingestion 66).
- Uploads: a colliding upload asks Move / Keep / Cancel.
- Listing: the Amazon listing link opens `/dp/<ASIN>`.

**Built, not exercised against data:**
- Upload of a page with no tracking (typed and skipped): no test PDF without tracking exists. The branch is covered by unit tests.
- Collision and existing-tracking answers (Move / Keep / Replace / Add): they write to real orders. Their branches are unit-tested.
- Remove label with Undo by re-upload.
- Grid hover over a filed document.
- Headless Chromium paints nothing for a PDF in an iframe, so the viewer's page rendering was not visible in screenshots.

**Fixed during the pass:**
- Undo toasts sat behind every modal: `#app-root` is a fixed stacking context. `AppToaster` now portals to `body`, and `DialogContent` ignores outside-clicks that land on a toast.
- The owed-label pair picker stole focus, so the sheet's keys did nothing.
- `/api/product-manuals/search` returned string ids, so a linked preview never flipped to linked.
- An unpaired label's kept document stayed on the order.
- Undo re-ran apply, which cannot reverse a backfilled label.
