# 03 — Sales (main transaction history)

**Status:** P1–P2 shipped 2026-07-16 (P3 URL migration still deferred)
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md)
**Depends on:** [05 — Nav · permission · redirects](./05-nav-permission-redirects.md)

## Goal

Rename the `/walk-in` main hub to **"Sales"** — one **overall transaction-history Monitor**
for all front-desk work. Sales · Pickups · Repairs categories are retained as sub-tabs
(this is a history of *all transactions*, not sales-only). Monitor contract: observe, no edit.

## Decision (frozen — Parent #3)

Owner: *"it must be renamed to sales as just an overall history display for all transactions."*
The combined `WalkInHistoryHub` stays; only the nav label changes. Active intake stays on the
Walk-In Station ([02](./02-walk-in-station.md)).

## Current state (verified 2026-07-16)

- `src/app/walk-in/page.tsx` = `WalkInHistoryHub` + `WalkInHistorySidebar` inside `RouteShell` — a Monitor with `?category=sales|pickups|repairs`.
- Nav id `walk-in`, `kind:'main'`, label "Walk-In", `walk_in.view`; master-nav already carries `sales` / `pickups` categories.
- `useWalkInTaskRedirect` bounces legacy task deep-links (`?mode=sales`, `?new=true`, `?openRepair=`) to the station — keep.
- Categories SoT: `src/lib/walk-in/history-categories.ts`.

## Reuse map (Compose / Relocate / Delete)

| Asset | Action |
|---|---|
| `WalkInHistoryHub` | **Rebuild** on the dashboard recipe (`DashboardScrollShell` + `WorkbenchChromeHeader` + `KpiTile` + house row primitives) — the page-local tab band + hand-rolled tables were a fork of the golden pattern |
| `WalkInHistorySidebar` | **Slim** — chrome owns the category facets; sidebar keeps station hand-offs |
| `RepairTable` on this page | **Drop** — Workbench (details panel + pay) inside a Monitor; still mounted by `WalkInStationPane` |
| `src/lib/walk-in/history-categories.ts` | **Keep** — powers the overall history |
| nav label | **Relabel** `walk-in` → "Sales" (row in 05·P4) |

## Open decision

| Q | Recommendation |
|---|---|
| URL: keep `/walk-in` (label "Sales") vs move to `/sales` | **Keep `/walk-in`, relabel first.** Migrate `id`/URL in a later pass to protect bookmarks + tests (Overlap register → "Nav id rename"). Pairs with 02's route call — decide both together if a Sales namespace is adopted. |

## Phases

- [x] **P1** — Relabel nav `walk-in` → "Sales" — landed in 05·P4 (label "Sales", `id` kept, `walk_in.view`).
- [x] **P2** — Hub reads as an overall transaction history, rebuilt on the golden dashboard recipe:
  - **One feed, four tabs.** `history-categories.ts` gains an **`all`** category (now the default); All · Sales · Pickups · Repairs all render ONE merged feed filtered by kind. The three hand-rolled `<table>`s and the page-local header band are **deleted** — `RepairTable` no longer mounts here (repair work lives on the station, per the split; `WalkInStationPane` still owns it).
  - **Composition = `DashboardOrdersView`'s**: `DashboardScrollShell` + `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` + `WorkbenchChromeHeader` (`TabSwitch` tabs w/ counts) + KPI strip → full-bleed day-banded feed. Chrome sits outside the scroll port, so `DateGroupHeader` bands are the only sticky layer — no offset math.
  - **Rows compose house primitives**: `DateGroupHeader` + `groupRowsBy` day bands, `RowTitle` (fixed dot track), `LedgerValue` money, `dashboardOrderRowShellClass` grid.
  - **New SoTs** (views stay dumb): `lib/walk-in/transactions.ts` = pure data waist (adapters / merge / filter / count / rollup — each spine's money unit normalized in ONE place); `lib/walk-in/transaction-kind.ts` = kind → label/dot/tab-tint registry, mirroring `workflow-stages.ts`. 10 DB-free tests (`transactions.test.ts`, green under `TZ=UTC`).
  - **KPI strip** composes `KpiTile` (eyebrow → hero → footer), derived from the SAME rows the feed renders, so chrome can't invent a second story.
  - Sidebar drops its duplicate category list (chrome owns the facets — one facet control per surface) and keeps the station hand-offs.
- [ ] **P3** — *(optional, later)* URL migrate `/walk-in` → `/sales` with redirects.

## Acceptance

- [x] Nav shows "Sales"; page lists all transaction categories (sales + pickups + repairs) — and now defaults to the merged **All** feed.
- [x] Station intake deep-links still redirect to `/pickup` (unchanged) — `useWalkInTaskRedirect` untouched; legacy `?tab=done|active` still resolves to the Repairs category.

## Verify

`npm run verify`; `sidebar-navigation.test.ts` label assertion.
