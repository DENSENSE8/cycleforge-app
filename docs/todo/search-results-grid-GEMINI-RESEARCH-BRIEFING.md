# Research briefing — the cross-entity search RESULTS surface: hand-rolled row list → the house grid SoT

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-29 · **Rev 2** (every file:line below was verified by a second pass against the
actual source; Rev 1's two central claims were both wrong — see §12)
**Scope:** the `/search` route's results body only. Not the global header search pill, not the ⌘K
palette, not the retrieval engine's ranking. Precedents from other surfaces are cited as precedent.
**Deliverable:** (a) the 2026 industry standard for displaying **heterogeneous, relevance-ranked**
search results in a dense operations product, benchmarked against named products with citations;
(b) a reconciled, implementable target for *this* codebase — a decision between the four shapes in
§7; (c) a **column set + filter/sort model** for that target, concrete enough to build from.

---

## 0. How to use this brief

You do **not** have the codebase. Everything needed is measured and embedded here.

Answer **three separate questions — do not merge them:**

1. **What is industry standard in 2026** for rendering cross-entity search results in a dense ops /
   admin product? Named examples, cited sources, an explicit "dominant pattern" call.
2. **What is right for *this* codebase?** Reconcile against §2–§6. Where the standard collides with a
   house law, name the collision and pick a side. A defended deviation beats a generic answer.
3. **What is the concrete column set, filter set, and sort model?** Derived only from fields proven
   to exist in §3.

**Two warnings.**

- **Do not simply ratify the request.** The ask that prompted this was *"make it use the existing SoT
  tables display and properly import filters and sorting logic."* §4.5 shows **there is no filter
  logic in that stack to import** — the house grid has no filter model at all — and §3.2 shows the
  data has a hole that lands precisely on the most common query type. If a grid is wrong here, say
  so.
- **Rev 1 of this brief was confidently wrong twice** (§12). Both errors were "the obvious reading of
  a type signature." Please verify reasoning against the measured facts rather than the narrative.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics
refurb/resale is the dogfood tenant). Inventory is **serialized** — individual physical units with
serial numbers, condition grades, test verdicts, photo evidence — sold across eBay, Amazon/FBA,
walk-in and local pickup.

UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Stated bias:
**legible throughput over document calm** — Linear/Carbon/Stripe-Dashboard chrome discipline.

Four **region contracts** (enforced house law). Please use this vocabulary:

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition | durable focus in URL | `studio` |

**Who the operator is.** Warehouse and support staff, mid-task, usually holding a physical thing or
a customer on the phone. The dominant query is an **identifier they are holding** — a tracking
number off a label, a serial off a device, an order number read aloud. Second-most-common is a
**fuzzy recall** ("that Bose remote we returned last month"). They are almost never browsing.

That split matters more than anything else in this brief, because §3.2 shows the data behaves
**differently** for the two, and the difference lands on the columns.

---

## 2. The surface today, measured

`/search?q=` is a full-width client route with no context/sidebar column (its route key resolves to
`unknown`, which is what suppresses the 360px rail every workbench route reserves).

### 2.1 The render path — four files, no table anywhere

`src/app/search/page.tsx` (122 lines) → `SearchResultsSurface.tsx` (202) → `AiQuickJumpResults.tsx`
(76) → `SearchResultRow.tsx` (465). Grouping vocabulary in `search-tabs.ts` (81); chip/tone maps in
`search-result-chips.ts` (103).

The DOM is:

```
page <div class="mx-auto … max-w-5xl … overflow-y-auto">     ← the PAGE owns Y-scroll
└── per-entity <section class="rounded-xl border border-border-hairline bg-surface-card">
    ├── NON-STICKY header <div>  (eyebrow label + count pill)
    └── AiQuickJumpResults <div>
        └── <ul class="divide-y divide-border-hairline">
            └── <li> → SearchResultRow  = next/link <Link role="option"> + flex row of <span>s
```

**No column track, no header row, no cross-group alignment.** (`SearchResultsSurface.tsx:179-196`)

### 2.2 The row renderer already forks three ways — this is why it "looks terrible"

`SearchResultRow.tsx:461-464` dispatches into **three structurally different components**:

