# HANDOFF — To-ship paperwork, print fallback, ShipStation buying (2026-09-24)

Paste this as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`). Scope: **web desktop** (`/shipping/orders`, the Labels
walk, the evidence column). Dev origin `http://localhost:3050` only. Do not commit. The tree
carries other lanes' uncommitted work — touch only what the task needs. Supersedes the "First
step" section of `HANDOFF-industrial-record-panel-and-labels.md` (both items there are done).

Work the list **in order** — it is sorted by return on effort (money risk and blocked shipping
first, then time saved per order, then polish). Verify each item live before starting the next.

---

## 0. Verify the foundation (≈20 min) — nothing below is safe until this is green

Built this session, type-checked, **not yet screenshotted or run through `verify:fast`**:

- **One identity face for Order # and TRK#** — `OrderNumberIdentity` / `TrackingIdentity`
  exported from `src/components/ui/OrderIdentityChips.tsx` (brand dot + last-8 copy chip,
  left-aligned; tracking dot is the carrier ring). `useOrderIdentityCellNodes` now renders
  through them, so **every ledger/grid using `OrderIdentityChips` changed too** — screenshot
  the To-ship ledger band 1, the evidence column (`OutboundOrderEvidence.tsx` Order # / TRK#
  rows), and the Labels walk Order card. Owner law: consistent chip + coloured dot, left aligned.
- **Labels walk in the triage DS** — `PaperworkWalkHost.tsx` wraps the walk in
  `<ModeRegion mode="triage">`; `PaperworkEditor.tsx` is now `ShippingEntityContextHeader` +
  walk bar (prev · Skip/Next · exit) + `TriageScrollLayout` cards: **Order**, **Paperwork**,
  **Parcel & shipping label**. Re-run the key probe (J/K step, L toggles, Esc exits, Esc inside a
  field only blurs) — the earlier pass was against the industrial version.
- **Inline paperwork** — `paperwork/PaperworkDocuments.tsx` (triage face, container-responsive:
  list above preview on narrow, side by side at `@3xl`). The CRUD pass below was run against the
  previous industrial face of the same component; re-run it once on the triage face.

