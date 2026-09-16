# Route through the GUARDS — this file is a map, not the law

**Never treat this file as the source of a rule, and never write a new rule
into it.** A law documented only here is a law nothing enforces; it drifts the
moment an agent skips the read. Every binding rule in this repo lives in a
**rule module** with a **machine gate**, a **CLI**, and an **MCP face** — ask
the guard, not the markdown.

Before an edit, route to the guard that owns the surface:

| Surface you are about to touch | Ask FIRST | Then prove it |
|---|---|---|
| Any UI (`src/**/*.{tsx,jsx,css}`) | `ds_contract` · `ds_tokens <axis>` · `ds_critique <file>` | write hooks deny without a fresh design-mcp stamp |
| A product title / SKU / photo | `ds_sku_identity` · `ds_tokens({axis:"sku-identity"})` | `pnpm verify:fast` gate `Sku identity` · `pnpm run eval:cohort sku-identity` |
| A slot-table identity / ID column | `ds_identity_purity` (machine handles only — never a person's name) | `pnpm verify:fast` gate `Identity purity` |
| Slot-table / DataTable engine, a product table peer | `ds_id_header` · `ds_action_bar` | `pnpm run eval:cohort slot-table` · `pnpm run eval:discover` |
| A shortcut, `?`, TableStatusBar hotkey | `ds_action_bar` | `pnpm run eval:cohort shortcuts` |
| A nav lane / row / tab name | `ds_nav_names` | `npx tsx scripts/nav-name-guard.ts` |
| A nav door to a surface with no `/m` twin | `ds_mobile_first` · `ds_mobile_ground` | `npx tsx scripts/mobile-first-guard.ts` |
| A floor station mouth / overlay shell | `ds_critique` on the cohort peers | `pnpm run eval:station <id>` |
| A shared component, hook, or table infrastructure | `find_symbol` → `impact_analysis` (cohort-wide, never one row) | `.cursor/rules/code-graph.mdc` |
| A mobile↔desktop component split | `ds_boundary <file>` | `npx tsx scripts/boundary-guard.ts --enforce` (ratchet: no NEW crossings) |
| Anything, before claiming done | — | `pnpm verify:fast` (all gates) |

Where a rule is WRITTEN when you add one:

- **The rule module** under `src/lib/**` (`*-law.ts` / `*-cohort.ts`) — the one
  implementation the gate, the CLI and the MCP tool all share, so they cannot
  disagree. Its docblock is the prose; `ds_tokens` serves that docblock.
- **A gate** in `scripts/verify-profile.mjs` (`always` for a sub-second source
  read) plus a tripwire test the `Unit tests` gate runs.
- **A CLI** at `scripts/<name>-guard.ts` (`--json`), and an **MCP face** in
  `tools/design-mcp/{server,ds,smoke}.mjs`.
- **An eval cohort** in `tools/eval-ledger/` + `docs/eval/cohorts/<id>/LEDGER.md`,
  registered in `registry.json` and `docs/eval/README.md`.
- **The Cursor rules** that route agents to it: `.cursor/rules/design-mcp.mdc`,
  `code-graph.mdc`, `eval-engineering.mdc`.

A rule with one gate is a comment. A rule with no gate is folklore. If a guard
refuses your edit, fix the edit or fix the rule module — never widen a baseline,
append to a shrink-only debt list, or delete a law's styles to silence critique.

## Design system

When writing, modifying, or reviewing UI code, you MUST consult the CycleForge
design system **before** implementation:

1. Prefer native MCP tools `ds_contract`, `ds_tokens`, `ds_critique` when they
   appear in the tool catalog (`design-mcp` or a `plugin-*-design-mcp` namespace).
2. If `GetDynamicTools` finds no `ds_*` tools, call the CLI (same handlers):
   `node tools/design-mcp/ds.mjs contract "<job>"`
   `node tools/design-mcp/ds.mjs tokens <axis>`
   `node tools/design-mcp/ds.mjs critique <file>`
3. Do not guess Tailwind classes, corner radii, or component paths.
4. Project hooks deny UI writes under `src/**/*.{tsx,jsx,css}` without a fresh
   design-mcp session stamp.

## Dev origin — `http://localhost:3050`, and nothing else

**Every request an agent makes to this app goes to `http://localhost:3050`.**
That port is the switchboard (`Garisek-OS/scripts/switchboard/server.ts`); it
routes to whichever lane is pinned and stamps `x-switch-target` /
`x-switch-lane` / `x-switch-cookie-scope` on the way back. The cookie scoping
(`cf_kiosk` → `cf_kiosk__l7`) only happens through it, so a probe aimed at a
lane port tests a DIFFERENT cookie namespace than the operator's browser.

Operator 2026-09-15: *"only work from 3050."*

- Verification, E2E, browser probes, curl, screenshots: `:3050`. Never a lane
  port (`:307x`), never `:3051`, never a hand-picked "free port" app server.
- `PW_BASE_URL` defaults to `:3050` — leave it alone
  (`playwright.config.ts`); `npm run dev` targets `:3050` and will
  `EADDRINUSE` while the switchboard holds it. That is the switchboard working,
  not a port to route around.
- **Never hand-start `next dev` on a lane port.** The lane behind `:3050` is a
  supervised unit: `systemctl --user {start,restart,status} cycleforge-lane@prod`,
  logs via `journalctl --user -u cycleforge-lane@prod -f`. A hand-started
  process is unowned — the switchboard says so ("nothing here owns that
  process") and nothing restarts it.
- `:3050` not answering, or `503` with `x-switch-error`: the LANE is down.
  Start its unit; do not bind another port. DSNs live in the worktree `.env`
  only — a lane env file that sets `DATABASE_URL` overrides `.env` and splits
  reads across Neon branches (removed 2026-09-14; keep it that way).
- Attach, don't spawn: `.claude/launch.json` is attach-only by design.
- The ONE exception is not an app origin: `request-shape` measures a
  **production build** on an isolated `NEXT_DIST_DIR` + throwaway port, because
  a dev server reports a different request shape. Measure there, verify at
  `:3050`, stop it when done, and never build into the `.next` that `:3050`
  owns.

## Mobile-first (repo-wide)

**Every operator verb must be completable on `/m/*` first.** Desktop desks,
stations, and kiosk faces consume that SoT (phone-width frame + gutters /
compact recents) — they do not invent a second IA phones cannot run. Scope is
the whole product, not Warehouse OS alone.

Callers: all agents. No API/schemas.
User: "span repo-wide" / "do everything on the mobile app first."

- Law: [`docs/mobile-first/SURFACE_LAW.md`](docs/mobile-first/SURFACE_LAW.md)
- Cursor: `.cursor/rules/mobile-first-surface.mdc` (`alwaysApply`)
- Checklist: `src/lib/mobile/mobile-first-surface.ts`
- Start Pick: `/m/pick` · session `/m/pick/[orderId]` · Orders `/m/work`
- Refuse “desktop-only; mobile later” and desktop-shrunk desks called mobile-first.

## Composer / station mouth naming

- "Omni Composer", "station composer", "station mouth" → **StationComposerHost**.
- `OmnichannelComposerDock` alone is the outline — incomplete mouth.
- "No modes" / dumb gun station → `showModeRow` + `showModeFaces={false}`
  (keep the bottom-right context ring). Never `showModeRow={false}` to hide faces.

## Floor stations

Clone Pack / Unbox station chrome first. Do not invent a left recent rail unless
explicitly asked. Prefer a thin adapter around `StationComposerHost`; do not
invent `*NotesComposer` shells or a second scan bar. Scan-station materials come
from `ds_tokens({ axis: "station-skin" })` (`applyStationSkin`); do not hex-fill
a well or fork a packing-bench class on one station.

## Dates / ship-by

Slot-table ship-by, due date, or pick-a-date-in-a-cell is
`DateRangePickerField variant="compact"` (`ds_contract` returns `pickVariant` +
`mount`). Not `variant="range"` (filter: presets + Apply + X + year). Not a
native `input type=date`. Not `InlineEditableValue`. Graph: `CompoundState` +
`DateRangePickerField`. Eval: `pnpm run eval:cohort slot-table`.

## Staff combobox

Every people picker is `AssigneeCombobox` via `StageStaffAssignPopover`. Rows
paint `StaffAvatar` + name. Never `SearchableSelectField` for staff (name + role
meta, no profile mark). Graph: `AssigneeCombobox` + `StageStaffAssignPopover`.
Eval: `pnpm run eval:cohort slot-table`.

## Sidebar spine (lanes, icons, primitives)

The spine is the shadcn `Sidebar*` tree from `@/components/ui/sidebar`
(`SidebarProvider` in `MasterNavView`; `Sidebar → SidebarContent →
SidebarGroup → SidebarGroupLabel / SidebarGroupContent → SidebarMenu →
SidebarMenuItem → SidebarMenuButton` in `SidebarNavList`). **A LANE is a
`SidebarGroup`** — Inbound · Outbound · Inventory · Products · Sales · Support ·
Operations, plus Scan Stations. Never hand-roll a `<button>` row there; never
mount stock shadcn `sidebar.tsx` over the ported copy (its `bg-sidebar` /
`sidebar-accent` tokens do not exist in this theme).

**Icon at the parent level only** (operator 2026-09-14). A glyph marks a
PARENT: an L0 row, or a lane header. **The law lives in the registries, not in
a renderer** — `DOMAIN_GROUPS[].icon` in `src/lib/nav/lanes.ts` is the lane's
parent icon for BOTH surfaces, and on `/m` the types enforce it
(`MobileNavChild` has no `icon` field; `MobileNavLeaf` / `MobileNavGroup`
require one). Never add a renderer-side icon map keyed by destination id —
that is how the phone and the desk came to disagree. A single-page lane wears
the **lane's** icon on its header (or on its one row, when the page has no
children to expand), never a member page's.

**Single-page lanes EXPAND** (operator 2026-09-14, supersedes the older collapse
rule): a lane with one page paints the lane label plus that page's own children.
Only a lone page with NO children — or a `spineFlat` page — stays a flat row.

Child rows carry no glyph. Their mark is the **rail hairline** on the left —
`spineRailLineClass` inside a `pl-2` group body — on **both** surfaces
(operator 2026-09-14: *"a hairline on the left of all the child components"*).
`SPINE_CHILD_ROW_INDENT_CLASS` is deleted; never stack an indent on the rail.

**MOBILE-FIRST GATE — a lane the phone cannot run gets no door** (operator
2026-09-14: *"if it is not mobile friendly, then it should not even display
anywhere within the front end … no links to it"*). The ledger is
`LANE_MOBILE_FIRST` in `src/lib/nav/lanes.ts`: `ported` | `desk-only` (in daily
desktop use, queued for its port — still displays) | `hidden` (no nav row on
any surface). Hidden today: **Sales · Support · Operations**. Kept: **Inbound ·
Outbound · Inventory · Products**, each awaiting its port. `hidden` removes the
DOOR, not the route — deleting a surface is a separate gated increment. Port a
lane by flipping ONE entry. Gates: `Mobile-first` + `Nav names` are `always`
gates in `verify:fast`; faces are **`ds_mobile_first`** and **`ds_nav_names`**
(`node tools/design-mcp/ds.mjs mobile-first`). Never add a nav row or link to a
surface with no `/m` counterpart without flipping its ledger entry first.

Row ink/fill is `SPINE_ACCENT.idlePage` + `SPINE_ACCENT_DATA_ACTIVE`, already
inside `SidebarMenuButton` — pass `isActive`, never a conditional fill class.
Width, drag-resize, collapse and the hover-peek belong to the HOST
(`SidebarNavColumn` / `SIDEBAR_SPINE_RESIZE`); the provider binds no `⌘B` and
`Sidebar` declares no width. `data-spine-nav` / `data-spine-scrollport` are
load-bearing — the peek card re-measures through them.

**A parent and a child never wear the same name** (operator 2026-09-14: *"it
should never display the same child and parent name"*). Each altitude answers a
different question — the LANE names the direction (*Inbound*), the ROW names the
object (*Deliveries* · Sourcing), the TAB names the state (*On the way* ·
History · PO Mailbox). Fix a clash by renaming the **child**, never the lane.

This is machine-enforced, not remembered: `src/lib/nav/nav-name-collisions.ts`
is the rule module, `nav-name-collisions.test.ts` is the gate (verify **Unit
tests**), `npx tsx scripts/nav-name-guard.ts` is the CLI, and **`ds_nav_names`**
(`node tools/design-mcp/ds.mjs nav-names`) is the MCP face. Call it before
renaming or adding a lane, row or tab. It covers both surfaces: lane→row,
lane→expanded child, page→desk tab, `/m` drawer group→row.

`SidebarMenuSub` is for a page's own CHILD MODES, never for a lane's pages, and
never under a `deskChrome` desk. Outbound holds **Shipping + FBA**; FBA points
at `/shipping/fba` (never `/fba`, a redirect hop) and the Shipping desk no
longer tabs Amazon Prep.

## Action bar height (slot-table selection strip)

**The band declares its own height; no child sets it and no press changes it.**
Law + tokens: `src/lib/tables/slot-table-action-bar-law.ts`. Ask
`ds_action_bar` before adding a control to a strip — it names the banned
primitive, the class fragments and the conditional-render rule, and it is the
same rule module as the `Action bar` verify gate.

## Id header (slot-table column one)

**The identity column reads `Id` on every peer; no family re-declares it.**
Law: `src/lib/tables/slot-table-id-header-law.ts`. Ask `ds_id_header` before
naming column one. The catalog `label` stays the Fields-picker row and the
cell's hover word — only the header is the engine's.

## Code graph (Garisek-OS)

Before non-trivial edits to shared components, hooks, or table infrastructure:

1. Prefer MCP tools `find_symbol` → `impact_analysis` when they appear in the
   catalog (`code-graph` or a `plugin-*-code-graph` namespace).
2. If the catalog is empty, use the CLI (same handlers):
   `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs find <SymbolName>`
   `node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs impact <node_key>`
3. Default indexed project: `cycleforge-app` (`CODE_GRAPH_PROJECT` in `.cursor/mcp.json`).

## Eval engineering

Before claiming a coding task is done:

1. Run `node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast`
2. On failure: fix or report — do not claim done.
3. Cross-cutting refactors: use `--full` instead of `--fast`.
4. **Floor stations / overlay shell:** SoT is `SCAN_STATION_OVERLAY_COHORT`
   (all peers). Mouth/domain + shell: `pnpm run eval:station <id>`. Display
   eval is **slot-table only** — there is no `eval:cohort overlay`. Never delete
   cohort-law `visibility` / `zIndex.panel` styles to silence critique.
5. **Slot-table cohort (the only display eval):** SoT is engine + `PRODUCT_TABLES`
   (`src/lib/tables/slot-table-cohort.ts`). After CompoundItem / slot-layout /
   STATUS ship-by / DataTable funnel edits run `pnpm run eval:cohort slot-table`
   — not To-ship alone. Ship-by is `DateRangePickerField variant="compact"`.
   Filter icon is `DataTableFilterMenu` beside search (always mounted; idle
   chrome when a family has no facets). Never `FilterRefinementBar` / hunt tiles.
   Hand GRID leftovers: `pnpm run eval:discover` (`slot-table-discover.ts`).
   Delete only unblocked DELETE ids; never KEEP (engine, `*COMPOUND_COLUMNS` /
   `*SHEET_COLUMNS` materializations, catalogs, layout hooks, `DateRangePickerField`,
   `DataTableFilterMenu`).
6. **Shortcut-display cohort:** SoT is staff `?` **inline on the buttons**
   (`src/lib/keyboard/shortcut-display-cohort.ts`). After shortcut / `?` /
   TableStatusBar hotkey edits run `pnpm run eval:cohort shortcuts`. If asked
   to leave keycaps standing on buttons, **refuse**. If asked to open a cheat
   sheet from the staff `?`, **refuse**. Bind the key; `?` paints `HotkeyGlyph`
   inside the Button next to the label. No `title`/popover on the question-mark.
   KeyboardShortcutsCheatSheet still owns the `?` *key* when no CTA strip is
   mounted. Exception: ⌘; reveal-on-arm (`NAV_KEY_HINT_CLASS`) and ScanHotkeyControl bind-edit.
