# One Table — the fork-port prompt

**Paste this whole file as the prompt.** It is written for an agent with repo
access, and it is the standing brief for every table in Cycle Forge: find the
displays that are not the one table, and register them onto it so they look
*exactly* like To‑ship.

---

## 0. The acceptance test (quote it back before you start)

From `src/lib/tables/table-engine-law.ts` — this is the law, not a preference:

> **TABLE_ENGINE_ACCEPTANCE** — "Registering a new backend table adds **zero new
> `.tsx` files and zero lines to any existing component**: a catalog + a
> resolver + an adapter + a registry entry. A verb reaches every surface that
> binds its field, with no per-lane list."

And the four invariants, in one line each:

1. **ENGINE_IS_MONOMORPHIC** — one implementation, generic over the row.
   "A family contributes an adapter and a column array — **never a cell, never a
   row component, never a host**."
2. **REGISTER_ENTITY_NOT_PAGE** — one entity → one registration → many mounts.
   Scope, lane lock and layout are parameters of the MOUNT.
3. **DESCRIPTOR_CARRIES_DATA_NOT_BEHAVIOR** — a registration adds fields,
   widths, capabilities, tier. Never render props, per-family cells, override
   hooks. "If a mount needs behaviour the engine lacks, the ENGINE gains it for
   everyone or the mount does without."
4. **VERBS_BIND_TO_FIELDS** — a verb is declared once in the family verb
   catalog, names the FIELD it writes, and is offered wherever the mounted
   layout resolves that field. Bulk is a cardinality, not a mode.

If your PR adds a component to add a table, **the engine is missing a
capability and that — not the table — is the bug.**

---

## 1. The reference: what "looks exactly like To-ship" means

Open `/shipping/orders` and read the stack, top to bottom. This is the target
for every ported table; nothing below is optional and nothing is per-page.

| Layer | File | Note |
|---|---|---|
| Page mount | `src/components/unshipped/UnshippedTable.tsx` | spreads `{...sheet}` — the page supplies **no chrome** |
| Family feed | `src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx` | rows, groups, sort, verbs, empty states |
| Display | `src/components/tables/DataTable.tsx` | the one chrome row: search · filter funnel · sort menu · fields · zoom · fullscreen |
| Body | `NonlinearTableHost` → `CompoundRow` → `CompoundCells` | the engine's own cells |
| Model | `ORDERS_PRODUCT_LAYOUT` (`field-catalog/orders.ts`) | **`morph: 'compound'`**, identity `orders.order_id` |
| Foot | `TableStatusBar` | shown / total / selected / copy |

**The single most common miss: morph.** To-ship is `morph: 'compound'` — the
two-line WMS row with the image track, the compound item cell, status pills,
assignee chips and day bands. A family registered as `morph: 'sheet'` paints a
thin one-line spreadsheet and **will not look like To-ship no matter how its
columns are named.** Choose `compound` unless the family is explicitly a sheet
peer (`bins`, `catalog`, `units`, `my-day`, `warranty`, …).

---

## 2. Find the wrong tables

Run all five. Every hit is a candidate; the classifier is in §3.

```bash
pnpm run eval:discover                      # hand GRID leftovers the engine already knows about
grep -rln "<table" src/components src/features src/app --include=*.tsx
grep -rln "AdminTableColumn" src --include=*.tsx
grep -rln 'ul role="list"' src/components src/features --include=*.tsx
grep -rln "GridRow.tsx\|GridHost.tsx\|GridView.tsx" src
```

**A display is a fork when any of these is true:**

- it maps rows to JSX itself (`rows.map(r => <Row …/>)`, `<ul role="list">`, a
  raw `<table>`), or
- it owns a column array that is not a `materializeTracks` output, or
- it paints a header row that is not click-to-sort, or
- it has no Fields picker, no filter funnel, no `TableStatusBar` count, or
- it is registered per PAGE rather than per ENTITY, or
- it declares its own verbs (see `VERB_DECLARATION_DEBT`).

