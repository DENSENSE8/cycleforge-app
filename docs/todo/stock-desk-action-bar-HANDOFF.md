# Inventory › Stock — slot-table ACTION BAR handoff

**Status: SHIPPED 2026-09-15.** Four verbs on the strip — Adjust count, Move
to location, **Replace SKU / Pair to real SKU**, Delete — plus the row
selection the desk had no verbs for. What landed, and where:

| piece | file |
|---|---|
| Verb precondition (the mixed-selection trap) | `src/lib/inventory/stock-bin-writes.ts` (+ `.test.ts`, 8 cases) |
| The three requests | `src/lib/inventory/stock-bin-verb-writes.ts` |
| Strip: portal + keys + which row shows | `…/location-stock-grid/StockActionBar.tsx` |
| Strip state + commits | `…/location-stock-grid/useStockVerbStrip.ts` |
| The four faces | `…/location-stock-grid/StockVerbRow.tsx`, `StockAdjustRow.tsx`, `StockMoveRow.tsx`, `StockReplaceRow.tsx`, `stock-verb-row-parts.tsx` |
| SKU replacement precondition (pair vs swap) | `src/lib/inventory/stock-sku-replacement.ts` (+ `.test.ts`, 10 cases) |
| Selection (string-keyed, bus-bridged) | `…/location-stock-grid/useLocationStockSelection.ts` |
| Shared destination list | `…/location-stock-grid/useLocationPickerOptions.ts` (composer now consumes it) |
| Engine: compound row selection | `src/components/tables/useCompoundSpreadsheet.tsx` (`selection` option) |
| Engine: non-numeric row ids | `src/lib/tables/slot-table-visible.ts`, `DataTable.tsx` (`SlotTableRowId`) |

Two engine changes were unavoidable and are additive:

