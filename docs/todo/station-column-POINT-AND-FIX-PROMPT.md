# Handoff — station column, point-and-fix lane

**Lane:** `main` (WS-DOGFOOD). Rules: `AGENTS.md`, `.claude/rules/contextual-display.md`,
`.claude/rules/display/station.md`, `.claude/rules/display/workbench.md`.

**Guide (not a script):** [`station-column-archetype-split-plan.md`](station-column-archetype-split-plan.md).

---

## How to work in this lane

**You are reactive.** The user points at something — a screenshot, a route, a symptom, one
sentence — and you fix *that thing*. Do **not** open the plan and start burning down phases
because they exist. Nobody asked for the next phase; they asked about the thing they are
looking at.

The loop:

1. **Locate it.** Which surface, which route key, which card, which contract. Confirm from
   code before theorising — most of this chrome is 3 files deep, not mysterious.
2. **Fix the SoT, not the call site.** If two surfaces would need the same patch, the patch
   belongs in the shared token/primitive. See `AGENTS.md` → Pattern evolution.
3. **`npm run verify`.** Green before you report. Never raise a DS-ratchet baseline, never
   `--no-verify`.
4. **Report what changed and what you could not check.** Chrome is not unit-testable here
   (see *Verification reality* below) — say so rather than implying it was verified.

**Scope discipline:** fix what was pointed at, plus anything that is genuinely the same
defect. If you spot a second problem, name it in your reply and let the user choose — do not
silently widen the change.

---

## The plan is a map, not a mandate

`station-column-archetype-split-plan.md` exists so you don't have to re-derive the
reasoning: why Support/Review are Workbenches, why a queue is not a fifth archetype, which
surfaces are mis-declared, which trap bites. **Read the slice that covers what the user
pointed at. Skip the rest.**

**Update the plan whenever reality moves it.** It is a living doc, not a contract:

- A fix lands that completes or invalidates part of it → amend that part in the same change.
- The user's direction contradicts it → rewrite the affected section to match the new
  direction, and say in your reply that you did.
- You discover a constraint it doesn't mention → add it, so the next session doesn't
  rediscover it the hard way.

**Code first, then doc** (`AGENTS.md`). Never encode a net-new architecture in the plan
before it exists in code.

---

## Where things stand (as of `26636b1c`)

**Shipped.** Station surfaces get a **two-card sidebar column** — gray canvas backdrop,
**nav card** flush top (`rounded-b`, `border-t-0`), **station card** (recents + scan bar)
flush bottom (`rounded-t`, `border-b-0`). One shell, mirrored radii, same width / elevation
/ stacking band. They are **flex siblings**, so opening a nav menu expands the top card
downward and pushes the station card down — no offset math, no covering the scan bar.

Also shipped: `MasterNav layout="docked"` (menus in flow, `flat` variant on the menu panels
so a card never nests in a card), and a **flat desktop frame** — square top-left corner, no
canvas edge stroke, one `border-b` hairline on `GlobalHeader`.

**Known-broken — expect the user to point here first.** `isStationSurfaceRoute()` keys off
`APP_SIDEBAR_NAV.kind`, which is a *nav grouping label*, not a region contract, and it is
per route **key** — so `/unbox` and `/incoming` are indistinguishable:

| surface | `SURFACE_REGISTRY.archetype` | column today | should be |
|---|---|---|---|
| `/unbox` `/triage` `/pack` `/test` `/shipping` | `station` | scan | scan ✓ |
| `/incoming` `/pickup` `/repair` | `workbench` | scan | **panel** |
| `/receiving/history` | `monitor` | scan | **panel** |
| `/support` | `station` *(mis-declared)* | scan | **queue** |
| `/review` | *(no entry)* | scan | **queue** |

The fix is registry-driven — plan Phases 1–2. Do it when the user points at one of those
routes, not before.

---

## Traps (each one already bit this lane once)

- **`kind` ≠ `archetype`.** `kind: 'station'` is which bucket the nav dropdown lists you
  under. `SURFACE_REGISTRY.archetype` (`src/lib/stations/surface-keys.ts`) is the contract,
  and it is per *surface*, which is the granularity you actually need.
- **F2 focus stack.** `StationScanBar` calls `useRegisterScanTarget` — **last mounted wins**
  (`src/lib/scan-hotkey/store.ts`). A scan bar on a backlog page silently steals the hotkey
  from the bench the operator is standing at. Backlog bands must never register.
- **Scan bar sits at the TOP of the station card.** It was moved to the bottom once and
  rejected. The nav bar and the scan bar never share a row — that is the "one or the other"
  rule — but the nav buttons always stay top-left, above the card.
- **The mobile drawer keeps the classic single panel on every route.** `GlobalHeader` does
  not exist on the mobile branch, so the drawer is the only nav path there. Do not re-shape
  it with desktop station chrome.
- **The flat frame is app-wide.** `appContentShellClass` is on `<main>` for every desktop
  page — a change there is never scoped to one route.
- **New file → new Tailwind arbitrary values.** They *do* get scanned, but verify against
  the compiled CSS before blaming Tailwind. And CSS `calc()` needs spaces around operators:
  `calc(100%-1.5rem)` is invalid and silently dropped.
- **`flex-1` vs `flex-auto`.** `flex: 1 1 0%` in an **auto-height** column gives a
  hypothetical size of 0 — the feed collapses and only the band paints. Definite-height
  host → `flex-1` is right; content-height host → `flex-auto`.

---

## Verification reality

- **You cannot browser-verify unaided.** The app sits behind `/signin` and entering
  credentials is off-limits. Options: ask the user to sign in on the Browser pane, or ask
  them to describe/screenshot what they see. A screenshot has resolved every visual
  question in this lane faster than reasoning did — **ask early**.
- The user's dev server holds the Turbopack lock; port varies (`:3050` last seen, `:3000`
  is a different app). Do not start a second `next dev` — attach to theirs.
- **`npm run verify` can fail spuriously.** If many unrelated gates go red at once —
  especially `Route-permission drift` / `Schema drift`, which most chrome work cannot touch
  — suspect a process-spawn failure and re-run before believing it. That exact pattern
  blocked a push in this lane and was green on retry.
- `Tenancy isolation (static)` is **advisory**; its ~20 findings are pre-existing.

---

## File map

| Concern | File |
|---|---|
| Two-card column shell | `src/components/sidebar/station-column.ts` |
| Column branch / which occupant | `src/components/sidebar/SidebarShell.tsx` |
| Route → column predicate *(to be replaced)* | `isStationSurfaceRoute()` in `src/lib/sidebar-navigation.ts` |
| Contract SoT | `src/lib/stations/surface-keys.ts`, `src/lib/stations/archetype.ts` |
| Nav band + in-flow menus | `src/components/sidebar/master-nav/MasterNav{,View,Dropdown}.tsx` |
| Desktop frame / header hairline | `src/components/layout/header-shell.ts`, `GlobalHeader.tsx` |
| Receiving scan surface body | `src/components/sidebar/ReceivingSidebarPanel.tsx` |

## When done

`pnpm worklog "<action>" --result <r>` per unit of work. If a fix moves where the mode rail
or the column contract lives, update `.claude/rules/display/workbench.md` + the SoT row in
`.claude/rules/source-of-truth.md` in the same change.