**Not forks:** markdown tables (`MarkdownRenderer`), print receipts
(`api/walk-in/receipt`), KPI cards that happen to use `<table>` for layout of
*aggregates* (still worth porting later, low value).

---

## 3. The inventory (audited 2026-09-04 — re-run §2 before trusting it)

### Tier A — inventory domain, same rows as an existing family
| Fork | File | Port to |
|---|---|---|
| Ledger activity | `src/components/inventory/PulseView.tsx` | `inventory-events` — **done 2026-09-04**, compound morph, see §7 |
| Unit chain of custody | `src/components/inventory/PulseWorkspace.tsx` | same registration, second feed — **done** |
| By-filter unit list | `src/components/inventory/ByFilterResultList.tsx` | `inventory-units` (already registered) |
| By-unit detail | `src/components/inventory/ByUnitView.tsx` | raw `<table>`; timeline → `inventory-events` |

### Tier B — admin inventory, ten pages on a second engine
`src/app/admin/inventory/{events,holds,returns,bulk-allocate,cycle-counts,cycle-counts/[id],throughput,sku/[sku]}/page.tsx`
plus `_inventory-admin/{TableSections,StatusSections}.tsx` — all on
`AdminTableColumn`. `ds_contract "admin table of rows with columns"` ranks
**DataTable**, not AdminTable. Same entities as Tier A → mounts, not new
registrations.

### Tier C — settings / ops
`src/app/settings/{ai,audit}/page.tsx`, `settings/staff/StaffTable.tsx`,
`components/settings/sections/{SessionsSection,KioskDevicesSection}.tsx`,
`components/admin/sourcing/CompatibilityManagementTab.tsx`,
`features/operations/workspace/PackingKpiSection.tsx`,
`components/po-gmail/mailbox/ScannedMode.tsx`,
`components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx`,
`app/developer/QaConsoleClient.tsx`.

### Tier D — verb forks (law §4 debt, ratchet only down)
`components/photos/PhotoLibraryPage.tsx` (mints five photo verbs),
`components/tech/useTechTestingSelection.tsx`.

---

## 4. The work, in order

### Phase 0 — the engine gains the generic compound mount (**landed 2026-09-04**)
`useOrdersSpreadsheet` was the only compound feed and it is orders-shaped
(`QueueRowRecord`, `OrdersQueueTableRow`, order assignment, tracking popover).
That is why the last port had to write a per-family cell map — and why it did
not look like To-ship.

**`src/components/tables/useCompoundSpreadsheet.tsx`** is the generic mount:
`{ binding, columns, rows, adapter, resolve, sortFactFor, sort/dir, search }`
→ the `DataTableProps` bag, painted through the one `CompoundRow`. It owns
search over the MOUNTED facts, sort by the sorted FACT (typed from
`slotDisplayType`), banding and row painting. It deliberately takes **no**
`renderRow`, no cell map, no comparator override — see its docblock.

The engine also gained the FACES a family used to need a cell map for
(`compound/compound-slot-face.ts`): a `date` fact paints as an age with the
instant on hover, a `tag` as a mono chip, an `id` / `tracking` as a copyable
code. Chosen by DISPLAY TYPE, so every family inherits them.

**`CompoundRow` now forwards every cell capability.** It had accepted only a
subset of what `renderCompoundGridCell` takes — the in-cell editors
(`subtitleSelects`, `subtitleEdits`, `subtitleNoteKey`/`noteText`,
`onReorderSubtitle`, `shipByEdit`, `orderedAtEdit`, `onOpenLabels`) were
unreachable from the shared row, so a family that wanted an EDITABLE compound
row could not use it at all: it had to map the columns and call the cell
renderer itself. That is the whole origin of `OrdersQueueTableRow` — 1300 lines
whose desktop branch is `CompoundRow` with more props. The gap was invisible
because nothing compared the two lists; `compound-row-capability.test.ts` is
that comparison now, and it fails on the run that reopens the gap.

