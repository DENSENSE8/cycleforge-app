# Handoff — Today (`/`) chrome parity: saved views · search · trailing controls · KPI

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · lane: `main` (WS-DOGFOOD) · surface: `/` (Home → Today).
**Prior handoff (surface map + hard rules):** [`daily-triage-today-workbench-HANDOFF.md`](./daily-triage-today-workbench-HANDOFF.md) — **read it first.**
**Plan of record:** [`daily-triage-FRONTEND-PLAN-VALIDATION.md`](./daily-triage-FRONTEND-PLAN-VALIDATION.md)

---

You are Claude Code in the Cycle Forge monorepo with **fresh context**.

## Mission

Today (`/`, the `MyDayWorkspace` region) was rebuilt onto `WorkbenchChromeHeader` +
`LedgerGridSurface` + a non-modal `RightRailHost` inspector on 2026-08-01. It is now a
first-class workbench spreadsheet **missing the chrome every sibling spreadsheet has**.
Bring it to parity with the updated SoT contracts, in four workstreams:

1. **Saved views in a left context sidebar** — the operator-defined named param combos,
   served from the `saved_views` store, in a resident rail beside the table.
2. **Scoped search in the chrome header** — the same collapsed-at-rest search every
   workbench mounts, wired to the grid's already-plumbed no-match answer.
3. **Top context selections / trailing controls** — the `WorkbenchTrailingCluster`
   skeleton (Sort → Fields → Import → Add) with honest absence, same as Receiving
   History / Catalog / Outbound.
4. **KPI display** — decide what Today's numbers actually are and mount them the way the
   bounded-host workbenches do.

Do them **in that order** and keep each one landable on its own — this is four reviewable
slices, not one commit.

## Read before writing code

- `.claude/rules/display/workbench.md` — **Tabs vs. saved views** boundary, the trailing
  cluster law, sticky docking (one sticky layer per scroll port), the four settled states.
- `.claude/rules/ui-design-system.md` — **Scoped search chrome** (collapsed at rest; the
  two documented always-open exceptions and why Today is not one of them).
- `.claude/rules/source-of-truth.md` — saved-view surfaces, grid column visibility + sort,
  right-rail modality.
- The prior handoff's **seven hard rules**. The one that keeps getting broken here:
  *compose the shell; never lift its markup.* A fork under a new filename is still a fork.

## Current state (what you are extending)

| Thing | Where |
|---|---|
| Chrome band (lane tabs + queue links in `right`) | `src/features/my-day/MyDayWorkspace.tsx` |
| Grid (descriptor, header, row) | `src/features/my-day/grid/*` |
| Column model SoT | `src/lib/my-day/my-day-grid-layout.ts` |
| Read model (feed → rows) | `src/lib/my-day/my-day-tasks.ts` |
| URL view state | `src/features/my-day/useMyDayView.ts` (`?scope=` lane · `?task=` selection) |
| Capabilities (all `false`) | `src/features/my-day/grid/my-day-grid-descriptor.ts` |

`/` already **owns** `q`, `view`, `scope`, `task`, `filter`, `open` and **carries**
`colsort` / `coldir` (`HOME_ROUTE_PARAMS` in `src/lib/routing/query-mode-routes.ts`). Check
that list before adding any param — most of what these four slices need is already declared.

---

## 1 — Saved views in the left sidebar

**Today has no context panel at all.** `home` is absent from both the
`SidebarContextPanel` route dispatch and `CONTEXT_PANEL_ROUTE_KEYS`, so the spine reserves
no column for it. Adding one is three edits plus a panel:

- `src/components/sidebar/SidebarContextPanel.tsx` → a `routeKey === 'home'` branch.
- `CONTEXT_PANEL_ROUTE_KEYS` in `src/lib/sidebar-navigation.ts` → add `'home'` (this set is
  the **declared contract** for whether the spine pins a 360px column; a route that renders
  a panel without being in it, or vice versa, is the bug the set exists to prevent).
- The panel itself — compose `SidebarShell` (`@/components/layout/SidebarShell`). It owns
  the column, the pinned header rows and the single scroll body. **It renders no search
  band** — that is deliberate and guarded (`sidebar-search-bar.guard.test.ts`); Today's
  search goes in the chrome header (slice 2).
- Check for a nav guard asserting route-key ↔ panel ↔ column parity (`/search` has such a
  test) and extend it rather than working around it.

**The saved-views store is a single SoT — do not fork it.**

- Hook: `useSavedViews({ storageKey, paramKeys })` (`src/hooks/useSavedViews.ts`). It is the
  one apply-to-URL + persistence implementation; a surface supplies only those two inputs
  and its own UI.
- Reference UI: `OutboundSavedViewsList` (`src/components/unshipped/OutboundSavedViewsList.tsx`)
  — the always-visible list (not the popover), which is what a resident rail wants. The
  other face is `TableOptionsMenu`. **Three UIs over one store is not a fork**; a second
  store or a second apply-to-URL path is.
- Storage is the polymorphic `saved_views` table, **not** localStorage (that split-brain was
  closed 2026-07-29). `storageKey` kept its name for call-site stability and resolves to a
  DB `surface` discriminator via `src/lib/saved-views/surfaces.ts`.

**⚠️ Adding a surface needs a migration — this is the ask-first item in this handoff.**
`SAVED_VIEW_SURFACES` must stay in **lockstep with the `saved_views_surface_chk` CHECK** in
`2026-07-29g_saved_views.sql`, or Today's first insert fails. So a new value (e.g.
`home_today`) means: the TS list + `GENERIC_SAVED_VIEW_SURFACES` + `STORAGE_KEY_TO_SURFACE`
**and** a new migration altering the CHECK (`.claude/rules/polymorphic-tables.md` for the
idempotent-DDL shape). There is a lockstep test — run it. Confirm the migration with the
user before writing it.

