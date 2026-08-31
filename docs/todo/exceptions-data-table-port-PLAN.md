# PLAN — Port the data table onto Exceptions

**Written:** 2026-08-31 · **Branch:** `main` · **Status:** plan of record, not started

Operator direction: *"Port the currently built data table onto the exceptions
page within shipping. On the exceptions tab, clicking a button should never open
another page. It should open the data table first, for exact triaging of
information."*

Read `CLAUDE.md` first — `design-mcp` (`ds_contract` · `ds_tokens` ·
`ds_critique`) is mandatory before any UI code here.

---

## 1. What exists today, measured

| Piece | File | Lines | Fate |
|---|---|---|---|
| Route (full-bleed, **outside** `(desk)`) | `src/app/shipping/exceptions/page.tsx` | 27 | rewrite |
| Master/detail host | `.../exceptions/OrderExceptionsWorkbench.tsx` | 214 | shrink to a host |
| Bespoke queue rail | `.../exceptions/ExceptionsRecentRail.tsx` | 167 | **delete** |
| Bespoke search band | `.../exceptions/ExceptionsScanBand.tsx` | 66 | **delete** |
| The record form | `.../exceptions/ExceptionEditor.tsx` | 439 | **keep**, re-host |
| ↳ catalog pairing | `.../exceptions/ExceptionCatalogPairing.tsx` | 165 | keep, untouched |
| ↳ order fields | `.../exceptions/ExceptionOrderFields.tsx` | 141 | keep, untouched |
| ↳ release gates | `.../exceptions/ExceptionReleaseSection.tsx` | 90 | keep, untouched |
| Row shape | `src/lib/orders/order-exception-types.ts` | — | the table's `Row` |
| Feed | `GET /api/orders/exceptions` | 61 | unchanged |

The queue today is a hand-rolled 22rem `<aside>` of rows. It is not a table: no
columns, no sort, no column prefs, no fields picker, no selection, no copy
export, no virtualization. "Exact triaging of information" is precisely what a
column model buys and what that rail cannot give.

## 2. The two "opens another page" bugs, named

**Both are real and both are in scope.**

1. **The Exceptions tab navigates out of the desk.** `sidebar-navigation.ts`
   points the tab at `SHIPPING_EXCEPTIONS_PATH`, and
   `src/app/shipping/exceptions/page.tsx` sits **outside** the `(desk)` route
   group deliberately (its docblock says so) to escape `DeskPageChrome`'s
   fixed-width stage. So the tab band, the page header and the stage all
   disappear and reappear — a page change, not a tab change.

2. **A caged row in the To-ship table pushes a URL.**
   `src/components/unshipped/UnshippedTable.tsx:406–413` — when `?cage=1` is on,
   clicking a row does `router.replace(…?triage=<id>)`, which opens the centered
   `OrderIntakeOverlay`. That is a table row opening a different surface. It is
   also the exact ergonomic the exceptions workbench was built to escape (its
   own docblock: processing a caged order through the centered overlay was
   *"extremely difficult"*).

Fixing (2) is not optional garnish — once Exceptions is a real table, that
`router.replace` is a second, contradictory answer to "what does an exception
row open".

## 3. The decision that shapes everything: which binding

The repo has a formal table system — 19 entries in
`src/components/tables/registered-bindings.ts`, each a `TableSurfaceBinding`
pairing a Zod-validated `TableDefinition` with a typed column model, a
descriptor factory, and a declared `TableRecordPlane`.

**Option A — reuse `ORDERS_DEFAULT_TABLE_BINDING` with an adapter.**
Precedent exists and works: `cagedRecordToQueueRow`
(`src/lib/queries/caged-orders-queries.ts:88`) already maps a foreign row shape
into `ShippedOrder` so the caged set can ride the orders table. An
`exceptionRowToQueueRow` would be ~30 lines and ship in a day.

*Rejected.* `OrderExceptionRow` carries `blockers[]`, `siblingUnpairedCount`,
`skuCatalogId`, `catalogTitle`, `catalogSku` and `gates` — every fact the
operator is here to triage. `ShippedOrder` has columns for none of them, so the
adapter would produce a table that cannot show **why** a row is blocked. That is
the opposite of "exact triaging of information."

**Option B — a new binding, `outbound.order-exceptions`. ← recommended.**
Same engine, own columns. Cost is four small files plus two list edits, and the
`tracking-exceptions` binding (49 + 210 + 55 + 273 lines) is a direct template
for an exception-shaped table.

## 4. Phases

### Phase 1 — the binding (no UI change yet)

Model on `src/components/tracking-exceptions/grid/*`. New directory
`src/components/outbound/orders/exceptions/grid/`:

