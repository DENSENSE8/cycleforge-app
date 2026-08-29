# HANDOFF — Tear the table display down to one SoT

**Status:** not started · **Written:** 2026-08-29 · **Branch:** `main` · **Stage:** dogfood
**Supersedes:** [`one-sheet-table-sot-PLAN.md`](./one-sheet-table-sot-PLAN.md) for everything
above the data layer. That plan rebuilt 26 surfaces onto a binding waist and then bolted a
Sheets toolbar on top. The waist was right. **The display layer on top of it is not, and
this handoff deletes it rather than editing it.**

---

## 0. The instruction, in the operator's words

> "Deleting everything and refactoring under one source of truth, still in dogfood stage."
> "Just removing all the bloat and creating a simple data table — so just removing it all
> first, I don't care, delete all of it so I can cleanly restart without the bloat of
> changing the terrible components itself."
> "Keep the search bar component and the data table but remove the interactive layer of it
> and the display of it."

**Read that as a licence, not a suggestion.** This is a dogfood-stage product with one
tenant. Do not preserve, deprecate, adapt, or wrap the components below. Delete them, get
`npm run verify` green on a smaller codebase, and let the rebuild be a rebuild.

The failure mode this handoff exists to prevent is the one the last three passes hit: a
component gets *adapted* instead of deleted, its props become `@deprecated` and inert, its
docblock grows a paragraph about why it still exists, and the fork survives wearing an
apology. **If you find yourself writing "kept for compatibility", stop and delete it.**

---

## 1. Mission

Two things survive. Everything else that draws a table goes.

| Survives | Why |
|---|---|
| **`SearchField`** (`src/design-system/primitives/SearchField.tsx`) | The find field is fine. It is a text input with a clear affordance. |
| **A data table** — rows, columns, a header, virtualization | The thing the product is. |

Everything between those two and the page — toolbars, chrome bands, per-desk headers,
rails, drill hosts, compare hosts, formatting, zoom, fullscreen, column menus, in-cell
editors, resize handles — is deleted and rebuilt once, as one component, under one SoT.

**The target is a plain data table.** Rows, columns, a header, a checkbox gutter, a search
box, and one filter control. Nothing else until the operator asks for it.

---

## 2. The four corrections that describe the target

These are from the screenshots of the current To-ship desk. Each is small on its own; they
matter because they are the shape of the mistake — one intent reached by two controls, and
chrome that exists because a component existed rather than because a job did.

### 2.1 Two filter buttons must become one

The toolbar today has a funnel **inside** the search field and another funnel **beside**
it. Two controls, one job.

- The in-field one is `PackBenchRefineFacet` (`src/components/packing/PackBenchRefineFacet.tsx`),
  passed as `trailingSuffix`, plus `usePackedFindFieldChrome`'s funnel passed as
  `trailingPrefix` on the Packed stage. Both mount `WorkbenchFilterPopover` at
  `density="field"`.
- The outside one is `SheetFilterMenu` (`src/components/sheet/SheetFilterMenu.tsx`).

**Keep one filter control, outside the field.** The search field holds text and nothing
else — no funnel, no chips, no paste button, no inline content. `SearchField`'s
`trailingPrefix` / `trailingSuffix` / `inlineContent` slots are the mechanism that let this
happen and should not exist on the new field.

### 2.2 The "All" tab comes off the bottom strip

`TRIAGE_FACETS[0]` in `src/components/dashboard/useOutboundSheetChrome.tsx`. "All" is the
absence of a filter, not a filter — the unfiltered list is what the sheet shows when
nothing is selected, so a tab for it is a control that means "stop".

### 2.3 "Copy all rows" leaves the toolbar

`data-testid="sheet-copy-all"` in `SheetToolbar.tsx`. Copying every row is a thing you do
**to a selection**, so it belongs to the select-all control in the top-left header gutter
(`LedgerGridColumnHeader.tsx` around line 219, the `Select all` checkbox) — select all,
then copy — not to a permanent button that acts on rows nobody picked.

### 2.4 The rest of the toolbar is bloat

Import, export, print, zoom −/100%/+, the column picker, **B** / *I* / S̶, text colour,
fill colour, and the three alignment buttons. Fourteen controls above a warehouse queue.
Delete the row. If a verb earns its way back later it comes back one at a time, asked for.

---

## 3. Ground truth — what is actually there now

