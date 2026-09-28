# HANDOFF — To ship: simpler list, Picked vocabulary, pick who/when fix, deleted-order ghost; Square card intake next (2026-09-28, late)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the state
it relies on. Other sessions edit this tree at the same time, so re-read before every edit. Dev
origin `http://localhost:3050` only (AGENTS.md §1).

Earlier handoffs this builds on:
- `docs/HANDOFF-to-ship-bulk-delete-swipe.md`: §6 and §7 (bulk delete, swipe, Undo, ghost repro, snap).
- `docs/HANDOFF-outbound-ops-e2e-order-to-scan-out.md`: order → picker → phone pick → pack → scan out.
- `docs/HANDOFF-inbound-po-intake-form.md`: inbound / purchase-order form.

## 1. Owner rules (verbatim intent, binding)

1. **To-ship membership:** every order stays on To ship, with or without a bin, picked or not,
   packed or not, until it is **scanned out**. Only the dock scan-out (`SHIP_CONFIRM`) moves an
   order to Shipped and off To ship. "No bin" is still an order and must stay in the To-ship list
   and data table.
2. **To-ship display is status-only:**
   - status filters are **Urgent · To pick · Picked · Packed · Out of stock** (owner 2026-09-28:
     "To pick" added; Urgent first, Out of stock last; every order answers to one);
   - no Ready chip (the state is now **To pick**, `TPK`, grey), no No-bin chip, no Late chip;
   - Late is still readable on each card's ship-by corner and in the "Late" section.
3. **Row facts:** qty · condition · price only, on both the cards and the Floor data table. No stock,
   no SKU / item #, no bin, and no "SKU in N orders" chip. The open record still carries all of them.
4. **Vocabulary + colour:** the WMS walk **To pick → Picked → Packed → Shipped**. An order nobody
   picked reads **To pick** (`TPK`, neutral grey); a picked, not packed order reads **Picked**
   (`PIK`, blue); packed reads **Packed** (`PKD`, purple). Picker blue, packer purple.
5. **Simpler overall.** Prefer deleting code to adding it.
6. **Order-agnostic page names (2026-09-28):** lane Inbound → **Receiving**, lane Outbound →
   **Fulfillment**, the To ship desk page → **Allocate** (`/shipping/orders`, ids and routes
   unchanged). Pill rails scroll with the plain mouse wheel, not only Shift+wheel
   (`useHorizontalWheelScroll`).

## 2. Built this session (uncommitted; lint + typecheck clean on these files)

| Change | Files |
|---|---|
| Card facts qty · condition · price (`price` tier `always`); removed stock / sku / bin facts, the SKU-batch chip and its `skuOrders` / `selectSku` plumbing, and the dead model fields `stock`, `bin`, `sku` | `src/lib/triage/views/outbound-triage.ts`, `src/components/outbound/orders/cards/OrderCard.tsx`, `OrderCardList.tsx`, `src/lib/orders/order-card-model.ts` (now exports `linePrice`) |
| Floor ledger row: qty · condition · price. `WORK_QUEUE_ROW` dropped `orders.bin` and `orders.item_number` and added `orders.amount`. The SKU span and the bin face are gone. `LedgerPrice` uses `linePrice`. `LEDGER_LOCATION_CLASS` deleted (no users) | `src/lib/views/view-specs.ts`, `src/components/outbound/orders/OutboundOrdersLedger.tsx`, `outbound-orders-ledger-geometry.ts` |
| SSR first paint matches the live row (no Bin / SKU; price) | `src/components/dashboard/OrdersQueueFirstPaint.tsx` |
| Status-only summary. `QUEUE_STATUS_CHIPS = ['outOfStock','urgent','picked','packed']`; one list drives the chips, the split-pane summary and the Floor footer line. `late` / `no-bin` keys removed (the `QueueStatusKey` type is gone; keys are `LifecycleState`) | `src/components/outbound/orders/OrderQueueSummary.tsx` (+ callers in `OrderCardList.tsx`, `OutboundOrdersLedger.tsx`) |
| New lifecycle state `picked` (code PIK, "Picked", tone **info = blue**; Packed stays fulfillment = purple, owner: picker blue, packer purple; icon `package-search` → `PackageSearch`). `orderLifecycleState` and `workStageLifecycleState` map `PICKED → picked` (was collapsed into `ready`). Added to `STATE_RANK` and `STATUS_MEANING`. Unit-status `PICKED` badge/dot (`src/lib/unit-status.ts`) reads the same blue | `packages/design-tokens/src/lifecycle.ts`, `src/lib/order-lifecycle.ts`, `src/design-system/components/record-ledger/LifecycleCode.tsx`, `outbound-orders-ledger-state.ts`, `OrderCard.tsx`, `src/lib/unit-status.ts` |
| **Pick who/when fix (root cause below).** `PICK_FACTS_LATERALS`: the scan arm now uses `ORDER_PICK_SCAN_ACTIVITY_TYPES` + `sqlStationActivityMatchesOrder` (same as `sqlOrderHasPickScan`), plus a 4th arm for a serial taken (`tech_serial_numbers`). New `PICKED_BY_SQL` / `PICKED_AT_SQL` / `PICK_FACTS_GROUP_BY` replace 6 copied COALESCE / GROUP BY lists. `sqlOrderPickedByStaffId` (`?pickedBy=`) mirrors it | `src/lib/neon/orders-queries.ts`, `src/lib/orders/order-stage-facts.ts`, `src/lib/orders/desk-view-sql.ts` |
| Deleted-order ghost fix: a deleted id stays hidden for the page's life; `commit` no longer un-hides; `restoreRecords` replaces `unhideRecords({returning})` | `src/lib/orders/deferred-order-delete.ts`, `src/design-system/components/triage-card-list/dismiss.ts`, `MorphingRowActionMenu.tsx` |
| Docs touched | `docs/design-system/HANDOFF-order-card-list.md`, `docs/design-system/BRIEF.md`, `src/design-system/tokens/desk-stage.ts` comment |

