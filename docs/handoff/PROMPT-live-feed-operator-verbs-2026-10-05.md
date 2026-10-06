# PROMPT — Live feed: act on every package from the board (2026-10-05)

You are extending the CycleForge **Live feed** (`/operations/live-feed`, `/m/live-feed`) from a board you *read* into the board you *run the floor from*. An operator must be able to see a package, understand what is wrong with it, and move it forward or out of the system **without leaving the page**, one at a time or in bulk, on a desk or a phone.

Read first, in this order: `AGENTS.md` (lane rules: `:3050` only, never start/stop a lane), `docs/handoff/HANDOFF-live-feed-triage-2026-10-04.md` (what exists, rulings, verification recipes), then `src/features/live-feed/` and `src/lib/live-feed/`. Other sessions edit this tree concurrently — re-read every file right before editing it.

## Owner rulings (binding)

1. **Everything on one screen.** The board, the package rail and the bulk bar carry every verb an operator needs. No "go to Allocate to fix it".
2. **Shipped means out.** If a package has physically left (or the channel already says `shipped`), the operator can mark it shipped from here and it leaves the board immediately — even when it was never picked or packed here.
3. **Next step, always one tap.** Every open package offers "advance to the next step" (To pick → Picked → Packed → Scanned out), single and bulk.
4. **Problems are visible and actionable.** Exception, out of stock, wrong/replaced tracking are flagged on the card face and fixable from the rail.
5. **Status adjusts and refreshes itself.** After any verb the card moves to its new column (animated), counts roll, and every other open board updates via realtime — no manual refresh.
6. Design-system placement/styling rules are waived for this board (owner); data-safety rules are NOT: `withAuth`/`requireRoutePerm`, tenancy wrapper, audits, one writer per fact, migrations as files.

## The verbs

Reuse the existing write paths below — **do not add a second writer for any fact.** Where a path is missing, build ONE domain function in `src/lib/…`, call it from one route, and test it.

