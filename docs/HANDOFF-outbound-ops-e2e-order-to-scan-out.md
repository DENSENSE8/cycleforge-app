# HANDOFF: Outbound operations end to end: order in → picker → phone pick → pack → scan out (2026-09-28)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the state it
relies on. Other sessions edit this tree at the same time (inbound form, labels-docs, auth PIN,
mobile daily tasks), so re-read before every edit.

Related handoffs (read what you need, not all of them):
- `docs/HANDOFF-new-sales-order-intake.md`: the order form (desk `/orders/new`, phone
  `/m/orders/new`), Test mode + Fill, Square/Ecwid import, the Team step.
- `docs/HANDOFF-to-ship-bulk-delete-swipe.md` §7: two open To-ship bugs (deleted order reappearing,
  a height snap at the end of list animations) that another session may be finishing. Don't overlap.

## 1. Owner ask (verbatim intent)

"Continue the overall throughput and operations." One order must travel the whole warehouse
flow, driven by the owner on the phone:
1. **In:** create a test order, or import one (Square invoice / Ecwid), on the order form, and
   **select a picker** (and packer) in the Team step.
2. **Pick list:** the order appears on **that picker's pick list on mobile**.
3. **Mobile operations, end to end:** pick → (tote) → pack → **scan out**. The order leaves the
   warehouse, off To ship and on Shipped.

Every step must be completable on the phone (mobile-first law, `docs/mobile-first/SURFACE_LAW.md`;
start URLs `/m/pick`, `/m/work`).

## 2. What exists (facts checked 2026-09-28; verify each before relying on it)

**Order in: the Team step already assigns people.**
- Desk: `src/components/orders/new/CheckoutAssignments.tsx` (per-line picker → packer chips,
  "Everyone" row, `StageStaffAssignPopover`; picker lane role = `technician`).
- Phone: `src/components/mobile/orders/new/MobileTeamStep.tsx` (Pick / Pack rows per line, staff sheet
  from `@/lib/staffCache`).
- Defaults + save: `src/components/orders/useRuleAssignments.ts`.
  - `useRuleAssignments(lines, channel)` fetches rule defaults and keeps manual choices.
  - `commitAssignments(lines, orderIds, byKey)` POSTs `/api/orders/assign` per group after the order
    rows are saved.
- Order create: `src/lib/orders/create-order.ts` inserts the rows plus a `work_assignments` row
  (`work_type 'TEST'`, `assigned_tech_id NULL`, `status 'OPEN'`, deadline = ship-by). The picker comes
  later, through `/api/orders/assign` (`src/app/api/orders/assign/route.ts`).
- Assignment reads: `src/lib/orders/desk-view-sql.ts` (`sqlOrderAssignedToStaff`,
  `sqlOrderPickAssigneeId` = latest live ORDER/PICK `assigned_tech_id`, `sqlOrderPackAssigneeId`).
- Test Fill (`testOrderFill`, `src/lib/orders/intake/intake-model.ts`) picks a real catalog product
  (qty 1, $5, REFURBISHED), ship-by today, **Pickup**. Saves as `CF-TEST-<n>`.
  - Verified: release → To ship live in ~5 s.
  - **Unknown:** what Fill leaves in Team (rule default vs empty). Check it.

**Phone pick list: one screen, my list (rebuilt 2026-09-28).**
- `/m/pick` (`src/app/m/(shell)/pick/page.tsx`) → `PickScreen`
  (`src/components/mobile/picker/PickScreen.tsx`): the desk's status chips (`QueueStatusChips` +
  `src/lib/orders/to-ship-queue.ts`, counts equal `/shipping/orders`), my list, one sticky
  **Start picking · N** CTA. No Take / Pass / scope tabs / mode tabs.
- My list (`src/lib/picking/pick-walk.ts`): orders whose live PICK assignee (`picker_id` on the
  `/api/orders` rows = the latest ORDER/PICK `work_assignments` row) is me, first; then unowned;
  another picker's orders never. Owners come from pick history (`sku_staff_pairings` →
  `src/lib/picking/sku-pick-owners.ts` → PICK assignments).
- Start picking / a tapped card → `?order=<id>` → `PickOrderScreen` / `usePickOrder`: the desk scan
  flow (`src/lib/picking/desk-scan-client.ts`, `/api/picking/desk/*`). The first serial / SKU scan
  anchors the pick on the ORDER (`scanDeskOrder`, `type: 'ORDER'`), so a Pickup order (no tracking)
  picks the same way as a labelled one; once the order is in hand the walk advances; Skip moves on
  without a write. No allocation needed.
- The directed allocation-fed stack (`POST /api/v1/picking/next`, `release`, `sessions/[id]/tote`,
  `sessions/[id]/notes`, `DirectedPickScreen`, `directed-feed.ts`) is deleted.
- Other routes: `/m/pick/[orderId]` (`_picker/useMobilePicker.ts`, `PickerTaskCard`,
  `ShortPickSheet`), `/m/id/pick/[orderId]`; `/m/work` = "assigned orders"
  (`RedesignedMobileAssignedOrders`).

**Pack.**
- Phone: `/m/pack`, `/m/pack/start/[orderId]`.
- Desk: `/pack`, `/packer`.
- APIs: `POST /api/pack/ship`, `/api/packerlogs/*`.
- The packer comes from the Team step (`assigned_packer_id`).