| Branch | Leading element | Serves |
|---|---|---|
| `OrderRow` | a **10px status dot**, no tile, no EntityTag (`:239`) | `order` |
| `UnitRow` | an **`h-9 min-w-[3rem]` mono serial badge** (`:299`) | `unit` |
| `GenericRow` | an **`h-9 w-9` colour tile** | receiving · sku · repair · fba |

At `comfortable` density (what `/search` uses) **these produce different row heights in one scroll
port.** And the order branch is gated on `hit.facets != null || hit.packout != null` — a
**data-dependent** branch stacked on top of the entity branch, so the same entity type can render two
different ways depending on which retrieval arm produced it.

That is the mechanical cause of the complaint. It is not "the styling is bad"; it is that **three row
grammars are interleaved in one list and nothing aligns down the page.** Ten near-identical Bose
remote titles, each truncated at the same point, with the discriminating facts (status, condition,
carrier, last-4 tracking, age) pushed right, rendered small, and unaligned.

Additional measured drift, all real but secondary:

- `subtitle` is a **lossy `' · '` join** built server-side (`build-search-text.ts:104`) that `UnitRow`
  **string-splits back apart** at `SearchResultRow.tsx:299`.
- The page uses **two different max-widths** — `max-w-3xl` on the empty branch
  (`page.tsx:89`), `max-w-5xl` on results (`page.tsx:108`) — so the column width changes between
  states. Neither is the house `WORKBENCH_BODY_COLUMN`.
- `SearchResultsSurface.tsx:145` carries a **second `!q` empty box that can never render** (the page
  early-returns first), and it drifts: raw `px-4 py-10` where the `inset-empty` intent is `px-4 py-6`,
  and a raw `text-sm` instead of a `text-role-*` token.
- A **sole hit auto-redirects** to the record (`page.tsx:79`), so the list never renders for one
  result. Any grid must survive mount-then-immediately-navigate.
- `CATEGORY_TABS` is consumed in exactly **one** place (`SearchResultsSurface.tsx:47`) — for section
  labels and order only. There is no pill strip; the "all/Overview" entry is filtered out and unused.
- `pageContext: '/search'` resolves to **no relevance boost at all** — `'search'` is absent from
  `SEGMENT_SCOPE` (`page-context.ts:16-37`).

### 2.3 The house law already broken

`.claude/rules/ui-design-system.md:53`, "Always ban":

> **Hand-rolled `<table>` / tab band / row markup** for a tabular ops surface. **Do:** compose the
> Workbench spreadsheet SoT — `LedgerGrid` … *Extending a hand-rolled queue shell is growing a fork
> — migrate onto `LedgerGrid` instead.*

Note the rule calls `LedgerGrid` **"the Workbench spreadsheet SoT"**, and §6 shows `/search` is
currently a **Monitor**. That tension is real and you must resolve it.

---

## 3. What a result row actually carries

### 3.1 The wire shape

`src/lib/search/search-hit.ts:40-52` — for every hit:

```ts
export interface SearchHit {
  id: number;
  entityType: 'order' | 'unit' | 'receiving' | 'sku' | 'repair' | 'fba';
  title: string;
  subtitle: string;        // pre-joined ' · ' string, composed DIFFERENTLY per type
  href: string;
  matchField: string;      // WHICH field matched
  score: number;
  chips: SearchHitChip[];
  facets?: Record<string, string | null>;   // ← OPTIONAL. See 3.2.
  actions?: SearchHitAction[];
}
```

Seven fields are **universal and non-null across all six entity types**: `id`, `entityType`, `title`,
`subtitle`, `href`, `matchField`, `score`. Everything column-shaped lives in the one **optional**
`facets` bag.

### 3.2 THE CRITICAL FACT — `facets` is absent exactly where operators search most

There are two retrieval arms and **they do not produce the same row shape**:

- The **doc arm** (keyword/vector over `entity_search_docs`) emits the full 7-key facet bag
  (`hybrid-retrieval.ts:260-269`): `status · condition_grade · source_platform · tracking_number ·
  carrier · serial_number · happened_at`.
