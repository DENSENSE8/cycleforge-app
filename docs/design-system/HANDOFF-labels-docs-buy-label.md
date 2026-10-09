# HANDOFF — Labels & docs: Buy a label page, QoL, open items (written 2026-09-28)

Paste the **Prompt** at the bottom into a fresh session. Ground truth as of 2026-09-28 night. Other
sessions edit this worktree concurrently — re-read every file right before editing, never revert what
you did not write, never commit or stage without asking. Dev origin `http://localhost:3050` only
(`AGENTS.md` §1). Earlier history: `HANDOFF-labels-docs-print-stations.md` §6 (read it — it records
every ruling and decision from this pass).

## 1. Owner rulings (newest last)

1. Desk `/shipping/label-intake` views: **1 Uploads** (bare) · **2 Labels** `?view=labels` · **3
   Paperwork** · **4 Printed**. Uploads = one card per uploaded PDF (batch); pages = labels.
2. Uploads: lone list at the **full hairline width** until a card is clicked, then rail + record;
   ✕ / Esc folds back. Labels / Paperwork / Printed keep the always-open rail (no ✕).
3. **✕ is always the top-right-most control** in a record header (`n of N · verbs · ✕`).
4. Record titles are screen-reader only (the open card names the record) — do not flip back.
5. Label previews are **square** (no radius). Batch verbs in ONE header row at the right.
6. Bulk upload auto-splits: one PDF → one batch, one label per page (server-side, pdf-lib).
7. **Warn before reprinting**: an animated shadcn-style scrim + dialog ("Print again?"). Done.
8. **Buy a label outright** (latest): no order number required; its OWN page with **no left
   sidebar**; completely focused on buying one label; "Link a product" fills L×W×H + weight from the
   product's remembered parcel. The Labels view's header face is **Buy label** → that page.

## 2. State of the Buy a label work (this is where the pass stopped)

Built, NOT yet linted/typechecked as a whole, NOT yet seen on :3050:
- Route `src/app/shipping/buy-label/page.tsx` (`shipping.buy_label`) → `src/features/labels-docs/buy/BuyLabelPage.tsx`:
  sticky header (title · ✕ top-right, Esc → `/shipping/label-intake?view=labels`), left column Ship to
  (address fields) + Package (Link a product → `searchLabelBuyProducts`, weight/L/W/H, "Remember this
  size" checkbox), right column Service (Outbound/Return/Replacement, optional reference, Get rates,
  radio list of rates sorted by price, **Buy carrier $x**), then Bought (tracking, cost, square
  preview, Print → label station via `useDeskPress`, Buy another, Open Labels). One `clientEventId`
  per intended purchase; Buy another mints a new one.
- Nav: `NAV_PAGE_DECLS['label-intake']` `labelsDocsActions` — `labels-docs.buy-label` is now an
  **href** `/shipping/buy-label` (face on the Labels view only); parity.ts + PARITY.md + NAV_ACTION_ICONS
  (Truck) updated. The earlier inline Buy panel (`BuyLabelPanel.tsx`) and its desk wiring were
  REMOVED; `BuyLabelSection.tsx` / `OrderShippingPanel.tsx` reverted to HEAD.
- Server (LabelBuyServer agent, unit-tested 26/26, route perms + OpenAPI regenerated, never run
  against ShipStation — dev has no keys): `src/lib/label-buys/{contracts,buy,http-client}.ts`,
  `POST /api/v1/label-buys/rates`, `POST /api/v1/label-buys`, `GET /api/v1/label-buys/products?q=`.
  No migration: `shipping_label_purchases.order_ref` is nullable; reference stored when typed. A
  reference that exactly names an order finishes through `finishLabelPurchase` (pairs, docs, audits;
  buyer-note check first). Otherwise the bought label becomes an unpaired Labels card. After-charge
  failures come back as 200 + `warning`. `rateReferenceLabel`/`referenceShipmentSpec` widened to all
  purposes; `recordPurchaseLabelIngestion` + `rememberParcelDims` accept `orderId: null`.
