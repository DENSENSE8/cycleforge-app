# 05 — Nav · permission · redirects (shared blueprint)

**Status:** ✅ Built 2026-07-16 (P1–P6 landed; P5's history leg intentionally deferred to 04 — see below)
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md)
**Build order:** first (connective tissue — 02 / 03 / 04 depend on it)

This doc **owns** the three shared registries every surface doc edits. Coordinate all
`sidebar-navigation` / `surface-keys` / `proxy` changes here so parallel lanes don't collide
on the same files. Surface docs declare the rows they need; this doc is the single editor.

## Scope

| File | Concern |
|---|---|
| `src/lib/sidebar-navigation.ts` | `APP_SIDEBAR_NAV` / master-nav, `getSidebarRouteKey`, `ROUTE_PERMISSIONS` |
| `src/lib/stations/surface-keys.ts` | `SURFACE_REGISTRY` |
| `src/proxy.ts` | mobile rewrites + mode→path resolution |

## Current state (verified 2026-07-16)

| Concern | Current | Target |
|---|---|---|
| `getSidebarRouteKey('/pickup')` | `'receiving'` | ✅ `'walk_in'` (new `SidebarRouteKey`) |
| `ROUTE_PERMISSIONS` `/pickup` | `receiving.view` | ✅ `walk_in.view` (repair job → `repair.view` in-page) |
| `SURFACE_REGISTRY.pickup` | `pageKey:'receiving'`, `permission:'receiving.view'`, `modeKey:'pickup'` | ✅ `pageKey:'walk_in'`, `permission:'walk_in.view'` |
| nav id `walk-in` | label "Walk-In", `kind:'main'`, `/walk-in`, `walk_in.view` | ✅ label **"Sales"** (id kept for now — migrate later) |
| nav id `walk_in` | *(did not exist)* | ✅ new `kind:'station'` row, `/pickup`, `walk_in.view` |
| `/repair` | `redirect(walkInStationHref('repair'))` → `/pickup?job=repair`, perm `repair.view` | ✅ unchanged |
| proxy `/pickup` → `/m/receiving` | mobile rewrite | ✅ kept (no `/m/walk-in`; see P6) |

**Two front-desk keys, on purpose:** `walk-in` (kebab) = the `/walk-in` history monitor, now labelled **Sales**; `walk_in` (snake) = the `/pickup` station bench. Snake matches the station's permission family (`walk_in.view`) and its surface `pageKey`. Confusable by design-of-history — the id migration that would clean this up is a later pass (Overlap register, "Nav id rename").

Permission families already exist: `walk_in.view` / `walk_in.intake` (ops) **and** a separate
`repair.view` / `repair.intake` / `repair.mark_repaired` / `repair.pickup_sign` (tech).

## Phases

- [x] **P1** — Add `walk_in` `SidebarRouteKey`; `getSidebarRouteKey('/pickup')` → `walk_in`.
- [x] **P2** — `ROUTE_PERMISSIONS`: `/pickup` → `walk_in.view` (repair sub-job guarded by `repair.view` in-page, not the route prefix).
- [x] **P3** — `SURFACE_REGISTRY.pickup`: `pageKey`→`walk_in`, `permission`→`walk_in.view`; keep the legacy `/receiving?mode=pickup` redirect until [01](./01-receiving-boh-slim.md) lands.
- [x] **P4** — Nav label `walk-in` → **"Sales"** (keep `id: 'walk-in'` for bookmark/test stability; id migration is a later pass — Overlap register "Nav id rename").
- [x] **P5** — Redirect matrix (single source): `/receiving?mode=pickup`→`/pickup`; `/repair`→`/pickup?job=repair` (unchanged); `/walk-in?mode=sales` / `?category=` in-page via `useWalkInTaskRedirect`. **Deferred leg:** `/receiving?mode=history` still lands on `/receiving/history` — repointing it at the dashboard inbound mode is [04](./04-inbound-history-dashboard-mode.md)'s cutover step (pointing at it before that mode exists would dump the operator on the dashboard default). The matrix is documented in one place: `resolveReceivingSurfaceRedirect`'s docblock in `src/proxy.ts`.
- [x] **P6** — Mobile: **keep** the `/pickup` → `/m/receiving` rewrite. There is no `/m/walk-in` shell and building one is out of scope here; a phone hitting `/pickup` gets exactly today's receiving feed. Recorded in the `MOBILE_UA_REWRITES` comment; revisit with 02·P5.

### Also landed here (TODO-2's nav half, which the phase list under-specified)

- **New `kind: 'station'` nav row** `{ id: 'walk_in', label: 'Walk-In', href: '/pickup', icon: DoorOpen }` — the Locked-product-direction "own station item" (peer of Receiving/Packing/Testing/Shipping). Deliberately **no** `SIDEBAR_PAGE_NAV` entry: jobs stay in-page `?job=` sub-modes (Phase 0 decision #8), so the station is modeless.
- Nav id **is** the route key (`walk_in`), so `getMobileAppTitle` / `getSidebarHref` / the master-nav context panel all resolve the station without extra wiring.

## Acceptance

- [x] `getSidebarRouteKey('/pickup') === 'walk_in'`; `sidebar-navigation.test.ts` updated (+4 new tests pinning the split).
- [x] `/pickup` gated by `walk_in.view`, not `receiving.view`.
- [x] `surface-keys.test.ts` green with the new `pageKey` (`walk_in::pickup` keeps the pair unique).
- [x] Every legacy redirect resolves (no 404): `/receiving?mode=pickup`, `/receiving?mode=history`, `/repair`, `/walk-in?mode=sales`.

## Known interim states (close in the named lane)

- **`/pickup` has no L2 mode rail** between 05 and 01: the route key no longer resolves to the `receiving` page nav, so `useActiveSidebarMode` finds no modes. This is the *target* end state (jobs are in-page), and the new station nav row is the way back — but the Receiving rail still shows a Walk-In pill pointing at it until [01](./01-receiving-boh-slim.md) drops it.
- **`getMobileAppTitle('/pickup')`** now reads "Walk-In" (was "Receiving"), and `routeHasMobileContextRow('walk_in')` is false — so the phone `/pickup` view loses the Receiving mode-switch row. Intentional decoupling; 02 owns the mobile story.

## Verify

`npm run verify` (route-auth drift + enforce, surface-key + sidebar-nav unit tests).

**Result 2026-07-16:** Typecheck · Unit tests + DS guards · Route-permission drift · Route-auth enforce · Tenancy · Schema drift all ✓. Lint ✓ in isolation. The **knip** gate is red on lane 04's not-yet-wired exports (`dashboard-domains.ts`, `InboundWorkspaceHeader.tsx`, `surface-isolation.ts → DASHBOARD_SURFACE_ROUTE`) — no file owned by this lane is flagged; 04 closes it when it wires the mode.