- The **exact-identifier arm** emits parent-table hits with **no `facets` key at all and
  `chips: []`** (`exactResultToHit`, `hybrid-retrieval.ts:273-280`) — **and those rank FIRST**
  (score-1000 band, `:276`).

So an identifier query — *the most common operator input* — does not produce a uniformly facet-less
set. It produces a **mixed** one: facet-less exact hits ranked above facet-rich doc hits merged
beneath them (`:362-372`).

**In a grid that means rows whose Status / Tracking / Condition / Date cells are *structurally
absent* sitting directly above rows where those same cells are populated — at the top of the result
set, on the query type operators run most.** This is the single hardest constraint in this brief and
Rev 1 missed it entirely.

Is this fixable at the source? Probably — teaching `exactResultToHit` to hydrate facets is a
retrieval-layer change, not a UI one. **Please say explicitly whether your recommendation requires
that fix**, because it changes who does the work and in what order.

### 3.3 Per-entity facet fill rates (measured from `build-search-text.ts`)

| Entity | Facets populated | Notes |
|---|---|---|
| ORDER | **6 / 7** | only `serialNumber` hardcoded null |
| RECEIVING | **6 / 7** | |
| SERIAL_UNIT | **5 / 7** | |
| REPAIR | **4 / 7** | |
| FBA | **3 / 7** | `sourcePlatform` hardcoded `'fba'` |
| SKU | **2 / 7** | |

A flat table over all six therefore has **inapplicable** cells (not missing — *not-a-question-for-
this-row*), worst for SKU. How a dense ops table should render **inapplicable vs. empty vs. absent**
(§3.2) is a question we want answered explicitly, with precedent.

### 3.4 `score` is three incomparable scales and nothing renders it

Three live scoring bands, never normalised against each other:

1. exact arm: `1000 - rank` (`hybrid-retrieval.ts:276`)
2. keyword-under-exact: `500 - i` (`:370`)
3. RRF fusion: `round(score * 3050)` (`:393`)

`score` is on the wire and read by **zero UI code** (one test fixture only). So "sort by relevance"
is not one scale, and "show a relevance score column" would show three different units in one
column. Factor this into any sort model you propose.

### 3.5 What the retrieval layer can and cannot do

- **Accepts:** `{ query, entityTypes?, limit?, pageContext?, mode? }` only
  (`src/lib/schemas/ai-search.ts:17-23`). `entityTypes` is a real **server-side hard filter** that
  `hybridSearch` honours (`hybrid-retrieval.ts:77-78`) — and **`/search` never sends it**
  (`SearchResultsSurface.tsx:80-88`). A type facet is therefore free today.
- **No sort param. No offset / cursor / nextPage / hasMore** — grep across `src/lib/search/*.ts`
  returns zero. Result set is hard-clamped **1..50**.
- **Consequence:** client-side sort/filter over ≤50 rows is the only option, and **virtualization is
  unnecessary** — which removes one of the main reasons to adopt the grid.
- Adding new server-side filters is not free. `.claude/rules/source-of-truth.md`:
  > **Keyword-arm SQL rule**: every predicate must textually match the indexed expression
  > `lower(search_text)` using GIN-supported operators (`=`, `LIKE`, `<%`) — `BTRIM`/raw-column
  > variants force a per-org Seq Scan (EXPLAIN-verified 2026-07-04).

---

## 4. The grid SoT — what it actually is

### 4.1 `LedgerGrid` has NO `columns` prop

Its full prop surface is `LedgerGrid.tsx:44-108` and contains **no column list**. The CSS grid
template is set **per-element by the consumer's own row and header components** (e.g.
`RepairGridRow.tsx:219` and `RepairGridColumnHeader.tsx:72` both call `repairGridTemplate(columns)`).

So the DS shell is **column-agnostic**. What is single-column-set is the machinery **above** it (one
descriptor, one visibility resolution, one Fields menu, one TanStack `columns` array, one
`contentMinWidthRem`) and the shared-width contract **below** it (`--cf-orders-grid-w`,
`dashboard-order-row-layout.ts:421`).

### 4.2 The row type is one unconstrained generic at every layer

