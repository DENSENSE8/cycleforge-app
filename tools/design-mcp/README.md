# design-mcp — CycleForge

Serves this repo's design system to any MCP-capable agent via `.mcp.json` at
the repo root (a real file; the old `.cursor/mcp.json` symlink is gone). A new
agent session must show `design-mcp` in its MCP list and must have
`ds_contract` / `ds_tokens` / `ds_critique` in its tool catalog.

| Question | Wrong answer it reaches for | Tool |
|---|---|---|
| What already exists for this job? | writes a new primitive | `ds_contract` |
| What values may I use on **one** axis? | `#1a1a1d`, `text-[13px]`, `axis: "all"` | `ds_tokens` (`axis` required) |
| Why is this component bad? | rewrites it from scratch | `ds_critique` |

## Mobile operational preflight

The `mobile-surface` contract preflight classifies the surface before suggesting
paint. It distinguishes a primary record from a linked-record quick look, edit,
picker, confirmation, or physical job, then retrieves the existing record,
sheet, dock, capture, and evidence components.

The governing interaction rule is **Fitts's Law** (also indexed as “Fits Law”
for operator-language retrieval): acquisition gets faster as a target grows and
travel distance falls. On mobile this means a visually compact icon can still
own a 44px-or-larger hit area; frequent verbs stay in the stable thumb region;
and one operation never starts at the top and requires a distant bottom commit.
Compact means less exposed information, not smaller controls.

Reference contract probes:

```bash
node tools/design-mcp/ds.mjs contract "Fitts law Fits Law mobile add photo camera icon bottom thumb target" --limit 8
node tools/design-mcp/ds.mjs contract "mobile linked photos preview view all full screen delete photo evidence gallery" --limit 8
node tools/design-mcp/ds.mjs contract "mobile scan destination manual fallback move stock location" --limit 8
```

The first must lead with `IconButton` / `DetailDock`; the second with
`MobileSwipePhotoViewer`; the third with `MobileCaptureWindow`. These results
are behavioral routing, not a license to add a parallel component. A primary
record remains `DetailHubScreen`; the Radix bottom `Sheet` remains a scoped quick look or
verb form; `DetailDock` owns the action floor.

### V2 compositions are the reference, not examples

The catalog also walks the proven V2 compositions. A future implementation
must retrieve the composition for its domain before reaching for atoms:

| Job | First contract result |
|---|---|
| Mobile application frame and navigation | `MobileV2Shell`, `MobileV2AppSwitcher`, `MobileV2TopBar` |
| Compact Allocate queue | `MobileV2FulfillmentOrders` + `mobile-v2-allocate-layout` |
| Location-first stock | `MobileV2StockLocations` + `MobileV2LocationRecord` |
| Scanner with visible history | `MobileV2ScanStation` + `MobileV2ScanRecentList` |
| Receiving LPN / QC | `MobileV2ReceivingCartonRecord` |
| Order documents | `MobileV2OrderPaperworkSheet` |
| Multi-photo evidence | `MobileNativePhotoCapture` + `MobileContinuousPhotoCamera` |

These compositions carry the product decisions that cannot be reconstructed
from a generic “mobile friendly” prompt: V2 is the source of truth; Allocate is
compact and high-volume; status controls float on a transparent sticky stacking
context; stock starts from physical location; scan history remains above the
capture surface; actions end in the thumb zone; primary records use routes;
linked quick looks and verb forms use scoped sheets; evidence preview is not a
destructive management surface.

The pre-write profile has domain-specific rules for navigation, fulfillment,
stock, scanning, receiving, paperwork and photo capture. A matching file's
first write is paused until the live MCP has answered. The receipt lasts 30
minutes—long enough to admit the immediate retry, short enough to refresh the
contract when a long-running session returns to the same file. Clients without
a pre-write hook cannot be forced by a stdio MCP server; for them, calling
`ds_contract` before the first UI edit remains mandatory workflow.

Replay the historical product prompts end to end:

