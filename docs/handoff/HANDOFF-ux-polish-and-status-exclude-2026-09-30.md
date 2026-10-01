# HANDOFF — UX/UI polish pass + global left-sidebar "Exclude status" filter (owner 2026-09-30)

Paste this whole file as the prompt. It is self-contained.

## Goal

Two jobs, one session:

1. **Global "Exclude status" filter in the left (contextual) sidebar.** On
   every triage desk that paints status chips, the operator can HIDE one or
   more statuses (e.g. hide Closed, hide Cancelled, hide Arriving) from the
   list. It is the inverse of the chips right of the count: chips = "show only
   these"; Exclude = "never show these". Built ONCE in the sidebar and fed by
   each desk's existing status vocabulary — never a per-desk fork.
2. **UX/UI polish across the record + list grammar** that the 2026-09-30 repair
   record work exposed (list below). Fix what is cheap and shared; report the
   rest as owner decisions.

## Working rules (binding)

- Shared worktree with other live sessions; a large uncommitted diff is normal.
  Never revert files you did not change; re-read right before each edit; never
  rewrite whole shared files. Shared design files (touch additively, list the
  lines you changed): `RecordCard.tsx`, `TriageSelectBar.tsx`, `TriageRow.tsx`,
  `DeskRecordViewSwitch.tsx`, `DeskStageOverlay.tsx`, `DeskPageChrome.tsx`,
  `pinned.json`, `RecordItem.tsx` (another session owns it — it was rewritten
  under the last session).
- Dev origin `http://localhost:3050` only (AGENTS.md §1). Never start another
  server. Playwright: import from `@playwright/test`, storageState
  `tests/.auth/admin.json`, throwaway scripts `tests/_tmp-*.mjs`, delete after.
  Screenshots to `/tmp/ux-polish/`.
- Real dogfood data (org `00000000-0000-0000-0000-000000000001`). Prove writes
  on ONE record and put it back. The last session's test ticket is repair 4894
  (#10089, Roxann Fenn, Dropped off, `Pending Repair`, notes NULL, serial
  `0469AE`, label not printed) — keep it in that state.
- Before any new or reshaped UI: `skill://new-ui-surface`, then
  `node tools/design-mcp/ds.mjs contract "<job>"`; after: `ds.mjs critique
  <file>`. `ds_critique`'s "imports none from the design system" is a known
  text-match false positive when a file imports only `@/design-system/primitives`
  — report it, don't restructure for it. Routes: `skill://new-route`. Pure lib
  tests: `skill://domain-unit-test` (`npx tsx --test <file>`).
- No shims, no aliases, no re-exports; clean cutover. Done = `pnpm verify:fast`
  green (report ambient reds from other sessions separately). Do not commit or
  deploy.

## Part 1 — Exclude status (the feature)

### What exists (read these, nothing else first)

- Sidebar controls schema: `src/lib/nav/context/schema.ts` — `NavControlsSchema`
  (`staff`, `dates`, `dateRanges`, `sort`, `choices` — single-choice, writes one
  param) and `navControlParams` (every param a desk's controls own; Reset
  clears them; the route must declare them).
- Sidebar renderer: `src/components/sidebar/contextual/NavFilters.tsx`
  (choices, sort, saved views with the Shift-digit hotkeys, facets).
- Per-page declarations: `src/lib/nav/context/pages.ts` (26 `controls:`
  blocks; repair's is `REPAIR_CONTROLS` ≈ l.347 — a `Status` choice on `?tab=`).
- The list side: `src/design-system/components/triage-card-list/triage-list-state.ts`
  — `useTriageUrlState` (chips in the URL, `statusParam`, `statusSelect`
  many|one) and `useTriageCut().filterBands(bands, groupKey, rowStatusKeys)`,
  the ONE place a desk's bands are narrowed before the record cursor (J/K walk
  only what is painted).
- Each desk's status vocabulary: its triage view in `src/lib/triage/views/*.ts`
  (`chips: { owner, param }`) and its chip builder (repair:
  `src/lib/repair/repair-status-chips.ts` — stages Arriving · Still needs work
  · Completed · Closed · Other).

### Design (decide the details, keep the shape)