`LedgerGrid<T>` (`:110`), `VirtualGroupedSections<T>` (`:100`), `RowGroup<T>` (`group-rows.ts:12`),
`useGridSurface<Row>` (`:75`), `GridSurfaceDescriptor<Row, C>` (`grid-surface-descriptor.ts:135`).
The only union in the stack is over item **kind** (`header | group | row`,
`VirtualGroupedSections.tsx:39`) — a layout discriminator, not a data one. Grep for
`heterogen|discriminated|union row|mixed entity` across the grid dir, `src/lib/tables`, and the grid
plan doc returns **zero**. All 8 live consumers use a single concrete interface.

**So heterogeneity is not forbidden by the types — it is simply unprecedented.**

### 4.3 …but there is exactly ONE column header and ONE banding axis

- `columnHeader: ReactNode` — **singular** (`LedgerGrid.tsx:64`), rendered once in one
  `role="rowgroup"` sticky band.
- The only grouping band is a hard-coded `DateGroupHeader` typed to `{ date, count }`
  (`VirtualGroupedSections.tsx:39-40, :245`); both input modes (`orderGroupsByDate`, `daySections`)
  are `[dateKey, …][]` and the band renders `formatDateWithOrdinal(date)`.

**Therefore: per-entity column sets inside ONE `LedgerGrid` are not expressible.** Option B in §7
means *N grid instances stacked*, not one grid with N headers.

For contrast, the timeline primitive **does** expose a generic band selector (`groupKeyOf`,
`EventTimeline.tsx:201`). **The two house primitives are not at parity on banding** — which is
precisely why the timeline can be domain-agnostic and the grid cannot (yet).

### 4.4 The house's own sanctioned answer to divergent column shapes

`grid-surface-descriptor.ts:133` states the law:

> **"Modes swap descriptors, not markup"**

and `OrdersGridView.tsx:151-155` already **swaps its entire canonical column set on a URL-derived
facet**. The pattern is `DEFS_BY_MODE` / `ordersQueueColumnsFor(mode)`. **Per-MODE descriptor swap is
sanctioned; per-ROW union is not, anywhere in the repo.**

This is the most important structural fact for your recommendation: it makes option **C** in §7
house-legal *by existing precedent* rather than by argument.

### 4.5 There is NO filter model in this stack — at all

`getFilteredRowModel` / `columnFilters` / `globalFilter` / `getSortedRowModel` /
`getGroupedRowModel` return **zero matches across all of `src`**. `useGridSurface` wires only
`getCoreRowModel()` (`:90`) with `manualSorting: true` (`:93`). Every consumer sorts **client-side**
after reading the URL (`IncomingGridView.tsx:108`, `useOrdersQueueRows.ts:60`).

So "properly import the filters and sorting logic" has no import to make. Sorting is a URL convention
plus a per-surface comparator; filtering does not exist as a shared thing. **Say plainly whether your
recommendation requires building one, and whether that belongs in the DS or on this surface.**

### 4.6 The real cost — much lower than it looks

There are **8** `LedgerGrid` consumers, and they span an order of magnitude:

| Consumer | Shape | Adoption cost |
|---|---|---|
| `FbaBoardTable.tsx:8` | hardcoded `grid-cols-[…]` constant, inline header, **no descriptor / TableId / visibility hook** | **cheapest** |
| `StationListTable.tsx:13` | generic `<TRecord>`, injected renderers, **no column model** | cheapest |
| Incoming / Receiving / Catalog / Pickup / Repair | descriptor + header + row | mid |
| `orders-queue/` (golden) | 17 files incl. in-cell editors, group folds, resize | heaviest |

**The floor for a new consumer is ~490 lines, not the golden reference's ~3,986.** The shared DS
layer is 1,883 non-test lines and already exists. Rev 1 quoted only the golden number and made
adoption look ~8× more expensive than it is — please price against the floor.

Two further reusable assets:

- **One `TableId` already serves two different column sets** — Incoming and Receiving both default
  `tableId = 'receiving'`, which works because the staff-preference delta keys on `hideKey`, not on
  the grid column key. Direct precedent for "six search modes, one TableId".
- **A shared search-result presentation SoT already exists**: `search-result-chips.ts` —
  `ENTITY_ICONS`, `CHIP_TONE_CLASSES`, order-status tones.

---

