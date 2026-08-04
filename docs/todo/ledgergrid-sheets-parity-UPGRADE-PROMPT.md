# LedgerGrid Sheets/Notion parity — upgrade prompt

**For:** the agent session that executes this initiative. Read this whole file before touching code.
**Status:** handoff only — no product/TS code by the sessions that wrote or upgraded this file.
**Context upgrade:** 2026-08-03 — pre-filled scan seeds, date end-align + frozen-edge grip baseline,
bench/screenshot interpretation, Ask-first Phase 1 scope locked to `id` + `location` (not `number`).
**Baseline:** [`table-surface-inventory-2026-07-31.md`](table-surface-inventory-2026-07-31.md) (updated
through 2026-08-03) — **Phase 3 of that plan is COMPLETE.** Every Workbench ops queue mounts
`LedgerGridSurface` behind a thin host; every admin/settings/reports list mounts `DataTable`. Do not
re-run that migration. This prompt is the **next** initiative on top of that pin: close the gap between
what LedgerGrid does today and a Notion/Airtable/Sheets-class grid — full-width resize, off-screen
horizontal scroll, harmonized default widths — without inventing a second engine.

---

## 1. Product frame

**One data-table engine for Workbench: `LedgerGrid` / `LedgerGridSurface`.** Admin/settings/reports stay
on the sibling `DataTable` (same alignment SoT, no virtualization, no Fields — that split is intentional,
see inventory §D). This prompt does **not** touch that boundary.

Target experience, stated plainly: an operator can drag the edge of **identifier / tracking** fact
columns — `order`, `tracking`, `sku`, `serial` — the way they drag a column edge in Google Sheets or
Notion. Every fact column is sortable. Default column widths for those tracks read as roughly **8 digits**
wide, not the current 4.5–5rem floors tuned for a 5-character preview. Horizontal scroll reveals columns
rather than squashing them. The Fields/column-display gutter (`GridColumnGutter` →
`GridColumnDetailsPanel`) stays the single columns affordance — this prompt does not touch it.

### Non-goals (explicit — do not drift into these)

- **No second table engine.** `DataTable` keeps its job (non-virtualized RSC-safe admin lists). Do not
  give it resize/reorder/Fields — that would make it a second, weaker `LedgerGrid`, which its own
  docblock and the July inventory (§ A4) already forbid.
- **No USAV/dogfood framing.** This is a house capability, not a tenant-specific one.
- **No change to `CopyChip`'s last-8 *display* format.** The chip face stays last-8; only the *track
  width around it* becomes operator-adjustable. Do not touch `getLast8` / `resolveChipDisplay`.
- **No merge of the two URL sort vocabularies.** `?colsort=`/`?coldir=` (column-click surfaces) and
  `?sort=`/`?dir=` (Orders/Repair composite display order) are a **ruled, documented split**
  (`source-of-truth.md` → Grid column visibility + sort; inventory § A3). Do not touch it.
- **No mobile/list-density change.** Mobile stays list-density by design (inventory §E).
- **No re-litigating Orders' permanent header fork** (`OrdersQueueColumnHeader` — inventory § A2,
  reconfirmed through Wave 8). This prompt's Phase 2 does lift **reorder** into the shared factory as a
  *capability*, but it does not force Orders off its fork or force every family to adopt reorder.
- **No mid-grid “leading grip on every seam”.** Mid-grid Airtable left-owns-divider stays. The
  frozen-edge dual-grip fix (2026-08-03) is **not** a license to put leading+trailing grips on every
  column — see §2.2.

---

## 2. Already shipped — cite this, do not rediscover it

A fresh agent must not re-run the July/August table-surface migration. Read
[`table-surface-inventory-2026-07-31.md`](table-surface-inventory-2026-07-31.md) in full before Phase 0.
Headline facts this prompt depends on:

