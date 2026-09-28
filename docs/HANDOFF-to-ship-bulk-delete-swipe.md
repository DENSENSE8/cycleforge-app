# HANDOFF — To-ship bulk delete, swipe motion, Undo toast; intake parity leftovers (2026-09-27, late)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the state it
relies on (code written this session, working tree, other sessions editing concurrently — re-read
before every edit). Dev origin `http://localhost:3050` only (AGENTS.md §1). Browser probes: a
MANAGED tab (`browser.open({ app: { relay: false } })`), never the relay.

## 1. Owner asks this session (verbatim intent)

1. Bulk-delete orders from the Outbound › Shipping **To ship** list selection bar; deleted cards leave
   the list with a motion.dev **swipe to the left** (Apple Reminders / notification dismiss), staggered,
   ease-in-out, while the list moves up.
2. **Same root motion component** for add and delete: an order that ARRIVES (live, websocket) first
   opens its gap (list moves down), then slides in from the left; a deleted order slides out left while
   its gap closes.
3. In the selection bar the **⋮ (vertical)** and **Delete** sit at the **far right** of the bulk verbs,
   and Delete is clickable with N checked.
4. **NEW, not built yet:** deleting shows an **Undo** action in a toast, bottom right.
5. Earlier in the session (done, see §3): header "+ Add" lost its Ecwid row; test-mode Fill; intake
   desk ⇄ phone parity (see `docs/HANDOFF-new-sales-order-intake.md` → "Landed 2026-09-27 (parity pass)").

## 2. Built this session for 1–3 (typecheck + eslint clean on these files; NOT yet seen in a browser)

| Piece | File | What |
|---|---|---|
| Root motion | `src/design-system/components/SwipeListItem.tsx` (new) | `SwipeListItem enter="swipe"|"none" exit="swipe"|"collapse" stagger={i}`; `LIST_SWIPE` (0.34 s, ease `[0.65,0,0.35,1]`, 0.06 s stagger, slide-in after 0.2 s of gap, gap closes half-way through slide-out). Height via `CollapseItem`; stable tree (frame → `motion.div` slide box → content) so `exit` can flip later without remounting |
| Height delay | `src/design-system/components/Collapse.tsx` | `CollapseItem exitDelay?: number` (exit height waits) |
| Delete marks | `src/design-system/components/triage-card-list/dismiss.ts` (new) | `markDismissed(ids)`, `afterDismissPaint()`, `useDismissedRecords()` — record ids a verb removed; TTL 8 s |
| Arrivals | `triage-card-list/triage-list-state.ts` `useHeldNewRecords` | returns `isArrival(key)` (render-time: live arrival in view, not first paint / new question / Load more) |
| List | `triage-card-list/TriageCardList.tsx` | every card is a `SwipeListItem` (arrive → `enter="swipe"`, marked → `exit="swipe"`, separate stagger counters) |
| Delete verb | `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx` `deleteOrder` / `delete` verb | `scope: 'both'`, label `Delete N`; deletes every `actionIds` row through `DELETE /api/orders/[id]` (Promise.all), `markDismissed(deleted)` → `afterDismissPaint()` → `bustFulfillmentCaches` + `['order-exceptions']`; summary toasts. Still `placement: 'isolated'` = second press ("Delete — press again") |
| Bar layout | `src/design-system/components/record-action-strip/RecordActionStrip.tsx` | `MoreVertical` (was `MoreHorizontal`) — affects EVERY strip; `HEADER_FACE_CLASS` now `w-full flex-1` so ⋮ + Delete sit far right |
| Server | `src/lib/neon/orders-queries.ts` `deleteOrder` | after the row delete: removes the order's `work_assignments` (entity ORDER) and `feed_memberships` rows (was handoff open item 3) |
| Header Add | `src/components/layout/GlobalHeaderAdd.tsx` | Ecwid row + `Store` icon removed (`S`, `I` only). `/orders/new?mode=ecwid` still works; update the intake handoff's "Header + Add" lines (still say S/I/E) |

## 3. Verified vs not

