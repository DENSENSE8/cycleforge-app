# Plan — split the station column by ARCHETYPE, not nav `kind`

**Goal:** the two-card sidebar column is the right shell for every operator bench, but
"scan bench" and "backlog" are different **contracts**. Drive the column off
`SURFACE_REGISTRY.archetype` (the real SoT) instead of `APP_SIDEBAR_NAV.kind` (a nav
grouping label), and give backlog surfaces — Support, Review — a queue band instead of a
scan bar.

**Lane:** `main` (WS-DOGFOOD). Rules: `AGENTS.md`, `.claude/rules/contextual-display.md`,
`.claude/rules/display/station.md`, `.claude/rules/display/workbench.md`.

---

## The bug this fixes

`isStationSurfaceRoute()` (`src/lib/sidebar-navigation.ts`) keys the two-card station
column off `kind: 'station'`. That field is **which bucket the nav dropdown lists you
under** — Main / Stations / More. It is not a region contract, and it is per **route key**,
so `/unbox` and `/incoming` are indistinguishable (both `receiving`).

`SURFACE_REGISTRY` (`src/lib/stations/surface-keys.ts`) already declares the contract, per
surface, and it disagrees with what shipped:

| surface | registry `archetype` | column today | correct |
|---|---|---|---|
| `/unbox`, `/triage`, `/pack`, `/test`, `/shipping` | `station` | scan | scan ✓ |
| `/incoming`, `/pickup`, `/repair` | `workbench` | scan | **panel** |
| `/receiving/history` | `monitor` | scan | **panel** |
| `/support` | `station` *(mis-declared)* | scan | **queue** |
| `/review` | *(no entry)* | scan | **queue** |

So the column over-sweeps in both directions: four receiving surfaces that are not benches
get a scan column, and two genuine backlogs get a scan bar they should never have.

## Why Support / Review are Workbenches, not Stations

Run the `pickArchetype()` discriminator (`src/lib/stations/archetype.ts`) on them:

- **Q1 — scanner?** No. Neither panel mounts a `StationScanBar`.
- **Q2 — observe-only?** No; tickets and review chores are edited and persisted.
- **Q3 — node-graph?** No.
- **Q4 — fallthrough** → **Workbench.**

The code already knew: `SupportSidebarPanel` drives durable `?search=` / selection through
URL params, and its own header comment labels its modes `(Monitor)` and `(Workbench)`.

**But they are not *catalog* Workbenches.** A catalog is browsed; a backlog is burned down:

| | scan bench | backlog |
|---|---|---|
| input | scanner, F2 focus-lock | pointer + search / filter |
| the list is | *recents* — what I just did | *queue* — what is left |
| list drains | no, it grows as you scan | yes, items leave when resolved |
| ordering | newest first | oldest / priority (SLA) |
| selection | ephemeral | durable `?id=` |
| leading band | scan bar | search + assignee + filter |
| goal metric | throughput / hour | remaining, oldest age |
| empty state | "ready to scan" | inbox zero |

**Do NOT add a fifth archetype.** A queue is still pick → edit → persist, so Workbench is
correct, and `contextual-display.md` explicitly makes Workbench the fallthrough and warns
against growing a new contract when it fits. The difference is *collection semantics*, a
sub-recipe — not a contract.

## The correctness reason (not just aesthetics)

`StationScanBar` calls `useRegisterScanTarget`, which pushes onto the global F2 focus stack
— **last-mounted wins** (`src/lib/scan-hotkey/store.ts`). Give Support a scan bar and a
ticket filter silently steals the focus hotkey from the bench the operator is standing at.
A backlog band must **not** register a scan target, and a wedge scan on `/support` must keep
routing through `GlobalWedgeScannerMount` to the right station.

---

## Phase 1 — registry becomes the SoT

- Add `collection?: 'catalog' | 'queue'` to the `SURFACE_REGISTRY` entry type
  (`surface-keys.ts`). Meaningful for `archetype: 'workbench'` only; default `catalog`.
- Fix `/support`: `archetype: 'station'` → `'workbench'`, `collection: 'queue'`.
- Add a `/review` entry: `workbench` + `collection: 'queue'`.
- Extend `surface-keys.test.ts` so a `collection: 'queue'` entry must be `workbench`
  (a queue on a Station entry is the mis-declaration this plan exists to prevent).

## Phase 2 — one resolver replaces the nav-kind predicate

- New `sidebarColumnKind(pathname): 'scan' | 'queue' | 'panel'`, resolving through the
  registry (surface → archetype + collection), not the nav list:
  - `station` → `scan`
  - `workbench` + `collection: 'queue'` → `queue`
  - everything else → `panel` (the classic single sidebar panel)
- Delete `isStationSurfaceRoute()`. Re-point `SidebarShell`.
- This alone un-breaks `/incoming`, `/pickup`, `/repair`, `/receiving/history` — they fall
  back to `panel` because the registry says workbench/monitor.

**Accept:** `/unbox` `/triage` `/pack` `/test` `/shipping` keep the scan column;
`/incoming` `/pickup` `/repair` `/receiving/history` return to the classic panel;
`/support` `/review` get the two-card column with no scan bar.

## Phase 3 — the queue band

- New leading band for the bottom card on `queue` columns: search + assignee filter +
  remaining count / oldest age. Compose `ToolbarSearchToggle` + existing filter primitives;
  **never** `StationScanBar`, and **never** `useRegisterScanTarget`.
- Bottom card keeps the shared shell (`station-column.ts`) — same width, elevation,
  stacking band, mirrored radii. Only the band swaps.
- Selection stays URL-durable (`?id=` / `?ticket=`), per the Workbench contract.

**Accept:** F2 on `/support` still focuses the last real bench, not the ticket filter; a
wedge scan on `/support` routes through `GlobalWedgeScannerMount`; ticket selection
survives reload.

## Phase 4 — naming + docs

- Rename `station-column.ts` → `work-column.ts` once it hosts two contracts (`scan` and
  `queue`), so the filename stops implying Station-only.
- Add the column-kind row to `.claude/rules/source-of-truth.md`, and the scan/queue split
  to `.claude/rules/display/workbench.md` (backlog recipe) — **code first, then doc**.

---

## Out of scope

- A fifth region contract. Workbench + `collection` covers it (see above).
- Re-homing Support's `calls` (Monitor) and `warranty` (Workbench) sub-modes — the panel
  already mixes contracts per mode; that is its own split.
- Touching the mobile drawer, which deliberately keeps the classic single panel on every
  route (it is the only nav path on the mobile branch).

## Verify

```bash
npm run verify
```

Chrome-only phases — unit tests cannot cover the column. **Browser-verify each** at desktop
and narrow viewports, and specifically test the F2 hand-off between a backlog page and a
bench.