Measured 2026-08-29. Do not trust older docs.

### 3.1 The engine and the layers on it

```
src/design-system/components/grid/     63 files    7,997 lines
src/components/sheet/                  12 files    2,094 lines
src/components/tables/compound/         9 files    2,036 lines
                                       ─────────────────────
   non-test total                      64 files   10,444 lines
```

Inside the grid directory, the interactive layer to strip:

| File | Lines | What it is |
|---|---|---|
| `LedgerGridSurface.tsx` | 523 | visibility + sort + skeleton + empty + column rail |
| `LedgerGrid.tsx` | 462 | markup, CSS-var tracks, split-x, airtable skin |
| `LedgerGridColumnHeader.tsx` | 411 | sticky header, sort clicks, select-all |
| `VirtualGroupedSections.tsx` | 271 | virtualizer + day bands |
| `LedgerGridColumnContextMenu.tsx` | 221 | right-click column menu |
| `LedgerDrillHost.tsx` | 208 | the drill pane |
| `ColumnResizeHandle.tsx` | 197 | drag-resize |
| `LedgerCellEditor.tsx` | 161 | in-cell editing |

### 3.2 The per-desk chrome forks

Every one of these hand-assembles its own header. This is the "completely different
display" the operator is describing — 30-odd surfaces that agreed on a data waist and then
each drew their own chrome on top of it.

```
1,383  repair/ProductSelector.tsx
1,062  station/ReceivingLinesTable.tsx
  975  receiving/unbox/UnboxWorkspaceHeader.tsx
  599  sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx
  523  features/review/catalog-link/ReviewCatalogLinkTable.tsx
  448  sheet/SheetToolbar.tsx
  442  outbound/orders/CsvImportStagingHost.tsx
  434  features/tasks/TasksWorkbench.tsx
  433  products/catalog/ProductsCatalogWorkspace.tsx
  426  photos/PhotoLibraryWorkspaceHeader.tsx
  424  features/home/HomeDailyMode.tsx
  414  support/zendesk/SupportTicketsBoard.tsx
  413  receiving/pickup/PickupWorkspace.tsx
  379  sidebar/tech/TechRailSearchBar.tsx
  360  features/my-day/MyDayWorkspace.tsx
  324  photos/PhotoLibraryScopeBand.tsx
  293  sidebar/receiving/HistoryWorkspaceHeader.tsx
  289  tracking-exceptions/TrackingExceptionsTable.tsx
  283  warehouse/LocationsWorkspace.tsx
  … 11 more, 167–225 lines each
```

### 3.3 Unbox is the worst case, and it is the reference

`/unbox` is what the operator singled out. `UnboxWorkspaceView.tsx` mounts **three
different body components** depending on state —

```tsx
{tab === 'all'   ? <TechAllTriageTable … />     // one table
 : compare       ? <UnboxCompareHost … />       // a second, two-pane
 : <ReceivingLinesTable … />}                   // a third, 1,062 lines
```

— under its own 975-line header, beside `ReceivingLineRailShell`, inside
`UnboxLineWorkspace`, which hides the whole pane (`visibility: hidden`) whenever the carton
overlay opens. That hidden-pane behaviour is real and load-bearing; it is also why a panel
appears to sit **in the middle** of the display rather than at an edge.

**Unbox is not a special case to preserve. It is the proof that the display layer forked.**

### 3.4 Include my own work in the teardown

`src/components/sheet/` (12 files, 2,094 lines) and `StationHistoryDock` / `StationDeck` /
the three connected docks were added in the previous pass. The operator has looked at the
result and asked for a clean restart. **Do not exempt them.** They are listed in § 4 with
everything else.

---

## 4. Delete list

Delete outright. No deprecation, no re-export shims, no adapters.

### 4.1 The whole chrome layer

```
src/components/sheet/                                   entire directory
src/components/dashboard/workbench-shell.tsx
src/components/dashboard/WorkbenchSheetView.tsx
src/components/dashboard/workbench-filter-popover.tsx
src/components/dashboard/workbench-band-control.tsx
src/components/dashboard/useOutboundSheetChrome.tsx
src/components/dashboard/OutboundFilterStrip.tsx
src/components/dashboard/OutboundOrderChromeActions.tsx
src/components/dashboard/QueueSortSwitch.tsx
src/components/packing/PackBenchRefineFacet.tsx
src/components/sidebar/tech/TechRailSearchBar.tsx
src/components/ui/table-options/                        entire directory
src/components/ui/table-density/                        entire directory
src/lib/tables/table-density.ts
src/hooks/useTableDensity.ts
```

