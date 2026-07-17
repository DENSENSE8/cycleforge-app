# 05 — Nav · permission · redirects (shared blueprint)

**Status:** ✅ Reconciled 2026-07-17. Built 2026-07-16 on the *job-switcher / own-station* direction;
its pickup-decouple half was **reverted** when the direction refined (pickup/repair are **Receiving
modes**, not a Walk-In station). This doc now documents the **shipped end state**, not the interim plan.
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md) (see the 2026-07-17 revision + Conflict #2)
**Build order:** first (connective tissue — 02 / 03 / 04 / 06 depend on it)

This doc **owns** the three shared registries every surface doc edits. Coordinate all
`sidebar-navigation` / `surface-keys` / `proxy` changes here so parallel lanes don't collide on the
same files. Surface docs declare the rows they need; this doc is the single editor.

## Scope

| File | Concern |
|---|---|
| `src/lib/sidebar-navigation.ts` | `APP_SIDEBAR_NAV` / master-nav, `SidebarRouteKey`, `getSidebarRouteKey`, `ROUTE_PERMISSIONS` |
| `src/lib/stations/surface-keys.ts` | `SURFACE_REGISTRY` |
| `src/proxy.ts` | mobile rewrites + mode→path resolution |

## ⚠️ Direction change — what reverted (read first)

The 16 Jul build implemented Phase 0 #7's "decouple `/pickup` into a `walk_in` station" — a new
`walk_in` route key, a `walk_in.view` gate on `/pickup`, a `walk_in` surface `pageKey`, and a new
`kind:'station'` nav row. **The 17 Jul refinement reversed all four.** The counter is a **kiosk form**
(→ [06](./06-walk-in-kiosk-auth.md)); Local Pickup + Repair are **peer Receiving modes** running the
Unbox flow. So front-desk *processing* is receiving work and gates `receiving.view`; `walk_in.*` is
reserved for the **Sales history page** (`/walk-in`) and the future **`/kiosk`** device surface.

| Concern | 16 Jul interim (built) | **Shipped end state (17 Jul, verified in code)** |
|---|---|---|
| `getSidebarRouteKey('/pickup')` | `'walk_in'` (new key) | ✅ **`'receiving'`** (`sidebar-navigation.ts` L253) |
| `getSidebarRouteKey('/repair')` | — | ✅ **`'receiving'`** (L259) |
| `SidebarRouteKey` union | added `'walk_in'` | ✅ **no `walk_in`**; has `'walk-in'` (Sales) + `'repair'` |
| `ROUTE_PERMISSIONS` `/pickup` | `walk_in.view` | ✅ **`receiving.view`** (L342) |
| `ROUTE_PERMISSIONS` `/repair` | — | ✅ **`receiving.view`** (L336) |
| `SURFACE_REGISTRY.pickup` | `pageKey:'walk_in'`, `permission:'walk_in.view'` | ✅ **`pageKey:'receiving'`, `permission:'receiving.view'`, `modeKey:'pickup'`** |
| `SURFACE_REGISTRY.repair` | `/pickup?job=repair` redirect | ✅ **first-class `route:'/repair'`, `pageKey:'receiving'`, `receiving.view`** |
| `kind:'station'` `walk_in` nav row | added (`/pickup`, `DoorOpen`) | ✅ **removed** — no standalone Walk-In station |
| nav id `walk-in` | label **"Sales"** | ✅ **kept** — label "Sales", `kind:'main'`, `/walk-in`, `walk_in.view` |

The `SURFACE_REGISTRY` comments now encode this: *"It is not a separate 'Walk-In station': front-desk
pickup is receiving work… the job-switcher model that this refactor drops."*

## Current state (verified 2026-07-17)

| Concern | Value | Owner note |
|---|---|---|
| `/pickup`, `/repair` route key | `receiving` | pickup/repair are Receiving modes (own routes) |
| `/pickup`, `/repair`, `/receiving`, `/unbox`, `/triage`, `/incoming` gate | `receiving.view` | one floor-permission family |
| `/walk-in` gate | `walk_in.view` | the **Sales** history monitor |
| nav `walk-in` (kebab) | label **Sales**, `kind:'main'`, `/walk-in` | id kept for bookmark/test stability |
| `SURFACE_REGISTRY.pickup` / `.repair` | `pageKey:'receiving'`, `receiving.view`, `archetype:'workbench'`, `workflowNodeType:'receiving'` | receiving surfaces |
| Receiving rail | Incoming · Triage · Unbox · **Local Pickup (cart)** · **Repair (wrench)** | Walk-In pill + History dropped |
| `?job=` switcher | **gone** | "the jobs ARE modes" |

**`walk_in.*` is now a *front-desk-commerce* family, not a floor family.** It gates `/walk-in` (Sales
history) today and will gate `/kiosk` (doc 06). `repair.view` / `repair.intake` / `repair.mark_repaired`
/ `repair.pickup_sign` (tech family) still gate the repair **APIs**; the `/repair` *route* gates
`receiving.view` like the rest of the rail.

## Phases — reconciled

Original P1–P6 recorded against the interim direction. Reconciled outcome:

- [x] **P1 (reverted)** — `walk_in` `SidebarRouteKey` + `getSidebarRouteKey('/pickup')→walk_in`.
  **Reverted:** `/pickup` and `/repair` resolve to `receiving`; no `walk_in` key.
- [x] **P2 (reverted)** — `/pickup` → `walk_in.view`. **Reverted:** `/pickup` + `/repair` gate
  `receiving.view` (front-desk processing is receiving work).
- [x] **P3 (reverted)** — `SURFACE_REGISTRY.pickup` `pageKey→walk_in`. **Reverted:** `pageKey:'receiving'`;
  `repair` promoted to a first-class `/repair` surface (`pageKey:'receiving'`).
- [x] **P4 (stands)** — Nav label `walk-in` → **"Sales"** (id kept; migration is a later pass — Overlap
  register "Nav id rename").
- [x] **P5 (stands)** — Redirect matrix, single source (`resolveReceivingSurfaceRedirect` docblock in
  `src/proxy.ts`): `/receiving?mode=pickup`→`/pickup`; `?job=repair`→`/repair`, `?job=sales`→`/walk-in`,
  other `?job=`→`/pickup`; `/walk-in?mode=sales`/`?category=` in-page via `useWalkInTaskRedirect`.
  **Deferred leg unchanged:** `/receiving?mode=history` still lands on `/receiving/history` — [04](./04-inbound-history-dashboard-mode.md) repoints it at the dashboard inbound mode on cutover.
- [x] **P6 (stands)** — Mobile: keep `/pickup` → `/m/receiving` (no `/m/walk-in`; out of scope,
  `MOBILE_UA_REWRITES` comment). Revisit with 02·P5.
- [x] **P7 (revert cleanup, done)** — the `kind:'station'` `walk_in` nav row was removed; `DoorOpen` is
  no longer imported for it (only Warehouse "Rooms" uses it now).

### Removed from this doc's job

The interim "New `kind:'station'` walk_in nav row" and its modeless station are gone. Front-desk
identity now lives in **two** places, both already correct: `/walk-in` (Sales, `walk_in.view`) and the
Receiving rail's Local Pickup / Repair modes (`receiving.view`). The **`/kiosk`** device surface is
[06](./06-walk-in-kiosk-auth.md)'s to add (its own gate, not a staff `SidebarRouteKey`).

## Acceptance (reconciled)

- [x] `getSidebarRouteKey('/pickup') === 'receiving'` and `'/repair' === 'receiving'`; `sidebar-navigation.test.ts` reflects it.
- [x] `/pickup`, `/repair` gated by `receiving.view`; `/walk-in` gated by `walk_in.view`.
- [x] `surface-keys.test.ts` green: `pickup`/`repair` are `pageKey:'receiving'` (pairs stay unique).
- [x] No `walk_in` `SidebarRouteKey`; no `kind:'station'` walk_in nav row.
- [x] Every legacy redirect resolves (no 404): `/receiving?mode=pickup`, `/receiving?mode=history`, `/repair`, `/pickup?job=repair`, `/walk-in?mode=sales`.
- [ ] **New (doc 06):** `walk_in.*` reserved for `/walk-in` + `/kiosk`; any kiosk `ROUTE_PERMISSIONS` / MDM proxy-allowlist entry lands here when 06 builds.

## Known interim states (close in the named lane)

- **Receiving rail still shows the graduated modes** — Local Pickup + Repair are peer modes now (target
  state). [01](./01-receiving-boh-slim.md) is a no-op for *these* (they stay); it only confirms the
  Walk-In pill + History are gone, which they are.
- **`getMobileAppTitle('/pickup')`** reads "Local Pickup"; phone `/pickup` still shows the receiving
  feed via `/m/receiving`. Intentional; 02 owns the mobile story.
- **`/receiving?mode=history`** still lands on `/receiving/history` until [04](./04-inbound-history-dashboard-mode.md) cuts over.

## Verify

`npm run verify` (route-auth drift + enforce, surface-key + sidebar-nav unit tests).

**Result 2026-07-17 (reconciliation):** the doc now matches code — no edits were needed to reach this
state (the revert already shipped in `3ea08956`). Re-run `npm run verify` after any future kiosk-gate
work (doc 06) that touches `ROUTE_PERMISSIONS`.