- **13 `GridView` families + 15 `LedgerGrid`/`LedgerGridSurface` mounts**, every one registered against a
  declared `GridSurfaceCapabilities` bag (inventory § A1, closed 2026-07-31) and a
  `makeLedgerGridColumnHeader`-generated header (inventory Wave 8, done 2026-08-01) — **except Orders**,
  which is the one permanent, guarded fork. Counts reconfirmed 2026-08-03 deep scan: **13**
  `*GridView.tsx`, **13+** `*-grid-layout.ts`, **17** `DataTable` consumers. July inventory Phase 3
  **complete** — this initiative is Sheets-parity *on* the pin, not re-migration.
- Column models live in per-family `*-grid-layout.ts` (e.g.
  [`incoming-grid-layout.ts`](../../src/lib/receiving/incoming-grid-layout.ts)) and
  [`dashboard-order-row-layout.ts`](../../src/lib/dashboard-order-row-layout.ts) for Orders.
- Alignment SoT: [`grid-header-align.ts`](../../src/design-system/components/grid/grid-header-align.ts)
  → `resolveGridColumnAlign` / `ALIGN_BY_TYPE` (`number`/`id`/`date` → end; `text`/`tag`/`external`/
  `location` → start; `order` is an explicit `align: 'start'` override on three surfaces — see
  `source-of-truth.md` → Grid column justification).
- Resize SoT: [`ColumnResizeHandle.tsx`](../../src/design-system/components/grid/ColumnResizeHandle.tsx)
  (mutates only `--cf-col-<key>`, commits once on drop to
  `staff_preferences.tableColumns[tableId].widths`) + frozen-edge dual grips
  (`grid-column-resize-edges.ts` → `resolveColumnResizeEdges`).
- Resizability gate:
  [`grid-column-editability.ts`](../../src/design-system/components/grid/grid-column-editability.ts) →
  `isGridColumnResizable` / `FIXED_WIDTH_COLUMN_TYPES = new Set(['number', 'id', 'location'])`. **This is
  the exact gate Phase 1 below has to change, and it is currently a deliberate, documented ruling** — see
  §4.
- Fields / column-display entry:
  [`GridColumnGutter`](../../src/design-system/components/grid/GridColumnDetailsTrigger.tsx) — hover-
  revealed over the card's top-right corner, opens `GridColumnDetailsPanel` (visibility · highlight ·
  chip · Reset). Confirmed the sole columns affordance (inventory Phase 3.5 item 1, done 2026-08-01).
- Reorder exists **only** on Orders (`OrdersQueueColumnHeader`, whole-header-cell drag via `dnd-kit`) —
  every other family's header is generated and has no reorder UI (`LedgerGridColumnHeader.tsx` docblock:
  *"Resize / reorder stay out of v1 (Orders deferred)"*).
- Legacy header survivor: `StationRowColumnHeader.tsx`, mounted by `StationListTable.tsx`
  (Tech/Packer history) — not yet on the `makeLedgerGridColumnHeader` factory.
- FBA board + station-history: **capabilities declared** (inventory § A1 closed) but **deliberately have
  no column model / descriptor** — station-history reuses `ORDERS_QUEUE_COLUMNS`, the FBA board still
  hand-rolls its track template, because authoring a column model nothing renders from would be a stale
  second declaration (inventory § A1, "No descriptor for either, deliberately"). **Do not treat this as
  an open gap from the July inventory** — it is a settled decision. If Sheets-parity work wants a real
  spreadsheet on the FBA board, that is a **new, ask-first** decision this prompt's Phase 2 should raise,
  not something Phase 0 should flag as a stale TODO.

### 2.1 Session baseline — shipped 2026-08-03 (cite, do not redo)

