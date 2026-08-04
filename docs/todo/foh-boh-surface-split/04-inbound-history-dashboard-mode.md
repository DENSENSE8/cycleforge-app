# 04 — Inbound History → Dashboard mode → Inbound desk Docked

**Status:** P1–P3 built 2026-07-16 (`?mode=inbound`); **superseded 2026-08-03** — Docked lane on `/incoming?lane=docked` (Inbound desk merge). Proxy redirects `/dashboard?mode=inbound` and `/receiving/history` there.
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md)
**Depends on:** [05 — Nav · permission · redirects](./05-nav-permission-redirects.md)

## Goal (original)

Move BOH inbound History (Scanned · Unboxed facets) out of the Receiving mode rail into a
**new `/dashboard` mode** (beside Orders / Shipping), per owner decision #5.

## Current home (2026-08-03)

Inbound landed activity is the **Docked** lane of the Inbound desk:

- URL: `/incoming?lane=docked` (+ Triage/Unbox via `?sort=scanned_newest|unboxed_newest`)
- Chrome/KPI: `IncomingWorkspaceHeader` + `IncomingKpiStrip` (lane-aware)
- Tabs SoT: `src/components/sidebar/receiving/incoming/inbound-docked-tabs.ts`
- Redirects: `proxy.ts` — `/dashboard?mode=inbound|receiving`, `/receiving/history`, `/receiving?mode=history`

## Decision (frozen — Parent #5)

Owner: *"this would have to be in the dashboard page, under a different mode, like receiving mode."*
So Inbound History lives on `/dashboard` as its own mode — **not** a receiving-rail pill, **not** a
standalone `/inbound` route (History-home option **2c**, implemented as a Dashboard mode).

## Current state (verified 2026-07-16)

- History today = `/receiving/history` + `history` pill in `RECEIVING_MODE_ITEMS`; graduated Monitor under `SurfaceGate('history')`.
- Sort SoT: `HISTORY_SORT_OPTIONS` / `normalizeHistorySort` (`src/lib/receiving/receiving-modes.ts` + `src/lib/receiving/lines/query.ts`): `scanned_newest` / `unboxed_newest` / …
- Table: `ReceivingLinesTable` (`view=activity`) + history descriptor; search `src/lib/receiving-history-search.ts` (`rh_q` / `rh_field` / `rh_scope`); sidebar `ReceivingHistorySearchSection`.
- Dashboard shell: `DashboardScrollShell` (chrome slot + scroll body); `OutboundWorkspaceHeader` = golden `WorkbenchChromeHeader` sibling; `DashboardOrdersView` = the domain/mode reference.

## Reuse map (Compose / Relocate / Delete)

| Asset | Action |
|---|---|
| `DashboardScrollShell` + `WorkbenchChromeHeader` | **Compose** — chrome = Scanned · Unboxed tabs |
| `OutboundWorkspaceHeader` | **Copy pattern** (not outbound data) |
| `ReceivingLinesTable` (`view=activity`) + history descriptor | **Relocate** into the dashboard mode |
| `ReceivingHistorySearchSection` | **Relocate** into chrome `search` / `right` slot |
| `HISTORY_SORT_OPTIONS` | **Promote** `scanned_newest` / `unboxed_newest` to tab ids |
| Dashboard domain/mode switcher | **Grow** — add an Inbound mode entry |

## Watch-outs

- 2c's known risk: keep inbound cartons in their **own domain switch**, visually distinct from outbound orders — don't blend tables (Parent → "Do not reuse outbound order tables for inbound History").
- Permission: the Inbound mode is on `/dashboard` (`dashboard.view`) but shows receiving data — apply a **mode-level `receiving.view`** gate.

## Phases

- [x] **P1** — Inbound domain on the Dashboard: `?mode=inbound` (SoT `src/lib/dashboard/dashboard-domains.ts`).
      The **nav mode entry** is a [05](./05-nav-permission-redirects.md) row — this lane owns the surface + the param contract only.
- [x] **P2** — Composed `DashboardScrollShell` + `WorkbenchChromeHeader` → `InboundWorkspaceHeader`
      (Unboxed · Scanned tabs; facet ids ARE the `HISTORY_SORT_OPTIONS` `?sort=` values).
- [x] **P3** — `DashboardInboundView` mounts `ReceivingLinesTable` (resolves `history` → `view=activity`);
      `rh_q` / `rh_field` / `rh_scope` relocated from `ReceivingHistorySearchSection` into the chrome `search` / `right` slots.
- [ ] **P4** — Redirect `/receiving/history` (+ `?mode=history`) → `/dashboard?mode=inbound` — **[05](./05-nav-permission-redirects.md)·P5 owns it** (`proxy.ts`).
- [ ] **P5** — Hand off "drop `history` pill from `RECEIVING_MODE_ITEMS`" to [01](./01-receiving-boh-slim.md).

## Acceptance

- [x] Dashboard has an Inbound mode with Scanned · Unboxed facets + search.
- [ ] `/receiving/history` redirects there; no `history` pill remains in the receiving rail. — blocked on 05·P5 + 01.
- [x] Inbound cartons never intermix with outbound order rows — the domains share the shell, never a table:
      the inbound view mounts only the receiving table, the order-details panel is skipped, order warm-up is
      disabled, and `DashboardOrdersContextPanel` renders **nothing** in inbound (no outbound feed beside cartons).

## What shipped (2026-07-16)

| File | Role |
|---|---|
| `src/lib/dashboard/dashboard-domains.ts` | Domain SoT — `?mode=inbound`, facets from `HISTORY_SORT_OPTIONS`, `receiving.view` gate const |
| `src/components/dashboard/InboundWorkspaceHeader.tsx` | Chrome — `WorkbenchChromeHeader` sibling of `OutboundWorkspaceHeader` |
| `src/components/dashboard/DashboardInboundView.tsx` | Region — shell + chrome + table; mode-level `receiving.view` gate |
| `src/components/dashboard/workbench-filter-popover.tsx` | **Promoted** — was private to `OutboundFilterStrip`; both headers now compose it |
| `src/lib/surface-isolation.ts` | `resolveLiveReceivingMode('/dashboard', mode=inbound)` → `history` |
| `tests/e2e/dashboard-inbound-mode.spec.ts` | Facets + `view=activity` feed + domain isolation |

Notes for the next lane:

- **Table self-scrolls.** `ReceivingLinesTable` brings its own `WorkbenchTablePane` (gutters + card) and week
  header, so the shell body is `overflow-y-hidden` and adds no second gutter/scroll port. Don't wrap it in
  `WORKBENCH_BODY_COLUMN`.
- **The inbound sidebar is intentionally empty** (`return null`) — chrome owns search + filters. If a rail is
  wanted later, it's a receiving rail, not the outbound order feed.
- **05 will want** an `dashboardInboundHref()` / domain-param-clearing helper; deliberately not pre-built here
  (knip gate — no dead exports). Add it in `dashboard-domains.ts` with its call site.

## Verify

`npm run verify` — **8/8 green** with only this lane's diff in the tree.
Routing law (`/dashboard?mode=inbound` → `view=activity`, outbound unaffected, `/receiving/history` unchanged)
covered by unit assertions.
**`tests/e2e/dashboard-inbound-mode.spec.ts` has not been run** — E2E auth minting fails locally
(`account signin failed (401): INVALID_CREDENTIALS`; `tests/.auth` session is stale). Run it once E2E owner
credentials are available before calling the surface verified in a browser.
