# HANDOFF — Inventory page rejoins the sidebar contract (2026-10-08)

## What changed

The Inventory page (`/inventory/stock` — page id `stock`, label "Inventory") forked the
contextual sidebar's head contract: `ContextualSidebar` special-cased
`nav.page.id === 'stock'` to paint `StockViewList` — an always-open vertical list of the
five views under a bespoke `[G] then Stock` hint header — while every other page panel
paints ONE collapsed `NavViewSwitcher` block. Operator ruling 2026-10-08: the sidebar is
the same mobile-app-like stack on every page — search field, `‹ <Lane>` local back row,
mode card, then the one view switcher.

- `src/components/sidebar/contextual/ContextualSidebar.tsx` — page-id fork removed; stock
  renders `NavViewSwitcher` like every page.
- `src/components/sidebar/contextual/StockViewList.tsx` — deleted
  (`useViewHotkeys` and the `G` go-hints were already owned by `NavViewSwitcher` /
  `NavGoKeys`; view digits 1–5 stay bound via `viewKeys: true`).
- `docs/design-system/consolidation-ledger.json` — `stock-view-list-fork` recorded
  `retired` (`workspace-placement`), `forbiddenSource: StockViewList, data-nav-stock-views`.

## Verified on :3050 (lane-prod, before the pin switched to lane-tasks-board)

- `/inventory/stock` head: `Search` → `‹ Inventory` → one `Overview` switcher block
  (grid glyph, count-free) — same face as `/exceptions`, `/shipping/orders`.
- Switcher overlay: lists exactly `All stock · Needs replenishment · Low stock ·
  Out of stock` with digit keycaps.
- Body: Room (selected, 127) + inline Aisle 1/3/4 facets — no stray view list.
- `verify:fast`: all gates green except a pre-existing boundary violation from another
  session's uncommitted work (`MobileV2TopBar → master-nav/StaffAccountFooter`).
  Nav resolver tests: 41/45; the 4 failures are pre-existing `/operations/live-feed`
  parity/round-trip failures, untouched by this change.

## Owed when the lane comes back up

1. Desktop `/inventory/stock`: click the `Overview` block, press `Esc`, then press `2` —
   it must land on `/inventory/stock?view=all` (the run that would have proven this hit
   the lane going down; the binding is the same `useViewHotkeys` call the deleted list used).
2. Eyeball `/inventory/stock?view=replenish` and `/inventory?section=replenish` — both
   resolve to the stock panel and now carry the one switcher block.
