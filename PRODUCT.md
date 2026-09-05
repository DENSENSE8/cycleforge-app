# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Warehouse and fulfillment operators (floor and desk) at a Cycle Forge tenant. USAV is the first dogfood tenant, not the product. They work a shift on Home (`/`) and need a project-task board that keeps assignment, triage, and staff pings inside Cycle Forge so they do not bounce to Discord or Slack.

## Product Purpose

Cycle Forge is a multi-tenant B2B warehouse / fulfillment operating system. Home → Tasks is the org-wide **project task desk**: native Cycle Forge projects (`ops_plans` / `ops_plan_tasks`), not a Zoho Projects import. Staff assign people to exact projects and triage tasks the same way they triage To-ship.

Success: an operator can create a project, add a task, assign a coworker, mark it done / in progress / canceled from the left Morphing menu (keyboard included), drop a row onto Ask for AI context, and ping `@Name` in the left composer without leaving the page.

## Positioning

The desk reuses the Kinetic Ledger DataTable + To-ship Morphing manifold + StationComposerHost mouth. Personal `staff_todos` stay on the header pace-and-next chip. Daily / Today stay their own Home modes. This is not a Zoho Projects clone in chrome; it is Cycle Forge’s collection engine pointed at org projects.

## Constraints

- Native Cycle Forge projects. No Zoho Projects API.
- Org-wide board. Default filter **assigned to me**; project filter in `DataTableFilterMenu`. Anyone with `operations.plans.view` (and claim/manage as today) can triage.
- Do not replace Daily or Today. Tasks remains the Home desk tab (`/?mode=tasks`).
- One DataTable (`tableId: tasks`). No new `*GridRow` / `*_GRID_COLUMNS`.
- Selection verbs on the **left Morphing gutter**, not DataTable `selectionActions`. Clone To-ship; do not change `MorphingRowActionMenu` (typed to `ShippedOrder`).
- Center Lock: row click opens the project on `DeskStageOverlay` (`recordPlane.kind: 'stage-overlay'`). No `detail:*` right rail, no Dialog as the record plane. Gutter checkbox still opens Morphing.
- Composer stays the existing left `DeskComposerAskLane` / `StationComposerHost`. Dumb faces stay off; Staff is `modeRowLeading`, not a new `STATION_COMPOSER_MODES` id.
- Staff `?` paints letters on buttons; no standing keycaps; no cheat sheet from the table-foot `?`.
- Every painted DATA header is click-to-sort. Chrome only: select / actions / `_fill` / `thumb`.
- Do not run `db:migrate` from the agent; hand off the members migration.

## Terminology

- **Project** — an `ops_plans` row. Staff belong via `ops_plan_members`.
- **Task** — an `ops_plan_tasks` row on the project’s default ADMIN / “Tasks” phase (or the first phase if one already exists).
- **Morphing** — left-of-row action menu opened from the select gutter (same manifold event as To-ship).
- **Ask** — assistant mode on the desk mouth. Dropped table rows become working-set context.
- **Staff** — composer face for `@mention` ping + assign. Not Ticket Cc.

## Workflows

1. Open Home → Tasks (`/?mode=tasks`). Default: my open tasks.
2. Filter Everyone / a project from the funnel beside search. Picking a project opens it on the stage. Lanes: Open / Done / Canceled.
3. Click a row (or press Enter) → project details on the stage: rename, People, this task’s status and assignee. The table stays mounted underneath and is not filtered away.
4. Tick the gutter checkbox → Morphing on the left: Done, In progress, Open, Assign, Ping, Cancel (+ keyboard).
5. Drag a row onto Ask → it stays in the working set; Ask answers with that task as context.
6. Switch Staff on the mode row, type `@Name` and a note, Enter → ping that staffer (and assign the selected/dropped task when one is in play).

## Accessibility

Operate on a dense warehouse desk: keyboard triage matching To-ship Morphing, visible focus rings, filter trigger names the active facet, no color-only state.

## Brand commitments

Incumbent Kinetic Ledger / Warehouse OS visual world. Extend Home Tasks; do not invent a second identity for this desk.