## 5. Filter / sort SoTs and the param rules

| Concern | Module | Params | Server or client |
|---|---|---|---|
| Column sort | `useUrlColumnSort` | **`?colsort=` / `?coldir=`** | client-only |
| Display sort chrome | `QueueSortSwitch` | surface-specific | client-only; **already generic** over the sort id and takes a caller-supplied options array (`QueueSortSwitch.tsx:31`), proven by Repair (`RepairWorkspaceHeader.tsx:114-118`) |
| Column visibility | `useGridColumnVisibility` / `useGridFields` / `GridFieldsMenu` | — | client + `PUT /api/staff-preferences` |
| Structured filters | `FilterRefinementBar` | surface-specific | client-only |
| Scoped search chrome | `ToolbarSearchToggle` | — | client-only |

**No SoT applies ordering itself.** Every consumer sorts client-side after reading the URL.

**Param mechanics (get this right or the build fails):**

- `colsort` / `coldir` are **AMBIENT** params owned by the routing registry
  (`route-params.ts:104,106`). They appear only in `carries` tuples, and **a guard fails the build if
  a route declares `owns` on them** (`param-ownership.guard.test.ts:149`).
- `?sort=` / `?dir=` / `?q=` are declared **`SHARED_OWNED_KEYS`** — legal for multiple routes to
  claim, but the list *"only shrinks"* (`route-params.ts:119-120`).
- **`/search` has no route-param spec at all** — absent from `QUERY_MODE_ROUTE_PARAMS`
  (`query-mode-routes.ts:214`), `routeParamsFor('/search')` returns `null`, and neither `app/search`
  nor `components/search` is in the guard's `OWNED_TREES`
  (`param-ownership.guard.test.ts:45`). It reads exactly one param, `?q=` (`page.tsx:47`).
- `TableId` is a **closed 9-member union with no search entry** (`table-columns.ts:61`).
  `useGridColumnVisibility`'s `tableId` is **optional** (`:92`) but `useGridFields` / `GridFieldsMenu`
  **require** one. So a Fields menu on `/search` means widening that union.

**The scoped-search-chrome exception matters here.** The SoT's one sanctioned exception is
`/ops/photos`, justified because there *"search **is** the entry path, not a refinement."* That
sentence describes `/search` at least as well, and the rule's own text says that if a third exception
appears *"the rule itself is wrong and should be re-cut around 'is search the entry path or a
refinement?'"* If your answer needs an always-visible query field here, argue it against that text.

---

## 6. Region contract: Monitor or Workbench?

`src/app/search/page.tsx:20-21` declares **Monitor**. Running the house discriminator
(`contextual-display.md`, `pickArchetype` Q1→Q4, first yes wins) on the code agrees: read-only, no
durable selection, `?q=` is a throwaway filter, and a row click **leaves the surface entirely** for
the record's own page. `/search` also has no `SURFACE_REGISTRY` entry.

The collision is explicit:

- `contextual-display.md:131` and `:197` forbid growing durable selection or edit affordances on a
  Monitor.
- `ui-design-system.md:53` calls `LedgerGrid` **"the Workbench spreadsheet SoT."**

So adopting the ops spreadsheet *with selection and in-cell editing* imports a Workbench pattern into
a Monitor region — a named anti-pattern. **Is "table-ness" separable from "Workbench-ness"?** Plenty
of products render read-only results in a sortable table with no selection at all. Answer this
explicitly; it decides whether the surface may ever grow bulk actions.

(`contextual-display.md:199` does allow one page to host several contracts.)

---

## 7. The four candidate shapes

Pick one and defend it.

### (A) One flat universal grid
One `LedgerGrid` over all hits; columns from the 7-key facet bag; a Type column; client-side sort.

- **For:** true cross-entity comparison; one column set; cheapest at the §4.6 floor; the data layer
  already normalises six types into one shape.
- **Against:** §3.3 sparsity (SKU fills 2/7) **plus** §3.2's mixed exact/doc rows, which puts
  structurally-absent cells at the *top* of the most common query. Also: a column sort destroys the
  RRF ranking (§3.4), and there is no shared filter model to lean on (§4.5).