…plus **every `*WorkspaceHeader.tsx` / `*TriageBand` / `*ChromeActions.tsx`** in § 3.2.

### 4.2 The grid's interactive layer

```
LedgerCellEditor.tsx           in-cell editing
ColumnResizeHandle.tsx         drag-resize
LedgerGridColumnContextMenu.tsx right-click column menu
LedgerDrillHost.tsx            drill pane
LedgerDrillParentMap.tsx       "
GridColumnDetailsTrigger.tsx   the column-display rail
useGridColumnVisibility.ts     per-staff hide/show
useGridColumnWidths.ts         persisted widths
grid-zoom.ts                   zoom
grid-column-resize-edges.ts    "
```

### 4.3 The formatting feature

Added last pass, never asked for by an operator:

```
src/lib/tables/column-formats.ts (+ test)
src/lib/tables/column-formats-queries.ts
src/app/api/tables/[tableId]/column-formats/route.ts
src/components/sheet/SheetSwatchMenu.tsx
src/components/sheet/SheetColumnPicker.tsx
src/components/sheet/useSheetFormat.tsx
src/components/sheet/sheet-format-context.tsx
```

**Leave `table_column_formats` in the database.** Dropping a table is a separate,
irreversible decision; an unread table costs nothing. Write a migration that drops it only
if the operator says so.

### 4.4 Station docks and rails beside a table

```
src/components/station/StationHistoryDock.tsx
src/components/station/StationDeck.tsx
src/components/station/ShippingHistoryDock.tsx
src/components/station/PackHistoryDock.tsx
src/components/station/UnboxHistoryDock.tsx
src/components/station/station-history-dock-feeds.tsx (+ test)
```

The older rails (`ShippingStaffScanHistoryRail`, `PackRecentPacksRail`, `LabelsRecentRail`,
`SidebarRecentRailBase`) go too **if** nothing outside a table mounts them — check first;
several are navigation, not table chrome.

### 4.5 Do NOT delete

| Keep | Why |
|---|---|
| `src/design-system/primitives/SearchField.tsx` | The operator named it. Strip its `trailingPrefix` / `trailingSuffix` / `inlineContent` slots — those are how the second funnel got in. |
| `LedgerGrid.tsx` + `grid-column-geometry.ts` + `grid-cell-chrome.ts` | The table itself: CSS-var tracks, the airtable skin, the row shell. |
| `VirtualGroupedSections.tsx` | 900-row queues need windowing. Not optional. |
| `src/components/tables/compound/` | **The two-row row with the photo.** Explicitly required earlier: *"keep existing two rows display for the row with photo taking up two rows"*. |
| `src/lib/tables/table-definition.ts`, `table-surface-binding.ts`, `registered-bindings.ts`, `NonlinearTableHost.tsx` | The data waist. 23 bindings resolve through it and it is not what is broken. |
| `src/lib/selection/`, `useTableSelection`, `useTableSelectMode` | The checkbox gutter needs them. |
| Everything under `src/lib/` that fetches or shapes rows | This is a display teardown. The domain is fine. |

---

## 5. What to build back

**One component.** Give it a name and let it be the only way a table reaches a screen.

```
┌─────────────────────────────────────────────────────────┐
│ [ 🔍 search ]  [ ▽ filter ]                             │  one row, two controls
├──┬──────────────────────────────────────────────────────┤
│☑ │ Order      Item              Status      Amount      │  header + select-all
├──┼──────────────────────────────────────────────────────┤
│☑ │ 09-69683   Bose Wave …       TESTED      $0.00       │  two-row compound
│  │ 76755777   Pack Tuan · Jul 7  64d late               │
├──┴──────────────────────────────────────────────────────┤
│ Must ship 99+ · Urgent · Out of stock          82 of 922│  tabs + counts
└─────────────────────────────────────────────────────────┘
```

Rules for the rebuild:

1. **One header, drawn once.** No page supplies chrome. A surface supplies its rows, its
   columns, its tabs, and its filter options — data, never JSX.
