# Cycle Forge — Fable 5.1 system research brief

**Audience:** Fable 5.1 (or any research/implementation model) with **no prior session memory**.
**Repos:** `cycleforge-app` (`/home/michaelgarisek/Projects/cycleforge-app`) and sibling `Garisek-OS` (`/home/michaelgarisek/Projects/Garisek-OS`).
**Purpose:** make a short, vague operator prompt (`"sort the image column"`, `"hide the modes"`, `"add a date in the cell"`) produce the **same files, the same primitives, and the same refuse** that a fully-briefed agent would produce — then prove it with the real gates.
**Product:** Cycle Forge is a 2026 multi-tenant B2B warehouse/fulfillment ops SaaS. Do not frame strategy, UX, or copy as an internal 5-person shop tool.

This file is the operating system of **how code is allowed to change**. It is not a second constitution. Authority lives in TypeScript cohorts, `pinned.json`, MCP oracles, and runners. Prose here explains **why** those artifacts exist and **which files an agent must not touch**.

---



## 0. How Fable must use this document

Read this file **before writing code**. Then follow the loop in §1. Do not skip oracles because the prompt was small.

Three jobs, in order:

1. **Research the live system** — open the SoT files named here; do not trust this brief if a cohort TS file disagrees (the TS file wins).
2. **Expand the operator’s prompt** into a cohort, a graph blast radius, a mount, and a refuse list (§7).
3. **Implement only inside that radius**, then run the named eval. If eval is red, the change is not done.

The operator will often give **almost no description**. That is intentional. The missing description is already encoded in paint law, KEEP rows, `ds_contract`, and graph impact. A short prompt is not permission to invent.

**Success criterion:** given `"make the status header sortable"`, Fable edits `slot-table-header-sort.ts` / `queue-display-sort.ts` / `LedgerGridColumnHeader.tsx` (engine), not `OrdersQueueTableRow.tsx` (one desk), then `pnpm run eval:cohort slot-table` is green.

---



## 1. The loop (always, even for a one-line prompt)

```
vague prompt
    → classify intent (§7)
    → ds_contract + ds_tokens          (if UI / CSS / TSX)
    → find_symbol → impact_analysis    (if shared / table / station / hook)
    → read the matching cohort TS + LEDGER Open gaps
    → implement ONE gap / ONE engine change
    → ds_critique on every UI file you touched
    → named eval (cohort / station / discover)
    → cursor-eval --fast before claiming done
```

If the catalog has no `ds_*` or `find_symbol` tools, use the CLIs (same handlers):

```bash
# Design (repo-local)
node tools/design-mcp/ds.mjs contract "<job in the operator's words>"
node tools/design-mcp/ds.mjs tokens <axis>
node tools/design-mcp/ds.mjs critique <file>

# Graph (Garisek-OS)
export CODE_GRAPH_TARGET_REPO="$(pwd)"
export GARISEK_OS_ROOT="${GARISEK_OS_ROOT:-/home/michaelgarisek/Projects/Garisek-OS}"
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find <SymbolName>
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" impact '<node_key>'

# Eval
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
pnpm run eval:cohort slot-table
pnpm run eval:cohort shortcuts
pnpm run eval:station <id>
pnpm run eval:discover
```

Project hooks **deny** writes under `src/**/*.{tsx,jsx,css}` and `src/design-system/**/*.{ts,tsx}` without a fresh `.cursor/design-mcp-session.json` stamp (45 min). Call the design tools first. Chicken-egg exception: `pinned.json` and `tools/design-mcp/`** may be edited without a stamp.

Never invent a `pnpm` / `npm` script. Verify names from this repo’s `package.json`.

---



## 2. Why this machinery exists (the failure being engineered against)

Agents in this repo write **valid React that quietly forks the system**. That is not a lint miss. The specimen:

1. Operator states a geometric or paint law (one composer mouth, click-to-sort every DATA header, `?` reveals letters on buttons).
2. Agent implements something plausible **beside** the existing primitive — a second date input, a desk-local Item cell, `sortable: false` on Image, a cheat-sheet Dialog from `?`.
3. Operator says undo / revert.
4. Next session, the same class of miss happens, because nothing in the **tool catalog** told the model what already exists, and nothing in **eval** told it the unit of change is a cohort, not a file.

The remedy is three oracles that answer three different questions:


| Question                                      | Wrong answer the model reaches for   | Oracle                                               |
| --------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| What already exists for this **job**?         | writes a new primitive               | **design-mcp** `ds_contract`                         |
| What **values** may I use?                    | `#1a1a1d`, `rounded-xl`, `type=date` | **design-mcp** `ds_tokens`                           |
| Who else **breaks** if I change this symbol?  | edits one desk row                   | **code-graph** `find_symbol` → `impact_analysis`     |
| Is the change **done**, and did I fork?       | “looks fine in this file”            | **eval** cohort / station / discover / `cursor-eval` |
| Why is this component **bad** after the edit? | rewrites from scratch                | **design-mcp** `ds_critique`                         |


**Registration is not use.** MCP servers in `.cursor/mcp.json` can be green in Settings and still missing from the agent catalog. If `GetDynamicTools` has no `ds_`* / `find_symbol`, the CLI is mandatory, not optional.

The 2026-08-21 house-law corpus (~195 files) was deleted because a 10k-line always-on constitution did not make agents compose from the system. This stack is the replacement: **small skills + MCP oracles + TypeScript SoT + LEDGER snapshots + a stop gate**. Do not reconstruct the old constitution.

---



## 3. Two-repo architecture


| Repo               | Role                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **cycleforge-app** | The product. Design system, desks, stations, tables, eval runners, LEDGERs, tripwires, `pinned.json`.              |
| **Garisek-OS**     | Control plane. Code-graph index (tree-sitter + pgvector), `cursor-eval.mjs`, Hermes loop verify, optional ratchet. |


Default env:

- `GARISEK_OS_ROOT` → `/home/michaelgarisek/Projects/Garisek-OS`
- `CODE_GRAPH_PROJECT` → `cycleforge-app` (in `.cursor/mcp.json`)