- Error codes the page must handle (`V1RequestError.code`, thrown by `v1Request`):
  `SHIPSTATION_NOT_CONNECTED` 400, `SHIP_FROM_NOT_CONFIGURED` 400 (link Settings → Organization →
  Ship-from), `SHIPSTATION_ERROR` 502, `LABEL_TEST_MODE_BLOCKED` 409, `LABEL_PURCHASE_IN_FLIGHT` 409,
  **`LABEL_PURCHASE_VOIDED` 409 → page must mint a new clientEventId and re-rate (not done yet)**.
  Today the page just prints `error.message`. (The buyer-note hold, `BUYER_NOTE_UNACKNOWLEDGED`,
  was removed 2026-10-08 — the note is shown inline, never gates a buy.)

## 3. What else landed this pass (all verified on :3050 unless noted)

- Batches: `label_batches` (+ `label_ingestions.batch_id/page_number`), `POST/GET /api/v1/label-batches`,
  `GET /api/v1/label-batches/{id}`; `LabelBatchesDesk.tsx`, `BatchCard.tsx`, `BatchPages.tsx` (inline
  pages, Printed ×N badge, per-page History), `batch-model.ts`. Real 2-file upload proved 2 batches /
  5 labels (probe data deleted).
- `DeskRecordPlane listRail: boolean | 'open'`, `DESK_TRIAGE_LONE_LIST_CLASS` (full width),
  `DeskStageRecordHeader rail` (✕ last).
- `use-desk-press.ts` (shared press hook) with `reprintWarning` + `requestConfirm`;
  `AlertDialog` scrim/dialog animation (`cf-scrim`/`cf-dialog` in `src/app/globals.css`, off under
  reduced motion; NOT gated on `[data-motion='2']` — decide if the motion law wants that).
- Purchases → Labels desk: `src/lib/shipping/label-purchase-ingestion.ts` (keyed by ShipStation
  shipment; order purchases return `labelIngestionId`). **Void deletes the ingestion + blob + print
  log even if printed** — owner has not ruled whether printed voids should keep a tombstone.
- Stations: org registry owns names (`PUT /api/v1/print-stations/name`, DB-unique
  `ux_print_stations_org_name`); rename UI on the Print stations card + Settings.

## 4. Open items

- Buy page: lint + `tsc`, handle VOIDED / BUYER_NOTE codes, prove on :3050 with all writes
  intercepted (`page.route` the three label-buys routes; stub rates + a buy result whose
  `labelIngestionId` is a real label id so the preview renders). Screenshot: no sidebar, ✕ top-right,
  Link a product fills dims, rates → Buy → Bought card → Print (intercept print-station publishes).
  Confirm the page renders WITHOUT the contextual sidebar (it is outside `(desk)`; if the global nav
  column still shows, find how other focused pages hide it — `DesktopRouteShell` only goes chromeless
  for public paths — and ask the owner before adding a new chromeless route class).
- `searchLabelBuyProducts` returns catalog rows; confirm titles via `resolveSkuIdentityTitle` in UI.
- Reprint-warning flag audit: the confirm fires from `confirm: reprintWarning(...)`, independent of
  `reprint`; verify every desk press path passes it (LabelBatchesDesk + LabelsDocsDesk).
- §3.4 QoL list offered to the owner (not built): offline station → print here; unreadable-label
  chip; duplicate tracking across uploads; P / Shift+P; remember ticks; paste-to-upload; printed-today
  tally; CSV export; slip matching against all orders; archive old uploads; one-job bulk batch print;
  `/m/labels`.
- Carried: real two-browser station round trip unobserved; first real 4×6 thermal print (raw path
  rotates 180°); Tauri `cf_print_html`; `pinned.json` entries; `package-lock.json` vs pnpm-lock.
- Known reds NOT ours: `src/lib/auth/pin.ts`, `ContextualSidebar.tsx` (Exceptions childLevels
  refactor), `TriageRow.tsx` (untracked), `src/app/inventory/stock/page.tsx`.
