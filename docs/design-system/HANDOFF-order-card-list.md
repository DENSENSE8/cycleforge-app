# Handoff — To-ship order card list (QoL round + phased design upgrade)

Lane: `prod` worktree, dev origin `http://localhost:3050` only (AGENTS.md §1). Dogfood mode:
fast iteration, but nothing from this work is committed yet — see "Commit" below.
Scope: the order management list ONLY. Do not screenshot or edit the contextual left
sidebar (another session owns it). Clip screenshots to `main`.

Owner works **phase by phase** (2026-09-27): one change set at a time, each verified in the real
browser before the next starts. The phase list is at the bottom.

## What exists (typechecks, lint clean, `pnpm verify:fast` all green 2026-09-27)

To ship (`/shipping/orders`) In place + Split render **order cards** instead of the DataTable;
Floor (Ctrl/⌘+Shift+F) keeps the industrial ledger. BRIEF §13 records the owner rulings.

| File | Role |
|---|---|
| `src/components/outbound/orders/cards/OrderCardList.tsx` | list: feed, `arrangeGroups` (chips · held orders · SLA sections), pager/scroll, find, peek, SKU batch, held new orders, record plane; card body → `openCard` |
| `src/components/outbound/orders/cards/OrderCard.tsx` | one card: status rail, check (18 px hit box = the visible square), status icon, lines, expand, Space quick look, "SKU in N orders" chip, single-check action drop-down; body = `onOpen` |
| `src/components/outbound/orders/cards/OrderCardSelectBar.tsx` | top bar: select-all · `BarFind` (sidebar closed) · status chips / bulk verbs · Find button (sidebar open) · pager · per-page · sort · Floor · order count (far right) |
| `src/components/outbound/orders/cards/order-card-list-state.ts` | URL state (`?cardStatus=`, `?page=`) via History API, page mode pref (+ `resolved`), kept scroll, held new orders, `[` `]` Home End |
| `src/components/outbound/orders/cards/OrderCardPeek.tsx`, `OrderCardActionMenu.tsx` | quick look; one-card verbs |
| `src/lib/orders/order-card-model.ts` | pure card facts; `orderSla`, `ORDER_SLA_SECTIONS` |
| `src/components/outbound/orders/OrderQueueSummary.tsx` | `queueRowStatusKeys`, `OrderQueueSummaryChips` (count ORDERS, filter, Reset + Esc) |
| `src/components/dashboard/orders-queue/useOrdersQueueFeed.ts` | `arrangeGroups(groups, sort)` option (replaced `groupFilter`) → `orderGroupsByDate` arranged (cursor walks it), `allOrderGroupsByDate` raw |
| `src/components/dashboard/orders-queue/useOrdersQueuePlane.ts` | select-mode `rows` = flattened `orderGroupsByDate` (screen order for Shift-range / select-all); open-record lookups keep the full list |
| `src/lib/nav/sidebar-column-store.ts` + `src/components/layout/DesktopRouteShell.tsx` | **new** — the shell publishes `columnOpen`; `useSidebarColumnOpen()` reads it. **Shell file is shared** (see Commit) |
| `src/lib/dashboard-table-data.ts` | bounded queue fetch reads 200-row chunks along the server keyset cursor |
| `src/lib/orders/orders-list.ts` + `src/types/orders.ts` | `sku_stock_on_hand` on /api/orders rows |
| `src/lib/routing/outbound-routes.ts` | declared `cardStatus`, `page` params (hygiene keeps both — checked) |
| `src/app/shipping/layout.tsx` | removed `hidden md:flex` (owner asked for responsive; confirm phones vs `/m/*`) |
| `src/design-system/tokens/desk-stage.ts`, `DeskPageChrome.tsx` | removed stage `rounded-b-xl` and `pb-4` floor padding (every desk page) |
| motion | rules abolished: `motion/react` importable anywhere, `@/design-system/motion` = `export *` |

## Fixed this session (browser-verified on `:3050`)