Eval engineering CLI writes `.cursor/eval-session.json` (gitignored) in the **target** repo. Code-graph writes `.cursor/code-graph-session.json`. Design-mcp writes `.cursor/design-mcp-session.json`. Those stamps are proof the oracles ran, not the law itself.

Garisek `npx tsx scripts/ratchet-run.ts --repo cycleforge-app` is the optional DB-backed ratchet. `npm run check:loops` (Garisek) is graph-engineering law for the **cockpit**, not a Cycle Forge per-edit gate.

---



## 4. Source-of-truth hierarchy (what wins)

When documents disagree, this order wins:

1. **TypeScript cohort modules** imported by the eval runner
  - `src/lib/tables/slot-table-cohort.ts`
  - `src/lib/tables/slot-table-discover.ts`
  - `src/lib/keyboard/shortcut-display-cohort.ts`
  - `src/lib/station/scan-station-overlay-cohort.ts`
2. `src/design-system/pinned.json` — curated `useWhen` / `doNot` merged onto primitives. Absence of a key means **nobody has written that law yet**, not that anything is permitted.
3. **Eval runners** — `tools/eval-ledger/run-cohort-eval.mjs`, `run-station-eval.mjs`, `machine-gate.mjs`
4. **Skills + AGENTS.md / CLAUDE.md /** `.cursor/rules/`* — agent routing, must match (1)
5. **LEDGER markdown** — human Operator verdict + machine `<!-- eval-ledger:auto:* -->` blocks. **Do not hand-edit auto blocks.** Do not invent Operator verdict.
6. `docs/warehouse-os/` — plan of record for the shell rebuild. `LAWS.md` is numbered and honest about enforcement (`DB` / `TYPE` / `TOOLING` / `PROTO` / `PROSE`). `README.md` still says “Phase 0 / AGENTS.md gone”; that paragraph is **stale**. The eval/graph/design stack landed after it.
7. **Kill list** — `docs/kill-list/` names deletions. Discover names the next DELETE id. Knip is a candidate generator, never the authority.

`tools/eval-ledger/registry.json` is a pointer only. Authority is the TS cohorts.

---



## 5. Design-mcp — what to mount, never invent



### 5.1 Tools (exactly three)


| Tool          | Job                                                                         |
| ------------- | --------------------------------------------------------------------------- |
| `ds_contract` | Plain-language job → existing primitive + `mount` + `pickVariant` + `doNot` |
| `ds_tokens`   | One visual **axis** (required). No dump-all.                                |
| `ds_critique` | Heuristic review of a file you just edited                                  |


Deliberately absent: `ds_adjudicate`. A tool that says “allowed” with no shared enforcer manufactures confidence. ESLint + tripwires + critique are the gates. Critique is **heuristic text**, not AST proof — do not delete a cohort-law `visibility` / `zIndex.panel` style to silence it.

### 5.2 Token axes

`color` · `radius` · `spacing` · `typography` · `z-index` · `elevation` · `border` · `focus` · `station-skin` · `station-depth` · `item-record`

Scan-station materials come from `ds_tokens({ axis: "station-skin" })` → `applyStationSkin(name)` (`src/design-system/themes/station-skins.ts`). Never hex-fill a well. Never fork a packing-bench class onto one station.

There is **no motion axis**. Motion jobs are `motionRole` in `src/design-system/motion/roles.ts`. Hover / icon / motion no-fork mounts: [`docs/eval/UI-UX-2026-CONTRACTS.md`](UI-UX-2026-CONTRACTS.md).

### 5.3 Two Buttons, two jobs

- Ops CTA → `@/design-system/primitives/Button` (flush `cornerClass('flush')`)
- shadcn / 21st.dev chrome → `@/components/ui/button`

Pin keys are **filename ids** (`badge`, not `Badge`) or they never merge with the walk.

### 5.4 Primitive homes (the walk is non-recursive)

`src/design-system/primitives`, `src/design-system/components`, `src/components/ui` (flat), plus four extra homes: `src/components/tables`, `src/lib/tables`, `src/components/composer`, `src/components/desk`, `src/components/labels` (matched files). **A component in a subdirectory is invisible to** `ds_contract`**.** Flatten or the walk must change. Do not nest a new primitive hoping the catalog will find it.

### 5.5 Naming that must not be invented


| Operator says                              | Mount                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Omni Composer / station mouth / scan mouth | `StationComposerHost`                                                                                                              |
| Raw `OmnichannelComposerDock` alone        | incomplete mouth — do not ship                                                                                                     |
| Dumb / gun station / “no modes”            | `showModeRow` + `showModeFaces={false}` — **keep** the bottom-right context ring. Never `showModeRow={false}` to hide Unbox|Ticket |
| Floor station chrome                       | Clone Pack / Unbox. No invented left recent rail. Thin adapter around the host. No `*NotesComposer`. No second scan bar            |
| Ship-by / due date / date in a cell        | `DateRangePickerField variant="compact"`                                                                                           |
| Filter a DataTable                         | `DataTableFilterMenu` beside search (always mounted; idle chrome if no facets)                                                     |
| Page header / desk frame                   | `DeskPageLayout` → `DeskPageChrome`. Title from `SIDEBAR_PAGE_NAV`. CTA via `DeskActionSlot`                                       |
| Keyboard keycap / teaching kbd             | `KeyboardKey` — gray sunken face, black letter. Never a local `<kbd>`                                                              |




### 5.6 Date law (easy to get wrong)


| Job                                  | Variant                                              | Not                                                         |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| In-cell ship-by / due / pick one day | `compact` (no X, no year, no presets, click commits) | `variant="range"`, `input type=date`, `InlineEditableValue` |
| Filter a date range                  | `variant="range"` (presets + Apply + X + year)       | compact                                                     |


Write path for STATUS delay: `CompoundState` + `useOptimisticMutation` in `useOrderAssignment`. Graph: impact `CompoundState` and `DateRangePickerField`, not one queue row.

---



## 6. Code-graph — blast radius is the unit of change



### 6.1 Protocol

1. `find_symbol` (or `search_code` if the name is unknown).
2. `impact_analysis` on the returned `node_key` before changing signatures or paint.
3. If `find` is empty after you added a `graphSymbols` export, the **index is stale** — rebuild:

```bash
node "$GARISEK_OS_ROOT/tools/code-graph/index-cli.mjs" \
  --path /home/michaelgarisek/Projects/cycleforge-app \
  --name cycleforge-app
```

Empty `find` **fails** `eval:cohort slot-table`. Do not “fix” that by removing the symbol from the cohort.

Smoke: `node "$GARISEK_OS_ROOT/tools/code-graph/verify-clients.mjs"`

### 6.2 Why graph exists (the reason files should not change)

A product table **looks like** a local React file. It is not. `CompoundItem` is one cell for every `PRODUCT_TABLES` peer. Changing title hover on To-ship by editing `OrdersQueueTableRow` creates a second Item cell. The next desk copies it. Dual SoT.

Graph impact on `CompoundItem` / `useSlotTableLayout` / `queueSortForColumnKey` / `LedgerGridColumnHeader` is how you learn the radius **before** you type. Eval then proves you did not fork.

Same for overlay: Pack is **not** golden. `SCAN_STATION_OVERLAY_COHORT` is every floor peer. Impact the edited station **and** a peer, or run `eval:station <id>`.

### 6.3 Engine symbols (slot-table) — impact these, not a desk

From `SLOT_TABLE_ENGINE.graphSymbols`:

`CompoundItem` · `CompoundState` · `useSlotTableLayout` · `materializeTracks` · `getExternalUrlByItemNumber` · `DateRangePickerField` · `useOptimisticMutation` · `DataTableFilterMenu` · `queueSortForColumnKey` · `LedgerGridColumnHeader` · `isSlotTableChromeTrack`

### 6.4 Overlay / shortcut symbols

Overlay: each member’s `exportName` plus extras (`useOverlaySwapHardCut`, and on scan-out `StationComposerHost`, `ComposerModeRow`, `ScanStationProgressRing`).

Shortcuts: `KeyboardKey` · `KeyboardShortcutsCheatSheet` · `useSelectionStatusBarHotkeys` · `TableStatusBar`

---



## 7. Vague-prompt expansion (this is the 100% reliability method)

The operator’s short sentence is an **alias**. Expand it before touching files.

### 7.1 Router


| If the prompt mentions…                                                                         | Cohort / gate                       | Engine files (prefer)                                                                                                                                                                                  | Never                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| table, column, header, sort, filter, ship-by, listing, title, item #, DataTable, grid           | `eval:cohort slot-table`            | `CompoundCells.tsx`, `useSlotTableLayout.ts`, `materialize-tracks.ts`, `DataTable.tsx`, `slot-table-header-sort.ts`, `queue-display-sort.ts`, `LedgerGridColumnHeader.tsx`, `DateRangePickerField.tsx` | a new GRID_COLUMNS array; `sortable: false` on a labeled fact; `FilterRefinementBar`; hunt tiles; `type=date` |
| `?`, shortcut, hotkey, keycap, cheat sheet, “show the key on the button”                        | `eval:cohort shortcuts`             | `KeyboardKey.tsx`, `useSelectionStatusBarHotkeys.ts`, `TableStatusBar.tsx`                                                                                                                             | standing keycaps; Dialog from staff `?`; `title`/popover on `?`; foot `?` button; local `<kbd>`               |
| unbox / pack / triage / testing / shipping / scan-out overlay, idle browse, z-index, visibility | `eval:station <id>`                 | that station’s `*Workspace.tsx` **and** keep cohort predicates                                                                                                                                         | delete `visibility` / `zIndex.panel` to silence critique; treat Pack/Unbox as golden; invent a second mouth   |
| composer, omni, mouth, modes, Unbox|Ticket, gun, notes composer                                 | `eval:station <id>` + `ds_contract` | `StationComposerHost`, `ComposerModeRow`                                                                                                                                                               | `showModeRow={false}`; `*NotesComposer`; second scan bar; left recent rail                                    |
| station color, well fill, porcelain, packing bench class                                        | `ds_tokens station-skin`            | `station-skins.ts` + `applyStationSkin`                                                                                                                                                                | hex on one station                                                                                            |
| leftover GRID, dual columns, “delete the old table model”                                       | `pnpm run eval:discover`            | delete **one** unblocked DELETE id                                                                                                                                                                     | KEEP rows; emptying `TABLE_COLUMNS` keys; inventing DELETE ids                                                |
| icon, glyph, toolbar icon, hover on an icon, icon floor                                         | `ds_contract` + pin (no icons cohort) | `IconButton.tsx`, `IconActionFloor.tsx`, `CopyIconButton.tsx`                                                                                                                                         | lucide-in-`<button>`; call-site `hover:bg-slate-*`; a second icon toolbar; `eval:cohort icons`                |
| animate, motion, transition, overlay swap, press feedback                                       | overlay tripwire + `motionRole`     | `src/design-system/motion/roles.ts` — pick the **job**; overlay greps `swap.scan`/`swap.focus`                                                                                                         | `transition-all`; duration literals; geometry tweens; a new motion role for a duration tweak                  |
| shared hook / primitive / table infra, “this is used everywhere”                                | graph impact first                  | the symbol’s defining file                                                                                                                                                                             | one importer’s local copy                                                                                     |




### 7.2 Exact aliases (operator language → law)


| Operator says (even poorly)                         | Actual intent                                    | Do                                                                                               | Refuse / do not                                                                                       |
| --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| “make it sortable” / “header does nothing”          | `SLOT_TABLE_PAINT_LAW.headerSort`                | Map the track in `isSlotTableChromeTrack` + comparator + URL fact. Image/Status/Amount are DATA. | `sortable: false` on a labeled fact; freeze ≠ unsortable                                              |
| “put a date in the cell” / “ship by”                | compact `DateRangePickerField`                   | `variant="compact"` on `CompoundState`                                                           | range filter, native date input, `InlineEditableValue`                                                |
| “add a filter bar” / “those hunt tiles”             | `DataTableFilterMenu` beside search              | Always mount; `DATA_TABLE_FILTER_IDLE` if no facets                                              | `FilterRefinementBar`; tiles; funnel inside SearchField; folding Queue/Viewed/History into the funnel |
| “show shortcuts on the buttons”                     | **refuse standing**; teach via `?`               | Bind keys; `?` paints `KeyboardKey` overlay `absolute right-1.5`                                 | standing letters; widen `iconRight`/gap                                                               |
| “open the cheat sheet from `?`”                     | **refuse** while CTA strip mounted               | Cheat sheet owns `?` **only** when no inline-hotkey surface                                      | Dialog from table-foot `?`                                                                            |
| “no modes on this station”                          | hide **faces**, keep ring                        | `showModeFaces={false}`                                                                          | `showModeRow={false}`                                                                                 |
| “just fix To-ship” (when the paint is CompoundItem) | engine + every PRODUCT_TABLES peer               | Edit compound / layout engine                                                                    | Fork `OrdersQueueTableRow`                                                                            |
| “copy Pack” for a new floor station                 | clone Pack/Unbox **chrome**, join overlay cohort | Append `SCAN_STATION_OVERLAY_COHORT` + design-mcp `OVERLAY_COHORT_WORKSPACES`                    | new rail; new mouth; Pack-as-golden tests                                                             |




### 7.3 One-gap rule

LEDGER Open gaps: implement **one** per session. Discover: pick **one** unblocked `verdict: delete` (priority 1 first). After the kill, remove that id from `SLOT_TABLE_KNOWN_DEBT` (shrink-only). Never append a new dual-SoT id to go green.

---



## 8. Eval engineering — the reason the codebase is shaped this way

Eval is not “run tests at the end.” It is the **definition of the change unit**.

### 8.1 Display SoT is slot-table only

There is **no** `eval:cohort overlay`. Overlay is a **shell contract** evaluated per station. Display paint (title, listing, ship-by, filter, header sort) is engine-wide.

```bash
pnpm run eval:cohort slot-table                 # engine + PRODUCT_TABLES
pnpm run eval:cohort slot-table -- --skip-verify
pnpm run eval:cohort shortcuts
pnpm run eval:discover
pnpm run eval:station scan-out                  # mouth/domain + overlay shell
```

`--skip-verify` = critique + graph + tripwire/contracts, no `verify:fast`. Before claiming done, run **without** skip (or `cursor-eval --fast` plus the named cohort).

### 8.2 What `eval:cohort slot-table` actually does

Imported from TS (no hand JSON):

1. **Tripwire tests** — `slot-table-cohort.test.ts`, `slot-table-discover.test.ts`
2. **Engine-contract greps** — `SLOT_TABLE_ENGINE_CONTRACT` (title idle/hover, compact ship-by, filter always mounted, `isSlotTableChromeTrack`, track maps for thumb/state/amount, …)
3. **Graph find** every `graphSymbols` name — no match ⇒ `ok: false` (rebuild index)
4. **Graph impact** depth 2 — written into LEDGER auto sections
5. **ds_critique** on `critiqueFiles`
6. **Discover** matrices (KEEP / DELETE / judgment) into the LEDGER
7. `verify:fast` unless skipped

Hard fail: tripwire red, any engine-contract miss, any graph find no-match, verify fail.

### 8.3 Paint law (engine, every peer)

Copied from `SLOT_TABLE_PAINT_LAW` — if this disagrees with the TS file, **the TS file wins**.

- **Title:** `text-text-default` idle; hover/focus `text-text-info` + underline; optional `titleHref` opens listing.
- **Listing subtitle:** ExternalLink glyph (never the word “Listing”, never item # / host path as face); live `text-text-info`, missing `text-text-faint`; copy = raw `item_number`.
- **Ship-by:** `DateRangePickerField variant=compact` when editable. Always a face. Write through `useOptimisticMutation`.
- **Filter:** `DataTableFilterMenu` always beside `SearchField`. Never FilterRefinementBar, hunt tiles, funnel inside search. Unbox Queue/Viewed/History share `?ukpi=` via `useReceivingTableChrome`.
- **Header sort:** every painted DATA header is click-to-sort. Chrome only: `select`, `actions`/`action`, `_fill`. Image/thumb is DATA. Dead headers are a fail — map the track.
- **Scope:** every `PRODUCT_TABLES` peer — not To-ship alone.



### 8.4 Why peers come from `PRODUCT_TABLES`

Hand-copying a peer list is how Pack-as-golden happened. `slotTablePeerIds()` is derived. Add a product table → it appears in `PRODUCT_TABLES` + `REGISTERED_BINDINGS`. Opt onto the engine → append `SLOT_TABLE_ENGINE_LAYOUT_HOOKS`. Family hooks are **config**, not a second Item cell.

### 8.5 Discover — KEEP vs DELETE (why you must not delete the engine)

`slot-table-discover.ts` walks the tree. Kill-list authority: `docs/kill-list/07-slot-table-hand-models.md`.

**Never delete KEEP rows.** They exist because agents treated them as “old table code”:


| KEEP id (prefix)                                                                                 | Why it must stay                                                                                                |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `engine:CompoundItem` / `ProductTitleLink` / `CompoundState` / `CompoundStageStep`               | One Item / STATUS / stage paint for every peer                                                                  |
| `engine:useSlotTableLayout` / `materializeTracks`                                                | Shared cascade; track keys are slot indices                                                                     |
| `engine:DataTable` / `DataTableFilterMenu` / `NonlinearTableHost` / `LedgerGrid` / `SearchField` | One display. Kill-list never-kill                                                                               |
| `engine:slot-table-header-sort` / `queueSortForColumnKey` / `LedgerGridColumnHeader`             | Header click law. Deleting them to silence a dead header is the bug                                             |
| `engine:DateRangePickerField`                                                                    | Compact ship-by. Do not hand-roll `type=date`                                                                   |
| `engine:REGISTERED_BINDINGS` / `PRODUCT_TABLES` / `SLOT_LAYOUT_TABLES` / `TABLE_COLUMNS-keys`    | Catalog / waist. Empty `TABLE_COLUMNS` buckets stay as **keys** (`shipped`, `tech`, `testing`, `packer`, `fba`) |
| `engine:getExternalUrlByItemNumber`                                                              | Listing URL. Desks must not paint host paths                                                                    |
| `hook:<tableId>`                                                                                 | Engine opt-in. Keep the hook                                                                                    |
| `catalog:<tableId>`                                                                              | Field catalog — data only                                                                                       |
| `engine:CART_COMPOUND_COLUMNS`                                                                   | Kiosk cart shares the skeleton without pretending to be a staff desk                                            |


**DELETE:** only ids Discover lists as `verdict: delete` and unblocked. Judgment rows stay human (Testing History layout, FBA catalog, station-history, support-tickets, etc.).

`SLOT_TABLE_KNOWN_DEBT` is shrink-only. A **new** dual-SoT id fails the tripwire. A **gone** id fails until you remove it from the list.

### 8.6 Shortcuts cohort

SoT: staff `?` reveals letters as **KeyboardKey overlays** inside each selection CTA (`absolute right-1.5`), zero layout shift. Not a Dialog. Not a foot `?`. Not standing keycaps.

**Refuse** (hard, even if the operator asks):

- Leave keycaps standing on buttons
- Open a cheat sheet from staff `?` while CTAs are mounted
- Add a foot `?` control
- Park keycaps outside / widen via `iconRight` / gap
- Fork a white/muted teaching `<kbd>` — import `KeyboardKey`

Exception: `KeyboardShortcutsCheatSheet` still owns the `?` **key** when no inline-hotkey surface is mounted. `NAV_KEY_HINT_CLASS` (⌘;) and ScanHotkeyControl bind-edit stay.

`SHORTCUT_DISPLAY_KNOWN_DEBT` is shrink-only leftover in-menu kbd. Do not append to go green.

### 8.7 Overlay shell (not a display cohort)

Members (append-only when a new floor station ships the shell; shrink only if the station is gone):


| id       | route                | workspace export       |
| -------- | -------------------- | ---------------------- |
| unbox    | `/unbox`             | `UnboxLineWorkspace`   |
| triage   | `/triage`            | `TriageLineWorkspace`  |
| pack     | `/pack`              | `PackOrderWorkspace`   |
| testing  | `/test`              | `TestingLineWorkspace` |
| shipping | `/shipping`          | `TechRightPane`        |
| scan-out | `/shipping/scan-out` | `ScanOutWorkspace`     |


Shared predicates (`SCAN_STATION_OVERLAY_CONTRACT`): idle stays mounted (`visibility: hidden`, not unmount); `pointer-events-none`; `inert={}`; `zIndex.panel` (never a raw integer); `AnimatePresence`; `motionRole.swap.scan` **or** `.focus` (neither Pack nor Unbox owns the role name).

Add a station: cohort row **and** `OVERLAY_COHORT_WORKSPACES` in `tools/design-mcp/server.mjs`.

### 8.8 Machine gate (Cursor stop + Hermes twin)

`tools/eval-ledger/machine-gate.mjs` — no LLM grader, never writes the tree.

- Always `cursor-eval --fast`
- Scoped `eval:cohort slot-table` / `eval:station` when dirty paths match
- Cursor `stop` hook: pass = silence (`{}`); machine red + `loop_count` 0 = one `followup_message`; timeout/crash = fail-open
- Hermes: `LOOP_VERIFY_COMMAND` defaults to this CLI for `cycleforge-app`

Shared repair law (`CYCLEFORGE_REPAIR_LAW`):

> Make that contract green. Do not change paint. Do not fold Queue/Viewed/History into the funnel. Do not delete overlay visibility / zIndex.panel. Do not invent Operator verdict. Allowed: fix `SLOT_TABLE_ENGINE_CONTRACT` / DataTableFilterMenu always-mounted / KEEP rows. Forbidden: FilterRefinementBar, hunt tiles, screenshot baselines as a resume reason.

Kill switch: `CYCLEFORGE_EVAL_STOP=0`. Dry: `CYCLEFORGE_EVAL_STOP=dry` / `--dry-fail`.

### 8.9 Verify profiles (from `package.json` / `scripts/verify.mjs`)


| Command                                       | What                                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `pnpm run verify:fast` / `cursor-eval --fast` | lint + typecheck (inner loop)                                |
| `pnpm run verify` / `cursor-eval --full`      | local CI mirror — required before done on cross-cutting work |
| `pnpm run verify:dogfood`                     | tenant click-through slice                                   |


Green here ⇒ green in CI (full profile). Never fail-fast: every gate reports.

### 8.10 Perf north star

Lighthouse / Speed Insights ≥ 95. `eval:perf-gate` stamps `.cursor/perf-session.json`. Live Chrome only when `LOOP_PERF=check` or `MACHINE_GATE_PERF=check` with `LH_BASE_URL`. Overnight Hermes grind: `pnpm run perf:overnight`. Do not lower floors or strip desk density to hit 95.

### 8.11 LEDGER etiquette


| Section                       | Who writes                                       |
| ----------------------------- | ------------------------------------------------ |
| Locked wins                   | Human promotes → often `pinned.json`             |
| Operator verdict              | **Human** after a desk walk. Agents never invent |
| Open gaps                     | Human prioritizes; agent does one                |
| `<!-- eval-ledger:auto:* -->` | **Runner only**                                  |


---



## 9. Why files should and should not change (worked reasons)

This is the heart of eval-as-reason. Each row is a class of agent mistake.

### 9.1 Change the engine, not the desk

**Should change:** `CompoundCells.tsx`, `ProductTitleLink.tsx`, `useSlotTableLayout.ts`, `materialize-tracks.ts`, `DataTable.tsx`, `slot-table-header-sort.ts`, `queue-display-sort.ts`, `DateRangePickerField.tsx`, `LedgerGridColumnHeader.tsx`.

**Should not change (for paint law):** `OrdersQueueTableRow.tsx` as a second Item cell; a new `*_GRID_COLUMNS` export; a per-desk title `<a>` with standing blue.

**Why:** PRODUCT_TABLES peers must inherit. A To-ship-only fix is a fork. Eval fails if the engine contract greps miss; graph impact shows 20 desks, not one.

### 9.2 Map the track; do not disable sort

**Should change:** `isSlotTableChromeTrack`, family `isSortable`, comparator, URL fact map, `queueSortForColumnKey` for compound track→fact.

**Should not change:** `sortable: false` on Image/Status/Amount; deleting `engine:slot-table-header-sort` to go green.

**Why:** dead headers are the bug. Chrome-only keys are `select` / `actions` / `_fill`. Operator 2026-09-01.

### 9.3 Compact date is not the filter date

**Should change:** `DateRangePickerField` compact face; `CompoundState` mount; `useOrderAssignment` optimistic write.

**Should not change:** add `input type=date`; reuse `variant="range"` in a cell; `InlineEditableValue`.

**Why:** range chrome (presets, Apply, X, year) is a filter. Compact is one-day commit. Contract greps `variant=["']compact["']` and `format(..., 'MMM d')`.

### 9.4 Filter icon is always there

**Should change:** `DataTable.tsx` funnel; family facet config.

**Should not change:** `FilterRefinementBar`; hunt-tile strip; hide the icon when a family has no facets; fold page tabs into the funnel.

**Why:** idle chrome (`DATA_TABLE_FILTER_IDLE`) is the empty state. Unbox Queue/Viewed/History are page tabs, not facets.

### 9.5 Overlay hide is visibility, not unmount

**Should change:** keep `style={{ visibility }}`, `zIndex.panel`, `inert`, `pointer-events-none` on every cohort workspace.

**Should not change:** delete those to make `ds_critique` quiet; `display:none` unmounting idle browse; raw `z-[80]`.

**Why:** idle must stay mounted so scan/browse state survives overlay. Critique allowlists cohort-law styles via `OVERLAY_COHORT_WORKSPACES`.

### 9.6 Dumb station keeps the ring

**Should change:** `showModeFaces={false}` on `StationComposerHost`.

**Should not change:** `showModeRow={false}`; a custom notes dock.

**Why:** the mode row is also the context/procedure ring. Hiding the row deletes the ring. Pinned on `StationComposerHost` / `ComposerModeRow`.

### 9.7 Shortcuts teach on demand

**Should change:** bind `useSelectionActionHotkeys`; overlay `KeyboardKey` on `?`.

**Should not change:** standing glyphs; cheat-sheet from `?`; foot `?`; white/muted kbd.

**Why:** standing keycaps are chrome noise on a warehouse floor. `?` is the teaching chord. Forbidden greps encode this.

### 9.8 Discover before you delete a GRID

**Should change:** the one DELETE id Discover named.

**Should not change:** KEEP engine / materializations / catalogs / hooks; `TABLE_COLUMNS` keys; judgment rows.

**Why:** knip and grep cannot tell a live waist from a leftover. Discover is the inventory; the tripwire ratchets debt down.

### 9.9 Do not seed dual SoT to pass eval

**Should change:** delete the leftover, then shrink `SLOT_TABLE_KNOWN_DEBT`.

**Should not change:** append the new smell to KNOWN_DEBT.

**Why:** baselines only shrink (`knip:baseline` same rule). A new fork is a fail.

### 9.10 Process laws (Warehouse OS V · still live)

- Never commit `.env`
- Never start/restart/kill the operator’s dev server (`:3050`). Broken server = report, not repair
- Never create a git branch; work on `main` (isolated lane = worktree still on `main`) unless the operator says otherwise in that session’s user rules
- Stage only files you changed. Commit only when asked
- Never delete `/01/**`, `/414/**`, `/l/**`, `/p/**`, `/s/**`, `/q/**` (GS1 / short URLs printed on stickers)
- Payload budgets ratchet down

---



## 10. Warehouse OS — plan of record vs live product

`docs/warehouse-os/` is the shell destination (sessions, rails, canvas, one composer). Much of `LAWS.md` is `PROTO` (true in `prototype/warehouse-os.html`, not yet in `src/`). Do not “implement a law” by regex-asserting source text (law **X1**: laws are prose; guards that `readFileSync` + regex a shape are banned as a *constitution* — the eval **engine-contract greps** are a different, named, shrink-only tripwire on **specific predicates**, not a reconstructed house-law corpus).

Useful laws when the prompt is about the shell:

- **I8** — one composer ever
- **S1** — exactly one armed scan session per org (DB)
- **Q1** — a work queue is a table in a tile, not a rail
- **F11** — Tailwind + shadcn; `shell.css` shrink-only
- **M1/M2** — no geometry animation; color/opacity only, 80ms
- **D5** — `orgId` from `ctx.organizationId`, never the body; `withTenantTransaction`

Read `docs/warehouse-os/HANDOFF-continue.md` before large shell work. Do not reconstruct the deleted 2026-08-21 constitution.

---



## 11. Hooks and stamps (what runs without the operator asking)

`.cursor/hooks.json`:


| Event                           | What                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `workspaceOpen`                 | Load Garisek + design-mcp Cursor plugins                   |
| `sessionStart`                  | Inject design-mcp dumb-station recipe; Garisek engineering |
| `afterMCPExecution` `ds_*`      | Stamp `.cursor/design-mcp-session.json`                    |
| `afterMCPExecution` graph tools | Stamp `.cursor/code-graph-session.json`                    |
| `preToolUse` Write/StrReplace/… | Deny UI writes without a fresh design stamp                |
| `stop`                          | `machine-gate.mjs` (timeout 300s, `loop_limit` 1)          |


If a UI write is denied: run `ds_contract` + `ds_tokens`, then retry. Do not bypass by writing the file through a non-matching path.

MCP: `.cursor/mcp.json` registers `design-mcp` (repo `server.mjs`) and `code-graph` (`Garisek-OS/.../run-mcp.sh`, `CODE_GRAPH_PROJECT=cycleforge-app`). Claude Code uses `.mcp.json` (symlink).

---



## 12. Honest gaps (do not paper over)

Fable should treat these as **upgrade targets**, not as permission to ignore the stack.

1. **Catalog empty in Cursor** — project MCP sometimes never reaches the agent. CLI fallback is the reliability path; plugin `plugin-`* namespaces are the other.
2. `ds_critique` **is heuristic** — can nag legal cohort styles; agents then delete `visibility` / `zIndex.panel`. Repair law forbids that. Upgrade: critique allowlist is already path-based; keep it, don’t weaken it.
3. **Engine-contract greps vs X1** — greps pin a *shape*. They exist because agents fork. Upgrade: prefer behavioral tests where a grep is brittle; do not delete the tripwire to “comply with X1.”
4. **Shortcuts LEDGER can show contract FAILs** while the TS file documents overlay law — if runner and files drift, **fix the files or the predicates**, don’t ignore `ok`.
5. **Warehouse OS README stale** — still says AGENTS.md gone / Phase 0.
6. **Graph index staleness** — adding a `graphSymbols` export without rebuild fails the cohort. Rebuild is part of done.
7. **Operator verdict empty** — machines must not fill it. Human tunnel walks are the taste channel.
8. **Perf 95** is a north star, not a reason to gut desk density.
9. **Kill list “nothing deleted yet”** (2026-08-20) — Discover is the live deletion queue for slot-table hand models; don’t freeze on the kill-list cover letter.
10. **Interaction pins missing** — `IconButton`, `IconActionFloor`, `CopyIconButton`, and `motionRole` have no `pinned.json` `useWhen`/`doNot`. Absence is unwritten, not permitted. Bar + pin recipes: [`docs/eval/UI-UX-2026-CONTRACTS.md`](UI-UX-2026-CONTRACTS.md). Do not add `eval:cohort icons`.

---



## 13. Exact use cases Fable must be able to execute

Each use case is a **prompt the operator might type**, the **expansion**, the **files**, the **eval**. Implement against these as acceptance tests of the methodology.

### UC-1 — “the image column header doesn’t sort”

- Expand: `headerSort` law; Image is DATA.
- Graph: `isSlotTableChromeTrack`, `queueSortForColumnKey`, `LedgerGridColumnHeader`.
- Do: map `thumb`/`image` in the chrome-track helper (must return **false** for chrome only — image is not chrome) + comparator + URL fact.
- Don’t: `sortable: false`.
- Eval: `pnpm run eval:cohort slot-table`.



### UC-2 — “put ship-by in the status cell”

- Expand: compact DateRangePickerField on CompoundState.
- Graph: `DateRangePickerField`, `CompoundState`, `useOptimisticMutation`.
- Don’t: range variant, `type=date`.
- Eval: `eval:cohort slot-table`.



### UC-3 — “add filters like the hunt tiles”

- Expand: **refuse hunt tiles**. Mount `DataTableFilterMenu`.
- Eval: `eval:cohort slot-table`.



### UC-4 — “show ⌘C on the Copy button always”

- Expand: **refuse standing**. Bind Copy; `?` reveals `KeyboardKey`.
- Eval: `eval:cohort shortcuts`.



### UC-5 — “? should open the shortcuts sheet from the table”

- Expand: **refuse**. Cheat sheet only when no CTA strip.
- Eval: `eval:cohort shortcuts`.



### UC-6 — “scan-out shouldn’t have Unbox and Ticket”

- Expand: `showModeFaces={false}`, keep mode row / ring.
- Graph: `StationComposerHost`, `ComposerModeRow`, `ScanOutWorkspace`.
- Eval: `eval:station scan-out` (peers stay green).



### UC-7 — “make testing overlay like pack”

- Expand: cohort predicates, not copy-paste Pack JSX. Join/keep `SCAN_STATION_OVERLAY_COHORT`.
- Eval: `eval:station testing` + confirm overlay tripwire.



### UC-8 — “delete RECEIVING_GRID_COLUMNS”

- Expand: `eval:discover` first. If DELETE and unblocked, one id, shrink KNOWN_DEBT. If KEEP, **stop**.
- Eval: `eval:discover` then `eval:cohort slot-table`.



### UC-9 — “new floor station for QC”

- Expand: clone Pack/Unbox chrome; `StationComposerHost`; `applyStationSkin`; append overlay cohort + design-mcp workspace list; no new rail/mouth.
- Eval: `eval:station <id>` + overlay tripwire.



### UC-10 — “this button is the wrong blue”

- Expand: `ds_tokens color` + existing Button variant. No hex.
- Critique the file. No new primitive.



### UC-11 — “sort is broken only on To-ship”

- Expand: still engine. Impact `queueSortForColumnKey`. Fix the track→fact map once.
- Eval: full slot-table cohort, not a To-ship unit test alone.



### UC-12 — “hide the overlay idle so critique is clean”

- Expand: **refuse**. Visibility hide is the law.

---



## 14. New methodologies to upgrade toward 100% reliability

These are the implementations Fable should specify and, when asked to build, land **as data and runners**, not as another markdown constitution.

### M1 — Prompt router as data (highest leverage)

Commit a machine-readable router (JSON or TS) next to the cohorts:

```ts
{ match: /sort|header|column/i, cohort: 'slot-table', symbols: [...], refuse: [...] }
```

Eval runner and skills import the **same** module. A vague prompt is classified before the first edit. Drift between AGENTS.md and TS is the current failure; one module fixes it.

### M2 — Graph stamp parity with design-mcp

Today UI writes require a design stamp. Shared-symbol edits do not require a graph stamp. Add a `preToolUse` (or eval hard-fail) when dirty paths match engine files and `.cursor/code-graph-session.json` is missing/stale **unless** `eval:cohort` / `impact` already ran this session. Fail open on infra bugs (same as design hook).

### M3 — Intent expansion in `ds_contract`

`ds_contract` already maps jobs to mounts. Add aliases for the UC table in §13 (`"date in a cell"` → compact picker + `doNot: type=date`). The oracle, not the chat, carries the expansion.

### M4 — Cohort `ok` as the definition of done for those files

Machine-gate already scopes slot-table / station when dirty. Extend: dirty `shortcut-display-cohort` files ⇒ `eval:cohort shortcuts` required. Dirty overlay workspaces ⇒ `eval:station` for that id. No silent skip because the prompt was “small.”

### M5 — Discover is the only deletion API

Any agent deletion of `*GRID_COLUMNS` / emptying `TABLE_COLUMNS` without a Discover DELETE id is a tripwire fail. (Partially true today — close remaining scanners.)

### M6 — Repair brief stays paint-frozen

When machine-gate is red, the follow-up may only make **contracts** green. Forbid restyle. This is already `CYCLEFORGE_REPAIR_LAW`. Keep it. Add shortcut refuse lines to the same string.

### M7 — Index freshness as a cohort predicate

If `graphSymbols` find is empty, the runner already fails. Document rebuild in the repair brief. Optional: `eval:cohort` calls `index-cli` when find is empty once, then re-find (careful: slow; maybe `--rebuild-graph` flag).

### M8 — LEDGER auto vs human split stays sacred

Never train a model to write Operator verdict. Upgrade: tripwire that Operator verdict section has no agent-typical phrases if you must — prefer process (human only) over a regex guard.

### M9 — Pin promotion path

Locked wins that survive a human walk get a `pinned.json` entry (`useWhen` / `doNot` / `law` cite). That is how a law becomes reachable from `ds_contract`. Fable should propose pins, not dump laws into AGENTS.md.

### M10 — Behavioral tests where greps rot

When a grep fails because a legal rename happened, replace **that one** predicate with a unit test of behavior (click header ⇒ sort param), then delete the grep. Shrink greps; don’t explode them.

### M11 — One composer, one table, one overlay contract

New surfaces must **join a cohort**, not start a sibling pattern. The methodology: “is there a cohort for this job?” If yes, append a row. If no, ask the operator before inventing the third table engine.

### M12 — Browser / desk verification is not a screenshot baseline

User rule: UI changes are verified by using the flow, not one screenshot. Eval must not resume on screenshot diffs. Machine-gate already forbids screenshot baselines as a resume reason.

---



## 15. File map (open these, not a random desk)


| Path                                                               | What it is                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| `src/lib/tables/slot-table-cohort.ts`                              | Display SoT, paint law, engine contract, graph symbols |
| `src/lib/tables/slot-table-discover.ts`                            | KEEP / DELETE inventory                                |
| `src/lib/keyboard/shortcut-display-cohort.ts`                      | `?` overlay law + refuse + forbidden greps             |
| `src/lib/station/scan-station-overlay-cohort.ts`                   | Floor overlay peers + shell predicates                 |
| `src/design-system/pinned.json`                                    | Curated doNot for `ds_contract`                        |
| `tools/design-mcp/server.mjs` / `ds.mjs`                           | Design oracle                                          |
| `tools/eval-ledger/*.mjs`                                          | Cohort / station / machine-gate                        |
| `docs/eval/README.md`                                              | Ledger layout + stop-gate semantics                    |
| `docs/eval/UI-UX-2026-CONTRACTS.md`                                | 2026 AI-app bar + hover / motionRole / IconButton pins |
| `docs/eval/cohorts/*/LEDGER.md`                                    | Human + auto snapshots                                 |
| `docs/kill-list/07-slot-table-hand-models.md`                      | Why each hand GRID dies                                |
| `docs/warehouse-os/LAWS.md`                                        | Numbered shell laws + enforcement status               |
| `.cursor/skills/{design-mcp,code-graph,eval-engineering}/SKILL.md` | Agent instructions (must match TS)                     |
| `AGENTS.md` / `CLAUDE.md`                                          | Always-on short routing                                |
| `$GARISEK_OS_ROOT/tools/code-graph/`                               | Graph CLI + MCP                                        |
| `$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs`          | Fast/full verify stamp                                 |


---



## 16. Definition of done (copy into every session)

A Cycle Forge coding task is done only when:

1. Design tools ran **before** UI writes (or CLI equivalent).
2. Graph find + impact ran for shared / table / station / hook edits (or CLI equivalent).
3. The change sits in the **engine / cohort**, not a one-desk fork, unless Discover named that desk leftover as DELETE.
4. Named eval is green (`eval:cohort` / `eval:station` / `eval:discover` as applicable).
5. `cursor-eval --fast` is green ( `--full` if cross-cutting).
6. No KEEP row deleted. No standing keycaps. No cheat sheet from staff `?`. No `showModeRow={false}` to hide faces. No hunt tiles. No `type=date` in a cell.
7. LEDGER auto sections were produced by the runner, not hand-edited.
8. Operator verdict was not invented.

If eval is red: fix or **report**. Do not claim done.

---



## 17. What Fable should return after researching this system

When asked to upgrade reliability, deliver **code** in this order, not more essays:

1. A shared `src/lib/eval/prompt-router.ts` (or similar) consumed by skills text **and** machine-gate repair hints.
2. `ds_contract` aliases for UC-1..UC-12.
3. Machine-gate coverage for shortcuts dirty paths.
4. Pins in `pinned.json` for any Locked win still missing (`useWhen`/`doNot` only — small).
5. Behavioral tests that let one brittle grep die (M10), one at a time.

Do not add a new markdown constitution. This file is already the research brief. The TS cohorts remain the SoT.