```bash
node tools/design-mcp/mobile-operational-smoke.mjs
```

This invokes the public CLI for every case, so it tests the live MCP engine,
profile, catalog walk, pin merge and ranking together. It is not a JSON-file
existence test.

## Data-table lane: decide, declare, then check the ledger

Every list is one of three faces: a card list (`TriageCardList` + `RecordCard`,
declared per nav view by a `TriageViewDecl`), a keep-sheet (`DataTable` with a
direct `TableSurfaceBinding`), or a record surface. Owner 2026-10-03: a port
off a retired grid becomes a card view, mobile V2 first, never a compound grid.

| Question | Tool |
|---|---|
| Which face fits this page? | `ds_display_method` — pass the page's facts (`steadyRows`, `comparedFacts`, `verb`, `surface`, optional `shape`, `rowsPerScreen`, `urgencyBands`, `admin`, `statusGroups`; verb `monitor-pipeline` = watch several statuses together). Candidates include the status column board (`ColumnBoard`). Returns the ranked candidates, the confidence, and the decision: implement, implement and name the runner-up, or ask the operator with the menu. The formula is `src/lib/tables/display-method.ts`. |
| Does every card paint what its view declares? | `ds_card_views` (no arguments) — each view's `slots` (identity, channel, person, quick look), `status` kind and facts, checked against its adapter. Same module as `triage-views.test.ts`. |
| Is this file, or what it imports, on the delete list? | `ds_ledger` (`file_path`) — `retired-path` / `retired-source` are violations (the same needles fail verify:fast); `on-delete-list` / `imports-delete-list` are advisories that name the replacement. |
| Which existing component does this table job? | `ds_contract` — the catalog walks `record-card`, `record-action-strip`, `triage-card-list` (incl. `triage-view`), `AdminTable`, and the table engine's `DataTable`, `DataTableExportMenu`, `table-surface-binding`. |
| Where do filters, sort, date/time, staff, facets, views and modes go? | `ds_contract` — any intent naming a filter, sort, chip row, toolbar, facet, time window, segmented control, direction split, feed, board, list page or brief leads with `placement.{law, briefBlock, lead}` (profile `placement`; `lead` = `NavFilters`, `ContextualSidebar`, `ListPageRecipe`), ahead of the score-ranked `matches` for the job itself. Paste `briefBlock` verbatim into every brief. The profile rule `filter-controls-outside-sidebar` (`adjudicator.rules`) blocks a page-body write that writes list filters to the URL and mounts a filter control; `ds_critique` reports it over the whole file. |

The `data-table-surface` preflight pauses the first write to table files
(`tables/**`, the view declarations, `record-card/**`, `*Table*`, `*CardList*`,
`*Ledger*`, `cards/**`) until the contract has answered. Domain rules
(mobile V2, products, inbound receiving) are listed first and keep their own
files.

```bash
node tools/design-mcp/ds.mjs display-method '{"steadyRows":40,"comparedFacts":6,"verb":"scan-and-act","surface":"desk"}'
node tools/design-mcp/ds.mjs card-views
node tools/design-mcp/ds.mjs ledger src/features/task-board/TaskTable.tsx
node tools/design-mcp/data-table-smoke.mjs
```

`data-table-smoke.mjs` replays the lane's real jobs (display decision, port
off a grid, stock card slots, select gutter, selection and danger verbs,
keep-sheet wiring, export, paging, empty state) through the public CLI, then
exercises `ds_ledger` and the preflight routing.

## Screen budget lane: declare, then measure

Owner 2026-10-03: "this amount of information at one time displayed at the screen."
`ds_disclosure` checks every declared first screen (`src/lib/disclosure/surfaces.ts`)
statically, or — given `{surface, params}` — opens it live at :3050 (390×844) and returns
the DELETE · SIMPLIFY · MOVE · ENLARGE lists with fix recipes. Same module as verify
`Disclosure`; the `declutter` skill turns an owner instruction into a declaration edit and
drives the screen to zero findings. Record chrome it expects: `IosBar` + `IosMoreMenu`
(`src/components/mobile/ios`, Apple HIG patterns).