| New file | Mirrors | Contents |
|---|---|---|
| `order-exceptions-grid-layout.ts` | `tracking-exceptions-grid-layout.ts` (210) | `ORDER_EXCEPTIONS_GRID_COLUMNS` + `OrderExceptionsGridColumn` |
| `order-exceptions-grid-descriptor.ts` | `…-grid-descriptor.ts` (55) | capabilities + `makeOrderExceptionsGridDescriptor` (module-level reference — an inline arrow rebuilds TanStack's column list every render) |
| `OrderExceptionsGridRow.tsx` | `TrackingExceptionsGridRow.tsx` (273) | the row cells |
| `order-exceptions-table-definition.ts` | `…-table-definition.ts` (49) | `parseTableDefinition` + the binding |

Columns, in triage order — the queue answers "what is wrong" before "what is it":

1. **Blockers** — chips from `ORDER_EXCEPTION_BLOCKER_LABEL`. The primary column.
2. **Order #** (`orderNumber`) · **Item #** (`itemNumber`) · **SKU** (`sku`)
3. **Title** (`productTitle`) · **Paired catalog** (`catalogTitle` / `catalogSku`,
   empty = the `unpaired` blocker, so the two columns corroborate)
4. **Siblings** (`siblingUnpairedCount`) — the fan-out number. `batchPair`
   already clears every order sharing an item number, so this column is the one
   that tells an operator which single fix clears ten rows.
5. **Qty** · **Condition** · **Tracking** · **Source** (`accountSource`) · **Release state**

Definition literals:

```ts
id: 'outbound.order-exceptions',
tableId: 'order-exceptions',
entityFamily: 'order-exceptions',
ariaLabel: 'Order exceptions',
testId: 'order-exceptions-grid-body',
surface: 'sheet',
showDayHeaders: false,   // no civil-day banding; see Phase 4
```

Then two list edits:

- `src/components/tables/registered-bindings.ts` — import + append to
  `REGISTERED_BINDINGS`.
- `src/lib/tables/table-catalog.ts` — `{ tableId: 'order-exceptions', label:
  'Order exceptions' }`.

Gates: `table-definition-registry.test.ts` (enumeration, no duplicate ids) and
`table-catalog.test.ts` (every entry labelled, catalog names exactly the
registry's sheets, no component imports dragged into a server bundle). Both are
list-driven — they pass once the two edits above are made.

> The `*.guard.test.ts` files named in several docblocks
> (`table-record-plane.guard.test.ts`, `band3-find-only.guard.test.ts`,
> `table-definition-registry.guard.test.ts`) **do not exist** — they were
> consolidated into the two tests above. Don't go looking for them.

### Phase 2 — the record plane: the table stays, the record opens beside it

The binding must declare where a picked row goes. This is the mechanism that
enforces the operator's rule, and it is declared once rather than hand-wired:

```ts
recordPlane: { kind: 'inspector', occupantId: 'detail:order-exception' },
```

`inspector` is the house desk peek — a `RightRailHost` occupant. The table keeps
painting; `ExceptionEditor` opens in the pane beside it. No route change, no
overlay, no modal.

`occupantId` is a stable prefix, **not** keyed per record: `RightRailHost` keys
its `AnimatePresence` on the occupant id, so a per-record id plays
exit → empty → enter on every prev/next step. This surface is a queue walk
(resolve-and-advance is its whole point), so it must not do that.

Work:

1. `ExceptionEditor` keeps its props (`row`, `onChanged`, `onExit`) — it is
   already a self-contained pane. Wrap it in a `DetailStackRailRegistrar` at
   `detail:order-exception`.
2. `onExit` currently does `router.push(SHIPPING_ORDERS_PATH)` — **leaves the
   page**. It becomes "close the occupant", clearing `?order=`. That is now
   coherent: the land-on-first-row effect that made Esc look broken goes away
   with the rail (Phase 3).
3. Delete the `cagedOnly` branch at `UnshippedTable.tsx:406–413`. A caged row on
   the To-ship desk resolves the same way as everywhere else — through the
   record plane, not a `router.replace` to `?triage=`.

### Phase 3 — the host

`OrderExceptionsWorkbench` collapses from a bespoke master/detail into a mount:

- **Delete** `ExceptionsRecentRail.tsx` and `ExceptionsScanBand.tsx`. `DataTable`
  owns the find row, the filter menu, the fields picker, the status bar and the
  fullscreen toggle — the scan band and the rail are both re-implementations of
  parts of it.
- Scope (`actionable` | `all`) stops being two `Button`s in a band's right rail
  and becomes a table filter. It is already a server param (`?scope=`), so it
  stays a server param.
- The feed keeps `useQuery(['order-exceptions', scope, debounced])` and hands
  `rows` to the table exactly as `UnshippedTable` hands `records` to
  `useOrdersSpreadsheet`.
- Keep `?order=<id>` — a row must stay linkable ("this one is wrong, look").
  Register it in `ORDERS_ROUTE_PARAMS`-style route params for the exceptions
  route, or `useSurfaceParamHygiene` will strip it on the next keystroke. That
  bug has already been paid for twice on this desk (`ingest`, `triage`); do not
  pay for it a third time.

### Phase 4 — the tab stops being a page

Move `/shipping/exceptions` **inside** the `(desk)` route group, so the tab band,
page header and stage stay mounted across a tab switch (Next keeps a layout
mounted across sibling segments — that is already why fullscreen survives
Orders → Amazon Prep).

The stated reason it sits outside — `DeskPageChrome`'s stage caps at 1152px and
the surface was specified full-bleed — **expires with the rail.** That width was
for a 22rem queue plus a detail pane side by side. A data table with an inspector
occupant is the same shape as To-ship, which lives in the stage happily.

This is the change that makes the tab feel like a tab. It is also the riskiest
step, so it is last: Phases 1–3 are independently shippable with the route where
it is.

Also in this phase, once the table is in the stage: the **"Added today"** section
(`ADDED_TODAY_BAND` / `sectionHeaders`, landed 2026-08-31) is available here for
free — a natural fit for banding today's new exceptions above the standing
backlog. Optional; decide after seeing it.

## 5. What this deliberately does not do

- **No new API.** `GET /api/orders/exceptions` already answers scope + search +
  single-row read-after-write. Every fix still composes existing endpoints
  (`PATCH /api/orders/[id]`, `/tracking`, `/sku-catalog`, `/pair`,
  `/cage-release`).
- **No migration.** No column is added to `orders`.
- **No change to `ExceptionEditor`'s internals** — pairing, fields and gates are
  untouched. Only its host and its exit change.
- **No merge with the To-ship queue.** Exceptions stays a peer tab. It passes the
  peer test `sidebar-navigation.ts` states for FBA and Exceptions: a process
  fork whose queue semantics To ship cannot express.

## 6. Traps, from this codebase

- **Bundle altitude.** Client components import from
  `order-exception-types.ts` (pure). `order-exceptions.ts` reaches
  `@/lib/db` → `server-only` and breaks the build. The new grid files are client
  components — types only.
- **Catalog search.** Use `/api/sku-catalog?q=`, never
  `/api/sku-catalog/search` — the latter returns `sku_platform_ids.id`, not
  `sku_catalog.id`, and feeding it to `/pair` binds the order to an unrelated
  row. Already load-bearing inside `ExceptionCatalogPairing`; do not "simplify"
  it.
- **Postgres NULL ordering.** `ORDER BY (release_state = 'caged') DESC` is NULL
  for legacy rows and `DESC` is NULLS FIRST. Always `COALESCE(release_state,'')`.
- **`(desk)` layout altitude.** `src/app/shipping/(desk)/layout.tsx` renders
  ABOVE the `QueryClientProvider`; a react-query hook there throws "No
  QueryClient set" and takes down every desk tab. The Exceptions tab count uses
  a plain `fetch` for exactly this reason — Phase 4 must not "tidy" it into
  `useQuery`.
- **`makeDescriptor` must be a module-level reference.** `LedgerGridSurface`
  memoizes on `[makeDescriptor, visible]`; an inline arrow rebuilds the state
  engine's column list every render.
- **Shared tree.** A peer session edits these files concurrently. Re-read before
  patching, and a red `tsc` in `exceptions/` is often theirs — check mtimes
  before repairing.

## 7. Order of work

1. Phase 1 — binding + 2 list edits. Gate: `table-definition-registry.test.ts`,
   `table-catalog.test.ts`, `tsc`.
2. Phase 2 — record plane + delete the `UnshippedTable` caged `router.replace`.
   Gate: caged row on `/shipping/orders?cage=1` opens the pane, not a URL.
3. Phase 3 — host swap, delete the rail + scan band. Gate:
   `order-exceptions-workbench.spec.ts` rewritten against the grid testid.
4. Phase 4 — move the route into `(desk)`. Gate: tab switch keeps the chrome
   mounted; `sidebar-navigation` 28/28 still green.

`npm run verify` before done. Note the standing red: `color-neutrals` trips on
`hover:bg-black/[0.05]` in another session's untracked
`src/components/labels/LabelFaceSlotOverlay.tsx` — confirm it is still theirs
before touching anything.