**Data written (committed):** the `order_stage_facts` who/when backfill. 90 orders (org
`…0001`) had `has_pick_scan = true` but `picked_by` NULL. They were recomputed with the new projection
(one transaction): 90 → 0 mismatched, 0 with a NULL `picked_at`.

## 3. Root causes found (evidence)

**Picked shows in the timeline but nowhere else** (owner's example `114-3096070-7490631`, id 19588).
- The pick is station scan #44244 (`PICK_SCANNED`, staff 1, 17:33). It went down the desk scan
  route's **not-found** branch (`src/app/api/picking/desk/scan/route.ts:102-128`,
  `metadata.order_found=false`), so it was written with `shipment_id` only and `order_row_id` NULL.
  The order got its shipment after the scan.
- `has_pick_scan` and the timeline matched it through the sole-shipment path, so the order read Picked.
- The who/when arm required `order_row_id = o.id`, so the Pick cell read "Not yet".
- 21 of 35 `PICK_SCANNED` rows from the last 3 days are like this (18 desk, 3 tech.scan), which is
  legitimate.
- Now both sides use one matcher. Verified: the API row for 19588 returns
  `picked_by_name: "Michael", picked_at: "2026-09-28 10:33:07"`.
- **UI not yet screenshotted** (the probe was aborted).

**"No bin" measured on the live queue** (`GET /api/orders?inWarehouse=true&listShape=queue`):
173/173 orders had it, 0 had any allocated unit, 0 had a SKU home bin, and 98 were already packed.
The chip carried no information, so it was removed. Routing No bin to Exceptions was rejected by the
owner: it would have flooded that desk with all 173 orders.
- **Implication for the ops flow:** `order_unit_allocations` is empty for the whole queue. The phone
  directed pick confirms by `allocationId`, so orders likely never reach `/m/pick`. This is
  finding #1 for `docs/HANDOFF-outbound-ops-e2e-order-to-scan-out.md`.

**Deleted order reappears** (§7 of the bulk-delete handoff). Client-side cause: `commit` un-hid the
ids and trusted the list refetch. A refetch that 500s or is slow, or the deep-link row
(`['dashboard-table','unshipped-deep-link',…]`, not in the bust prefix), repainted the deleted order.
The fix has landed; **it hasn't been re-verified on a healthy lane**.

## 4. Not done / not verified

- **Reverse gap (pre-existing, not fixed):** 4 orders have `picked_at` set (from the allocation
  or picking-session arm) but `has_pick_scan = false`, because `sqlOrderHasPickScan` counts only
  serials taken and pick scans. Those orders read Ready although someone picked them. Fix: derive
  `has_pick_scan` from the same four arms (`picked_at IS NOT NULL` on the facts row), then
  recompute the facts. Check with
  `select count(*) from order_stage_facts where not has_pick_scan and picked_at is not null`.
  The serial arm deliberately matches `tsn.order_id` only, exactly like `sqlOrderHasPickScan`;
  don't widen it to `sqlTsnMatchesOrder` alone.
1. **Browser proof (1440×900, managed tab)** for everything in §2:
   - card lines read ×qty · condition · price;
   - the Floor ledger rows (M and S zoom) have no Bin / SKU;
   - the SSR first paint matches;
   - chips are exactly OOS · Urgent · Picked · Packed (last reading: Picked 11 before the backfill);
   - 19588's card and record show **Picked · Michael**;
   - a picked-not-packed order shows **PIK Picked**.
   Earlier probe: cards had no Stock/Bin/SKU, the chips then were `Ready 61 · Picked 11 · Packed 96`,
   and the Floor first paint still showed Bin/SKU (it predated the ledger edit).
2. **To-ship membership rule (§1.1):** read the To-ship scope in `src/lib/orders/orders-list.ts` (the
   `awaitingOnly` / `excludePacked` / `sqlOrderHasShipConfirm` clauses, ~L620-700) and prove:
   no-bin orders are listed; packed orders are listed; only a ship-confirmed order leaves
   (then appears on Shipped). Report any other exit (e.g. `excludePacked` on some view) and ask
   before changing it.