2. **No slots that take `ReactNode` for chrome.** Every slot the old shell offered
   (`leading`, `right`, `trailing`, `views`, `extraControls`, `searchSlot`, a controls
   portal) is how thirty desks each drew something different. A props object of *data* is
   the difference between one display and thirty.
3. **The URL stays the state.** Filters, the active tab, and sort live in the URL. That is
   the deep-link contract and every existing bookmark depends on it.
4. **Selection is the only interaction** at first: a checkbox gutter, a select-all, and a
   count. Row-open comes back after, if asked for.
5. **Borders do not change.** Bottom-only rules through header and body, no vertical
   column cage. A before/after screenshot of any grid must show zero border change.

---

## 6. Constraints that still bind

From `AGENTS.md` — these are not part of the teardown's licence:

- **No layout animations.** Nothing tweens `height`, `width`, `top`, `left`, margin,
  padding, or framer's `layout` / `layoutScroll`.
- **`orgId` from `ctx.organizationId`**, never the body. Org-scoped writes go through
  `withTenantTransaction`.
- **Never create a branch.** Work on `main`, in a worktree if you need isolation.
- **Stage only files you changed.** `git add -A` sweeps other sessions' work.
- **`:3050` and `usav-dev` are the operator's.** A lane of your own is fine — `next start
  -p 3100` and `PW_BASE_URL` — and `pkill` narrowly (`pkill -f "next start -p 3100"`), never
  `pkill -f next-server`, which kills theirs.
- **`npm run verify` green before done**, and run `npm run build`: the production build
  catches server-bundle module-init failures that typecheck and unit tests do not.

---

## 7. Sequence

1. **Delete first, green second.** Take § 4 out in one pass. Expect a large red build; walk
   it to green by deleting call sites, not by restoring components. A route that has
   nothing to render should render nothing — do not reintroduce a placeholder component.
2. **Build the one component**, mount it on To-ship only, and get the § 2 corrections
   right there.
3. **Move the other surfaces onto it**, deleting each one's chrome as you go. A surface is
   done when it passes rows, columns, tabs and filter options, and supplies no JSX.
4. **Unbox last.** Its three bodies collapse to one; the carton overlay's hidden-pane
   behaviour has to be understood before it is touched, and it is the reason a panel looks
   like it sits mid-display.

---

## 8. Things that will bite you

Learned the hard way in the previous pass. Each cost an hour.

- **`/shipping/orders` RSC-seeds its list** into a `HydrationBoundary`
  (`unshipped-queue-seed.server.ts`). A plain load issues **zero** `/api/orders` requests,
  so a Playwright route mock never fires. Navigate with a key the seed misses (`?staff=`)
  when you need fixtures.
- **e2e auth**: `PW_OWNER_EMAIL` / `PW_OWNER_PASSWORD` in `.env` are stale. `global-setup`
  now falls back to pinless, so it works — but if you see `401 INVALID_CREDENTIALS`, that
  is the warning, not a failure.
- **The desks render the COMPOUND row.** `data-col="title"` does not exist. The tracks are
  `select · thumb · fulfillment · item · state · amount · actions · _fill`. Three e2e specs
  were red for months because they were written against the retired flat model.
- **Sort is written in FACTS, keyed by TRACKS.** `queueSortForColumnKey` bridges them. If
  you delete it, header clicks silently stop sorting again.
- **`table-catalog.ts` must stay in lockstep with `REGISTERED_BINDINGS`** — the API route
  cannot import the registry (it drags `'use client'` cells into the server bundle and the
  production build fails on a Zod parse of a half-initialised module). `table-catalog.test.ts`
  is the guard.

---

## 9. Definition of done

- `src/components/sheet/` does not exist.
- `grep -rl "WorkbenchChromeHeader\|WorkbenchTriageBand" src` → **0**.
- No file matching `*WorkspaceHeader.tsx` remains under `src/components`.
- One component draws every table header, and it takes no `ReactNode` chrome slots.
- The To-ship desk shows: a search box, **one** filter button, a header with a select-all,
  two-row rows, a bottom strip **without** "All", and a row count.
- `npm run verify` green · `npm run build` green.
- Net line count **down by several thousand**. If it went up, the teardown became a
  refactor and the fork survived.

---

## 10. First commands

```bash
git branch --show-current          # must print `main`
rm -rf src/components/sheet
npm run verify                     # expect red; walk it green by DELETING call sites
```