Then: `pnpm verify:fast`. Known reds from other lanes: `picking/sessions.ts`,
`UnitQcRunner.tsx`, print-station `targetStationId`, sku-exceptions, StockByLocationView,
location-stock-grid. `pnpm test:auth` has 1 red not ours: kiosk carts routes show as
ungated writes (their device-cookie gate isn't detected by `scripts/audit-route-auth.ts`).

## 1. ShipStation P0 — stop double charges and broken label downloads (≈1–2 h)

Buying already works end to end on ShipStation **v2** (`src/lib/shipping/shipstation/client.ts`,
`API-Key` header): `POST /api/shipping/order-rates` → `/order-labels/purchase` → `/void`,
`shipping.buy_label` gated, label PDF stored as the order's
`shipping_label`, packing slip generated, tracking written, audited. v1 (`orders-v1.ts`, Basic
auth) is read-only order/weight sync. Fix, in order:

1. **Double-charge window** — `src/app/api/shipping/order-labels/purchase/route.ts:139-249`.
   Idempotency is "does a `documents` row with `sourceHash = clientEventId` exist". If
   `storeOutboundDocumentFromBytes` throws after `v2.purchaseLabelFromRate` succeeded, nothing is
   recorded and a retry buys again. Record the purchase (label id, tracking, cost, clientEventId)
   **before** storing bytes, short-circuit retries on that record, and backfill the document on
   retry. `BuyLabelSection.tsx:149` mints `clientEventIdRef` once per rate load — keep one key per
   intended purchase, new key only after a confirmed success or void.
2. **Label download 401** — `purchase/route.ts:231` calls `downloadLabelBytes(labelUrl)` without
   the v2 API key; the `labelDownload.href` fallback needs it.
3. **Print from the success card** — `BuyLabelSection.tsx:265` only says "print them from the
   main panel". Add Print label / Print slip using item 2's print path.

Prove with a sandbox/test rate or by forcing the store to throw once, then retrying: exactly one
purchase, one document, one tracking row.

## 2. Print when the packer print station is down — one file, one order, many orders (≈2 h)

Today (`src/lib/documents/print-bundle.ts`, `POST /api/orders/[id]/documents/print`) the packer
bundle is EVERY shipping label on file, the newest packing slip, the manuals, and every label
paired to the order before pack (label_ingestions MATCHED/LINKED with no documents row yet,
ledgered by `document_print_jobs.label_ingestion_id`, browser-read from
`GET /api/orders/[id]/documents/label-ingestions/[ingestionId]`). It goes to PrintNode when an
outbound printer profile exists, else returns `browserFallbackDocs`. The pack scan
(`POST /api/packing-logs`) also accepts a tote or a unit label / serial and packs that order on
its primary tracking (`src/lib/packing/pack-scan-order.ts`); on a phone,
`/api/packing/resolve-scan` hands `/m/pack/start/[orderId]?print=1`, which prints the bundle on
entry. Station hand-off is Ably (`useStaffPrintBridgeHost/Client`) with an offline timeout.
**No server PDF merge exists.**

Lowest-cost path (recommended): reuse the existing browser fallback
(`src/lib/print/printOutboundDocuments.ts`, `printPackBundleFallback.ts` — one full-bleed page
per document, then `window.print()`):
- **One file**: already there — Print on each preview card (`printDocument` in
  `paperwork/order-paperwork-client.ts`, hidden-iframe print).
- **Whole order**: "Print all" on the Paperwork card → label + slip + manuals in pack order
  (`resolvePrintBundle` gives the order and the manual set).
- **Bulk**: ledger selection → "Print paperwork" (evidence column verb + desk bar segment) for N
  orders, same builder. Log each as a `fallback_browser` row in `document_print_jobs` so pack
  history stays true.
Only if single-dialog printing is required: add `pdf-lib` and `GET /api/orders/print-packet
?orderIds=…&kinds=…` (`orders.view`) merging `readOutboundDocumentBytes` +
`readManualFilesForZip` bytes into one inline PDF.

## 3. Weight + L/W/H remembered per SKU / item number (≈2 h) — owner said "add it and run it"

Owner: "there should be an existing table — if not, add it and run the migration now." Scouted
the live DB (`information_schema`): **no** SKU/item-level weight or dimension columns anywhere
(`sku_catalog`, `sku_platform_ids`, `items`, `packages` have none; parcel lives only on
`orders.parcel_weight_oz|length_in|width_in|height_in`, migration `2026-08-30d`).
`npm run db:migrate:dry` → 0 pending, so nothing blocks applying a new file.

- Read `skill://db-migration-author`, then author
  `src/lib/migrations/2026-09-24f_product_parcel_dims.sql`: tenant-from-birth table
  `product_parcel_dims (id, organization_id uuid NOT NULL, key_kind 'sku'|'item_number',
  key_value text (normalized: SKU = UPPER(TRIM); item = normalizeIdentifier), sku_catalog_id
  NULL FK ON DELETE SET NULL, weight_oz, length_in, width_in, height_in (numeric, >0 or NULL),
  source_order_id, updated_by, created_at, updated_at)`, unique
  `(organization_id, key_kind, key_value)`, guarded `enforce_tenant_isolation`. Apply with
  `npm run db:migrate` (owner approved), then `npm run tenancy:coverage`.
- Write: `setOrderParcel` (`src/lib/orders/caged-orders.ts:369`) upserts the order's SKU row and
  item-number row in the same `withTenantTransaction`.
- Read: `GATE_SELECT` (`caged-orders.ts:170`) falls back order → SKU → item number when the
  order's parcel is empty; expose `parcelSource: 'order'|'sku'|'item_number'|null` on
  `CagedOrderRecord` and show "Remembered from SKU 03796" under the fields in
  `OrderShippingPanel`. `POST /api/shipping/order-rates` reads the same record, so rates pick up
  the default automatically.

## 4. ShipStation P1 — unblock rating (≈1 h)

- `OrderShippingPanel.tsx:254` blocks rating when no local weight, but `order-rates` already
  falls back to ShipStation v1 `engineWeight` — let ShipStation-sourced orders through (item 3's
  SKU default covers the rest).
- `OrderShippingPanel.tsx:171` only handles `SHIPSTATION_NOT_CONNECTED`; also handle
  `SHIP_FROM_NOT_CONFIGURED` with a Settings → Shipping link.
- `purchase/route.ts:167` — pass `label.carrierCode` into `applyOrderTrackingOps` instead of
  regex-guessing the carrier.

## 5. Desktop To-ship page in the triage DS — **owner decision pending**

Owner asked whether the whole desktop To-ship page should be triage, not industrial. Recommended
answer given: **mode-only first** — wrap desktop `/shipping/orders` in
`<ModeRegion mode="triage">` (slate palette, 4px radius, 14px body re-map through tokens) and
keep the ratified ledger anatomy; screenshot density before/after. Full triage anatomy (cards /
DataTable) conflicts with `HANDOFF-industrial-record-ledger.md` and waits for the
outbound-workflow cohort re-ratification. `/m` stays industrial. **Ask before doing this.**

## 6. ShipStation P2 / P3 (later)

- P2: label format + layout (PDF/ZPL, 4×6/letter) through the purchase body; carrier package
  codes; serialize `insuredValue` in `client.ts:toSsShipment` (currently dropped).
- P3: customs block for international (`types.ts`, `client.ts`, `order-rates`); auto-register the
  v2 `track` webhook on credential save (`connectors/shipstation.ts`).

Deferred (not desktop): phone paperwork sheet — replace
`mobile/redesign/MobileOrderDocumentsSheet.tsx` with `PaperworkDocuments` inside the
`MobileToShipSheet` BottomSheet (the component is already container-responsive).

---

## Done this session (verified live unless marked)

- **Labels walk** finished and verified: J/K/↑/↓ step, L toggles, Esc exits.
  `RightPaneOverlay` now claims the overlay stack (`useRegisterOverlay`) and only the topmost
  overlay closes on Escape — Esc in a document viewer no longer also exits the walk. (Shared
  component: every `RightPaneOverlay` now makes ambient keyboards stand down while open.)
- **Evidence column**: TRK# replace is a square pencil cell; Pick/Pack show who + date/time
  (`LedgerStageAssign showStamp`, read-only when `onCommit` is absent);
  `LedgerValueActions` → `LedgerOpenAction` (the chip copies, the cell opens).
- **Order paperwork, full CRUD, inline, no slide-over** (`DocumentSlideOver` removed from the
  walk; `SkuManualsPanel.tsx` deleted). Proven in the browser on order 14256, then cleaned up:
  label/slip upload (201), replace, delete; manual upload, rename, replace file, unpair, re-pair
  from the library picker, delete; All view; Download all ZIP (`01_…pdf, 02_…pdf,
  03_ecwid-invoice-5076.pdf, manual_…pdf`).
- **Backend** (PaperworkBackend agent, curl-smoked, test data reverted):
  - `GET/POST /api/orders/[id]/manuals`, `PATCH/DELETE /api/orders/[id]/manuals/[manualId]`
    (`?mode=unpair|delete`); domain `src/lib/manuals/order-manuals.ts`, blob store
    `src/lib/manuals/manual-file-store.ts`. Manuals pair to the order's item number AND SKU and
    the resolved catalog row; every write busts the `/api/manuals/resolve` cache.
  - `download-zip` accepts `manualIds`. Order document upload no longer dedupes a second file of
    the same type onto the first. `/api/manuals/resolve` returns `contentUrl`, no more
    `docs.google.com/.../null` URLs.
  - Audit actions `order.manual.*`; route manifest regenerated and pinned.
- `OrderShippingPanel` gained `showDocuments` (the walk renders documents itself).

Known pre-existing bug (not fixed): library create via `/api/product-manuals/upload` throws —
`upsertProductManual` requires a Google id or `relativePath` for a sourceUrl-only row.

## Tools and gotchas

- Playwright session: `/tmp/pw-walk/auth.json`. Probes: `keys.mjs` (walk keyboard),
  `docs.mjs view|crud <orderId>`, `crud.mjs <orderId>` (response-driven CRUD + cleanup),
  `trk.mjs <url>` (evidence rows), `all.mjs`. Launch with `chromium.launch({ channel: 'chromium' })`
  — the default headless shell can't render PDFs. Test orders in To-ship: 14256 / 14258 / 14259.
- The manuals list refetch lands a beat after the documents refetch; wait on the `/manuals` GET
  response, not a fixed sleep.
- Do not write TS/JS containing `!` through the Python eval kernel — IPython treats `!…` as a
  shell escape and corrupts the line (it happened once this session).