```bash
node tools/design-mcp/ds.mjs disclosure
node tools/design-mcp/ds.mjs disclosure task-sheet id=16127 --dark
```

## Route & vocabulary lane

Owner 2026-10-03: the MCP houses the exact routing and vocabulary. `src/lib/nav/route-tree.ts`
is the one source for Warehouse URLs, nav names and domain words; `src/lib/nav/route-tree-law.ts`
holds the checks and queries, and `scripts/route-tree-guard.ts` is the only face:

- `ds_route {path|file|intent}` → `route` (node, ancestry, live path, phase-2 target, page,
  builder export) or `ask-operator` (lane menu; ask, never invent).
- `ds_vocabulary {word?}` → term + `via: term|banned` (banned → paint the canonical label);
  unknown → `found:false`, ask the operator.
- `ds_route_tree {lane?}` → the nested tree.
- Gate: verify `Routes` (unregistered page, name clash, menu owner, banned word, literal-path
  baseline `scripts/route-tree-literals.baseline.json`, shrink-only; `--write-baseline`).
- Preflight: `route-surface` (/m pages, the tree, the phone menu). Digest: the SessionStart hook
  prints `route-tree-guard.ts --digest` (≤25 lines).

```bash
node tools/design-mcp/ds.mjs route '{"intent":"print a bay sticker"}'
node tools/design-mcp/ds.mjs vocabulary zone
node tools/design-mcp/ds.mjs route-tree warehouse
```

## When the agent catalog is empty

Some harnesses lease project MCP servers without surfacing their tools. The CLI
runs the same handlers:

`node tools/design-mcp/ds.mjs contract|tokens|critique …`

`ds_contract` remains available as an explicit lookup. In addition, the shared
agent-contract door reads this repo's `contractPreflight` profile: the first
write in a session to a declared navigation/page surface queries the live MCP,
returns the matched patterns, and pauses the write. The retry carries a
six-hour, file-scoped receipt. This makes the existing pattern available before
implementation without turning design prose into a source-text heuristic.

## Just-in-time nudge for visitors without pre-write hooks

`new-component-nudge.mjs` runs as a Claude `PostToolUse` hook
(`.claude/settings.json`, matcher `Write`). When a write CREATES a `.tsx` under
`src/{components,app,design-system,features}` that exports a rendering
component, it adds three `ds_contract` matches plus up to three unpinned
code-graph hits to the agent's context — one line each, once per file per
session. Edits, tests and existing files cost nothing. It never blocks: new
components are welcome while the codebase is young; the nudge only makes the
duplicate visible at the moment it would be written. Agents without Claude
hooks get the same path from the `new-ui-surface` skill
(`.claude/skills/new-ui-surface/SKILL.md`).

## Naming (pinned)

- Omni Composer / station mouth → **StationComposerHost**
- Raw `OmnichannelComposerDock` alone → incomplete mouth
- Dumb / gun station → keep `showModeRow` (context ring on); never
  `showModeRow={false}`. Header tasks own Ticket versus station work — no bottom Unbox|Ticket faces.
- Mobile scanned-entity hub / mobile record / phone drill-in → **DetailHubScreen**
  (the only record grammar on `/m`)
  - card slot → a **DetailSummaryCard** mapper; whole card → `/info`, which
    holds every fact and the only edit (the bar pencil)
  - rows → `DetailNav` doors built with `detailDoor()`; one per exact job
  - dock → **DetailDock**, at most three verbs, one primary
  - scanning → **MobileCaptureWindow** as the bottom surface (lens + collapsed
    Scan bar + keyed fallback for typing) — or no scan at all. Never a Scan verb
    that opens it, never a typed-entry bar beside it (rules `capture-scan-verb`,
    `capture-typed-fork`; operator 2026-09-25). A verb that navigates to
    `/m/scan` is not a scanner.
  - `/info` and job screens → `DetailRecordFrame`
  - never: `MobileTriagePage` / `ItemCardRow` / a bottom `Sheet` as the record

