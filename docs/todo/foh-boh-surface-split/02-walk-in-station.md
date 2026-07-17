# 02 — Walk-In Station (intake bench)

**Status:** Built 2026-07-16 — P0–P5 done (P5 = keep the phone rewrite, see below)
**Parent:** [../foh-boh-surface-split-plan.md](../foh-boh-surface-split-plan.md)
**Depends on:** [05 — Nav · permission · redirects](./05-nav-permission-redirects.md)
**Staff context:** [../../master-connections-and-refactor/staff/06-local-pickup.md](../../master-connections-and-refactor/staff/06-local-pickup.md)

## Goal

Give the Walk-In counter its own station page + identity, **off `ReceivingSurfacePage`**.
Jobs via `?job=`: **Local Pickup** (default) · **Repair** · **Sales cart**. Contract stays
Station (act-and-clear intake), not a Receiving mode.

## Open decision — RESOLVED (P0)

Owner left the canonical URL open, noting "sales page would be best."

| Options | Recommendation |
|---|---|
| **keep `/pickup`** · move to a `/sales/…` namespace · `/walk-in/station` | **Keep `/pickup`.** `WALK_IN_STATION_PATH` (`src/lib/walk-in/jobs.ts`) is already `/pickup` and `/repair` redirects into it — decouple **identity only** (routeKey, permission, `pageKey`). If a Sales-namespace is wanted, add `/sales/counter` with `/pickup`→301 and update `walkInStationHref` (one SoT edit) — but that is pure churn with no user-facing gain. |

**DECIDED 2026-07-16 — keep `/pickup`.** Identity is what was actually coupled, and
[05](./05-nav-permission-redirects.md) decoupled all of it: `routeKey` `walk_in` (own nav
station row), gate `walk_in.view`, `pageKey` `walk_in`. The URL carried none of that
coupling, so renaming it buys nothing a user can see and costs every bookmark, the
`/repair` redirect, the phone rewrite, and the e2e specs.

The owner's "sales page would be best" instinct is satisfied by decision 3 instead:
`/walk-in` **becomes** the Sales page ([03](./03-sales-main-history.md)) — front-desk
commerce gets its main-nav home without dragging the *bench* into a Sales namespace.
Station (act) and history (observe) stay separate archetypes on separate routes.

**Reopen only if** a `/sales/*` namespace ships for real: then add `/sales/counter`,
301 `/pickup`, and update `walkInStationHref` — one SoT edit, still not a rewrite.

## Current state (verified 2026-07-16)

- `src/app/pickup/page.tsx` = `<SurfaceGate surfaceKey="pickup"><ReceivingSurfacePage mobileTitle="Walk-In"/></SurfaceGate>` — routeKey resolves `receiving`, gate `receiving.view` (the coupling to break).
- Components already built: `WalkInStationPane`, `WalkInStationSidebar`, `WalkInJobSwitcher` (`src/components/walk-in/`); `LocalPickupEditPanel` / `LocalPickupSidebarList` (`src/components/work-orders/`); `RepairTable` / `RepairIntakeForm` / `RepairSidebarPanel` (`src/components/repair/`); `SalesEditPanel` / `SalesCartSidebar` / `salesCartStore` (`src/components/walk-in/`).
- Job SoT: `src/lib/walk-in/jobs.ts` — `walkInStationHref`, `WALK_IN_JOB_ITEMS`, default `pickup`.

## Reuse map (Compose / Relocate / Delete)

| Asset | Action |
|---|---|
| `WalkInStationPane` / `WalkInStationSidebar` / `WalkInJobSwitcher` | **Compose** into the new page |
| `RouteShell` | **Compose** as the shell |
| `ReceivingSurfacePage` mount on `/pickup` | **Delete** (keep it for `/unbox` / `/triage`) |
| `ReceivingDashboard` pickup branch · `ReceivingSidebarPanel` pickup branch | **Delete** mount path |

**Do not** reuse `ReceivingSurfacePage` for the station — it brings the Receiving mode rail + mobile unbox feed (Parent → "Do not reuse for the wrong job").

## Phases

- [x] **P0** — Confirm canonical URL (resolved above: keep `/pickup`).
- [x] **P1** — New `WalkInSurfacePage` composing `RouteShell` + `WalkInStation*`; job from `?job=` via `parseWalkInJob`.
- [x] **P2** — Point `src/app/pickup/page.tsx` at `WalkInSurfacePage` (drop `ReceivingSurfacePage`).
- [x] **P3** — Per-job permission gate: page = `walk_in.view`; **Repair job additionally checks `repair.view`**.
- [x] **P4** — Realtime invalidation scopes per job (`walkIn` / `repair`).
- [x] **P5** — Mobile: **keep `/pickup`→`/m/receiving`** (see gap below).

## What shipped

| Concern | Landing |
|---|---|
| Page shell | `WalkInSurfacePage` (`src/components/walk-in/`) — `RouteShell` + `WalkInStation*`, no receiving chrome |
| Sidebar half | `SidebarContextPanel`: `routeKey === 'walk_in'` → `WalkInStationSidebar` (was `ReceivingSidebarPanel`) |
| Job permission SoT | `WALK_IN_JOB_PERMISSIONS` (`src/lib/walk-in/jobs.ts`) — `repair → repair.view`, others `null` |
| Per-job gate | `useWalkInJobAccess(job)`; denied job → `WalkInJobDenied` in **both** halves; `WalkInJobSwitcher` drops the pill |
| Deleted mount paths | `ReceivingDashboard` pickup branch (+ `isPickupMode`), `ReceivingSidebarPanel` pickup branch + its clear-session effect |

Mode plumbing (`RECEIVING_MODE_ITEMS`, `useReceivingMode` pickup branch) is deliberately
left to [01](./01-receiving-boh-slim.md) — the pill is now unreachable, not yet removed.

## Acceptance

- [x] `/pickup` renders without `ReceivingSurfacePage`; no Receiving mode rail present.
- [x] Sales / Local Pickup / Repair jobs switch via `WalkInJobSwitcher`; `walkInStationHref` contract unchanged (`jobs.test.ts`).
- [x] `/repair` → `/pickup?job=repair` still works (page redirect via `walkInStationHref`, untouched).
- [x] Route gated by `walk_in.view` (+ `repair.view` for the repair job).

## Known gap — mobile (P5)

A phone hitting `/pickup` still rewrites to `/m/receiving` (`MOBILE_UA_REWRITES`), so the
counter operator gets the **receiving photo feed**, not the bench. This predates the split
and is unchanged by it; the desktop decoupling is complete either way.

Building `/m/walk-in` is a whole mobile surface (job rail + cart + pickup list in
`MobileShell`) with no acceptance row here, so it is **not** in this lane. It is the
natural next ticket if the counter is ever worked from a phone.

## Verify

Walk-in + repair e2e; `npm run verify`.
