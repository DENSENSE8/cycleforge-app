# HANDOFF — Warehouse ops ROI, one feature at a time (written 2026-09-29)

Paste ONE feature's **Prompt** block into a fresh session. Build it, prove it, stop. The owner
tests it with the **Owner test** steps before the next feature starts. Never batch features.

The evidence lines below come from a code read (2026-09-29), not from running anything. The
session MUST re-read every cited line before editing; the tree moves under other sessions.

## Rules for every feature

- Dev origin `http://localhost:3050` only (AGENTS.md §1). Lane down → `systemctl --user restart
  cycleforge-lane@prod`. A tab stuck on skeletons with `_17-8j4_._.js` 404s is the lane's stale
  build: restart the lane, reload, re-sign-in (staff-picker + `/api/auth/signin`, `x-tenant-slug: usav`).
- **The `.env` database is PRODUCTION.** Prove writes only on `CF-TEST-` fixtures you create; clean
  them up in one transaction and report the counts. `ops_events` is append-only (a DELETE is
  refused) — never work around that guard; re-arm fixtures by changing their data instead.
- Other sessions edit this tree: re-read before each edit, touch only your lines, never commit.
- One writer per fact. Fix the shared server route or SQL predicate, never one UI caller. Clean
  cutover: delete the path you replace in the same change.
- Tests: one regression test per feature that fails before and passes after, on the pure function
  or route (`node --import tsx --import ./scripts/register-server-only-shim.cjs --test <file>`).
  Never pin SQL text or source strings.
- Done = the feature's acceptance is observed in the browser on :3050 + its test green +
  `pnpm verify:fast` green on your files (report other sessions' red files by path, don't fix them).
- Report as a table: acceptance item → evidence (screenshot / test / API response) → files changed.

## Order

| # | Feature | Why first | Size |
|---|---|---|---|
| F1 | Short pick never recreates phantom stock | oversell source | S |
| F2 | Scan-out refuses unready orders | last gate before a wrong box ships | S |
| F3 | Live pack writes SOLD + item/order match | on-hand drift, mis-packs | M |
| F4 | Exception cage enforced at allocate / pick / pack | unpaired SKUs ship | S |
| F5 | CSV import keeps every line of an order | silent lost items | S |
| F6 | Start a return from the original order | 4 return writers → 1, no retyping | M |
| F7 | Return receive = serial → grade → bin, one flow | returns land nowhere | M |
| F8 | One-screen manual order form, one transaction | intake speed | L |
| F9 | Duplicate / reorder from an order | intake speed | S |
| F10 | Mobile pack in 2 steps; short-last-task tote bug | floor friction | S |
| F11 | Label bought at pack; tracking scanned once before scan-out | floor friction | L |
| F12 | Batch pick by bin walk | throughput (only after F1–F4) | L |

---

## F1 — Short pick never recreates phantom stock

**Evidence:** `pick.short` returns the unit to `STOCKED` for every reason and RELEASES the
allocation with `SHORT_PICK_<reason>` (`src/lib/picking/sessions.ts:741-783`); reason sheet
`ShortPickSheet.tsx:53-75`. No re-allocation, no OOS flag.

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F1). In `src/lib/picking/sessions.ts` short-pick
> handling: a unit shorted as "not found / missing" must NOT return to `STOCKED`. Move it to the
> existing missing/held state the unit model already has (find it — do not invent a status), put
> its bin into the count queue through the existing cycle-count / drift-alert writer, and try to
> allocate the next eligible unit through `autoAllocate` (`src/lib/allocation/auto-allocate.ts`);
> if none, flag the order out of stock through the existing OOS write. Other reasons (damaged,
> wrong item) follow the same rule with their own state if one exists. Regression test on the
> short-pick function. Prove on a `CF-TEST-` order + unit you create.

**Owner test**
1. On `/m/pick`, open a CF-TEST order and short its unit as "not found".
2. The unit no longer shows as available in stock; the bin shows up for counting.
3. The order either picked up another unit (new bin on the pick list) or shows Out of stock in
   Exceptions › FBM.

---

## F2 — Scan-out refuses unready orders

**Packed gate landed 2026-09-30.** `scanOutLabel` now fails closed with
`blockReason='not_packed'` unless the shipment has a completed `ORDERS` `packer_logs` row; the
read-only identification face uses the same decision. `reversePack` removes `SHIP_CONFIRM` when it
removes the final completed pack. Migration
`2026-09-30_ship_confirm_requires_completed_pack.sql` deletes historical violations and installs
deferred database triggers on both tables, so direct writes and later un-packs cannot split the
facts. Live cleanup removed 793 invalid `SHIP_CONFIRM` rows; 0 remained.