| Change | Where | Ruling |
|---|---|---|
| **`date` end-aligns** | [`grid-header-align.ts`](../../src/design-system/components/grid/grid-header-align.ts) `ALIGN_BY_TYPE.date = 'end'` | Civil day / duration is a magnitude (“sooner / overdue?”). `location` stays **start**. Docs synced: `AGENTS.md`, `source-of-truth.md` → Grid column justification, `ui-design-system.md`, `display/workbench-ops-queue.md`. |
| **Frozen-edge dual grips** | [`resolveColumnResizeEdges`](../../src/design-system/components/grid/grid-column-resize-edges.ts) + [`ColumnResizeHandle`](../../src/design-system/components/grid/ColumnResizeHandle.tsx) `edge` / `flush` | Mid-grid: left-of-divider owns the seam (Airtable). At sticky title edge: flush title trailing + leading grip on the first scrollable **resizable** column (Incoming By / Orders Ship by). Wired in [`LedgerGridColumnHeader`](../../src/design-system/components/grid/LedgerGridColumnHeader.tsx) + the Orders fork. |
| Incoming Age | [`incoming-grid-layout.ts`](../../src/lib/receiving/incoming-grid-layout.ts) | Dropped redundant `align: 'end'` — type map covers it. |
| **Unbox chrome went two-row** | [`UnboxWorkspaceHeader.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx) | Row 1 = tabs · KPI cluster (`WorkbenchChromeHeader` new `middle` slot) · CTA. Row 2 = the **data-table triage band** (`UnboxTriageBand`, Unbox-local) — search left, refine + week-pill right. **The grid's toolbar portal target (`controlsSlotRef`/`data-unbox-controls`) now lives in row 2, not row 1** — if this prompt's Phase 2 h-scroll/reorder work touches `ReceivingLinesTable`'s `toolbarPortalTarget` wiring, the portal DOM position moved but the prop contract did not. Detail: `display/workbench-ops-queue.md` → Sticky docking, Scoped exception. |

### 2.2 Bench / screenshot interpretation (do not chase ghosts)

1. **Fields gutter (columns icon, top-right of the card)** — `GridColumnGutter` → `GridColumnDetailsPanel`.
   Sole columns affordance. Do not mount a second Fields control in chrome or the header band.
2. **STATUS / mid-grid dark seam** — grabbing the **left** edge of Status resizes the **previous** column
   (Airtable left-owns-divider). That is correct mid-grid behavior, **not** the frozen-edge footgun.
   The frozen-edge fix only applies at `data-frozen-edge` (title \| first scrollable). Mid-grid “I wanted
   Status but Cond/Product moved” is expectation education — or a future Ask-first expansion to
   leading+trailing grips everywhere. **Out of scope** for this prompt unless the human expands Phase 1.
3. **Order / tracking look “stuck” at ~8 chars** — CopyChip **face** is last-8 by SoT
   (`copy-chip-format`); **track width** is what Phase 1 unlocks. Do not change last-8 display.

---

## 3. The actual gap (Sheets/Notion parity, not table-engine consolidation)

| Gap | Today | Target |
|---|---|---|
| Resizable order / tracking / SKU / serial | `FIXED_WIDTH_COLUMN_TYPES = number\|id\|location` blocks grips by design (`grid-column-editability.ts`) | Unlock **`id` + `location`**; `select` stays non-resizable; **`number` stays fixed** unless Ask-first expands |
| Default widths inconsistent + narrow | Orders `tracking: 5rem`, `order: 4.5rem`; Incoming `order: 7rem`, `tracking: 8rem` | Harmonize identity/tracking floors toward an **8-digit** default in the layout SoTs |
| Column reorder | Whole-header drag only on Orders; every other family has none | Promote reorder into the shared header factory as an opt-in capability; `tableColumns.order` prefs already exist to receive it |
| Legacy header survivor | `StationRowColumnHeader` (Tech/Packer history) predates the factory | Migrate onto `makeLedgerGridColumnHeader` + a real descriptor, or document why not |
| H-scroll consistency | Incoming title is content-hard `minmax(16rem, 16rem)` (Notion overflow pilot); Orders title still `minmax(12rem, 1fr)` | Audit; flag `1fr` fill tracks — do not silently flip without a design call |

This is **narrower** than the July/August initiative. That one asked "is every Workbench table on the
pin?" (answer: yes). This one asks "does the pinned engine behave like Sheets on the columns that matter
most to an operator scanning a warehouse?" (answer: not yet, on purpose — see §4).

### 3.1 SoT growth points only (pattern-evolution)

Grow these modules — never invent a twin:

1. [`grid-column-editability.ts`](../../src/design-system/components/grid/grid-column-editability.ts) —
   shrink `FIXED_WIDTH_COLUMN_TYPES`: unlock **`id` + `location`**; keep `select` false via its own
   branch; **`number` stays in the set** unless separately approved.
2. Layout SoTs — especially
   [`dashboard-order-row-layout.ts`](../../src/lib/dashboard-order-row-layout.ts) `tracking`
   `minmax(5rem, 5rem)` → `minmax(8rem, 8rem)` (match Incoming).
3. Docs in the **same** change: editability docblock + `source-of-truth.md` → Grid column visibility +
   sort (must not disagree).
4. [`grid-column-resize-edges.test.ts`](../../src/design-system/components/grid/grid-column-resize-edges.test.ts)
   — after unlocking `id`, Catalog’s first-after-title (`sku`) may gain a leading grip.
5. Later (Phase 2): promote Orders reorder into the factory as **opt-in**; retire
   `StationRowColumnHeader`.

**Never:** per-surface `resizable: true` spam across 13 layouts; a second resize-handle module; a second
width prefs key; merge `colsort`/`sort`; change CopyChip last-8 face; force DataTable to grow
Fields/resize.

---

## 4. Phase 1 is a reversal of a *documented, deliberate* ruling — read this before touching code

`isGridColumnResizable` does not withhold grips from `number`/`id`/`location` by oversight. The docblock
on `FIXED_WIDTH_COLUMN_TYPES` states the reasoning explicitly: these are identifier/magnitude tracks whose
cell content renders through the `CopyChip` last-8 preview or a short tabular numeral run, so "dragging
one wider produces a wider empty gutter beside the same eight characters." `source-of-truth.md` → *Grid
column visibility + sort* repeats the same ruling: *"`isGridColumnResizable` decides who gets a grip:
variable-content tracks yes; `select` and the fixed-format types (`number` · `id` · `location`) no,
because those cells render a last-8 chip or a short numeral run and a drag only moves whitespace."*

**This prompt's whole premise is that the ruling is wrong for the identifier columns operators actually
want to widen** (order #, tracking, SKU) — the "drag only moves whitespace" argument holds for a bare
last-8 preview, but an operator who wants to see more of a tracking number, or fit a longer PO number, is
asking for exactly that whitespace. That is a genuine product argument, but it is **not** this prompt's
call to make unilaterally:

- Per `pattern-evolution.md` → **Ask first**: *"Public API changes to a shared primitive used by many
  call sites."* `isGridColumnResizable` gates all 13+ grid families.
- The correct move is: **grow the SoT**, not fork around it — never add a per-surface
  `resizable: true` spam on 13 layout files as a workaround.

**Do not silently empty `FIXED_WIDTH_COLUMN_TYPES` and ship it.** Before any code:

1. State the reversal explicitly to whoever is driving this session — quote the existing ruling above and
   the proposed new one, and get an explicit go before editing `grid-column-editability.ts`.
2. If approved, the change is **narrow and additive**: `id` and `location` gain grips (tracks operators
   want to widen); `select` stays non-resizable (no content to fit); **leave `number` alone** unless a
   specific qty/count column is separately approved — a bare `#` qty column is genuinely a short numeral
   run with no argument for widening.
3. Update the docblock on `FIXED_WIDTH_COLUMN_TYPES` in the same change — it currently states the OLD
   reasoning as settled fact. A stale docblock next to reversed code is exactly the trap
   `pattern-evolution.md` → *After a correction* warns about.
4. Update `source-of-truth.md` → *Grid column visibility + sort* (the `isGridColumnResizable` paragraph)
   in the same change. Do not leave two documents disagreeing — see the July inventory's own
   "UNRESOLVED CONTRADICTION" entry (§ Compound opportunities) for what that costs later.
5. Re-run `grid-column-resize-edges.test.ts` — unlocking `id` may hand Catalog's first-after-title column
   (`sku`) a leading grip it did not have before (`resolveColumnResizeEdges` adds a leading grip to "the
   first resizable column after `frozenEdgeKey`").

**Proposed new ruling (for the approval conversation):**

> Magnitudes that are short tabular numerals (`number` / qty) stay non-resizable — drag only grows
> whitespace beside `#`. Identifier and location tracks (`id` / `location` — order, SKU, serial,
> tracking) **are** resizable: operators widen them to read more of the value; default floors stay ≈
> eight digits / `8rem`. `select` never gets a grip.

---

## Phase 0 — deep scan (write findings only; zero behavior change)

Do not skip this because §2/§3 above look complete — this repo's own rule
(`pattern-evolution.md` → *After a correction*) is that a stale claim in a rules file is invisible until
someone re-scans. Run every check below against the **current** tree, not this document's snapshot.
Pre-filled tables below are **seeds from the 2026-08-03 scan** — re-verify and correct drift.

### 0a. Mount + fork census

```bash
rg -n '<LedgerGrid(Surface)?[ />]' src --type=tsx
rg -n '<DataTable[ />]' src --type=tsx
rg -n '<table\b' src/app src/components --type=tsx
rg -n 'role="grid"' src --type=tsx
```

Tag every hit: `on-pin` (already `LedgerGridSurface` + descriptor + capabilities) ·
`thin-adapt` (on-pin but missing a piece — e.g. reorder, factory header) ·
`migrate-to-LedgerGrid` · `migrate-to-DataTable` · `keep-sibling-job` · `retire`.

**Findings — seed (re-verify):**

| File / family | Mount kind | Tag | Notes |
|---|---|---|---|
| 12 Surface GridViews (Receiving, Incoming, Catalog, …) | `LedgerGridSurface` | `on-pin` | factory headers |
| `OrdersGridView` + remounts | `LedgerGrid` + `useGridSurface` | `on-pin` (header fork) | Packed/Shipped/Unshipped/Labels/Staged/Review packing·pairing/Support orders |
| `StationListTable` (Tech/Packer) | `LedgerGrid` | `thin-adapt` | legacy `StationRowColumnHeader` |
| `FbaBoardTable` | `LedgerGrid` + caps | `keep-sibling` / ask-first | hand template; no column model by design |
| Admin Favorites / Reason codes / Locations / Repair issues | CSS-grid CRUD | `migrate-to-DataTable` or keep | Phase 3 backlog if still custom |
| Schedule / heatmap matrices | 2D editors | `keep-sibling-job` | not spreadsheet |

### 0b. Resize/sort/align fork census

```bash
rg -n 'justify-end|justify-start|text-right|text-left' src/components src/lib --type=tsx -g '!*grid*'
rg -n 'onResize|resizeHandle|ResizeHandle' src --type=tsx -g '!*/design-system/components/grid/*'
rg -n "'asc' \| 'desc'" src --type=ts --type=tsx
```

Any second header, resize handle, sort machine, frozen-left math, or hand-typed alignment ternary outside
`@/design-system/components/grid` is a fork. Known survivors going in:

| File | What it forks | Migrate / keep-sibling / already-allowlisted |
|---|---|---|
| `OrdersQueueColumnHeader.tsx` | Header + DnD reorder (uses SoT `ColumnResizeHandle`) | **already-allowlisted** permanent fork |
| `StationRowColumnHeader.tsx` | Legacy two-zone header | **migrate** (Phase 2) |
| FBA board header spans | Hand track template | ask-first / keep-sibling |

### 0c. Capability + column-model matrix

| Family | Shell | Header | Has reorder? | Column model | Notes |
|---|---|---|---|---|---|
| Orders (+ remounts) | `LedgerGrid` + `useGridSurface` | **`OrdersQueueColumnHeader` fork** | yes | `dashboard-order-row-layout.ts` | Permanent outlier — lift reorder *capability* for others; don’t force Orders off fork |
| Receiving (Unbox/History/Testing) | `LedgerGridSurface` | factory | no | `receiving-grid-layout.ts` | on-pin |
| Incoming | `LedgerGridSurface` | factory | no | `incoming-grid-layout.ts` | content-hard title (h-scroll pilot) |
| Catalog | `LedgerGridSurface` | factory | no | `catalog-grid-layout.ts` | after Phase 1, `sku` may get frozen-edge leading grip |
| Repair | `LedgerGridSurface` | factory | no | `repair-grid-layout.ts` | on-pin |
| Pickup | `LedgerGridSurface` | factory | no | `pickup-grid-layout.ts` | on-pin |
| Warranty | `LedgerGridSurface` | factory | no | `warranty-grid-layout.ts` | on-pin |
| Ready | `LedgerGridSurface` | factory | no | `ready-grid-layout.ts` | on-pin |
| Unfound | `LedgerGridSurface` | factory | no | `unfound-grid-layout.ts` | on-pin |
| Bins | `LedgerGridSurface` | factory | no | `bins-grid-layout.ts` | on-pin |
| Tracking exceptions | `LedgerGridSurface` | factory | no | `tracking-exceptions-grid-layout.ts` | on-pin |
| My Day | `LedgerGridSurface` | factory | no | `my-day-grid-layout.ts` | on-pin |
| Catalog-link (+ import-exception) | `LedgerGridSurface` | factory ×2 | no | `catalog-link-grid-layout.ts` / `import-exception-grid-layout.ts` | on-pin |
| Station history (Tech/Packer) | `LedgerGrid` | **`StationRowColumnHeader` legacy** | no | reuses `ORDERS_QUEUE_COLUMNS` (by design) | Phase 2 header migrate |
| FBA board | `LedgerGrid` + caps | hand-rolled | no | none (by design) | **ask-first** before inventing a column model |

Fill blanks / correct drift after re-running greps; confirm nothing has moved since 2026-08-03.

### 0d. Width matrix — every `id` / `location` / `number` column

```bash
rg -n "type: '(id|location|number)'" src/lib src/components --type=ts
```

**Findings — seed (re-verify every row):**

| Surface | Key | Type | Declared width today | CopyChip last-8? | Resizable today? | Phase 1 default target |
|---|---|---|---|---|---|---|
| Orders | `order` | `id` + `align:start` + frozen | `minmax(4.5rem, 4.5rem)` | last-N face | **no** (FIXED_WIDTH) | Unlock resize; keep identity **start**-align; widen toward ~8rem only if approval includes order |
| Orders | `tracking` | `location` | `minmax(5rem, 5rem)` | yes | **no** | **`minmax(8rem, 8rem)`** (match Incoming) |
| Orders | `qty` | `number` | `minmax(3.5rem, 3.5rem)` | short numeral | **no** | Leave `number` in FIXED_WIDTH unless Ask-first expands |
| Incoming | `order` | `id` + `align:start` + frozen | `minmax(7rem, 7rem)` | yes | **no** | Unlock resize; width already near 8-digit |
| Incoming | `tracking` | `location` + `omitCellIcon` | `minmax(8rem, 8rem)` | yes | **no** | Unlock resize; default already 8rem |
| Incoming | `qty` | `number` + `headerGlyphOnly` | `minmax(3.5rem, 3.5rem)` | short numeral | **no** | Same as Orders qty |
| Receiving | `tracking` / `serial` | `location` / `id` | typically `8rem` | yes | **no** | Unlock; keep ~8rem floors |
| Catalog | `sku` | `id` | `minmax(7rem, 7rem)` | yes | **no** | Unlock; may gain frozen-edge **leading** grip — update resize-edges tests |

H-scroll pilot: Incoming title is **content-hard** `minmax(16rem, 16rem)` (not `1fr`) — Notion overflow
doctrine. Orders title still `minmax(12rem, 1fr)` — Phase 2 audit **flag**, not a silent flip.

### 0e. Duplication heat

```bash
rg -n "resolveGridColumnAlign|gridCellAlignClass|gridHeaderCellAlignClass" src --type=ts -c | sort -t: -k2 -n
rg -l "gridFrozenLeft\(" src --type=ts
```

Files that re-derive alignment/resize/frozen-left math instead of importing the SoT helpers are forks
even if they produce the right pixels today.

### Phase 0 exit gate

Update this section (or append a dated addendum to the July inventory) with reconciled tables above,
plus a ranked backlog. **Get explicit approval on the Phase 1 reversal (§4) before writing any Phase 1
code** — this is a harder gate than a normal scan-exit because it changes a shared primitive's contract.

**Hard gate script for the human:**

1. Quote the OLD ruling (FIXED_WIDTH includes `number` · `id` · `location`).
2. Quote the PROPOSED ruling (§4 above — unlock `id` + `location`; keep `number`).
3. Wait for explicit go before editing `grid-column-editability.ts`.

---

## Phase 1 — pin resize to the SoT (pending §4 approval)

1. Narrow `FIXED_WIDTH_COLUMN_TYPES` to **`{'number'}` only** (or equivalent: remove `id` and
   `location` from the set). Keep `select` excluded by its own `column.key === 'select'` branch,
   unchanged. Do **not** empty the set unless the human separately approves unlocking `number`.
2. Update the `FIXED_WIDTH_COLUMN_TYPES` docblock and `source-of-truth.md` → *Grid column visibility +
   sort* in the same commit.
3. **Default widths** — raise identifier/tracking floors toward an 8-digit target in the layout SoTs.
   Concretely, in `dashboard-order-row-layout.ts`: `tracking` `minmax(5rem, 5rem)` → `minmax(8rem, 8rem)`
   (already Incoming's value — reuse it, don't invent a new number). Leave `order` width as-is unless the
   approval conversation also wants it widened; it is already `align: 'start'` as a transaction identity
   (a different ruling — see `source-of-truth.md` → Grid column justification — do not conflate the two).
4. Re-run `grid-column-resize-edges.test.ts` and any snapshot/E2E asserting the old fixed widths
   (`ledger-grid-column-display.spec.ts` and family-specific specs) — expect intentional diffs, not
   silent breaks. Catalog-shaped “no start grip” cases may change once `sku` (`id`) becomes resizable.
5. Confirm `staff_preferences.tableColumns[tableId].widths` round-trips a resized `id`/`location` column —
   this path already exists for resizable columns; nothing new to build there.

**Acceptance:**
- `npm run verify` green.
- `grid-column-resize-edges.test.ts`, `grid-column-editability.test.ts` updated and green.
- `source-of-truth.md` and the `FIXED_WIDTH_COLUMN_TYPES` docblock agree with the shipped code (no
  reintroduction of a docs/code contradiction).
- Manual bench check (Playwright or Browser pane) on Incoming (`/incoming`) and `/dashboard`: drag the
  `order` or `tracking` column edge, confirm it resizes and the width persists across reload.

---

## Phase 2 — reorder + legacy header + h-scroll audit

1. **Lift column reorder into the shared factory as an opt-in capability**, not a forced default. Model it
   after `OrdersQueueColumnHeader`'s `onReorderColumns` prop (`dnd-kit`, whole-header-cell drag, locked
   pane excluded via `isOrdersQueueFrozen`-equivalent). `makeLedgerGridColumnHeader` gains an optional
   `reorder` config; families that want it opt in per column model. **Do not force Orders to migrate onto
   the lifted version** — its fork is permanent and guarded (inventory § A2); lifting reorder is about
   giving *other* families the option, not retiring the fork.
2. **Migrate `StationListTable` off `StationRowColumnHeader` onto the factory.** It already has capabilities
   (`STATION_HISTORY_GRID_CAPABILITIES`) and reuses `ORDERS_QUEUE_COLUMNS` as its column source — the
   migration is header-only, not a new column model. Confirm `use-is-column-hidden.guard.test.ts`'s
   allowlist for `StationRowColumnHeader` shrinks accordingly once it's retired (it's one of four
   documented survivors of the retired `useIsColumnHidden()` path — check whether removing the header also
   removes that call site, or whether it's independent).
3. **FBA board column model — ask-first, do not build speculatively.** Confirm with the user whether
   Sheets-parity extends to the FBA board (real `LedgerGridColumnModel[]` + descriptor) or whether it stays
   `keep-sibling-job` per the July ruling. Do not author a column model nothing renders from "just in
   case" — that recreates the exact stale-declaration trap `makeGridSurfaceDescriptor`'s docblock warns
   against.
4. **H-scroll audit** — walk every family's column model (0a/0c above) and confirm content-hard
   `minmax(Nrem, Nrem)` tracks, not `1fr` fill tracks, on any column meant to scroll off-screen rather than
   squash. Flag (don't silently fix) any `1fr` fill track found on a fact column — that's a design call,
   not a bug fix, if a family deliberately wants its title column to fill remaining width. Known seed:
   Incoming title content-hard; Orders title still `1fr`.
5. **Mid-grid resize UX** — do not expand frozen-edge dual grips house-wide. Document in findings if
   operators still confuse Status’s left seam with “resize Status”; that is left-owns-divider, not a bug.

**Acceptance:**
- Reorder is available to at least one non-Orders family behind an explicit opt-in, proven by a Playwright
  spec (drag two columns, confirm persisted order survives reload via `tableColumns[t].order`).
- `StationRowColumnHeader.tsx` deleted, or a documented reason it survives.
- H-scroll audit findings recorded in this file (table) with explicit `keep` / `fix` per family.

---

## Phase 3 — cleanup backlog

- Retire `StationRowColumnHeader.tsx` fully once Phase 2.2 lands (component + its guard allowlist entry).
- If Phase 1 widened default widths, sweep any hardcoded viewport-width assumptions in E2E specs that
  assert pixel geometry on the old narrower tracks (`grep -rn "5rem\|4.5rem" tests/e2e`).
- Re-run the July inventory's guard suite (`grid-surface-capabilities.guard.test.ts`,
  `ledger-grid-column-header.guard.test.ts`, `grid-column-tier.guard.test.ts`,
  `grid-column-display.guard.test.ts`) — none of Phase 1–2's changes should touch their scope, but they're
  the fastest way to catch an accidental new fork.
- Update `table-surface-inventory-2026-07-31.md` with a dated addendum (not a rewrite — that document is a
  historical record of the completed Phase 3 migration; this initiative is a new, later wave) pointing at
  this file.

---

## 5. Verify

```bash
npm run verify
```

Plus targeted:

```bash
npx tsx --test src/design-system/components/grid/grid-column-editability.test.ts
npx tsx --test src/design-system/components/grid/grid-column-resize-edges.test.ts
npx tsx --test src/design-system/components/grid/grid-header-align.test.ts
npx playwright test ledger-grid-column-display --project=qa-desktop
```

E2E for any new/changed spec must assert against the **QA org** (`QA_ORG_ID`), never dogfood row counts —
`verify.md` → *E2E runs against the QA org*.

After Phase 1: bench Incoming + Orders — drag `order` / `tracking` edges; widths persist across reload.

---

## 6. Pointers (read order for the executing agent)

1. **This file** — Sheets/Notion parity (next wave on the pin).
2. [`table-surface-inventory-2026-07-31.md`](table-surface-inventory-2026-07-31.md) — completed Horizon A
   display pin / Phase 3 migration; read in full before Phase 0.
3. [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md) —
   locked decisions (Horizon A → B → C sequencing; two families one law).
4. `source-of-truth.md` → **Grid column visibility + sort**, **Grid column justification**, **Grid identity
   pane**, **Grid surface capabilities**, **Grid cell chrome**.
5. `.claude/rules/pattern-evolution.md` — Always / Ask first / Never; this prompt's Phase 1 is squarely an
   Ask-first case.
6. `.claude/rules/display/workbench-ops-queue.md` → *Row anatomy* — the column-address rulings (status
   dot, date+stamp, frozen order column, `#` qty header, tracking start-align, chip inset, frozen-edge
   resize) this prompt must not regress while touching widths/resize.
7. `.claude/skills/receiving-grid-cell/SKILL.md` — load before touching `RECEIVING_GRID_COLUMNS` or its
   cells.