1. **`useCompoundSpreadsheet` had no way to paint a ticked gutter.** It passed
   `selected={false}` and no `select`, so a family could declare
   `multiSelect: true`, pass a `selectionScope` (which reaches the column
   header's select-all) and still get an inert checkbox. Families that pass no
   `selection` are byte-for-byte unchanged.
2. **Selection plumbing assumed a numeric PK.** `DataTable` published
   `Number(getRowId(row))`, so this desk's `(location, sku, source)` triple
   became `NaN`, got filtered out, and the scope published an EMPTY page —
   select-all ticked nothing and the header checkbox read "all" at one tick.
   A numeric-looking key still rides through as a number; anything else keeps
   its string (`SlotTableRowId`).

**Verified against real data** on `/inventory/stock` (dev lane, port 3077),
every write through the desk UI and every figure re-read from Postgres:

| verb | UI | `bin_contents` | `sku_stock` | `sku_stock_ledger` |
|---|---|---|---|---|
| Adjust +1 | projection `3 → 4` before the press | C0413100 3→4 | 13→14 | `#5718 +1 BIN_ADD rc=2 staff=1` |
| Adjust −1 | projection `4 → 3` | C0413100 4→3 | 14→13 | `#5719 −1 BIN_PULL rc=1` |
| Move 1 | `C0413100 · 00045-P-2-BK → C0411100` | 3→2 and 4→5 | unchanged (13) | `#5720 −1 TRANSFER_OUT`, `#5721 +1 TRANSFER_IN` |
| Move back | same, reversed | restored to 3 / 4 | unchanged | `#5722/#5723` |
| Delete | `Delete` → `Delete — press again` → toast "Deleted 1 pairing", row gone after refresh | seeded ZONE pair 2→0 | 3→1 | `#5727 −2 BIN_PULL` |
| Mixed (bin + unit) | `2 rows · 1 writable … 1 of 2 rows skipped: a serialized unit — move it from the unit desk, one unit at a time` | — | — | — |
| Units only | all three verbs DISABLED, reason `Nothing to write here: all 2 rows are serialized units — …` | — | — | — |

Every real figure was put back where it started (the delete ran against a
pairing seeded for it). Net data change: none; the ledger keeps the trail,
which is the point of routing through `adjustBinQty` rather than `set`.

### The SKU replacement verb (added the same day, on the operator's follow-up)

> *"what about a from tmp SKU to a real SKU — SKU replacement and pairing"*

Both writes already existed and neither had a DESK surface: `/m/on-hold` could
pair a placeholder from a phone, and the swap endpoint had no UI at all. They
are now ONE verb whose direction comes from the rows
(`TABLE_ENGINE_LAW.verbsBindToFields` — "a reversible verb is ONE verb with two
directions"), because the operator's question is one question and the answer
depends on what the row's SKU currently IS:

| selected rows' SKU | the verb reads | what it writes |
|---|---|---|
| `TMP-…` placeholder | **Pair to real SKU** | `POST /api/sku-catalog/provisional/merge` → `mergeProvisionalSku`: every `bin_contents` row AND the whole `sku_stock_ledger` history re-keyed onto the real SKU, the rename recorded in `provisional_sku_merges`, the placeholder deleted |
| a real catalog SKU | **Replace SKU** | `POST /api/locations/[barcode]/swap` per selected bin → `SWAP_OUT` / `SWAP_IN` through `adjustBinQty` |

What the strip had to get right, and the reasons:

- **One source SKU, or the verb refuses.** Both writes are keyed by the SKU
  being replaced; a two-SKU selection would either need two targets or fold two
  products into one. The refusal names the count.
- **Pair is SKU-WIDE and the row says so** (`warehouse-wide — every bin +
  ledger`), because the selection is how the operator NAMED the placeholder,
  not the extent of the write. There is no qty input on that path: the
  placeholder's stock is the stock.
- **Pair is ONE request**, not one per selected row — the second would 404,
  because the placeholder no longer exists (`commitOnce` in
  `useStockVerbStrip`).
- **A placeholder with serialized units standing somewhere is refused**, with a
  sentence rather than a constraint name: the merge re-keys bins and the ledger
  but never `serial_units`, then deletes the placeholder's catalog row, which a
  unit still pointing at it would reject.
- **The target list excludes the source SKU and every other `TMP-…`** —
  chaining one placeholder onto another is `target-is-provisional`, so a row
  that could only 409 is not offered.

**Verified against real data**, both directions, through the desk UI:

| direction | UI | result in Postgres |
|---|---|---|
| swap | label `Replace SKU`; face `Bose Wave Audio System (Radio Only) Grey · 00470-P-2-GY →`; scope `the whole count in this bin` | `ZONE/00470-P-2-GY=14` → `ZONE/00045-P-2=14`; ledger `#5741 −14 SWAP_OUT`, `#5742 +14 SWAP_IN` |
| pair | label flips to `Pair to real SKU`; scope `warehouse-wide — every bin + ledger`; no qty field | placeholder `TMP-VERIFY…` folded into `00045-P-2`; its bin row and its ledger row re-keyed; `sku_stock` placeholder rows left **0**; `provisional_sku_merges` = `qty_moved 2, bin_rows_moved 1, ledger_rows_rekeyed 1` |

Seeded stock for both runs and took it back out afterwards; the operator's own
live placeholder (`TMP-FJRJRB`) was never touched.

**Known gap, shared with the intake composer:** the target picker is the Zoho
catalog search (`searchField: 'zoho_catalog'`), so a `sku_catalog` row with no
Zoho mirror row cannot be picked as a target — `00045-P-2-BK` is a live example
(it exists, and searching its full key returns nothing). Both surfaces read one
list, so fixing it is one change to the search source rather than two, and it
is a decision about the catalog, not about this strip.

**§4d is still open** — Mark counted, min/max, print label, copy. So is the
`/m` move counterpart (see §6, ruling below).

**Operator ask (2026-09-15):**

> "include the slot data table action bar on the top just like the shipping page
> for common actions that are most frequent — like move SKU from one location id
> to the other, and adjusting the stock count, and more actions for the stock"

---

## 0. What already exists (do not rebuild any of it)

| thing | where |
|---|---|
| Desk + route | `/inventory/stock` → `src/app/inventory/stock/page.tsx` (RSC loader) |
| Client host | `src/components/inventory/StockByLocationView.tsx` |
| Family glue | `src/components/inventory/location-stock-grid/useLocationStockSpreadsheet.ts` |
| Row shape | `src/lib/inventory/location-stock-row.ts` (`LocationStockTableRow`) |
| Catalog / resolvers | `src/lib/tables/field-catalog/location-stock{,-resolve}.ts` |
| Row adapter | `…/location-stock-grid/location-stock-row-view.ts` |
| Column model | `…/location-stock-grid/location-stock-grid-layout.ts` |
| Binding + capabilities | `…/location-stock-grid/location-stock-table-definition.ts` |
| Feed (both pairings) | `src/lib/neon/location-stock-queries.ts` → `getStockByLocation` |
| Page CTA | `DeskActionSlotRegistrar role="primary"` → "Add stock" |
| Inline intake | `…/location-stock-grid/StockPairComposer.tsx`, mounted in `bodyPrefix` |
| Room funnel | `DataTableFilterMenu` via the `filter` prop; `?room=` |
| Search | engine-wide, over every painted fact (`slotTableSearchFactIds`) |
| Family test | `src/lib/tables/field-catalog/location-stock.test.ts` (22 cases) |
| Live refresh | `…/location-stock-grid/useLocationStockRealtime.ts` + `src/lib/inventory/stock-live-refresh.ts` |
| Live-refresh test | `src/lib/inventory/stock-live-refresh.test.ts` (6 cases) |

**A row is a `(location, sku, source)` triple.** `source` is `'bin'` (loose
counted stock in `bin_contents`) or `'unit'` (serialized units standing at a
location via `serial_units.current_location`). This distinction is the single
most important thing for this task — see §3.

**The desk is live, and it is GATED.** `adjustBinQty` publishes one
`STOCK_DELTA_*` per ledger row after its transaction commits, so every bin verb
on the floor — the gun's put/take, `/m`'s offline queue draining,
`/api/transfers`, the swap, the cycle counts — reaches this desk on the org's
`station:changes`. There is no poll: the page is RSC + `force-dynamic`, so a
tick costs a whole server render of the two-CTE union, and the phone's queued
writes make a clock no fresher anyway.

`useLocationStockRealtime({ gated })` refreshes on the event while the desk is
IDLE, and merely COUNTS while it is gated — a selection armed, or intake open —
because the strip writes the rows it was handed (§3). The held count paints as a
`DataTable` toolbar `actions` chip ("3 new pairings · Refresh"), never as
`TableStatusBar`'s lead, and flushes when the gate lifts. **When you add the
verb strip, keep `onCommitted={live.refreshNow}`**: routing the desk's own
commit through the hook clears the announcement its own echo would otherwise
raise. The gating rule is pure and pinned in `stock-live-refresh.test.ts` —
extend that, not the hook, when a new gate appears.

**Two writers reach this desk without `adjustBinQty`, and only one of them is
wired.** An on-hold MERGE (`POST /api/sku-catalog/provisional/merge`, reachable
from the phone at `/m/on-hold`) folds or re-keys `bin_contents` rows and re-files
the ledger without writing a delta, so it publishes its own
`STOCK_DELTA_MERGED` keyed on the re-keyed ledger row and carrying the
PLACEHOLDER's sku — the sku a bin subscriber is currently showing. The UNIT half
(`serial_units.current_location` — the desk's `source: 'unit'` rows) publishes
NOTHING on placement: putaway, `/api/serial-units/[id]/move`, `/api/pick/scan`
and the RMA restock all write the column and emit only receiving/order events.
Those rows are therefore load-time only. Fixing it means a placement event
(there is no `unit.*` name in `src/lib/realtime/publish.ts` yet) across those
four routes plus one more subscription here — a receiving-cohort increment, not
a line.

---

## 1. The precedent to copy: the shipping action bar

`src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx` (1175 lines)
is the To-ship strip and it is a **slot-table cohort engine file**
(`SLOT_TABLE_ENGINE.morphingRowActionMenu`, in `critiqueFiles` *and*
`graphSymbols`). Read its docblock before writing anything.

Its structural law, verbatim from that file and
`src/components/tables/slot-table-overlay-host.ts`:

- It **portals** into `SLOT_TABLE_ACTION_ROW_ATTR`
  (`data-slot-table-action-row`), an in-flow `empty:hidden` guest that
  `LedgerGrid` stamps **under** `[data-grid-col-header]`.
- Armed, it **grows and pushes the rows**. It never covers the column labels
  and never sits over the search toolbar.
- Idle it is `empty:hidden` — zero height, no placeholder.
- **Selection dismisses it, not an outside click.**
- Primary verbs left, overflow in a `⋮` `DropdownMenu`, destructive verb
  isolated far right so a mis-click on a benign verb cannot fire it.
- **No confirm step.** Picking commits; the write is optimistic and visible on
  the row behind the strip. The one exception is a destructive verb, which
  re-labels in place and takes a second press — never a Confirm *button*.

It mounts through the spreadsheet feed's `bodyPrefix`
(`useOrdersSpreadsheet.tsx:632` → `<OrdersMorphingHost …>`), which is why the
DOM can portal into the grid's own slot. `bodyPrefix` is already occupied on
this desk by `StockPairComposer` — **§5 says how the two share it.**

### Do NOT

- Do not add an `actions` COLUMN. Every table that arrived from `AdminTable`
  had one and that is why none of them could mount the shared row
  (`useCompoundSpreadsheet` docblock, §`VERBS_BIND_TO_FIELDS`).
- Do not pass JSX as a row action. `rowActions?: (row) => CompoundRowAction[]`
  takes label + callback only, so a bespoke control cannot reappear inside the
  shared row wearing an action's name.
- Do not wire new verbs into `TableStatusBar`'s `tabs`. Page modes ride
  `DeskPageChrome`'s top row (operator 2026-08-31).
- Do not paint standing keycaps on the CTAs, and do not open a cheat sheet from
  the table-foot `?`. **Refuse both.** Bind the key; staff `?` reveals
  `HotkeyGlyph` *inline inside the Button next to the label*
  (`src/lib/keyboard/shortcut-display-cohort.ts`).

---

## 2. Selection has to be turned on first — and it changes the row

`LOCATION_STOCK_GRID_CAPABILITIES` currently declares:

```ts
{ rowTriageFlags: false, multiSelect: false, inCellEdit: false, fieldsMenu: true, dayBands: false }
```

`multiSelect: false` is **documented as deliberate** in
`location-stock-table-definition.ts`: "there is no verb here and `multiSelect`
stays off: the gutter checkbox would be a control with no verb behind it."

This task supplies the verbs, so flipping it is now correct — **update that
docblock in the same commit**, or the next reader will read a comment that
argues against the code beside it.

Flipping `multiSelect` has three consequences:

1. **The select gutter goes live.** `CompoundSelect` is the gutter control:
   pass `statuses` from `compoundSelectStatusMarks` and let the CELL paint the
   edge rail — never paint the rail in the row
   (`SLOT_TABLE_PAINT_LAW.selectGutterStatus`).
2. **Row activation changes meaning.** `compoundRowActivationProps` switches
   from click-to-open to double-click-to-open once `multiSelect` is true,
   because the single click now belongs to selection. This desk's
   `recordPlane` is `{ kind: 'none' }`, so there is nothing to open — verify
   the row does not become inert-but-clickable.
3. **The status bar grows a left cluster.** `TableStatusBar` takes
   `selectionActions?: readonly TableStatusSelectionAction[]`, with precedence
   `selectionActions` → `tabs` → `lead` → empty spacer. Decide **once**
   whether a verb lives on the top strip, in the foot's `selectionActions`, or
   both — the engine already deleted a duplicate-painting arrangement
   (`DataTable.tsx:505-509`: "Both were a second place to run a verb the ROW
   already owns").

Wire selection with `selectionScope` +
`emitSelection` / `emitSelectionTotal` / `onToggleAll` from
`src/lib/selection/table-selection.ts`. `src/components/warehouse/BinsTable.tsx`
is the closest read-only precedent for the bridge.

---

## 3. THE TRAP: half the rows have no bin to write to

`getStockByLocation` unions two pairings. **Only `source: 'bin'` rows are
writable through the bin endpoints.**

| fact | `source: 'bin'` | `source: 'unit'` |
|---|---|---|
| backing table | `bin_contents` | `serial_units` |
| `location_id` | always set | **nullable** — free-text placements that resolve to no `locations` row |
| qty means | a counted quantity | a COUNT of serials |
| min/max, `last_counted` | real | always `null` |
| adjust count | `PATCH /api/locations/[barcode]` | **meaningless** — you cannot "adjust" 3 serials to 5; a serial exists or it does not |
| move | `POST /api/transfers` (bin→bin) | `PATCH /api/serial-units/[id]/move` (per unit) |

So every verb in this task is **conditional on `row.source`**, and the
condition belongs on the FACT, not on the route:

- `rowActions: (row) => …` must return a different verb set per source. A verb
  offered on a row it cannot serve is worse than an absent verb.
- A MIXED selection (bins + units) must either disable the shared verb with a
  reason or split the write. Do not silently apply the bin path to unit rows.
- `location_id === null` (an unresolved placement — `85`, `QA-BIN-1`) has **no
  addressable location at all**. Those rows can only be *re-placed*, not
  adjusted. There were 23 such rows before the 2026-09-15 `85` cleanup; the
  class is not empty and will refill.

Write a test for the mixed-selection case before the UI.

---

## 4. The verbs, with the endpoint each already has

**Nothing below needs a new API.** Every write exists and every one of them
already fires the ledger + `sku_stock` recompute + inventory event. Re-using
them is what keeps the desk and the phone telling one story.

### 4a. Adjust the stock count — `bin` rows only

`PATCH /api/locations/[barcode]`, body `{ action, sku, qty, staffId, reason,
reasonCodeId, notes, clientEventId }` + an `Idempotency-Key` header.

- `action: 'put'` ADDS, `action: 'take'` SUBTRACTS. Both go through
  `adjustBinQty`.
- To SET an absolute count, the endpoint also accepts a bare `{ sku, qty }`
  (upsert) and a version-checked form via `expectedUpdatedAt` →
  `upsertBinContentIfVersion`. **Prefer the versioned form for a desk**: two
  operators adjusting the same bin from two screens is the exact race it
  exists for.
- **Show the SUM before commit.** `StockPairComposer` and
  `MobilePairQty` both paint `onHand → projected`; a putaway that adds is
  indistinguishable from one that replaces until the next cycle count
  disagrees.
- Reason codes: `ReasonCodePicker` (`@/components/sku/ReasonCodePicker`).
  A reason with `requires_note` must block commit without a note — the phone
  already enforces this, so the desk must too or the two write different
  ledgers. Defaults in use: `BIN_ADD` (put) / `BIN_PULL` (take).

### 4b. Move a SKU from one location to another — `bin` rows only

`POST /api/transfers` already does exactly this: it verifies the source has
enough on hand up front, then `adjustBinQty(-qty)` on the source and
`adjustBinQty(+qty)` on the destination. **Do not hand-roll take+put** — the
route owns the short-transfer refusal.

Destination picker: `SearchableSelectField` over `GET /api/locations`, filtered
to barcoded rows. `StockPairComposer` already builds exactly this option list
(house face via `formatStagedLocationFace`, room on the meta line) — extract
that `useMemo` into a shared `useLocationPickerOptions` hook rather than
copying it; it will then have three callers.

Related and already built, do not duplicate:
`POST /api/locations/[barcode]/swap` re-labels stock in place from one SKU to
another (take old, put new, same bin).

### 4c. Move a serialized unit — `unit` rows only

`PATCH /api/serial-units/[id]/move`. A `unit` row is an AGGREGATE of N serials,
so "move" on that row is a fan-out. Decide and document: either open a unit
picker (which serials?) or refuse the verb on aggregate rows and send the
operator to the unit desk. **Refusing is the honest default** — silently moving
"whichever 3" is a data-entry bug with no audit story.

### 4d. Candidate "more actions"

Ranked by whether the write already exists:

| verb | endpoint | notes |
|---|---|---|
| Mark counted | `markBinCounted(locationId, sku)` | fills the desk's permanently-`--` Counted column; the cheapest real win |
| Set min / max | needs a route | the two catalog facts (`min_qty` / `max_qty`) are unbound and always `--`; wiring them makes the Level pill mean something |
| Print bin label | `/inventory/locations/print/special-bin` | exists; check it accepts a non-special barcode |
| Copy selection | `DataTable` `copyExport` | engine chrome — use the prop, do not add a Copy pill (one was already deleted) |
| Open the SKU | `/inventory/health/sku/[sku]` | a row-level navigate, not a bulk verb |

Do not ship a verb with no endpoint as a disabled button.

---

## 5. `bodyPrefix` already has a tenant

`StockByLocationView` passes `StockPairComposer` in `bodyPrefix`. The action
strip wants the same slot. Options, in order of preference:

1. **One host component** in `bodyPrefix` that renders the intake composer when
   the CTA opened it and the action strip when there is a selection. They are
   mutually exclusive in practice — an operator adding stock is not also
   bulk-moving it — and one host means one measured height for
   `LedgerGrid`'s `ResizeObserver` (it re-measures on
   `Boolean(bodyPrefix)`, `LedgerGrid.tsx:281`).
2. Portal the strip into `SLOT_TABLE_ACTION_ROW_ATTR` the way To-ship does and
   leave `bodyPrefix` to the composer. More faithful to the precedent; two
   things now write into the same visual band, so verify they cannot both be
   open.

Pick (1) unless the portal is needed for sticky behaviour under scroll.

---

## 6. Mobile-first — read this before writing the desktop strip

`docs/mobile-first/SURFACE_LAW.md` binds repo-wide: **every operator verb must
be completable on `/m/*` first.** `LANE_MOBILE_FIRST.inventory` is
`'desk-only'` in `src/lib/nav/lanes.ts` — it displays and is queued for its
port, which is what permits a desk surface at all, not a licence to add verbs
the phone cannot run.

Already on the phone:

- **Pair a product to a location** — `/m/pair/[code]` → `/m/pair/[code]/[sku]`.
- **Adjust a bin count** — the same qty screen, `± TAKE` / `+ PUT`.

So 4a already has its phone counterpart and the desk is legitimately the
second surface. **4b (move) does not**, and this increment took the second
option: the desk ships move, and the phone path is named here.

**RULING (2026-09-15).** Move is desk-first, and this is the narrow case where
that is honest rather than a licence:

- The floor ALREADY moves stock, in two presses on the screens it has —
  `± TAKE` at the source bin, `+ PUT` at the destination
  (`/m/pair/[code]/[sku]`). What the floor lacks is the ATOMIC form: the one
  that refuses a short transfer up front and writes `TRANSFER_OUT` /
  `TRANSFER_IN` as a linked pair. The verb is not absent on the phone; its
  audit shape is worse.
- The desk verb is `POST /api/transfers`, the same endpoint an `/m` screen
  will call. There is no desk-only write to unpick when the port lands.
- The phone path when it is built: `/m/move/[code]` — scan the SOURCE bin,
  pick the SKU already there, scan the DESTINATION, POST the same body.
  Scanning both bins beats a combobox, which is why it must not be a port of
  this strip's UI.

What that does NOT license: a desk verb with no endpoint the phone could call,
or one whose write shape only a desk can produce. Both stay refusals.

Do not let the desk grow a verb the floor cannot perform; that is how the two
IAs diverge.

---

## 7. Design-system gates (hooks WILL block the write)

Project hooks deny writes under `src/**/*.{tsx,jsx,css}` without a fresh
design-mcp session stamp. Before implementing:

```
node tools/design-mcp/ds.mjs contract "slot table action bar for bulk row verbs"
node tools/design-mcp/ds.mjs tokens <axis>          # one axis per lookup
node tools/design-mcp/ds.mjs critique <file>        # after each UI file
node tools/design-mcp/ds.mjs adjudicate <file>      # would this be allowed?
```

Expected answers: `Button` from `@/design-system/primitives/Button` for ops
CTAs (solid CTAs render `cornerClass('flush')`, never a `rounded-*` literal),
`IconButton` for glyph-only, `DropdownMenu` for the `⋮` overflow,
`KeyboardKey` / `HotkeyGlyph` for hotkeys, `SearchableSelectField` for the
destination picker, `ReasonCodePicker` for reasons. Never invent a hex, a px
radius, or a `text-[Npx]`.

## 8. Code graph — blast radius before editing shared files

```
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" find CompoundSelect
node "$GARISEK_OS_ROOT/tools/code-graph/cg.mjs" impact <node_key>
```

Touching `CompoundSelect`, `compoundSelectStatusMarks`,
`compoundRowActivationProps`, `MorphingRowActionMenu`, `TableStatusBar` or
`useCompoundSpreadsheet` is **cohort-wide** — 47 `PRODUCT_TABLES` peers. Impact
a peer, not just this desk.

## 9. Definition of done

```
pnpm run eval:cohort slot-table        # ok:true, peers == enginePeers
pnpm run eval:cohort shortcuts         # if any hotkey was bound
npx tsx --test src/lib/tables/field-catalog/location-stock.test.ts
npm run verify:fast                    # lint · typecheck · boundary · nav names · mobile-first
```

Plus, and this is the part that is easy to skip:

- [x] Browser-verified on `/inventory/stock` against real data — select rows,
      run each verb, confirm the row and the `sku_stock` figure both moved.
      (Table at the top of this file; every figure re-read from Postgres.)
- [x] A **mixed `bin` + `unit` selection** splits the write and NAMES the
      remainder; a selection with nothing writable disables all three verbs
      with that sentence as the reason. Pinned by `stock-bin-writes.test.ts`
      before the UI existed.
- [x] A row with `location_id === null` cannot reach a bin endpoint
      (`unresolved-location`, pinned).
- [x] `multiSelect` docblock in `location-stock-table-definition.ts` rewritten
      to say why the gutter now has verbs behind it.
- [x] `Idempotency-Key` on every mutation (`jsonRequest` in
      `stock-bin-verb-writes.ts` — one key per call, echoed as
      `clientEventId`). A double-press is additionally blocked by the in-flight
      guard + draft reset, the same shape the intake composer uses.
- [x] No standing keycaps, no cheat sheet from the foot `?`. `a` / `m` / `d`
      bind while the strip is armed and ride `aria-keyshortcuts`; the faces
      stay clean, exactly as `MorphingRowActionMenu` does it. Shortcuts cohort
      green.

### Found and fixed on the way

The destination picker offered BARCODE faces (`C0411100`) while the row below
it reads `C-04-11-1`, and `SearchableSelectField` matches label ∪ meta — so an
operator typing the location they could SEE got "No matching location". The
bin's own name now rides the meta line beside the room
(`useLocationPickerOptions`), which fixes the intake composer at the same time,
because both read one list.

## 10. Known-adjacent debt, do not fix here

- `compound-row-model.test.ts` × 3 fail on HEAD — `Daily` declares a `status:1`
  track the shared-tracks guard rejects (`daily.ts` + `compound-columns.ts`,
  unrelated working-tree changes). Will block a full `npm run verify`.
- `Counted` / `Level` paint `--` / `STOCKED` on nearly every row because
  `bin_contents.last_counted` and the min/max bounds are unset org-wide.
  §4d ("Mark counted", "Set min / max") is what makes those columns earn their
  width.
- `navigator.clipboard` is still called unguarded in ~36 files outside
  `useCopyChip` / `IdentityLinkChip`; `src/lib/clipboard.ts`
  (`writeClipboardText`) is the house path for the migration when someone does
  it.