**Still open in F2:** cage (`release_state`) gate, plus verification
of the legacy `mirrorAllocations({ packerLogId: activityId })` identifier.

**Owner test**
1. Scan out a CF-TEST order that was never packed → refused, says "Not packed".
2. Pack it, scan out again → confirmed.

The buyer-note gate was dropped 2026-10-08 (operator ruling: packers are never interrupted; the
note shows inline on the record).

---

## F3 — Live pack writes SOLD and checks the item against the order

**Evidence:** the SOLD ledger decrement lives only in `/api/pack/ship`
(`src/app/api/pack/ship/route.ts:240-257`), which has no UI caller; the item/order mismatch guard
too (`:125-146`). Live pack is `/api/packing-logs` (`route.ts:563-688`). Desk SKU pick writes −N
`PICKED` (`src/app/api/picking/desk/sku/route.ts:242-248`). [Inferred: live flow never writes SOLD.]

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F3). First PROVE the inference: trace every writer of
> `sku_stock_ledger` / unit status on the live pick → pack → scan-out path and state exactly when
> stock leaves on-hand today. Then make ONE point the sale (pack or scan-out — pick the one the
> ledger model intends, cite why), move the SOLD write and the item-vs-order mismatch guard into
> the live route, and delete `/api/pack/ship` and `/api/picking/units/scan` (clean cutover; check
> the route-permission manifest). No double decrement with the desk SKU pick's −N. Regression test.

**Owner test**
1. Note a CF-TEST SKU's on-hand. Pick, pack, scan out one unit.
2. On-hand dropped by exactly 1, once.
3. Packing with the wrong item scanned is refused with the expected SKU shown.

---

## F4 — Exception cage enforced at allocate / pick / pack

**Evidence:** auto-cage sets `release_state='caged'` (`src/lib/orders/auto-cage.ts:27-45`); no
picking / packing-logs / scan-out route checks it; allocation reserves for caged orders
(`auto-allocate.ts:49-67`). Allocate route gated by a view permission (`allocate/route.ts:44`).

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F4). One predicate for "may move on the floor" (use the
> existing release-gates / `liveWorkingSetSql` — no second definition). Allocation skips caged
> orders; desk + mobile pick and pack refuse them with a machine code and a link to the order's
> exception. Fix the allocate route's permission to a write permission that already exists.
> Regression test.

**Owner test**
1. A CF-TEST order with an unpaired SKU shows in Exceptions › Missing pairs.
2. Scanning it at `/pick` or `/pack` is refused and links to the exception.
3. Pair the SKU → the order allocates and picks normally.

---

## F5 — CSV import keeps every line of an order

**Evidence:** `/api/orders/import-csv` dedupes rows by order number, first row wins
(`src/app/api/orders/import-csv/route.ts:90-98`); `saleAmount: null` (`:131`).

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F5). Group CSV rows by order number into ONE order with
> N lines through the same writer (`ingestCanonicalOrders`). Fill a missing price / title from the
> catalog (`sku_catalog`, `resolveSkuIdentityTitle`). Regression test with a 3-line order.

**Owner test**
1. Upload a CSV with one CF-TEST order number on three rows (three SKUs).
2. One order appears with three lines and catalog titles/prices. Delete the fixture after.

---

## F6 — Start a return from the original order

**Evidence:** four return writers (`processReturnsIntake` `src/lib/inventory/returns.ts`, RMA
`src/lib/rma/authorizations.ts:142`, disposition `:303-449`, inbound RETURN
`src/app/api/receiving/inbound/orders/route.ts:73-96`). Inbound RETURN retypes platform / order #
/ item / listing URL (`src/lib/inbound/inbound-order-draft.ts:252-279`); RMA "Order #" sends the
internal row id (`src/app/warehouse/rma/page.tsx:322`). No "Start return" on the order record.

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F6). Add "Start return" on the order record (desk
> Allocate/Shipped record and `/m/*`) and one lookup box that accepts order number, tracking or
> serial. It opens the inbound RETURN draft PRE-FILLED from the shipped order (customer, platform,
> order #, line, listing URL from the item number) through the existing `InboundOrderDraft` →
> `ingestInboundOrder` writer; the operator picks the line(s) and a reason only. Link the RMA to the
> real order (not the row id). Decide the one return writer and list the ones to retire (retire in
> F7). Regression test on the draft-from-order builder.

**Owner test**
1. Open a shipped CF-TEST order → "Start return" → only reason is asked → saved.
2. The return appears in Deliveries with the original order's platform, number and item.
3. Typing the order's tracking number in the lookup finds the same order.

---

## F7 — Return receive: serial → grade → bin, one flow

**Evidence:** `/inventory/returns` records no staff (`page.tsx:80-87`), sets no bin/grade;
disposition never links `rma_id`, bin only via an empty placement policy, grade never written
(`src/lib/rma/authorizations.ts:380-449`). No `/m/*` return page.

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F7). One receive flow for a return (desk + `/m/return`):
> scan serial (or the F6 return) → pick grade → scan bin → unit STOCKED at that location with the
> +1 ledger row, the grade written, the staff recorded, the RMA/return advanced. Reuse the existing
> ledger / grade / bin writers. Retire the writers F6 listed (clean cutover, callers migrated).
> Regression test.