## The contract is derived, not written

Garisek's equivalent server reads a hand-curated pin map with a `useWhen` /
`doNot` sentence per entry. CycleForge layers curated prose from
`src/design-system/pinned.json` onto a walk of real primitives. An absent key
means **nobody has written that law yet** — not that anything is permitted.

`ds_tokens` requires `axis` (`color` · `radius` · `spacing` · `typography` ·
`z-index` · `elevation` · `border` · `focus` · `station-skin` · `station-depth` ·
`item-record` · `detail-hub`). There is no dump. The same slices
are also MCP resources at `design://tokens/<axis>` — browse those; pass `filter`
on the tool when you already know the name. After changing a token file, run
smoke and the axis unit test, then `code-graph` `find_symbol` + `impact_analysis`
on the role function (`cornerClass`, `elevationClass`, `focusRing`,
`applyStationSkin`). Scan-station materials are **not** hexes on Unbox: they are
rows in `src/design-system/themes/station-skins.ts`, served on the `station-skin`
axis.

## Primitive homes

`src/design-system/primitives` is ops chrome (the CTA Button). `src/components/ui`
holds two kinds of file, labelled separately:

- **shadcn primitive (new-york, house tokens)** — twelve files (`button`, `input`,
  `label`, `checkbox`, `badge`, `alert`, `skeleton`, `separator`, `dialog`,
  `command`, `popover`, `calendar`). New composed / 21st.dev work starts here.
- **ui composite (house)** — CopyChip, FilterMenu, and the rest.

Two Buttons is two jobs, not a choice: ops CTA → design-system `Button`;
shadcn-lane chrome → `@/components/ui/button`. Pin keys are **filename ids**
(`badge`, not `Badge`) or they never merge.

Four homes sit outside those two because the thing an agent needs to find lives
there: `src/components/tables` (the one table engine), `src/lib/tables` (its slot
kernel, three files), `src/components/composer`, `src/components/desk` — the
`DeskPageLayout` a page mounts to wear the desk frame — and `src/components/labels`
(the print-faithful 2×1" sticker + slot overlay; matched files only, the walk
is still non-recursive). The frame itself
(`DeskPageChrome`) is catalogued from `src/design-system/components`; its adapter
cannot live there because it reads `SIDEBAR_PAGE_NAV` and `AuthContext`, and the
system must not import the app's spine.

**The walk is a non-recursive `readdirSync` per home.** A component in a
subdirectory is never catalogued, so it is law no agent can reach — which is why
the desk chrome is flat in `components/` rather than in a `desk/` folder. If you
add a nested primitive, either flatten it or the walk has to change.

## No ds_adjudicate, deliberately

Edits here DO pass Garisek-OS's pre-write door (`.claude/settings.json` →
`tools/agent-contract/door.mjs`), which adjudicates against this profile's
`adjudicator.baseRules` (only `no-suppression`) plus any `router.json`
refuse rules (none today). An ALLOWED write returns nothing to Claude, so the
door cannot carry advice — that is what the nudge above is for. `ds_contract`
answering "allowed" while nothing enforces it would manufacture confidence,
so there is no such tool. **ESLint is the gate here.**

Everything `ds_critique` reports is heuristic text matching, not AST proof.

## Verify

```bash
node "$GARISEK_OS_ROOT/tools/design-mcp/smoke.mjs"   # the engine's smoke (stdio JSON-RPC: axes, resources, critique per-axis fixes)
```

The variant extractor has been wrong twice: it once anchored on the
`BUTTON_VARIANTS` **import** rather than its declaration, and it once understood
only the cva shape. Smoke asserts **named** variants (`primary`/`ghost`/`danger`),
not a frozen count of 9.

`ds_critique` names the `ds_tokens` axis on each literal (not a generic
`var(--token)`). Plant `tools/design-mcp/fixtures/token-literal-violation.tsx`
if that ever regresses.