**`paramKeys` for Today** is the set that defines a view: `scope` (lane), `colsort`,
`coldir`, and `q` once slice 2 lands. Read `useSavedViews` for the apply semantics before
guessing — encoding order matters for its equality check.

**The boundary rule, which this slice exists to respect:** tabs are **system** lifecycle
states, saved views are **operator** facet combinations. Today's lanes (All · Do next ·
Assigned · Needs attention) are tabs. **Never ship a saved view that reproduces a lane** —
that is the duplication the rule names, and it desyncs the moment the lane's query changes.

## 2 — Scoped search in the chrome header

- Mount `ToolbarSearchToggle` in `WorkbenchChromeHeader`'s `search` slot — **collapsed at
  rest**, expanding on hover/focus/click or when the query is non-empty. Today's search
  *refines a list already on screen*, so it is not one of the two always-open entry-path
  exceptions (`/ops/photos`, `/search`).
- **There are two `ToolbarSearchToggle` files** — `src/components/ui/` and
  `src/design-system/primitives/`. `source-of-truth.md` names the DS primitive; Receiving
  History still imports the `ui` one. Find out which is canonical *before* importing, and
  if the `ui` copy is the retired half, say so rather than adding a consumer to it.
- Wire `?q=` (already owned by `/`) through `useMyDayView`'s construct-don't-copy pattern —
  every write re-states the keys Today keeps, so adding `q` means adding it there too.
- Filter in the read model (`my-day-tasks.ts`), not in the view. The grid already takes
  `searchEmptyMessage` / `isFiltered`; **"no data yet" and "no matches" are different
  answers** and Today already distinguishes them — keep that true when `q` joins `scope`.

## 3 — Top context selections (trailing cluster)

Compose `WorkbenchTrailingCluster` as the chrome's `trailing` prop — **Sort → Fields →
Import → Add**, with honest absence (render only what Today actually has). Reference:
`HistoryWorkspaceHeader` (`src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx`).

- Query/refine controls stay in `right`; **display** controls (sort, fields) go in
  `trailing`. Today's `right` currently holds the queue links — decide whether they stay
  there or move once real controls arrive, and say why in the docblock.
- **Fields is all-or-nothing** and is already scoped in the prior handoff: `TableId` +
  `TABLE_COLUMNS` entry + `hideKey`/`tier` on the fact columns + `fieldsMenu: true` in the
  capabilities bag **and its guard entry** + `GridFieldsMenu` mounted. Today deliberately
  passes **no `tableId`** to `useGridColumnVisibility` right now; do not half-wire it.
- Never stack a second sticky band inside the grid's scroll port to hold these — the
  chrome is a non-scrolling sibling and stays that way.

## 4 — KPI display

**Decide what Today's numbers are before mounting anything.** The queue counts are not
them: they are doors to other pages, which is why they are quiet links in the chrome, not
KPI heroes. A Today KPI answers "how is my day going" — candidates: overdue, unassigned,
needs-attention, closed-today. Bring the shortlist to the user rather than picking silently.

When mounting:

- Compose `KpiStrip` / `KpiTile` (`@/design-system/components/monitor`). Reference for a
  workbench-hosted attention strip: `OutboundKpiStrip` (`src/components/dashboard/OutboundKpiStrip.tsx`).
- **Gate on ALL sources together.** A band fed by two queries that each render as they
  settle reflows under the operator's cursor — `OutboundKpiStrip` holds one combined
  `isPending` for exactly this reason.
- A tile that filters uses `onOpen` + `active` (fill + inset ring, never a size shift), and
  the filter must be a **URL param**, not local state.
- KPI lives **in the body**, not the chrome. On a bounded-host lane the table owns its own
  scroll, so an in-body strip effectively stays put — that is deliberate, not a bug to fix.

---

## Verification

```bash
npm run verify
```

Green before done. It now includes a **Doc catalog drift** gate — run
`node scripts/portfolio-sot-sync.mjs` after any docs change. The tree routinely holds other
sessions' in-flight work: attribute a red gate to your own files before assuming it is
yours, and report pre-existing failures rather than inheriting them.

**No E2E covers this surface yet** — that is the first item in the prior handoff and it
matters more with every control you add. Either land `tests/e2e/my-day-today.spec.ts`
first (QA org, `--project=qa-desktop`) or extend it in the same slice; do not leave four
new controls verified only by hand.

Visual checks attach to the operator's dev server on **`:3050`** — **never start, restart,
or kill one**. A stubbed `GET /api/my-day` is the practical way to see populated lanes.

## Non-goals

Backend `TriageRow` / F1 categories · pin-tracking or messaging UI (F2/F3) · mobile
`/m/home` · mounting anything on Dashboard/Unbox (OQ1 is still unanswered) · a second
saved-views store, search engine, or table shell.

## Definition of done

- A `home` context panel exists, is registered in both the dispatch and
  `CONTEXT_PANEL_ROUTE_KEYS`, and lists saved views through `useSavedViews` — with the
  surface value added to `SAVED_VIEW_SURFACES` **and** the CHECK migration applied.
- Chrome carries a collapsed-at-rest search bound to `?q=`, and the grid answers no-match
  differently from no-data.
- `WorkbenchTrailingCluster` renders whatever Today genuinely has, Fields either fully
  wired or absent.
- KPI metrics agreed with the user, mounted in-body on a single settle gate.
- `npm run verify` green; work-log appended (`pnpm worklog`); the plan doc's Validation log
  updated with what landed and what stayed open.