3. **Deleted-order ghost:**
   - delete a test order and watch 20 s: it must stay gone, also with the order OPEN (`?order=`),
     and on the Floor;
   - check what the open record pane shows after its order is deleted.
4. **Height / padding snap at the end of add / delete animations** (§7B of the bulk-delete handoff):
   measure per rAF first, then fix. Suspects: `TriageSectionHeader` mounting instantly (its key
   includes the first card's key), the `ROW_RULE` hairline, the clip flip, and the Floor rows.
5. **Owner ask, not started: Square card intake on the new manual order form.** A phone customer
   gives a card; staff key it in and charge it through the org's Square integration. Research first:
   - the Payment step: `src/components/orders/new/*`, `IntakePaymentFields.tsx`, the phone
     `MobilePaymentStep`, and "in-person card facts";
   - the existing Square integration: invoice import `CheckoutSquareImport.tsx`, credentials in the
     integrations settings;
   - the Stripe path in the intake handoff (webhook `checkout.session.completed`, migration
     `2026-09-27b_order_payments_stripe.sql`).
   Build with the Square **Web Payments SDK** (card tokenized in the browser) → server
   `CreatePayment` with an idempotency key → record in the order payments table. Test mode uses the
   Square **sandbox** only. Ask the owner which Square location/app, and confirm sandbox credentials
   exist, before writing code.
6. The owner's ask "simplify the manual order form" is still undefined beyond card intake. Propose
   concrete cuts after reading the form, then ask.
7. `pnpm verify:fast` over the final tree. Known reds from other sessions:
   `src/lib/auth/pin.ts:159` and
   `src/components/receiving/incoming/order-composer/InboundOrderFields.tsx:100`.
8. `src/design-system/pinned.json`: add the `picked` lifecycle state and the status-only chip law
   under `MorphingRowActionMenu` / a new `OrderQueueSummary` entry. Drop the "SKU in N orders" mention.
9. Tests: `src/lib/order-lifecycle.test.ts` should assert `PICKED → picked` for both mappers (the
   uncertain edge). Run `src/lib/orders/*.test.ts` touching the pick facts (`order-grain-sql.test.ts`,
   `orders-compound-view.test.ts`, `order-fulfillment-badge.test.ts`).

## 5. Rules

- `:3050` only.
  - Lane down → `systemctl --user start cycleforge-lane@prod`.
  - A 500 burst across unrelated routes means another session's WIP: wait and re-probe, never patch
    their files.
- Browser:
  - managed tab, signed in via `/api/auth/staff-picker` + `/api/auth/signin`, header
    `x-tenant-slug: usav`, staff "Michael";
  - gate on visible state, not the fiber-key probe;
  - for animations: `page.bringToFront()` + CDP `Emulation.setFocusEmulationEnabled`.
- Floor view is a per-person preference (the last probe left it on). Switch with the Floor / In
  place buttons.
- Test data: `CF-TEST-` orders only. Clean them up plus their `work_assignments` and Test Buyer
  `customers` in one transaction with counts. None exist right now.
- `order_stage_facts` is materialized. After changing its projection, recompute the affected rows,
  generating the SQL from source:
  ```
  npx tsx --conditions=react-server --tsconfig tsconfig.json /tmp/pick-facts-sql.ts "<target predicate>"
  ```
  where the script prints `buildOrderStageFactsRefreshSql(argv[2])`. Strip the dotenv banner line,
  bind `$1`, dry-run in `BEGIN … ROLLBACK`, then commit with counts.

## Prompt

> You own the To-ship desk simplification in CycleForge. Read
> `docs/HANDOFF-to-ship-simplify-pick-facts-square.md` first, then the §2 files. Work on :3050
> only, in managed browser tabs. Other sessions edit this tree: re-read before each edit and
> touch only your lines.
>
> Binding owner rules (§1): every order stays on To ship until it is scanned out, whether or not
> it has a bin; the status filters are Out of stock · Urgent · Picked · Packed only; rows show qty ·
> condition · price only; a picked order reads Picked; simpler beats more.
>
> Do, in order, proving each in the browser + DB before the next:
> 1. §4.1: the browser proof of everything built in §2, including 19588 showing Picked · Michael.
> 2. §4.2: prove the To-ship membership rule. Only a scan-out removes an order; report any other
>    exit and ask before changing it.
> 3. §4.3: re-verify the deleted-order ghost is gone (list, open record, Floor).
> 4. §4.4: measure the end-of-animation height/padding snap, fix the root cause, and prove it.
> 5. §4.5: research Square card intake for phone customers. Report the plan and ask the owner the
>    Square account and location, and which sandbox credentials exist. Then build: Web Payments SDK
>    → server `CreatePayment` (idempotent) → order payment row, desk + phone, sandbox in test mode.
> 6. §4.6–4.9: propose the form simplifications (ask), `pinned.json`, tests, `pnpm verify:fast`,
>    docs.
>
> Report as a table: item, evidence (screenshot / DB row / ms), pass/fail, files changed.