### (B) Per-entity sections, each its own grid
Keep entity grouping; render each section as a grid using that entity's existing column family.

- **For:** every column meaningful and already tuned; matches the workbench the operator knows.
- **Against:** §4.3 — this is **N stacked `LedgerGrid` instances**, not one grid; six column layouts
  in one scroll port is noisier than the card stack it replaces; `unit` and `fba` have no family; and
  **the hit does not carry the fields those richer families expect** (only the 7 facets), so each
  section needs a second fetch per entity type. That last point may be disqualifying.

### (C) Type facet narrows to ONE entity; the grid swaps descriptors — **the house-sanctioned shape**
A type facet (server-side, free today via `entityTypes` §3.5) selects one entity; one grid renders it
with that type's descriptor, swapped per `DEFS_BY_MODE`. An "All" state shows either a compact
overview or the ranked list.

- **For:** this is literally the law at `grid-surface-descriptor.ts:133` ("modes swap descriptors,
  not markup") and already shipped in `OrdersGridView.tsx:151-155`; every column is applicable, so
  §3.3 sparsity vanishes; the server filter already exists; one `TableId` serving multiple column
  sets is precedented.
- **Against:** it *abolishes cross-entity comparison in the default view* — the operator must choose
  a type before seeing a table. Whether that is a loss or the correct focusing move is exactly what
  we want you to judge. Also needs an answer for the "All" state.

### (D) Adapter into one row model — the `TimelineItem` precedent
`.claude/rules/display/reference-timeline.md`: `EventTimeline` is the single renderer over a flat
`TimelineItem[]`; 14 `*ToTimeline` adapters (`src/lib/timeline/index.ts:2-20`) map every domain into
it; a 7-spine live merge exists (`journey.ts:112`); it even handles a polymorphic
`entity_type`/`entity_id` source (`entity-signals.ts:57`). `SearchHit` **is already** that shape.
Option D says: build the aligned, dense results renderer as search's `EventTimeline` — which may or
may not be a spreadsheet.

- **For:** the strongest existing house precedent for exactly "N domains, one renderer"; the timeline
  primitive already has the generic banding the grid lacks (§4.3).
- **Against:** "an aligned row that is not a full spreadsheet" is what the §2.3 ban exists to prevent.
  If you pick D you must say precisely what stops it becoming the same fork again. Note there is **no
  `*ToGridRow` family** — verified absent.

---

## 8. Questions we specifically want answered

1. **Table or not?** Do dense ops products in 2026 render cross-entity search results as a sortable
   table, a ranked list, or something else? Cite named products (Linear, Notion, Height, Jira,
   Retool, Stripe Dashboard, GitHub global search, Elastic/Kibana, Algolia, Sourcegraph, ServiceNow,
   Salesforce, Zendesk, Shopify admin — whichever are genuinely relevant).
2. **Relevance vs. column sort.** Sorting a relevance-ranked list by "date desc" throws away the
   ranking that made it useful — and here relevance is three incomparable scales (§3.4). How do the
   best products handle this? Is there a "Relevance / Date / …" mode switch, and where does it live?
3. **The mixed-shape problem (§3.2).** Rows missing whole columns ranked *above* rows that have them.
   Is the right answer to fix it at the source (hydrate facets on exact hits), to render
   "inapplicable" distinctly, or to avoid a column layout for identifier queries entirely? What is
   precedent for inapplicable-vs-empty cells in a dense table?
4. **Pick A, B, C, or D** and justify it against §2–§6. If a grid: give the concrete **column set** —
   every column, label, `core`/`optional`, alignment, sortable — using only §3-proven fields.
5. **Filters.** Given §4.5 (no house filter model) and §3.5 (only `entityTypes` server-side, ≤50
   rows), what filters are worth having and where do they live? Which need new machinery?
6. **Identifier vs fuzzy (§1).** Should the surface behave differently for an exact identifier? Today
   a sole hit auto-redirects. Right or wrong?
7. **Region contract (§6).** Monitor or Workbench? Does a spreadsheet oblige selection and bulk
   actions, or is a read-only sortable table a legitimate Monitor surface?
8. **Empty / loading / error.** Typed states, with skeletons preserving column widths — what is the
   standard for a *search* skeleton where the row count is unknown in advance?
9. **What we should NOT do.** Name the attractive-but-wrong patterns.

---

## 9. Constraints your answer must respect

Enforced by tests and hooks; an answer violating one is not implementable.

- **Compose the SoT, never fork it** — `Panel` / `SectionCard` / `CardShell`; `LedgerGrid`;
  `focusRing(archetype, tone)`; `elevationClass(role)`; `TABLE_SURFACE_*`. Hand-rolling any fails a
  ratchet guard.
- **Tokens only.** Semantic color tokens, the density-aware spacing scale + intents (`inset-chip`,
  `inset-field`, `inset-empty`…), `text-role-*`. No hex, no arbitrary px, no `z-[N]`.
- **Font weight caps at 600** — the 700 cut is not loaded, so `font-bold` renders as faux-bold.
- **One family, three cuts** — IBM Plex Sans / Condensed (bound intrinsically to `role-eyebrow` and
  `-micro`) / Mono (identifiers only; a serial must stay retypable).
- **Typed identifiers via the `CopyChip` family** (`TrackingChip`, `SerialChip`, `OrderIdChip`) —
  never a hand-rolled chip or a re-derived last-4.
- **Presentation kinds resolve via SoT modules** — dates via `src/utils/date.ts` (civil day and
  instant are different types), condition via `conditionLabel`/`condition-tone`, platform via
  `source-platform.ts`, lifecycle dots via `workflowStageDot`.
- **One sticky layer per scroll port.** Pinned chrome lives outside the scroll body; the grid's own
  column header is the only sticky thing inside it.
- **Motion:** opacity + transform only, sub-300ms ease-out, and **never crossfade a list on
  filter/keystroke**. Reduced motion collapses to opacity.
- **Multi-tenant:** every query org-scoped.

---

## 10. Deliverable format

1. **Industry scan** — products × behaviour × source link, then an explicit "dominant pattern is X"
   call with your confidence.
2. **Recommendation** — A, B, C, D, or a defended fifth. Name the collisions and which side you took.
3. **The spec** — column table (label / key / core-or-optional / align / sortable), the filter set and
   where each lives, the sort model including how relevance survives, typed empty/loading/error.
4. **Phasing** — what ships first to fix "looks terrible" with the least code; what is later. We would
   rather ship a correct 30% this week than a perfect thing in a month.
5. **Anti-patterns.**

Where uncertain, say so and say what evidence would settle it.

---

## 11. Things we could not measure for you

- **Real query-mix data.** §1's claim that identifier lookups dominate is engineering judgement, not
  telemetry. If your recommendation hinges on the ratio, flag it — §3.2's severity scales directly
  with it.
- **How often the 50-row cap is hit.** Decides whether pagination matters.
- **Whether operators use the entity grouping to orient.** The group cards may be doing real work a
  flat table would remove.

---

## 12. Corrections from Rev 1 (why this brief is version 2)

Rev 1 was fact-checked against source by a second pass. Two central claims were wrong, both in the
direction of making the job look easier:

1. **"Every hit carries the 7 facets."** False. Exact-identifier hits carry **none** and rank
   **first** (§3.2). Rev 1's whole "the normalization already exists, just use it" thesis rests on a
   bag that is absent on the most common query type. This is now the hardest constraint in the brief.
2. **"`LedgerGrid` is generic over `T`, so heterogeneous rows are fine."** Half-true and misleading.
   The types permit it, but there is exactly **one `columnHeader`** and the only banding axis is a
   hard-coded **date** header (§4.3) — so per-entity column sets in one grid are not expressible, and
   option B means N grids. Rev 1 also missed §4.4, the house's actual sanctioned answer
   (per-mode descriptor swap), which is now option C.

Also corrected: the adoption cost floor (~490 lines, not ~3,986 — Rev 1 priced only the golden
consumer); the absence of **any** filter model in the grid stack; the param mechanics (`colsort`/
`coldir` are `carries`, not `owns`, and a guard fails a route that claims them); and `score` being
three incomparable scales rather than one.

**Method note for the reader:** both Rev 1 errors were the obvious reading of a type signature
without opening the implementation. Please apply the same skepticism to your own answer.