**The row-anchored plane is an engine seam now (2026-09-05).** It was the last
thing that forced a family to own a row: `CompoundRow` painted every cell, but
had nowhere to put a panel anchored to the row, so To-ship kept
`OrdersQueueTableRow` alive to host its CYC-82 assign manifold.

- `TableSurfaceBinding.rowPlane` — declared once per ENTITY (invariant 2), so
  it reaches every outbound lane from one line. Gating a plane per lane is how
  Shipped once had the checkbox and no manifold; a registration cannot drift
  that way. A component reference is admissible on the BINDING for the same
  reason `makeDescriptor` is — the binding is the registration, not the
  Zod-validated `definition`.
- `CompoundPlaneRow` — the engine component that owns the per-row open state
  and the row ref, and mounts whatever the entity registered. No plane
  registered ⇒ the plain shared row, no state, no wrapper, no cost.
- `LedgerGridLeafRow` takes `children` (after the cells) and a `ref`. Narrow on
  purpose: the cells are still the only thing that paints row CONTENT.
- The CYC-82 click rule moved from `lib/outbound/morphing-row-action.ts` to
  `compound/compound-row-plane.ts` and is re-exported from its old home. It had
  already stopped being an outbound rule — `TasksWorkbench` calls it too.
- `CompoundRow` also forwards `flagClass` / `scrollMinContent`, so a family with
  row flags no longer rebuilds the shell to apply the fill cascade
  `LedgerGridLeafRow` has always owned.

Orders registers `OrdersRowPlane` on its binding today. The registration is
INERT until the last step below, because `useOrdersSpreadsheet` still mounts
`OrdersQueueTableRow`, which mounts the manifold itself — no double mount.

**The one step left: move the view assembly, then delete the row.**
`OrdersQueueTableRow` still builds `ordersCompoundView`, the slot values, the
subtitle selects/edits, ship-by, ordered-at and the stage assigns INSIDE the row
component. Every one of them is family data the law says belongs in the ADAPTER
(`useOrdersSpreadsheet` is where it goes). Once it moves, orders mounts
`useCompoundSpreadsheet` and the 1300-line row file is deleted.

That step changes what To-ship PAINTS, on the highest-traffic desk in the app.
It needs a browser check against `/shipping/orders` — the §6 checklist — not
just green gates. Do not land it blind.

Seams already owned (`ENGINE_OWNED_SEAMS`): geometry, materialization, layout
cascade, header sort, record plane, **cells** — and now the row that mounts
them.

### Phase 1..n — one family per PR
Per family, five artifacts and **zero `.tsx`**:

1. `src/lib/tables/field-catalog/<family>.ts` — facts as data + the product
   `SlotLayout`. Identity **must** be `displayType: 'id'` (`parseSlotLayout`
   refuses anything else). Prefer `morph: 'compound'`.
2. `src/lib/tables/field-catalog/<family>-resolve.ts` — `(row, fieldId) → text`.
   Pure. Never reads the clock.
3. `src/lib/<family>/<family>-row-adapter.ts` — `row → CompoundRowView`
   (`compound-row-model.ts`). Strings and enums only: "the moment a family can
   pass a node, the fork walks back in wearing a view model."
4. Registry lines: `TABLE_ENTITY_FAMILIES` (`table-definition.ts`), `TableId` +
   its empty hide-key bucket (`table-columns.ts`), `PRODUCT_TABLES`
   (`table-catalog.ts`), `SLOT_LAYOUT_TABLES` (`org-table-layouts.ts`),
   `REGISTERED_BINDINGS`, `SLOT_TABLE_ENGINE_LAYOUT_HOOKS`
   (`slot-table-cohort.ts`).
5. Verbs (if any) in the family catalog — never at the mount.

Then delete the fork's files in the same PR. A port that leaves the old display
mounted anywhere has not landed.

---

## 5. Rules that bite (each has cost a real rework)