- **Chip / page URL race.** `router.replace` on this route is a soft navigation that waits for an
  RSC round-trip before the URL moves; quick presses superseded each other and the URL lagged one
  press behind (the smoke's "chip does not reach the URL"). `write` now uses the repo idiom:
  `readLiveSearchParams` + `window.history.replaceState`. Probe: 6/6 rapid on/off toggles land.
- **`?page=2` lost on reload.** The page clamp ran against the SSR default page size (100) before
  the remembered size (20) was read, saw one page, and stripped `?page=`. Clamp now waits for
  `useCardListPageMode().resolved`. Probe: `]` → `?page=2` → reload → `21–38 of 38`; Home clears.
- **Ship-by sections interleaved** (9 headers: No ship-by / Late / No ship-by …, one mount). The
  feed bands by DAY and no-ship-by orders band by created day. `arrangeGroups` re-bands by SLA
  tone (Late · Due today · Tomorrow · Later · No ship-by) — pages, J/K, Shift-range follow it.
  Section counts are the whole cut. Urgent pins fold into their tone section (feed order kept).
- **Esc with a chip active reset the chips instead of closing the open record** (the list's
  Esc-reset listener mounts before the record's). It now steps aside while a record is open.
  Not re-run after the fix — owner is testing.
- **Card body click checked cards** while a check-set was live (Polaris select-mode law) — and on a
  multi-line order it checked only the lead line, so the card showed the mixed dash instead of the
  white ✓ (owner's "missing checkmark"). Owner ruling: the card body always opens the record; only
  the checkbox checks. Cards only — `queueRowClickIntent` (Floor ledger + group rows) unchanged.
- **J "walked null"** was a smoke artifact: To-ship opens records via `dispatchOpenShippedDetails`,
  not `?openOrderId` (deep-link only). The smoke now reads the record title + `n of N`.
- **Smoke `body` click** → focus a card / `main` instead.

Also verified: exact order number opens (`5043` → `Order 5043 [1 of 1]`), Space quick look
open/close, SKU chip checks the batch, F → sidebar Find, Esc resets chips, scroll mode (36 cards,
no pager), pasted `?cardStatus=outOfStock,late&page=2` cold-loads with both chips pressed.

## Still open

- **Hydration error on reload** (every run): server renders the desk title "Shipping", client
  "To ship". `useNavContext` seeds `initialData` from a localStorage snapshot keyed on the full
  path (search included), which the server cannot see. Sidebar session's file
  (`src/components/sidebar/contextual/useNavContext.ts`) — not touched here.
- **J/K steps per LINE**: a 4-line order (CF-ML-5LINE-SEED) takes 4 presses on one card.
- **One order, two cards**: CF-ML-5LINE-SEED renders as "Seed Socks" + "Seed Gloves +2 items"
  (the feed's urgent band splits an order's lines). Checking one card leaves its twin unchecked.
- **Held "N new orders" pill** — never exercised (needs a realtime insert while scrolled).
- **Kept scroll** restored 620 for a 700 set (likely max scroll at that moment) — unconfirmed.
- Pager counts LINES, not cards. Search is unbounded (needs `hasMore` through
  `dashboard-cache-patch.ts`).

## Acceptance (QoL round)

- [x] `?cardStatus=…&page=2` survives reload and a pasted link; chips reflect it.
- [x] J/K follow the screen order (sections); chip-filtered walk: order list matched, no strays.
- [x] F → sidebar Find; sidebar closed → the bar's Find (Phase 1).
- [x] Exact order number opens; Space quick look; SKU chip checks the batch.
- [ ] Scroll place restores (620/700, see above); held-orders pill (unexercised).
- [ ] No page errors — only the sidebar-owned hydration mismatch remains.
- [x] `pnpm verify:fast` green.

## Phases (owner 2026-09-27) — one at a time, verify in the browser

1. **DONE — Find in the bar, count far right, sort-only menu.**
   - Sidebar open: no Find in the bar at all — the sidebar owns Find and F.
   - Sidebar closed: a narrow (`w-36`) `Find orders` field (🔍 · `F` · text) slides out of the
     checkbox, and the status pills glide right to make room; reopening slides it back and the
     pills glide left. One eased 0.45 s tween (`FIND_SLIDE`) — slow enough to notice. F focuses
     it (claimed in capture — the closed column keeps the sidebar's Find mounted).
   - Order count at the far right. Chips take the leftover width (`@3xl:basis-0`) so the bar
     stays one row. ⇅ on the cards bar drops the Platform / Carrier pins (sort only); Floor's
     menu is unchanged.
   - Motion / width / no-button changes: not browser-run (owner testing).
2. Record header: **Back** top-left, no ✕ top-right, no product title in the order-number row.
   `DeskStageRecordHeader` is shared by every desk record (Repair, RecordLedger, settings
   planes) — confirm breadth with the owner.
3. Record actions as a top row under the order number; order information below them.
4. Keybinds for In place and Split.
5. Triage vs industrial split: rounded badges / staff avatars off-floor; solid-state badges only
   on Floor.
6. Floor always mounts a right rail with the most recently selected (or top) order's details.

## Commit

~446 dirty paths mixed with the sidebar and Cloudflare/AI sessions. Owner has not decided how
to commit. Ask before committing; if told to, commit this slice by path (files above) and
hunk-split shared files (`UnshippedTable.tsx`, `DashboardOrdersView.tsx`, `ShortageDesk.tsx`,
`PackWorkspaceView.tsx`, `ShippingWorkspaceView.tsx`, `MorphingRowActionMenu.tsx`,
`DesktopRouteShell.tsx` — the `columnOpen` publish effect + `useSidebarToggleHotkey` call,
`SidebarCollapseControl.tsx` — tooltip `shortcut` + `aria-keyshortcuts`, `useOrdersQueueFeed.ts`,
`useOrdersQueuePlane.ts`, docs). New: `src/lib/nav/sidebar-column-store.ts`,
`src/lib/nav/sidebar-toggle-hotkey.ts` (left nav column: `\` or `/` alone when not typing;
⌘/Ctrl + `\` or `/` anywhere; ⌘/ yields to the AI session's composer focus).
Design system: `src/design-system/motion/CursorLabelLayer.tsx` now paints the chord a tooltip
publishes (`HoverTooltip shortcut`) — it used to drop it, hiding every tooltip shortcut on desktop.

Throwaway smoke `.cards-qol.mjs` (repo root) stays for the remaining phases; delete it when the
phase list is done.