| Verb | Where | Existing path (reuse) | Notes |
|---|---|---|---|
| **Advance one step** | card hover, rail header, bulk bar, phone sheet, key `N` | To pick→Picked: `POST /api/picking/desk/scan` `{type:'ORDER', orderId}` (`picking.scan`). Picked→Packed: `POST /api/packerlogs` `{shippingTrackingNumber, trackingType:'ORDERS', idempotencyKey}` (`packing.complete_order`). Packed→Scanned out: `POST /api/shipped/scan-out` `{trackingNumber, source:'desk-selection'}` (`shipping.mark_shipped`) | One client helper `advancePackage(card)` picks the call from `card.stage`. Show the verb only when the viewer holds the permission for THAT step. Bulk = same helper per card, one toast summarising moved / refused / failed. |
| **Mark shipped (it already left)** | rail, bulk bar, "Probably shipped" badge | **Missing as a route.** Promote `scripts/ship-out-stale-orders.ts` (`pack()` + `scanOutKnownShipment`) into `src/lib/outbound/ship-out-left-building.ts` → `POST /api/live-feed/ship-out` `{orderRowIds:number[], at?:'now'|'ship-by'}` (`shipping.mark_shipped`). | Writes a COMPLETED packer log + PACK_COMPLETED event/audit only when no pack exists, then the dock scan-out (origin: a new `'operator-left-building'` with its own audit source). **Never writes `orders.status`** (the channel's `shipped` must not roll back to `packed`). Stamp: now by default; `ship-by` = later of ship-by and stage entry (never before a recorded pick). Confirm dialog states how many packages and that it records a pack where none exists. |
| **Undo scan-out** | toast action (10 s) and rail while within window | `DELETE /api/shipped/scan-out` `{shipmentId}` — 120-min window, own scans only | Surface the refusal reasons (`too_old`, `not_yours`) in words. |
| **Flag a problem** | rail "Problem" menu, bulk bar, key `F` | `PUT /api/orders/[id]/flag` / `POST /api/orders/bulk-flag` (`orders.edit`, `ORDER_ROW_FLAG_IDS`) | Card face shows the flag as a pill; a "Problems" facet/count on the board. Opening an `orders_exceptions` row from a user action has **no route today** — either add one through `upsertOpenOrderException` (one writer) or link to `/exceptions?order=<id>`; decide and document. |
| **Out of stock on / off** | rail, bulk | `POST /api/orders/missing-parts` `{orderId, isOutOfStock, reason?, oos*}` (`orders.create`) | Card already paints `blocked` on To pick / Picked; clearing must refresh the card in place. |
| **Replace / correct tracking** | rail tracking row: "Replace" | `PATCH /api/orders/[id]/tracking` `{edits:[{shipmentId, shippingTrackingNumber}]}` or `{primaryTrackingNumber}` (`orders.create`), then `POST /api/shipping/track/sync-one` `{shipmentId}` for UPS/FedEx | 409 "already assigned" → say which order owns it and offer to open it. After replace, re-read the package (it may change carrier facet / stage). |
| **Add an order (lands in To pick)** | board header "+ Order" (desk), phone menu | `POST /api/orders/add` (`orders.create`, `parseOrderCreateBody`; 409 on duplicate number) | On success open the new package in the rail; it must appear in To pick in the same refresh. |
| **Assign picker / packer, ship-by, urgent, hold** | rail fields, bulk | `POST /api/orders/assign` `{orderIds, pickerId?, packerId?, shipByDate?, isUrgent?}`; hold/release `POST /api/orders/[id]/cage-release` `{action}` | Ship-by uses `DateRangePickerField variant="compact"`; staff via `StageStaffAssignPopover`. |
| **Sync carrier now** | rail tracking row | `POST /api/shipping/track/sync-one` (30/min) | Only for `ENABLED_SYNC_CARRIERS` (UPS, FedEx). USPS is not polled — say so instead of a dead button. |
| **Print label / packet** | rail + bulk (exists for labels) | `GET /api/orders/[id]/documents` + `printOutboundDocuments`; `POST /api/orders/print-packet` `{orderIds}` | |

## Make the problem obvious before anyone clicks

- **"Probably shipped" badge**: an open package whose `orders.status = 'shipped'` (channel says it left) or whose carrier shows accepted/in-transit, still on To pick / Picked / Packed. This is exactly today's backlog (USPS is never polled, so Amazon/eBay packages that left without a dock scan sit in To pick for weeks). One-tap "Mark shipped" on the badge; a header count "N probably shipped · Clear all" with confirm.
- Card pills (existing `pills.tsx`): Exception/flag, Out of stock, Tracking replaced, Probably shipped, Stalled, Late. Never more than two pills on a compact card; the rest go to the rail.
- Rail: a "Problems" section at the top when any apply, each with its fix verb inline.

## Refresh and motion

- After every write: `invalidateQueries(LIVE_FEED_QUERY_ROOT)` plus an **optimistic move** of the card to its next column (or off the board), rolled back on error. Writes already publish `publishOrderChanged` / `publishActivityLogged`, which `useLiveFeedRealtime` listens to — keep it that way so other screens update.
- Animate the move with Motion `layout` / `LayoutGroup` keyed on `orderRowId` (desk only; respect reduced motion). Counts already roll with `AnimatedStat`.
- The rail stays open on the same package after it advances (it now reads its new stage); after "Mark shipped" it closes and the toast offers Undo.

## Contracts and code shape

- One client module `src/features/live-feed/package-actions.ts`: pure planners (`planAdvance(cards)`, `planShipOut(cards)`) + thin fetch callers, unit-tested like `bulk-actions.ts`. `BulkBar.tsx` and `PackageDetail.tsx` call it; no fetch strings in components.
- Verbs a selection may take are computed from the cards (`selectionInStage` pattern): mixed stages → show only verbs valid for every selected card, or "Advance" which is per-card.
- Permissions: read the viewer's permissions once (existing auth context) and hide verbs they can't run; the server still enforces.
- New route(s): register in `src/lib/nav/route-tree.ts` only if it is a page; API routes need `pnpm audit-route-auth:emit`. Any migration → a file under the migrations dir, then `npm run tenancy:coverage && npm run tenancy:routes`.
- Keyboard (desk, outside text fields): `N` advance, `S` mark shipped, `F` flag, `O` out of stock, `T` replace tracking, `Esc` close. Document them in the rail footer.

## Acceptance (prove each on `:3050`)

1. A To pick package advances to Picked, then Packed, then Scanned out from the rail; each step moves the card, rolls the counts, and a second browser tab updates without reload.
2. Bulk-select 3 Packed + 2 To pick → "Advance" moves each one step; toast reports 5 moved.
3. "Mark shipped" on an unpacked package whose channel status is `shipped` removes it from the board; DB shows one COMPLETED packer log, one SHIP_CONFIRM, audits, and `orders.status` unchanged. Undo within the window restores it.
4. Replace tracking on a package → rail shows the new number; carrier facet updates; 409 path names the owning order.
5. Flag + out-of-stock toggles paint pills on the card immediately and clear the same way.
6. "+ Order" creates an order that opens in the rail and sits in To pick.
7. Phone (390×844, `/m/live-feed`): every verb above is reachable from the sheet and the bulk bar.
8. `pnpm test:live-feed`, `node scripts/typecheck.mjs`, eslint on touched files, `pnpm verify:fast` (report others' red separately).

## Out of scope / ask the owner first

Soft-cancel of an outbound order (none exists — hard delete only), buying labels from the board, in-person orders (Phase 2), enabling USPS polling (needs the USPS IP agreement).