- Verified on :3050 earlier: desk + phone test Fill → Release → "Order CF-TEST-PH-00000N is in To ship";
  rows 19570 / 19571 `released`, REFURBISHED, $5, PICKUP; they render on `/shipping/orders`.
- **Not verified:** everything in §2 (the lane kept 500ing / full-reloading on other sessions'
  `src/features/labels-docs` + `WelcomeReplayButton` WIP). Last probe: the card checkboxes were not
  found by `li [role=checkbox], input[type=checkbox]` — find the real checkbox selector
  (`order-card` test ids / `RecordCard`) before scripting.
- **Not verified:** live arrival under "Due today" via Ably (owner: "under the Do Today grouping it
  should immediately be displayed"). Two-tab proof started, not finished.
- Test orders still in the DB (clean up LAST, or delete them via the new bulk delete as the proof):
  ids 19569 (`CF-TEST-PH-000001`, never caged — created during a dev reload, live on To ship),
  19570, 19571 + their Test Buyer `customers` rows (created this session, no other `orders.customer_id`).

## 4. Undo toast — design to build (item 4)

`toast.undo(message, { onUndo, duration })` exists (`src/lib/toast.ts:48`, sonner, 6 s). A hard DELETE
cannot be undone, so make delete **deferred**:
1. Press Delete → `markDismissed(ids)` + hide those rows client-side at once (the swipe runs), no request.
2. `toast.undo('N orders deleted', { onUndo })`, bottom-right (check the sonner `<Toaster position>`;
   set it for this toast if the app default differs).
3. Undo within the window → unmark, rows slide back IN (`SwipeListItem enter="swipe"`), nothing sent.
4. Window ends (or the page unloads — `pagehide` / `beforeunload` flush) → send the DELETEs; failures
   restore the rows and toast the reason (403 step-up / 409 `OrderDeleteBlockedError`).
Client-side hide: a small pending-delete store beside `dismiss.ts` that `OrderCardList`'s feed filters
(same place `cut.filterBands` drops held groups), so J/K and counts skip hidden rows. One source; the
floor ledger (`OutboundOrdersLedger`) uses the same verb — make it honour the same store.

## 5. Other open items from this session

- **"Quantity should not display a dot"** — owner has not said which: (a) the `·` after the count in
  "1 item · $5.00" (desk step bar, phone cart title, done screen), or (b) the round ×N count pip
  (`TRIAGE_SHELF_COUNT_PIP`, `triage-shelf-tokens.ts:59`) / TabSwitch count bubble. Ask once.
- `TabSwitch` non-compact rail pads `p-1` but faces use `SEGMENTED_CONTROL_FACE_CORNER` (control − 2px):
  2px concentricity slack in triage. Either pad `p-0.5` or accept + note.
- `DetailDock` triage branch (`useMode() === 'triage'`) — enumerate forced-triage phone sheets that
  mount a DetailDock and screenshot one; confirm `/m/pick` (industrial) unchanged.
- Create → cage gap: `useOrderTriage.save` creates rows live then cages them; a reload in between
  leaves a live, un-caged order (19569). Consider creating caged in one call (`caged: true` exists in
  `OrderRowsPlan`).

## 6. Session 2 (2026-09-28) — progress, paused for the inbound handoff

**Verified on :3050 (managed tab 1440×900; rAF needs `page.bringToFront()` +
CDP `Emulation.setFocusEmulationEnabled` or the hidden browser runs 2 fps):**
- Checkbox selector: `[data-testid=order-card-check]` (`aria-label="Select order <ref>"`).
- Bar with 2 checked: `Report out of stock · Mark urgent · Scan out · Documents … ⋮ (vertical) · Delete 2 · ×`
  — ⋮ and Delete far right, Delete enabled; second press = "Delete 2 — press again".
- Delete: leading card slides first (c0 −524 px while c1 −136 px), height closes during the
  slide, row below moves up 865→656 px. Toast "2 orders deleted · Undo" bottom-right.
- Undo: gap opens (h 0→105), then both slide in from −1210 px, ~60 ms stagger; count 39→41.
- Expiry (6 s) sends the DELETEs (19569/19570, 19573/19574 gone in DB; lane log `DELETE /api/orders/… 200`).
- Arrival: phone Release → card under "Due today" +5.26 s after the tap, 2.6 s BEFORE the phone
  confirmation (row is live at create, pre-cage); gap opens, then slide in.

**Built this session:**
- `src/lib/orders/deferred-order-delete.ts` (new) `deleteOrdersWithUndo(ids, onSettled)`: mark →
  hide → `toast.undo` (6 s) → commit on expiry / `pagehide` (`keepalive`); refused ids return
  (swipe in) + error toast; commit dismisses its toast.
- `dismiss.ts`: `hideRecords` / `restoreRecords` (was `unhideRecords({ returning })`), `useHiddenRecords`, `useReturningRecords`.
- `useOrdersQueueFeed` drops hidden ids at source (cards + floor ledger); `OrderCardList` total subtracts them.
- `TriageCardList`: returning ids swipe in; swipe-arriving cards get `enterIndex: null` (no second entrance).
- Height snap fix: `CollapseItem` sets `data-collapse-clip` while height moves; `RecordCard`
  `[[data-collapse-clip]_&]:[content-visibility:visible]` (skipped card measured as the 92 px placeholder → 116→105 snap).
- `MorphingRowActionMenu` `deleteOrder` → `deleteOrdersWithUndo`.

**Finished later in session 2:**
- Floor ledger: `Delete 2` → footer 41→39 + Undo toast; Undo → 41; expiry → both DELETEd.
  (A probe accidentally armed `Delete 41` on the ledger; Undo restored all 41, 0 DELETEs in the lane log.)
- Cleanup: CF-TEST-PH orders 19569–19576 gone; 8 Test Buyer `customers` (5418–5425) deleted in one
  transaction; 0 `work_assignments` / `feed_memberships` left. Older `CF-TEST-17895…` ids
  14060–14065 (2026-09-16) are not this work and were left.
- Quantity dot: owner picked (a). "1 item · $5.00" → step bar is two spans with a gap; the done
  screens (desk + phone) read "1 item, $5.00 · taken in …"; the phone cart title is "Cart (1 item)".
  All four seen on :3050 after the edit: desk step bar "1 item  $5.00", desk done "1 item, $5.00 ·
  taken in 0:07", phone done "1 item, $5.00 · taken in 0:11", phone cart sheet header "Cart (1 item)".
  The two Releases (19577, 19578 + customers 5426, 5427 + 2 `work_assignments`) were deleted in
  one transaction; 0 CF-TEST-PH orders / Test Buyer customers left.
- `pinned.json`: `SwipeListItem` added; `MorphingRowActionMenu` records the vertical ⋮ + deferred Delete.
  The intake handoff's header-Add lines are now S/I.
- `pnpm verify:fast` re-run over the final tree (after the quantity-dot edits): all gates green except
  Typecheck, whose only error is `src/lib/auth/pin.ts:159` (another session's uncommitted auth work).
- Not exercised: the 403 step-up / 409 failure path of a deferred commit (return + error toast).

## 7. Session 3 (2026-09-28): open bugs from the owner, in progress when paused

**A. "Deleted order reappears after I delete it" (root cause found, fix landed, NOT re-verified in a browser).**
- Evidence: the audit log shows the owner deleted `CF-ML-5LINE-SEED` (rows 13631–13635) at 07:43 and
  no `orders` row with that number was re-created, so the server delete is final. The repro on :3050
  deleted a test order: card gone at 1.8 s, **back at 13.3 s and still there at 184 s**, while the DB row
  was gone. The list refetch `GET /api/orders?inWarehouse=true&listShape=queue&limit=200` had returned
  500 (a transient 500 burst across routes while other sessions' WIP recompiled).
- Cause (client): `commit` un-hid the deleted ids after the DELETE, trusting the refetch to drop them.
  A failed or slow refetch (`bustFulfillmentCaches` never awaits), or the open record's deep-link row
  (`['dashboard-table','unshipped-deep-link',…]`, 60 s stale, not in the bust prefix, merged into the
  rows by `UnshippedTable.allRecords`), repainted the deleted order.
- Fix: a deleted id stays hidden for the life of the page (ids are never reused). `commit` no longer
  un-hides; only Undo or a refused delete calls `restoreRecords` (swipe back in). `onSettled` is now a
  plain `() => void`. Files: `deferred-order-delete.ts`, `dismiss.ts`, `MorphingRowActionMenu.tsx`.
  Lint clean; typecheck clean for these files.
- **To verify:** delete a test order (card list, not opened) and watch 20 s: it must stay gone even if
  the refetch 500s. Then the same with the order OPEN (`?order=`) and on the Floor ledger. Check what
  the open record pane shows after its order is deleted (it may still paint the stale record: close it
  on delete if so).

**B. "Padding / height adjustment on animation finish, in the list add and delete" (NOT started).**
- Measure before fixing: per `requestAnimationFrame`, record every card's and section header's top in
  the list plus the victim frame's height, padding and margins, for delete (swipe out) and add
  (Undo / live arrival). Report any one-frame jump > 0.5 px after the motion ends.
- Known so far: the ul is `display: flex` with `row-gap: normal`, so `CollapseItem`'s moved spacing is
  0/0. The victim frame collapses smoothly 104.6 → 0.4 px, then unmounts ~370 ms later. Suspects to
  measure: `TriageSectionHeader` mounting and unmounting instantly (it is not animated, and its key
  includes the first card's key, so deleting a section's first card remounts it); the `ROW_RULE`
  hairline moving to the next row; the clip flip at `onAnimationComplete`; the Floor ledger rows
  (the owner said "data table").

**Strays:** none left. Test Buyer `customers` 5428 and 5429 (from interrupted victim runs, no
orders) were deleted in one transaction; 0 `CF-TEST-PH` orders exist.

## Prompt

> You own the To-ship bulk delete + swipe motion + Undo in CycleForge. Read
> `docs/HANDOFF-to-ship-bulk-delete-swipe.md` first (state, files, what is unverified), then the
> files in its §2 table. Work on :3050 only, managed browser tabs only; other sessions edit this
> tree (labels-docs, NavFind, order record) — re-read before each edit, touch only your lines, and if
> the lane 500s on someone else's WIP, wait and re-probe rather than patching their files.
>
> Do, in order:
> 1. **Prove §2 in a browser** at 1440×900 on `/shipping/orders`: check 2+ cards (find the real
>    checkbox selector), the bar shows ⋮ (vertical) then `Delete N` as the far-right verbs, Delete is
>    enabled; sample `getComputedStyle(card).transform` every ~30 ms during a delete to show the
>    left slide + stagger + gap close. Use the test orders in §3 as the victims.
> 2. **Undo** per §4: deferred delete with `toast.undo` bottom-right; Undo slides the rows back in;
>    expiry / pagehide sends the DELETEs; failures restore + explain. Same behaviour from the floor
>    ledger's Delete.
> 3. **Arrival**: two tabs — `/shipping/orders` scrolled to top, and `/m/orders/new?test=1` → Fill →
>    Release; the new order must appear in "Due today" within ~2 s, opening its gap then sliding in
>    from the left. Report the ms. If scrolled away it is held behind "N new orders" (existing rule —
>    ask before changing it).
> 4. Ask the owner the "quantity dot" question (§5) and fix the one they name.
> 5. Clean up every `CF-TEST-…` order this work created or used, their `work_assignments`, and the
>    Test Buyer `customers` rows (one transaction, counts printed).
>
> Rules: one motion component (`SwipeListItem`) for arrive and leave — never a second slide; motion
> respects reduced motion via the app's MotionConfig; `pnpm verify:fast` before done (attribute other
> sessions' reds by file); update `src/design-system/pinned.json` (add `SwipeListItem`; note ⋮ is
> vertical in `RecordActionStrip`) and the intake handoff's header-Add lines.