- One URL param for every desk, e.g. `?hide=closed,other` (comma list of the
  desk's chip keys; unknown keys ignored). URL = reload / share / saved view
  carry it; add it to the saved-view param keys (`SAVED_VIEW_PARAM_KEYS`) so a
  saved view can mean "everything except Closed".
- Schema: add ONE optional `exclude` block to `NavControlsSchema` (label,
  param, where the options come from) and include its param in
  `navControlParams`. Options are the desk's own status keys + labels — derive
  them from the triage view / chip builder, never retype a list in
  `pages.ts`. If the sidebar can't reach the chip labels statically, have the
  list publish them (the way facets / the record cursor are published) — pick
  the smaller change and say why.
- Sidebar UI: a multi-select "Exclude" block under Status in `NavFilters`,
  each status as a toggle with the desk's tone dot, a count of what it hides,
  and a one-press "Show all". Keyboard reachable. Ask `ds_contract` for the
  multi-toggle chip/checkbox primitive the sidebar already uses — do not
  hand-roll one.
- List: `filterBands` drops rows whose status key is excluded (exclude wins
  over an include chip for the same key). The status chips right of the count
  keep counting over everything loaded, but an excluded status's chip reads
  as hidden (or disappears — decide, and match it on every desk).
- "Global" = every triage desk that has status chips gets it by declaration;
  a desk opts out only if its chips are `statusSelect: 'one'` (the chip IS the
  server scope, e.g. Exceptions' `?kind=`) — list which desks you skipped.
- Tests: pure — parsing `?hide=` (unknown keys dropped, order stable), and
  `filterBands` with include + exclude combinations. A route-params regression
  row if the param hygiene test pins declared params
  (`src/lib/routing/route-params.test.ts`).

### Acceptance (Part 1)

1. `/repair` (All repairs): Exclude → Closed hides every closed ticket; the URL
   carries `?hide=closed`; reload keeps it; J/K skips hidden tickets; Show all
   restores. Screenshot before/after.
2. The same control, unchanged code, works on at least two other desks with
   status chips (pick from `src/lib/triage/views/*` — e.g. incoming pipeline
   `?state=`, replenish `?rstatus=`). Screenshots.
3. A saved view created with an exclusion re-applies it via Shift + digit.
4. Opening a record whose status is excluded (a deep link `?openRepair=`) still
   opens it — exclusion narrows the list, never blocks a direct open.

## Part 2 — UX/UI polish (observed 2026-09-30; fix shared, report the rest)

Record (`src/components/repair/record/*`, the inbound twin
`src/components/receiving/record/*`, shared `record-ledger/*`):

1. **Header verbs collapse to bare icons** until the header is very wide
   (`RecordActionStrip face="header"` rungs). At 1440px the repair record shows
   Mark done + 8 unlabeled icons. Make the icon-only state discoverable
   (hover label already exists? verify) or relax the rungs so the first 3–4
   verbs keep labels at 1440. Shared component — measure inbound/outbound too.
2. **Status rail noise:** steps behind "now" that were never stamped read
   "Not recorded" on every older ticket (repair 32 shows five in a row).
   Consider collapsing unrecorded past steps or a quieter face; keep inbound
   and repair on one rule (`StepRail` + each model's step builder).
3. **Status history duplicates** the Fulfillment rail's who/when and grows
   with every toggle. Decide: keep as-is, collapse to the last N with "Show
   all", or move behind a Timeline verb (inbound's pattern: `Timeline` panel
   verb). Owner call — recommend one.
4. **Alerts card** ("2×1 label not printed") sits between photos and
   customer; check it against inbound's alert placement and tone.
5. **390px on desk routes**: the desktop shell keeps the left sidebar open at
   phone width, squeezing the record to half the screen. Phones should be on
   `/m/*` (SURFACE_LAW), but the desk shell should still collapse its sidebar
   below a breakpoint — find the shell owner, propose, don't hand-roll.
6. **Product row** (`RecordItem`, owned by another session): the repair row
   has no photo upload because it has no `skuCatalogId`; confirm with the
   owner whether repair products should take a catalog photo.
7. **Print receipt** is disabled with a reason when the ticket has no counter
   visit. `src/lib/repair/repair-intake-receipt.ts` builds intake receipt props
   for the kiosk sheet, but there is no server-rendered print route for it.
   Decide: add `GET /api/repair-service/[id]/receipt` rendering from
   `repair_service` (reuse `visit-receipt-html.ts`'s renderer), or keep it
   disabled. Owner call.
8. **Mobile parity**: `/m/rs/[id]` still reads its own stack
   (`src/components/mobile/repair/*`). The record-grammar plan wants it to read
   `repairRecordModel` (`src/lib/repair/repair-record-model.ts`) — status
   points, verbs visibility, SLA wording identical on desk and phone. Scope
   it; do it only if it fits after Part 1.
9. **Consistency sweep** (cheap, shared): sentence case on every record group
   title and verb; the same "No X yet" empty voice; money always
   `RECORD_PRICE_CLASS`; ids always full, never last-8, no colour dot (owner
   2026-09-30 rule for order # / tracking #) — grep record files for
   `OrderNumberIdentity` / `TrackingIdentity` on record bodies and list them.

For each item: fixed (file, what, screenshot) or decision needed (options +
recommendation). Do not silently skip.

## Report

- Part 1: files, schema change, which desks got Exclude and which were skipped
  and why, tests, screenshots.
- Part 2: per item as above.
- Shared-file lines changed. `pnpm verify:fast` result. Open decisions last.