- **Identity must be an `id` fact.** A date, a name or a count cannot be the
  frozen identity track.
- **A transition never sorts.** `prev → next` (status, bin) is one fact of two
  values; sorting it compares whichever end came first. The rule lives on the
  FACT, so a rebind carries it.
- **No new `*GridRow.tsx` / `*GridHost.tsx` / `*GridView.tsx`.**
  `SLOT_TABLE_GRID_ROW_ALLOWLIST` is **shrink-only** — it is a count of forks,
  and a port must not add to the thing it is reducing.
- **Chrome is DATA.** search, filter, tabs, counts, fields = props. Never a
  ReactNode slot, never a second toolbar, never `FilterRefinementBar`.
- **Every painted DATA header click-sorts.** Chrome-only exceptions: `select`,
  `actions`, `_fill`.
- **On a desk, mount with `DESK_TABLE_SURFACE_CLASS`** — edge-to-edge inside
  the card. Never wrap in `rounded-*` / `border` / `shadow`.
- **Don't register a new family for a row shape that adapts.** `/shipping/exceptions`
  is the model: `exceptionRowToQueueRow` + `tableId: 'orders'` = every column an
  operator curated on To-ship, for free.

---

## 6. Definition of done (per port)

```bash
node --import tsx --test src/lib/tables/field-catalog/<family>.test.ts
node --import tsx --test src/lib/tables/table-engine-law.test.ts
pnpm run eval:cohort slot-table          # peers must equal PRODUCT_TABLES, discoverDelete 0
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

Plus, in the browser, side by side with `/shipping/orders`:

- [ ] two-line compound rows, same row height, same image track
- [ ] frozen identity pane, same freeze shadow
- [ ] every data header sorts; the toolbar sort menu lists the same facts
- [ ] filter funnel present (idle chrome when the family has no facets)
- [ ] Fields picker binds/unbinds and the change survives a reload
- [ ] `TableStatusBar` shows shown / total / selected
- [ ] zero new `.tsx` in the diff — `git diff --stat -- '*.tsx'` is empty

The last line is the one that matters. If it is not empty, re-read §0.

---

## 7. Known debt — CLEARED 2026-09-04

The `inventory-events` registration failed §0: it added
`events-grid/cells/index.tsx` (a per-family cell map, banned by invariant 1) and
`events-grid/InventoryEventsTable.tsx` (a host, banned by the same line), and it
registered `morph: 'sheet'`, so the Ledger did not look like To-ship.

Both files are deleted. What replaced them:

- `src/lib/inventory/inventory-events-row-adapter.ts` — the family's `row →
  CompoundRowView`, pure, strings only.
- `events-grid/useInventoryEventsSpreadsheet.ts` — family glue on
  `useCompoundSpreadsheet`. A `.ts`: the display code is all engine now.
- the product layout is `morph: 'compound'`, the mount materializes onto the
  SHARED compound skeleton (`compoundColumnsFor`), and the org write gate
  (`slotMorphsFor`) refuses `sheet`.
- the cell map's three faces became engine display-type faces, so no family
  needs one again.

Five status bindings, not eight: on a compound row the shared chrome already
paints the status move (state pill), the station (its next-step line) and the
notes (the item cell's note line), and the mount drops `amount`, `dates` and
`select` — an event has no money, no deadline, and no bulk verb. All three
facts stay bindable in the catalog. Without that the materialization is 14
default tracks and `parseTableDefinition` refuses it at the dense ceiling of 10
— which is the guard doing its job, not an obstacle to route around.

Gates at the time of writing: `eval:cohort slot-table` ok (peers 24 =
enginePeers 24, discoverDelete 0), `cursor-eval --fast` ok, 549 table/compound
unit tests green.

---

## 8. What is next (Tiers A–D are untouched)

Phase 0's remaining half (orders as a consumer) and then §3 in order. Re-run §2
before trusting the inventory — this file's audit is dated.