**Scan out.**
- Desk: `/shipping/scan-out`. Phone: `/m/id/scan-out/[orderId]`, `/m/scan`.
- API `POST /api/shipped/scan-out` (DELETE = undo).
- A dock handoff is accepted only when the shipment has a completed `packer_logs` row with
  `tracking_type = 'ORDERS'`; deleting the final completed ORDERS pack removes its stale
  `SHIP_CONFIRM`.
- The Shipped desk dates and orders rows by `SHIP_CONFIRM.created_at`, not the older PACK row.
  Scanned-out ORDERS labels remain visible when no `orders` row owns the shipment; those
  unfound/unmatched packages are reconciliation records, not rows to discard.
- Bulk backlog clears use the already selected shipment id. They must not re-resolve the stored
  tracking text: legacy routed/GS1 values can canonicalize to a different registry row.
- Release gates: a **pickup** skips the tracking gates (G1/G3), per the intake handoff. A shipped
  order needs tracking and a label first (labels-docs lane).
- Decide with the owner which one the E2E proves (§4). Test Fill defaults to Pickup.

**Realtime.** Order writes publish Ably `order.changed` (`publishOrderChanged` /
`invalidateOrderViews`, `src/lib/orders/invalidation.ts`). Phone surfaces must refresh from it,
not from a reload. Measure it at every hop.

## 3. Rules

- Dev origin `http://localhost:3050` only; lane unit `cycleforge-lane@prod`.
  - `:3050` dead → `systemctl --user start cycleforge-lane@prod`. Never bind another port.
  - A 500 burst across unrelated routes means another session's WIP is recompiling: wait and
    re-probe. Read `journalctl --user -u cycleforge-lane@prod` to name the file. Never patch theirs.
- Browser: MANAGED tabs only, `browser.open({ app: { relay: false } })`.
  - Sign in: `/api/auth/staff-picker` + `/api/auth/signin`, header `x-tenant-slug: usav`.
  - Staff: "Michael" for the desk. **For the picker, sign in AS the picker you assigned** (a second
    tab or context at 390×844) so `/m/pick` shows that person's list.
- Hydration: the fiber-key probe is unreliable here. Gate on a visible state change: a button
  enabled, a text change.
- Animations in the hidden browser need `page.bringToFront()` + CDP
  `Emulation.setFocusEmulationEnabled`, or rAF runs at 2 fps.
- Evidence per hop: the screen (screenshot), the DB row (`orders.status`, `work_assignments`,
  allocations, `packer_logs`, shipped/scan-out rows) and the ms from the previous hop.
- Test data: `CF-TEST-` orders only. Clean up everything at the end in ONE transaction with
  counts: orders, `work_assignments`, allocations, pick sessions/totes, `packer_logs`, scan-out rows,
  and the Test Buyer `customers` rows.
- One writer per fact: reuse the existing routes (`/api/orders/assign`, `/api/v1/picking/*`,
  `/api/pack/ship`, `/api/shipped/scan-out`). Never add a second path for the same write.
- `pnpm verify:fast` before calling it done; attribute other sessions' reds by file. Known reds:
  `src/lib/auth/pin.ts:159` and
  `src/components/receiving/incoming/order-composer/InboundOrderFields.tsx:100`.

## 4. Prompt

> You own the outbound operations flow end to end in CycleForge: an order goes in with a picker
> chosen, shows up on that picker's phone pick list, and is picked, packed and scanned out of the
> warehouse. Read `docs/HANDOFF-outbound-ops-e2e-order-to-scan-out.md` first, then the §2 files.
> Work on :3050 only, in managed browser tabs. Other sessions edit this tree: re-read before each
> edit and touch only your lines.
>
> Do, in order, proving each hop in the browser + DB before the next:
> 1. **Map the gates (read-only, report before building).** For one order, list every condition
>    that decides whether it appears on `/m/pick` for picker P, can be packed, and can be scanned
>    out. Include assignment, allocation, release/cage state, status, stage and tracking/pickup,
>    each with file:line. Say which conditions a Filled test order already meets and which it
>    doesn't.
> 2. **Order in with a picker.** Phone `/m/orders/new?test=1`: Fill, set **Pick = P** and
>    **Pack = K** in Team, Release. Then Square import (test mode) with a picker. Prove
>    `work_assignments` has P (and K) and the desk To-ship card shows them. If Team is empty after
>    Fill, fix the default so Fill leaves a picker.
> 3. **Appears on P's pick list.** A second phone tab signed in as P on `/m/pick` (and `/m/work`):
>    the order must appear without a reload. Report the ms from Release. If it doesn't appear, fix
>    the real gate found in step 1 (e.g. allocation at create), not a test-only bypass.
> 4. **Pick.** As P: scan or confirm the bin, the unit and the tote; finish; release. Prove the
>    status, allocation and pick-session rows.
> 5. **Pack.** As K on `/m/pack`: the order is there, pack it, and prove the `packer_logs` row.
> 6. **Scan out.** Phone scan-out (`/m/id/scan-out/[orderId]` or `/m/scan`): the order leaves To
>    ship and lands on Shipped, live on a desk tab. Use Pickup (handover) unless the owner wants the
>    shipped-with-label path. Ask once, up front, together with step 1's report.
> 7. **Report** a table, one row per hop: surface, what the operator did, ms from the previous hop,
>    DB proof, screenshot, pass/fail. List every fix you made with its file.
> 8. **Clean up** every `CF-TEST-…` row this run created, and all its children, in one transaction.
>    Print counts.
>
> Ask the owner only these, batched in one message after step 1:
> - Pickup or shipped-with-label for the scan-out proof?
> - Which staff are P and K?
>
> Everything else: decide conservatively and say what you chose.