**Owner test**
1. On a phone, `/m/return`: scan the CF-TEST unit, choose a grade, scan a bin.
2. Inventory shows the unit in that bin with that grade; the return shows received by you.

---

## F8 — One-screen manual order form, one transaction

**Evidence:** `/orders/new` is 6 steps (`src/components/orders/new/NewSalesOrderCheckout.tsx:6`);
~4 round trips (`src/hooks/orders/useSalesOrderCheckout.ts:478-499`); duplicate inline form
`?triage=new` (`src/components/outbound/orders/intake/OrderIntakeForm.tsx`); four customer
searches (`/api/customers/search`, `/api/repair/customers`, `/api/walk-in/customers`, counter
phone match).

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F8). Run `new-ui-surface` and `ds_contract` first. One
> screen: Customer (phone/email lookup → address fills), Items (scan/search SKU → title, price,
> condition, bin from the catalog; enter qty), Ship (defaults by channel), Team + Payment folded
> with defaults; auto order number for manual channels. Save + assign + release in ONE server
> transaction through `createOrder`. Delete the `?triage=new` inline form and fold the customer
> searches into one endpoint. Desk and `/m/orders/new` share it. Test the transaction's
> all-or-nothing behavior.

**Owner test**
1. Create a CF-TEST phone order start to finish: time it, count clicks.
2. It lands in Allocate released, assigned, with catalog titles. Delete after.

---

## F9 — Duplicate / reorder from an order

**Evidence:** no clone action; `?prefill=` exists (`src/lib/orders/manual-order-draft.ts:254-255`).

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F9). "Duplicate order" on the order record builds a draft
> from the order (customer, address, lines) and opens the F8 form through `?prefill=`. New order
> number, no tracking, no stamps copied. Test the draft builder.

**Owner test**
1. On a CF-TEST order → Duplicate → form opens filled → save → a second order exists.

---

## F10 — Mobile pack in 2 steps; short-last-task tote bug

**Evidence:** mobile pack = tote scan → start hub → Take photos → photos → update
(`MobilePackingList.tsx:30`, `src/app/m/(shell)/pack/start/[orderId]/page.tsx:46-57`). A shorted
last task never calls `completeSession`, tote never STAGED (`useMobilePicker.ts:142,202-217`).

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F10). Tote scan lands directly on photos (draft created on
> scan); last photo / Done completes the pack. Fix completion to run when the last OPEN task is
> resolved by pick OR short. Test the completion rule.

**Owner test**
1. `/m/pack`: scan a CF-TEST tote → camera is open → photos → Done → packed.
2. Short the last item on a pick → the tote still reaches Staged.

---

## F11 — Label at pack; the tracking label is not the pick key

**Evidence:** desk pick, pack and scan-out all key on the tracking label
(`desk/scan/route.ts:43-56`, `PackScanColumn.tsx:297`, `scan-out/route.ts:61-63`), so a label must
exist before pick.

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F11). Desk pick keys on order / tote (the mobile model);
> the pack scan buys (or links) the label and prints label + packet in one step through the
> existing purchase route; scan-out stays the manifest check. Unify the two pick ledgers (desk
> PICK_SCANNED vs mobile allocation) on one writer. Owner decision needed first on which pick model
> wins — ask once, then build.

**Owner test**
1. Pick a CF-TEST order with no label → pack → label + packet print → scan out.

---

## F12 — Batch pick by bin walk

**Prompt**
> Read `docs/HANDOFF-ops-roi.md` (Rules + F12). Only after F1–F4 are signed off. A pick session
> holds N orders, walked in bin `sort_order` (`sessions.ts:213-215`), each unit into its order's
> tote. Design options first (cart vs tote-per-order), owner picks, then build.

**Owner test**
1. Start a batch of three CF-TEST orders → one walk → three totes staged correctly.