- Lane gotcha: another session's `pnpm install` wedges Turbopack (`next/font/google` resolve error,
  every route 500). Fix: `systemctl --user stop cycleforge-lane@prod`, `mv .next .next-stale` (same
  filesystem — `/tmp` hits disk quota), start, wait for `/api/auth/staff-picker` JSON, delete the stale dir.
- Probes: mint a session via `/api/auth/staff-picker` → `/api/auth/signin` (tenant `usav`, staff
  Michael), check `.ok()` before `.json()`, `chromium.launch({ channel: 'chromium' })`, intercept every
  write, delete probe files from the repo root after.

## 5. Verification

`npx eslint --quiet <files>`, `npx tsc --noEmit -p tsconfig.json` (filter the four known reds only),
`node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/features/labels-docs/*.test.ts
src/features/labels-docs/upload/*.test.ts src/lib/label-batches/*.test.ts src/lib/label-buys/*.test.ts
src/lib/label-prints/*.test.ts src/lib/print/*.test.ts src/lib/shipping/label-purchase-*.test.ts
src/lib/triage/views/*.test.ts src/lib/nav/context/*.test.ts`, then `pnpm verify:fast`.

## 6. Outcome (2026-09-29)

- Buy page: lint + tsc clean. `V1RequestError` now carries `details` (the extra fields `v1Error`
  puts beside `code`/`message`). `LABEL_PURCHASE_VOIDED` → new clientEventId, rate id cleared,
  warning line, automatic re-rate. (The `BUYER_NOTE_UNACKNOWLEDGED` ack-and-resend built here was
  removed 2026-10-08 with the whole buyer-note interlock.)
- Owner ruling: **focus route**. `DesktopRouteShell` `FOCUS_ROUTE_PATHS` (`/shipping/buy-label`)
  is chromeless: no nav column, no global header, so ✕ is the top-right-most control on screen.
- Proved on :3050 (every write intercepted): Link a product → 18 / 10 / 8 / 4; rates sorted by
  price; buy #1 VOIDED → re-rated and a new id; buy #2 buyer-note dialog → ack → buy #3 with the
  same id as #2 → Bought card with real label #50 (square preview) → Print → "1 label → print
  dialog". Esc from outside a field and ✕ both → Labels; the Labels CTA → the page. Focus route: 0
  asides, page at 0,0.
- Labels rail cards show the platform NAME beside the dot + order number (`LabelCard`, the same
  resolver as the dot). 49/49 order cards on :3050 carry it. Printed was not observed (dev has 0
  prints). Some channel labels read as short codes (`WALMT`); that comes from the org catalog label.
- §3.4 QoL: owner picked none.
- Red, not ours: `src/components/outbound/orders/OrderRecordView.tsx(287)` `tracking_number`.

---

## Prompt

You are continuing the CycleForge **Labels & docs** desk and its new **Buy a label** page in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md`, then
`docs/design-system/HANDOFF-labels-docs-buy-label.md` (this file) end to end, then §6 of
`docs/design-system/HANDOFF-labels-docs-print-stations.md`.

Owner's latest ruling: buying a label must not require an order number — a focused page
(`/shipping/buy-label`, no left sidebar) buys ONE ShipStation label outright; "Link a product" fills
the box's L×W×H and weight from the product's remembered parcel; the Labels view's top-right CTA is
**Buy label** and opens that page. ✕ is always the top-right-most control.

Finish §4's first bullet: lint + typecheck the page, handle `LABEL_PURCHASE_VOIDED` (new
clientEventId, re-rate), and prove the
page on :3050 with every write intercepted (never buy a real label). Confirm there is no sidebar; if
the global nav column still shows, ask the owner before inventing a new chromeless route class. Then
present the §3.4 QoL list to the owner with one-line costs and build what they pick. Report what you
proved and what is still red; do not commit or stage without asking.
