# Research briefing — a universal backend↔grid connector, and whether custom columns on search displays need new database tables

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every path, line number, schema
fragment, and measured behavior below was verified against real source on 2026-08-08. Do not invent
modules, claim to have inspected source, or assert "we already have X" beyond what §1–§3 state. Label
anything past that as `my reasoning:`.

**From:** Cycle Forge engineering
**Date:** 2026-08-08
**Subject:** Two entangled questions the product owner raised in one request: (1) can the
just-completed **nonlinear table-definition registry** connect to *any* backend Postgres table
generically, not only the 17 hand-registered entity families it knows today; (2) do tenant-defined
**custom columns on a "search display"** require new database tables, and if so what is the best
relational shape — reconciled against a schema **already drafted, mid-interview, by this same
engineering org, in the last 24 hours.**
**Status:** OPEN research. **Ground truth refreshed 2026-08-08 evening** for Phase 3 forest burn +
Unbox History Product/`_fill` geometry (see Appendix B) — do not treat earlier "14 → 2 wrappers"
wording as current. This brief **updates and narrows** a still-unlanded prior brief
(`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md`, 2026-08-01) whose "measured
current state" predates the registry below and which never mentions search at all. It does **not**
ask you to re-derive ground already covered well by that brief or by industry precedent — it asks you
to **pressure-test a concrete, already-proposed schema** against 2024–2026 practice, under constraints
those two topics create when combined.
**Your deliverable:** one markdown research + plan report (chat or export is fine). A repo-capable
agent will land it as `docs/todo/universal-table-connector-and-custom-columns-PLAN.md` and reconcile
it against the live interview named in §3f. **You do not write files.**

**Related documents (read for context; their open questions are not this brief's job to re-solve):**

| Doc | Status | What it settled | What it left open / doesn't cover |
|---|---|---|---|
| [`nonlinear-data-table-engine-PLAN.md`](nonlinear-data-table-engine-PLAN.md) | **APPROVED**, landed 2026-08-07/08 | The registry waist this brief's §3a describes | Explicitly defers "DB-backed org definitions" to Horizon C (§1.2) |
| [`nonlinear-table-forest-finish-HANDOFF.md`](nonlinear-table-forest-finish-HANDOFF.md) · [`nonlinear-table-burn-forest-and-ratchet-HANDOFF.md`](nonlinear-table-burn-forest-and-ratchet-HANDOFF.md) | **DONE** (2026-08-08) | Phase 3 forest burn: `GRID_VIEW_FOREST === []`; 0 `*GridView.tsx` on disk; shared adapters `ReceivingGridHost` / `OrdersGridHost`; Units inlined; Unbox History Product + `_fill` geometry restored | Phase 2 (constrained AI authoring) still deferred |
| [`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md`](tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md) | **OPEN**, 2026-08-01, no `-PLAN.md` exists yet | JSONB vs EAV vs schema-per-tenant framing; C1–C8 candidate list | Written *before* the registry in §3a existed; never mentions the `/search` surface at all |
| [`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](search-results-grid-GEMINI-RESEARCH-BRIEFING.md) | Rev 2, 2026-07-29, **research closed, partially landed** | The `/search` results feed should stay a flat, non-tabular list (see §3d — a guard now enforces this) | Never considered tenant-authored columns; assumed only the 7 fixed facet keys |
| [`unbox-view-switcher-and-custom-fields-HANDOFF.md`](unbox-view-switcher-and-custom-fields-HANDOFF.md) | **LIVE, in progress, today** | Drafted a `custom_field_defs`/`custom_field_values` schema; ruled out the flagship motivating example (R1); ruled a sharing-model shape (R2) | 12 interview questions (§4 of that doc) genuinely unanswered — this brief must not contradict R1–R3 or the "Never" list in that doc's §7 |

---

## 0. How to use this brief

### 0.1 Your job

1. **Survey the web** (prefer 2024–2026 primary sources) for how sellable multi-tenant SaaS separates
   *system schema* from *tenant-added fields* from *display/grid engines*, and how federated/cross-entity
   search UIs (not single-table search) handle heterogeneous result columns. Cite named systems.
2. **Reconcile** every recommendation against the embedded facts in §1–§3. Where industry conflicts
   with a house law, name the collision and pick a side — or tell us the law is wrong and defend that.
3. **Score** candidates with §0.3. Cut ruthlessly — a candidate that fails a §0.4 closed-forever item
   scores near zero regardless of its other axes.
4. Treat §1–§3 as **ground truth about this product today**. If you need a fact not listed, say so
   under Ask-first — do not invent it.
5. **Do not restart Horizon C from a blank page.** Its §1 "settled laws," §2 product context, and its
   own §5 industry-survey questions (Q1–Q6) are still valid and you may reuse them. What changed since
   2026-08-01 is embedded fresh in §3 below; use that, not the older brief's §3.

### 0.2 Sources to cover (minimum)

| Class | Examples | Use for |
|---|---|---|
| **Multi-tenant custom fields at scale (2024–2026)** | Salesforce custom fields/objects, HubSpot properties, Notion database properties, Airtable fields, Linear custom fields (if any), Attio attributes | Storage shape (typed columns vs JSONB vs EAV) and the promote-on-heat question |
| **Federated / cross-entity search UX** | Algolia multi-index/federated search, Elastic/Kibana cross-index, GitHub global search, Sourcegraph, ServiceNow global search, Salesforce global search | Whether/how heterogeneous result types ever expose per-type customizable columns, vs staying a ranked list forever |
| **Metadata-driven grid/table engines** | Retool Table, Salesforce List Views (dynamic field sets on a fixed object model), Airtable views | How a *fixed system schema* + *tenant-added fields* still renders through one grid engine |
| **Warehouse/WMS cross-grain reporting** | Any named WMS/3PL reporting layer that joins purchase-order lines against physical receipt/put-away events | Directly relevant to §3f's R1 finding — a report across two different grains is a different architecture than a per-row custom field |
| **Multi-tenant Postgres field/query cost** | JSONB GIN index cost, "promote a hot JSONB key to a real column" migration patterns, aggregated-join-vs-N-joins cost on a virtualized feed | Grounds §5's D9 |

Where industry splits, give both positions and pick one for **this** product with a defended reason.

**Hard fork, stated once so you don't re-litigate it per section:** this product is a **dense,
scan-aware, 1080p warehouse-ops SaaS** (Kinetic Ledger — see §2), not a general workspace/base builder.
Every recommendation must survive that filter.

### 0.3 Scoring model (mandatory)

Score every candidate on all five axes (1–5). Report a table. Do not invent a sixth axis.

| Axis | Meaning |
|---|---|
| **Fit** | Compounds on the landed registry (§3a) / polymorphic-tables.md contract (§3g) / existing JSONB-config precedent (§3e) vs. requires a new paradigm |
| **Sellable isolation** | Safe across orgs; auditable; no cross-tenant drift; correct for a sellable product, not one dogfood warehouse |
| **Operator throughput** | Helps a floor/desk queue or a tenant admin configuring one, without cognitive overload or query-cost blowups |
| **Blast radius** | Surfaces/APIs/migrations/guards touched (5 = tiny, 1 = company-wide) |
| **Migration cost** | Cost from today's measured state (§3) to the candidate |

**Score ≈ (Fit × Sellable isolation × Operator throughput) / ((6 − Blast) × (6 − Migration cost))**
Blast/Migration convention: **5 = tiny/cheap, 1 = huge.** Rank descending; state your cut line.

### 0.4 Closed forever (do not recommend unless Ask-first with extraordinary evidence)

All of these are either restated house law or **already ruled** in the live interview (§3f) — a
recommendation reversing one without an explicit "change the house law" Ask-first section is discarded:

- Adopting a foreign UI grid (AG Grid, Handsontable, MUI DataGrid, Glide, embedded Sheets)
- **EAV** (`entity_id, key, value` rows) as the primary custom-field store
- **Schema-per-tenant** / **database-per-tenant** as the default multi-tenant model
- A `custom_fields JSONB` **blob column added to a system entity table** (`receiving_line`,
  `orders`, `sku_catalog`, `serial_units`) — explicitly ruled "Never" in §3f's source doc §7: *"Add a
  `custom_fields` column to an entity table (blob per row) instead of the side table."*
- A custom-field query that issues **one `LEFT JOIN` per field** — explicitly ruled "Never" in the
  same doc: *"Ship a custom-field query with one join per field."*
- Collapsing the per-family domain cell registries (§3a/§3b) into one mega-row component that renders
  "any SQL column" — `NonlinearTableHost`'s own docblock names and rejects this by number (quoted
  verbatim in §3a)
- A custom-field **definition** carrying cell JSX, DDL, or a new terminal workflow status — ruled
  "Never" in §3f
- Re-grouping the `/search` results feed by entity type, or growing its per-row column count back out
  — a guard test now enforces the opposite (§3d)
- Raising any DS/CI ratchet baseline (`GRID_VIEW_FOREST`, the capabilities guard's `MOUNTS` list, the
  registry guard's `BINDINGS` list — all shrink-only, §3a) to land any part of this
- AI or a tenant writing prod-mutating code, DDL, or bypassing `transition()` / tenant GUC

---

## 1. Settled laws (do not re-litigate)

### 1.1 Engine and registry (unchanged from Horizon C's §1, reconfirmed)

| Already decided | Meaning |
|---|---|
| Shell SoT = `LedgerGrid` family | Virtualized Workbench queues mount `LedgerGrid`/`LedgerGridSurface` with a typed descriptor + boolean capabilities bag |
| Domain cells stay per family, forever at this horizon | Plan Decision D4, verbatim: *"Domain cell registries: Per-family forever at this horizon"* — orders cells ≠ receiving cells ≠ catalog cells |
| Status is a state machine | Status changes only via `transition()` + audit, never a raw cell overwrite |
| Shared-schema multi-tenancy | One Postgres schema; every row `organization_id`-keyed; org from `ctx`, never the body; `withTenantTransaction` / GUC |
| Compose → grow SoT → compound | Never fork a page-local twin; grow the named module when it's wrong |
| Retirement needs a guard | A prose-only retirement is incomplete — allowlists are shrink-only, mechanically enforced |
| `entity_type`/`entity_id` polymorphic contract | `.claude/rules/polymorphic-tables.md` — named CHECK discriminator, BIGINT id, org-led indexes, tenant-from-birth, app-layer existence checks (not a DB trigger), Drizzle model in the same PR |

### 1.2 New since Horizon C's original brief — the registry is DONE, and it is intentionally narrower than "any table"

- The **`TableDefinition` registry, `TableSurfaceBinding`, and `NonlinearTableHost`** (§3a) landed and
  are on `main`. **Phase 3 forest burn is also DONE (2026-08-08):** `GRID_VIEW_FOREST === []` and
  **0 `*GridView.tsx` files remain on disk.** Shared multi-consumer adapters live as non-forest hosts
  (`ReceivingGridHost` — 4 mounts; `OrdersGridHost` composing `useOrdersQueuePlane` — 9 mounts);
  single-consumer Units was inlined into `UnitsWorkspaceView`. The anti-regrowth ratchet (disk-walk
  freeze) stays live and shrink-only — a new `*GridView.tsx` fails CI. **Keep (not forest):** the
  allowlisted `OrdersQueueColumnHeader` fork (resize + viewport force-hide), plus documented
  raw-mount exceptions `StationListTable` / `FbaBoardTable`.
- **Unbox History column geometry restored (same day):** Receiving Product is again a hard preferred
  track `minmax(16rem, 16rem)` (`resizable: true`, `minTrackRem: 8`) with trailing structural
  `_fill: minmax(0rem, 1fr)` owning the template's sole `1fr`; canonical order is
  `select · order · title · status · date · … · _fill` (Date after Status, not jammed under Product).
  Matches the Orders `_fill` law (`isGridColumnFillTrack` names both consumers).
- **`NonlinearTableHost`'s own docblock explicitly rejected a fully generic mount** as a *named,
  scored, killed* candidate from the plan that approved this registry — quoted verbatim because it is
  the single most load-bearing fact for Q1 (§4.1):

  > "What this deliberately does NOT own — **Renderers.** Header / group / row stay render props,
  > resolved by the family, because a cell is domain code. A host that rendered 'any column of any
  > row' would be the **Airtable mega-row the plan kills (candidate 3)**."
  > — `src/components/tables/NonlinearTableHost.tsx:27-31`

  That candidate ("Airtable mega-row engine") scored **0.2 / KILLED** in the plan's own formal scoring
  table (`nonlinear-data-table-engine-PLAN.md` §2.1). This was a deliberate, scored decision — not an
  oversight.
- **`cellMapKey`, the one field the definition schema names *as* the seam for automatic per-family cell
  dispatch, is validated but currently dead code.** `TableDefinition.cellMapKey` is Zod-enumerated
  against the same 17-value `entityFamily` closed union and every one of the 15 definition files sets
  it — but a full-repo search finds **no reader**. Every page still manually imports its own
  `render*GridCell` dispatcher (or an inline `switch`) and hands it to `NonlinearTableHost` as a
  render-prop. This matters directly for §4.1/§6: the mechanism that *would* let a definition resolve
  its own renderer automatically already exists in the schema and is simply unwired.

### 1.3 Fields / column-visibility — a DIFFERENT system from "custom columns," confirmed by reading its code

- `staff_preferences.tableColumns[tableId]` is a **strict Zod delta** over a column set a developer
  already wrote — `hidden`, `shown`, `widths`, `widthBounds`, `order`, `display`
  (`highlight`/`cell`/`text`), `rowFills`. Full shape: `src/lib/schemas/staff-preferences.ts:162-248`.
- **It cannot add a column.** Proven three independent ways: (a) `useGridColumnVisibility`'s
  `isGridColumnVisible()` is a pure `.filter()` predicate over the descriptor's full canonical list —
  it can drop a column, never append one (`src/design-system/components/grid/useGridColumnVisibility.ts:60-82`);
  (b) `useGridColumnWidths`' `setWidth(key, px)` requires `key` to already exist in the descriptor
  (`src/components/ui/table-column-config/useGridColumnWidths.ts:59,114`); (c) the underlying column
  list itself, `TableDefinition.columns`, is a `z.strictObject` — *"an unknown key is a rejected
  definition, not a silently ignored one"* (`table-definition.ts:129-130`).
- **A declared-but-dead field lives in this schema too:** `order` is declared in
  `staff-preferences.ts:191` but no consumer under `src/design-system/components/grid/` or
  `src/components/ui/table-column-config/` reads `tableColumns[tableId].order` — it is schema without
  a wired feature, same shape as `cellMapKey` above.
- `src/lib/tables/table-columns.ts`'s `TABLE_COLUMNS` (the Fields-menu vocabulary — labels + hideKeys
  per `TableId`) is **one fully static, hand-authored `Record`** covering ~20 table ids. It is
  explicitly the visibility vocabulary, not a schema tenants can extend.

### 1.4 The cross-entity search surfaces are TWO different things, and only one of them is a matching engine

- `entity_search_docs` (migration `2026-07-03d`) is a **flattened matching index** — one
  `search_text TEXT NOT NULL` blob per row that keyword-trgm and pgvector both match against, plus
  four *shared, generic* typed facet columns (`status`, `condition_grade`, `source_platform`,
  `happened_at`) that mean something different per `entity_type`. It is not, and was never meant to
  be, a display projection with per-entity-type structured columns.
- `SearchHit` (the wire shape every consumer renders) carries 7 universal fields plus an **optional**
  `facets: Record<string, string|null>` bag whose *keys* are hardcoded per entity type by six
  hand-written builder functions in `build-search-text.ts` — never tenant-defined.
- **The `/search` results feed is, by recent and deliberate decision, a flat non-grid list — and a
  guard now enforces that shape.** As of today the render chain is `SearchResultsSurface.tsx` →
  `SearchBrowseShell.tsx` → `MonitorListBlock` (a plain `<ul class="divide-y">`) → `SearchResultRow`.
  A module named `search-result-grid.ts` exports `SEARCH_RESULT_GRID` — this is **not** a table; it is
  a fixed CSS Grid *template for one row's five slots* (Glyph | Id | Match | Tracking | Age). A guard,
  `search-result-grid.guard.test.ts`, asserts the surface **"flattens... no `CATEGORY_TABS` grouping"**
  and must render through `MonitorListBlock`. This is materially narrower than what
  `search-results-grid-GEMINI-RESEARCH-BRIEFING.md` (Rev 2, 2026-07-29) described nine days earlier
  (a three-way `OrderRow`/`UnitRow`/`GenericRow` fork with entity-grouped `<section>` blocks) — a
  decision landed in between that deliberately simplified and flattened this surface. **A repo-wide
  search finds zero references to `SearchHit`/`AiSearchHit` anywhere inside
  `src/design-system/components/grid/**` or `src/components/tables/**`** — the customizable-column
  grid kernel and the search-results renderer have never been connected.

### 1.5 The house already has a JSONB-config precedent, and its OWN validation story is explicitly unsettled

Three real per-org JSONB "bag" columns exist today, with different validators:

| Column | Migration | Validator |
|---|---|---|
| `organizations.settings` | `2026-05-22_organizations_tenancy.sql:33` | `OrgSettingsSchema` — `z.object({...}).passthrough()`, `src/lib/tenancy/settings.ts` |
| `staff_preferences.prefs` | `2026-06-21_staff_preferences.sql:20` | `StaffPreferencesPutBody` — `z.object({...}).strict()`, `src/lib/schemas/staff-preferences.ts` |
| `workflow_nodes.config` | `2026-06-03_workflow_graph_layer.sql:61` | `validateNodeConfig()`, `src/lib/workflow/validate-config.ts` — **hand-rolled, does not import Zod at all**, deliberately permissive |

`.claude/rules/polymorphic-tables.md` itself names `workflow_nodes.config`'s validation as an **open
question it explicitly declines to answer**: *"Does not pick a schema-validation mechanism for
`jsonb` variant-config columns... that's a separate, still-open question... not part of the
polymorphic-reference contract."* This matters for §5/§7: the house has not, in fact, settled "how do
we Zod-validate a JSONB bag" as one universal pattern — `.passthrough()` vs `.strict()` already
disagree between the two real examples.

**Four more JSONB `custom_fields` columns exist and are NOT usable precedent for this work** — on
`items`, `invoices`, `credit_notes`, `customers` (all inside `0000_baseline_through_2026-03.sql`).
Every one is a verbatim **Zoho ERP sync mirror** (proven by `src/lib/replenishment.ts:78-79`,
`src/services/OrderSyncService.ts:283`, `src/services/InventorySyncService.ts:56` all copying the
vendor's blob 1:1), never written by an operator, and on none of the four tables the operator's own
grids actually work (`receiving_line`, `orders`, `sku_catalog`, `serial_units`). Precedent for the
column *shape*; not a foundation.

### 1.6 The live interview (2026-08-08) — read in full before answering; do not contradict it

`unbox-view-switcher-and-custom-fields-HANDOFF.md` is an **in-progress, same-day** interview between
this engineering org and the product owner about the exact topic of this brief. It is summarized in
full in §3f. Three points are already **ruled** and must be treated as settled law, not reopened:

- **"Never" list (that doc's §7):** no blob-per-row custom_fields column; no one-join-per-field query;
  no cell JSX/DDL/terminal-status in a custom-field definition; the tabs-vs-saved-views law
  (`workbench-ops-queue.md` → *Tabs vs. saved views*) may not be overturned implicitly.
- **R1 (ruled):** the motivating example that prompted this whole conversation — *"a PO line: Dell
  dock ×10, 6 arrived, 4 short"* — is **not** a per-row custom field. It is a **cross-grain
  aggregation** (purchased quantity on a PO line vs. physically-counted quantity on a carton — two
  different feeds the codebase has *already* ruled cannot reconcile left-to-right). The doc states
  plainly: *"Do not ship an 'add a data table' affordance that can only re-filter one feed — its first
  real use is the thing it cannot do."*
- **R2 (ruled):** sharing/placement precedent — visibility (who sees a view) and placement (where it
  appears, e.g. "Unbox-only") are **orthogonal axes, not one enum** — matching Airtable
  Personal/Collaborative/Locked and Salesforce Private/All/Groups-gated-by-permission.

### 1.7 Two *other* recent handoffs explicitly named custom columns a non-goal — this brief is why that changed

Independent of the interview, a repo-wide search turned up two more recent documents that **explicitly
scoped custom columns OUT**: `ledgergrid-add-column-track-HANDOFF.md` lists *"inventing custom
columns"* under **Non-goals**, and `to-ship-pending-full-grid-handoff.md` states *"Do not implement
arbitrary user-defined columns — the registry..."* and lists *"user-defined column order drag-reorder"*
under **Deferred**. The operator's ruling in the live interview (§1.6) — *"businesses must be able to
add their own columns, not merely re-shape existing ones"* — is an explicit reversal of that prior
stance, made today. Treat the older non-goal language as **superseded**, not as a reason to reject this
brief's premise; it is useful only as evidence that this was a deliberate, considered scope boundary
before it was deliberately reopened.

---

## 2. Product context

Cycle Forge is multi-tenant B2B SaaS for used-goods reseller operations (receive → unbox → test →
repair → catalog → pack → ship → returns/warranty). USAV is the dogfood tenant only — answer for a
**sellable** product. UI identity is **Kinetic Ledger**: dense, state-colored, scan-aware; legible
throughput over document calm (Linear/Carbon/Stripe-Dashboard chrome discipline, not Notion
whitespace). Four region contracts govern every surface — **Station** (scanner, act-and-clear),
**Workbench** (pointer, pick→edit→persist — where all of §3–§7 lives), **Monitor** (observe-only, no
durable selection — where `/search` currently sits), **Canvas** (Studio, draft→publish definitions).
Every write is tenant-scoped, permission-gated, and auditable. Vendor systems (Zoho, Zendesk) are
capability facades, never the product noun in operator copy.

---

## 3. Measured current state (embedded — verified 2026-08-08)

### 3a. The nonlinear table-definition registry — COMPLETE (this section supersedes Horizon C's stale §3a)

Three modules, kept deliberately separate:

```
TableDefinition (Zod, pure data)  +  typed columns + makeDescriptor (code)  =  TableSurfaceBinding
                                              │
                                              ▼
                        NonlinearTableHost<Row, K, C>  →  LedgerGridSurface (engine, unchanged)
```

- **`src/lib/tables/table-definition.ts`** — `tableDefinitionSchema`. Column `type` is a **closed
  10-value tuple**: `text | number | id | tag | longtext | date | external | location | tracking |
  price` (compile-time exhaustive against `ColumnType`, which is declared *again*, separately, in
  `table-columns.ts` — a new 11th type needs editing both files). `entityFamily`/`cellMapKey` are each
  a **closed 17-value union** (`receiving`, `incoming`, `orders`, `catalog`, `repair`, `pickup`,
  `warranty`, `ready`, `tracking-exceptions`, `unfound`, `bins`, `my-day`, `tech-all`, `catalog-link`,
  `station-history`, `fba`, `units`) — `z.enum` rejects any 18th value at parse time. `columns` is
  `z.array(tableDefinitionColumnSchema).min(1)`, itself `z.strictObject` with **no render/formatter/
  accessor field of any kind** — purely presentational metadata (width/label/type/align/frozen/tier/
  hideKey/sortable). `superRefine` enforces frozen-pane-is-a-contiguous-prefix, at-most-one flex
  track, and a **hard 10-column dense-visible ceiling** (`MAX_DEFAULT_VISIBLE_TRACKS`).
- **`src/components/tables/table-surface-binding.ts`** — `TableSurfaceBinding<Row, C>` pairs the
  definition with `columns: readonly C[]` (the family's full typed model) and `makeDescriptor` (a
  **module-level function reference**, never inline) — because the host takes a *binding*, not an
  *id*: an id-keyed registry would erase `Row`/`C` and need a cast at every mount that "would look
  like a guarantee while guaranteeing nothing."
- **`src/components/tables/table-definition-registry.ts`** — `TABLE_DEFINITIONS`, a static
  `Record<id, TableDefinition>` built from 15 files / 17 registered bindings (list in Appendix A).
  Its own docblock: *"DB-backed org definitions are Horizon C and are deliberately NOT here: the code
  registry is the kernel that one compounds on."*
- **`src/components/tables/NonlinearTableHost.tsx`** — mounts `LedgerGridSurface` from a binding.
  Requires three **mandatory render-prop functions with no defaults** — `renderColumnHeader`,
  `renderGroup`, `renderRow` — supplied by the page, always hand-written per family (§3a's `cellMapKey`
  finding explains why: the seam that *would* auto-resolve these from `cellMapKey` is unwired).
- **`GridSurfaceDescriptor<Row, C>`** (`src/design-system/components/grid/grid-surface-descriptor.ts`)
  is a **plain TypeScript interface, not Zod** — it is not JSON-serializable, because one of its
  fields, `columnDefs: readonly ColumnDef<Row, unknown>[]`, carries live TanStack `ColumnDef` objects.
  Building one always needs hand-written functions (`isSortable`, `sortDescFirst`, `isLocked`,
  optionally `accessorFor`) — confirmed present in every one of the 15 `make*GridDescriptor` factories.
- **Ratchets, all shrink-only, mechanically enforced:**
  - `GRID_VIEW_FOREST` in `grid-surface-capabilities.guard.test.ts` — a **disk-walk** asserting the set
    of `*GridView.tsx` files on disk equals a frozen list. **As of 2026-08-08 the frozen list is
    empty** (`[]`): Phase 3 burned every wrapper. Shared adapters are *not* `*GridView` files
    (`ReceivingGridHost.tsx`, `OrdersGridHost.tsx`); Units binds the host inline. A new
    `*GridView.tsx` fails CI; the list only shrinks (already at zero).
  - The same guard's `MOUNTS` map is a disk-walk requiring every `<LedgerGrid`/`<LedgerGridSurface`/
    `<NonlinearTableHost` mount to be named against a declared `GridSurfaceCapabilities` bag
    (Orders → `OrdersGridHost.tsx`; Receiving → `ReceivingGridHost.tsx`; Units →
    `UnitsWorkspaceView.tsx`).
  - `table-definition-registry.guard.test.ts`'s `BINDINGS` array deep-equality-checks that
    `definition.columns` matches the family's typed `columns` — catches drift between the two halves.

**What a genuinely new backend table needs today — mechanically verified, not inferred** (full
11-step walkthrough with citations in Appendix A): a hand-written row type; a hand-written
`*-grid-layout.ts` column model; a hand-written `*-grid-descriptor.ts` (capabilities bag +
`isSortable`/`isLocked`/etc functions); a `*-table-definition.ts` whose `entityFamily` must **first**
be added to the hardcoded 17-item tuple in source; hand-written cell renderers (a `cells/` folder, or
an inline `switch (col.key)` — both patterns exist live, see §3b); a new registry import + array entry;
new entries in **two separate CI guards**; and — because there is **no generic `/api/tables/[id]`
reader** — a hand-written API route with hand-written SQL (a repo count found **293 route files**
using the same manual `tenantQuery(orgId, sql, params)` pattern; none are table-generic).

### 3b. Cell rendering — always hand-written TypeScript, in one of two shapes, never data

Three representative families were read in full:

| Family | Column entry example | Where the cell renders |
|---|---|---|
| `tracking-exceptions` (simple) | `{ key: 'title', type: 'tracking', width: 'minmax(10rem, 1fr)', frozen: true }` | **No `cells/` folder** — an inline `switch (col.key)` inside `TrackingExceptionsGridRow.tsx` |
| `receiving` (golden — hard Product + trailing `_fill`, restored 2026-08-08) | `{ key: 'title', width: 'minmax(16rem, 16rem)', type: 'text', resizable: true, minTrackRem: 8 }` + trailing structural `_fill: 'minmax(0rem, 1fr)'` (sole `1fr`; empty body cell via `case '_fill'`); Date is a day face **after** Status, not before Title | A `cells/` folder — `renderReceivingGridCell()` dispatches by key to `ReceivingTitleCell.tsx` etc.; mount waist is `ReceivingGridHost` → `NonlinearTableHost` |
| `orders` (capabilities-heavy: `multiSelect`, `inCellEdit`, `rowTriageFlags`) | `{ key: 'title', width: 'minmax(12rem, 12rem)', frozen: true, resizable: true }` + a structural `_fill: 'minmax(0rem, 1fr)'` slack track | **No `cells/` folder** — a 1276-line hand-written `switch` in `OrdersQueueTableRow.tsx`; in-cell edit is wired **per column key** directly to a mutation hook (`onCommit={(next) => commitAssign({ quantity: next }, ...)}`); mount waist is `OrdersGridHost` → `NonlinearTableHost` |

In every shape, `TableDefinition.columns` supplies geometry and a label — never how the cell actually
renders or what an edit commits to. That is always hand TypeScript, per family, confirmed by direct
reading of three structurally different families.

### 3c. The cross-entity search MATCHING engine (unchanged in shape since Horizon C; re-embedded for completeness)

- `hybridSearch()` (`src/lib/search/hybrid-retrieval.ts`) — exact/id bypass (parallel, not
  short-circuiting) → keyword arm (trgm GIN over `lower(search_text)`, hand-built predicates because
  the shared `buildTextSearchVariants` helper's shapes don't textually match the index expression) →
  vector arm (pgvector cosine, 300ms embed budget, silently degrades to keyword-only) → RRF merge
  (`k=60`, 1.3× boost for page-context types).
- `entity_search_docs` (`src/lib/migrations/2026-07-03d_entity_search_docs.sql:68-91`), full DDL:

  ```sql
  CREATE TABLE IF NOT EXISTS entity_search_docs (
    id              BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       BIGINT NOT NULL,
    title           TEXT NOT NULL,
    subtitle        TEXT,
    search_text     TEXT NOT NULL,     -- the one canonical matched blob
    embedding       vector(768),       -- nullable; HNSW-indexed
    embedded_at     TIMESTAMPTZ,
    status          TEXT,              -- 4 SHARED typed facets, generic across all 6 entity types
    condition_grade TEXT,
    source_platform TEXT,
    happened_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```

- `build-search-text.ts` — six hand-written builder functions (`buildOrderDoc`, `buildSerialUnitDoc`,
  `buildReceivingDoc`, `buildSkuDoc`, `buildRepairDoc`, `buildFbaDoc`), each emitting its own
  `{ title, subtitle, searchText, facets }` with a fixed 7-key `SearchDocFacets` shape. `MAX_SEARCH_TEXT
  = 2000` chars. Its own docblock: *"a column searched here but missing there [the migration's trigger
  `UPDATE OF` column list] goes stale silently."*
- `SearchHit` (`src/lib/search/search-hit.ts:62-80`) — 7 universal fields (`id`, `entityType`, `title`,
  `subtitle`, `href`, `matchField`, `score`) plus `chips: SearchHitChip[]` and an **optional**
  `facets?: Record<string, string|null>`. The **exact-identifier bypass arm emits hits with no
  `facets` and `chips: []` at all — and those rank first**, on the single most common operator query
  type (per `search-results-grid-GEMINI-RESEARCH-BRIEFING.md` §3.2/§1, not re-litigated here).

### 3d. The search RESULTS RENDERING surface — deliberately flat, guard-enforced, disconnected from the grid kernel

Every render path was traced today:

```
/search           → SearchResultsSurface.tsx → SearchBrowseShell.tsx → MonitorListBlock (<ul><li>) → SearchResultRow
header dropdown   → GlobalSearchDropdown.tsx  → same <ul><li> pattern, grouped by <section> only
⌘K palette        → CommandBar.tsx            → cmdk <Command.Item> wrapping the same SearchResultRow
workbench quick-jump → AiQuickJumpResults.tsx  → same <ul><li> pattern
```

**All four mounts render one `<Link>` row per hit — no column header, no per-field cell, no sort-by-
column, no field picker, anywhere.** `SEARCH_RESULT_GRID` (`src/components/search/search-result-grid.ts`)
is a fixed CSS Grid *template string* for one row's five slots (`Glyph | Id | Match | Tracking | Age`)
— a layout constant, not a table component. A guard, `search-result-grid.guard.test.ts`, states the
law directly in its own header comment: *"Comfortable /search Monitor feed SoT: One shared CSS Grid
template for live rows. Glyph | Id | Match | Tracking | Age — no status/condition/platform... Flat RRF
list — no CATEGORY_TABS grouping on the full results surface,"* and asserts both
`doesNotMatch(/CATEGORY_TABS/)` and `match(/MonitorListBlock/)`.

**A repo-wide search confirms zero references to `SearchHit`/`AiSearchHit` inside
`src/design-system/components/grid/**` or `src/components/tables/**`.** The customizable-column grid
kernel (§3a) and the cross-entity search results renderer (this section) have never been connected, in
either direction.

### 3e. `staff_preferences.tableColumns` — exact shape (confirms §1.3)

```ts
// src/lib/schemas/staff-preferences.ts:162-248 — inside StaffPreferencesPutBody (z.object({...}).strict())
tableColumns: z.record(z.string(), z.object({
  hidden: z.array(z.string()).optional(),
  shown: z.array(z.string().max(64)).max(64).optional(),
  widths: z.record(z.string(), z.number().int().positive().max(2000)).optional(),
  widthBounds: z.record(z.string().max(64), z.object({
    min: z.number().int().positive().max(2000).optional(),
    max: z.number().int().positive().max(2000).optional(),
  }).strict()).optional(),
  order: z.array(z.string().max(64)).max(64).optional(),   // declared — NO consumer reads it (dead)
  display: z.record(z.string().max(64), z.object({
    highlight: z.union([z.literal('none'), z.enum(['blue','amber','rose','emerald']),
                         z.string().regex(/^#[0-9a-fA-F]{6}$/)]).optional(),
    cell: z.enum(['default', 'chip']).optional(),
    text: z.enum(['default','muted','emphasis','warning','critical']).optional(),
  }).strict()).optional(),
  rowFills: z.record(z.string().max(64),
    z.union([z.literal('none'), z.enum(['blue','amber','rose','emerald']),
             z.string().regex(/^#[0-9a-fA-F]{6}$/)])).optional(),
}).strict()).nullable().optional(),
```

Every level is `.strict()` — this is a **closed vocabulary over columns that already exist**, not an
authoring surface.

### 3f. The LIVE, same-day custom-fields interview — summarized in full; do not contradict

`docs/todo/unbox-view-switcher-and-custom-fields-HANDOFF.md`, status *"INTERVIEW IN PROGRESS...
Custom fields NOT started."* The operator explicitly ruled *(b) businesses must be able to add their
own columns, not merely re-shape existing ones* — reversing the non-goal stance in two other recent
handoffs (§1.7). The engineering side's **proposed** (not yet ratified) schema:

```sql
custom_field_defs
  id BIGSERIAL, organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,        -- named CHECK, closed vocabulary (polymorphic-tables.md contract)
  key TEXT, label TEXT,
  type TEXT,                        -- text | number | date | select | boolean
  options JSONB,                    -- select only
  sort_order INT, archived_at TIMESTAMPTZ,
  UNIQUE (organization_id, entity_type, key)

custom_field_values
  id BIGSERIAL, organization_id UUID NOT NULL,
  field_id BIGINT REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
  value_text TEXT, value_number NUMERIC, value_date DATE,  -- exactly one populated, matching def.type
  UNIQUE (organization_id, field_id, entity_id)
```

Reasoning already given for this shape (do not re-derive from scratch — pressure-test it): **typed
value columns, not one `value jsonb`**, because sortability down a grid column is the entire point of
a column and JSON numbers sort lexically (`10` lands between `1` and `2`); a **side table, not a blob
per entity row**, because a blob needs a migration per table, gives no per-field index, and can't be
reused across entities; **one generic `CustomFieldCell` family dispatching on `type`** keeps
`table-definition.ts`'s own law true (*"a definition selects among columns a family already
renders... it never mints a DB column"*).

**Two traps the interview already flagged, both load-bearing for §5/§7:**

1. **The join is the whole ballgame.** *"Ten custom fields as ten `LEFT JOIN`s against a virtualized
   5k-row feed will not hold, and Neon bills CU-hours. It needs one aggregated join returning a jsonb
   map per entity, hydrated in JS. Getting this wrong is how the feature ships and then gets turned
   off."*
2. **Custom fields are invisible to search unless explicitly wired.** *"Custom fields are invisible to
   search unless added to `build-search-text.ts` AND the `entity_search_outbox` triggers. Decide up
   front — never call an upsert-search-doc helper from domain code."*

**Three interview rulings already made (2026-08-08), and they change what "custom columns" can mean:**

- **R1 — the flagship motivating example is NOT a per-row custom field.** Asked to read aloud one row
  of "unreceived orders," the operator described *"a PO line: Dell dock ×10, 6 arrived, 4 short"* — a
  row that requires joining **purchased quantity** (PO lines, the Inbound feed) against **physically
  counted quantity** (cartons, the Queue feed), two grains the codebase had *already* ruled cannot be
  reconciled left-to-right (that's why counts were restricted to two of five tabs earlier in the same
  interview). Verbatim ruling: *"the §3 plan (custom columns on an existing table) does not serve the
  motivating example. Do not ship an 'add a data table' affordance that can only re-filter one feed —
  its first real use is the thing it cannot do."* **This is a live fork this brief must force you to
  rule on** — see D2 (§7).
- **R2 — sharing/placement precedent.** Station-specific scope is a *placement* axis, not a third
  sharing tier; visibility (who sees) and placement (where it appears) are orthogonal fields, matching
  Airtable Personal/Collaborative/**Locked** and Salesforce Private/All/Groups-gated-by-permission —
  the interview specifically flags that Airtable's `Locked` tier ("this is the returns view, don't
  re-filter it") and Salesforce's publish-needs-a-permission split have no equivalent in the proposal
  yet.
- **R3 — a report column that reads "arrived"/"counted" must never say "received."** Bench-counted
  quantity is the correct basis for a *purchasing* report (vendor-delivery question), but this does
  **not** relax the house `Unboxed ≠ Received` law, which governs the **"Received"** label on operator
  rails specifically. A `short = expected − counted` computation is only honest once a PO line's
  receiving is **complete** across every carton/shipment it spans — which today has **no single
  column** to read; the interview leaves this explicitly open (*"OPEN: does a per-PO-line 'receiving
  complete' signal exist, or must the report derive it?"*).

**Twelve interview questions remain genuinely open** in that doc's §4 (dropdown-vs-strip placement;
ownership/sharing; **the model question** — *"A custom column added on receiving lines — should it
follow the carton to Testing and Shipping, or is it receiving-only?... per-`entity_type` fields do not
travel. A field that must travel belongs on the unit/carton every station reads, which is a different
model"*; which entity earns fields first — receiving lines, orders, or SKUs; scale — 3 views or 30;
whether a custom field should be searchable from global search). **This brief does not need you to
answer all twelve** — it needs you to rule on the subset that the *combination* of "universal
connector" + "search display" raises, which the interview's own scope never touched (it never mentions
`/search` once).

### 3g. Polymorphic-tables.md — the DDL contract any new table here must satisfy (verbatim key rules)

Already fully embedded in this org's rule files; restated for Gemini's convenience: named `CHECK`
discriminator (reserve a pg `ENUM` only for small, rarely-extended sets); `BIGINT`/`BIGSERIAL` id
matching the parent's actual PK type; `entity_type`/`entity_id` naming (not `owner_type`/`owner_id`);
every unique/partial-unique index **org-led**; parent-delete integrity via a real FK **or** a
dispatch-on-`TG_ARGV[0]` trigger family, with the trigger added **in the same migration** as the
discriminator value (cited failure mode: `work_assignments` shipped 5 enum values and only 2 triggers,
silently no delete-time behavior for 3 of them, for months); entity-existence validation is an
**application-layer** concern, never a DB `CONSTRAINT TRIGGER`; tenant-from-birth via
`enforce_tenant_isolation('<table>')` in the same migration, **no DEFAULT in the raw DDL**; modeled in
Drizzle in the same PR.

---

## 4. The two questions, decomposed and reconciled against §1–§3

### 4.1 Q1 — a universal backend↔grid connector

State the tension plainly, because it is real and mechanically proven (§3a/Appendix A), not a
hypothetical: the plan that approved today's registry **explicitly scored and killed** a fully
polymorphic "any column of any row" mount (0.2/KILLED, "Airtable mega-row engine"), and
`NonlinearTableHost`'s own source comment names that kill by number. "Domain cells stay per family
forever at this horizon" is Decision D4 of the same approved plan, not an accident of scope. So the
question as literally phrased — *connect to any different kind of table from the backend* — is not
what was built, and the architecture was steered away from that shape **on purpose**.

But §3a/Appendix A also surfaced something the plan's authors may not have fully exploited: **the
`cellMapKey` seam already exists in the schema and is currently unwired.** Ten `ColumnType`s already
cover most of what a display needs (text/number/id/tag/longtext/date/external/location/tracking/
price), and the live interview's own proposed custom-field `type` vocabulary (text/number/date/select/
boolean) maps almost directly onto that same closed set. Ask Gemini to rule on a narrower, defensible
version of "universal": **can a brand-new *column* (including every custom field) be added with zero
new TypeScript, by wiring `cellMapKey` to a real per-`ColumnType` generic cell dispatch (one
`CustomFieldCell` family, as the interview itself proposes) — while a brand-new *entity* (a new
physical table with its own business logic, its own status machine, its own API route) still always
needs a human to write a row type, a descriptor, and — per the closed-forever list — never gets
collapsed into a mega-row?** That is a materially different, answerable question from "connect to any
table," and it is the one this brief actually wants scored.

### 4.2 Q2 — custom columns for "search displays": disambiguate the phrase before answering it

Given §3d, "custom columns... for the search displays" cannot mean the same thing today that it might
have meant reading the request literally. Present both readings and force a choice:

**(a) The ranked `/search` cross-entity hit list itself.** Recently, deliberately, and
guard-enforcedly simplified to a flat, non-tabular, fixed-5-slot row (§3d) — a decision that landed
*after*, and is materially narrower than, what `search-results-grid-GEMINI-RESEARCH-BRIEFING.md`
(Rev 2) had described. That brief's own Option C reasoning (*"modes swap descriptors, not markup"* —
a type facet narrows to ONE entity, the grid swaps descriptors per that type) is the one candidate it
called "house-sanctioned by existing precedent." Expanding this surface into a tenant-customizable
multi-column grid means overturning a fresh, tested, guard-enforced simplification — not a green-field
choice.

**(b) A Workbench-grade list/table VIEW built from search-qualified rows** (or, more generally, a
saved/filtered view over any single entity), rendered through the now-complete `TableDefinition`/
`NonlinearTableHost` kernel (§3a) — where "custom columns" means the tenant's own
`custom_field_defs`/`custom_field_values` rows (§3f) get merged into that ONE entity's column set.
This needs **no** change to `entity_search_docs`, `SearchHit`, or the ranked-list renderer at all;
search only ever needs to answer "which entity ids qualify" (already possible today — `entityTypes` is
a real, unused-by-`/search`, server-side hard filter on `hybridSearch`, per
`search-results-grid-GEMINI-RESEARCH-BRIEFING.md` §3.5). The grid — not the ranked list — renders
whatever columns, system or custom, that one entity's (possibly per-org-extended) `TableDefinition`
declares.

**Our lean, stated so you can pressure-test rather than rediscover it:** (b) is very likely the correct
target, because it reuses two things that already exist and are excellent (the grid kernel; the
`entityTypes`-filtered search arm) instead of reopening a recent, tested, guard-protected
simplification for a use case Rev 2 already argued against on relevance-ranking and sparse-facet
grounds. **Rule explicitly on whether you agree**, and if you believe (a) genuinely needs to change
too, say precisely what would have to be true (e.g., only after the operator has already narrowed to
one `entityTypes` facet, so Rev 2's Option C conditions are met) for that not to re-break what the
guard now protects.

---

## 5. Candidate architectures — custom field storage (score all)

| ID | Candidate | One-line | Status |
|---|---|---|---|
| **S1** | JSONB bag + typed registry (Horizon C's C2) | One `custom_fields jsonb` column per entity + a `custom_field_defs` registry describing its keys | Closed-forever per §0.4 (blob-per-row banned in the live interview) |
| **S2** | EAV (`entity_id, key, value`) | Attribute rows | Closed forever (§0.4) |
| **S3** | **Typed side-table (the interview's proposal, §3f)** | `custom_field_defs` + `custom_field_values` with typed value columns, org-scoped, FK+trigger parent-delete | **Under test — score this one specifically, not abstractly** |
| **S4** | S3 + promote-on-heat (Horizon C's C3) | S3, plus an explicit path to promote a hot custom key into a real indexed column | Score as an extension of S3 |
| **S5** | Full custom-tables meta-schema (Horizon C's C4) | Org-scoped tables/fields/rows, generic renderers | Out of scope for this wave per R1 — score only to show why it's premature |
| **S6** | Schema-per-tenant | `CREATE SCHEMA` per org | Closed forever (§0.4) |

Score S3/S4 specifically against the **two new constraints §3f and §4.2 add** that Horizon C's original
brief never had to reconcile together: (i) the values must be efficiently joinable into a **virtualized**
grid feed (the interview's own flagged join-cost trap); (ii) if §4.2 rules for reading (b), the values
may also need to flow into the search-doc build pipeline (`build-search-text.ts` +
`entity_search_outbox`) without becoming a second search engine. State explicitly whether S3's schema,
as drafted, already satisfies both, or needs a concrete amendment (e.g., a denormalized `jsonb` cache
column refreshed on write, a materialized per-entity view, something else named by name).

---

## 6. Candidate architectures — universal connector (new; no prior doc scored this)

| ID | Candidate | One-line |
|---|---|---|
| **U1** | Status quo — `entityFamily`/`cellMapKey` stay a hardcoded 17-value union forever; every new entity needs a full hand-written adapter (§3a's 11-step walkthrough) | Current state |
| **U2** | Wire `cellMapKey` to a real dispatch; ship ONE generic `CustomFieldCell` family keyed purely on `ColumnType` (per the interview's own proposal), so any column reducible to the existing 10 types — **including every custom field** — needs a new `TableDefinition` row and nothing else | The narrowed "universal" question from §4.1 |
| **U3** | U2, plus let an admin/AI author that `TableDefinition` row as validated JSON per-org (this is exactly the already-**approved** Phase 2 of the landed plan — "Constrained AI authoring," Zod-only output, density-linted, publish-gated) | Composes with the already-approved plan; does not need new house-law |
| **U4** | Full schema-introspection connector — point at any Postgres table, infer columns/types, generate a grid | The literal reading of "connect to any different kind of table from the backend" |

Score U4 explicitly against the plan's own closed-forever list (mega-row collapse, AI-authored DDL) —
we expect it to lose badly, but say so with the formula, not by assertion. **U2/U3 is the version of
"universal" we believe is actually achievable without reopening a already-scored, already-killed
decision** — rule on whether you agree, and if not, name precisely which house law you are asking us to
change and why the trade is worth it.

---

## 7. Forced decisions (one pick each, no "it depends")

| # | Decision | Notes |
|---|---|---|
| **D1** | Ratify, revise, or reject the interview's S3 schema (§3f/§5) as the storage answer | Score against S1/S2/S4/S5/S6; if revising, give the concrete amended DDL |
| **D2** | Does R1 (§3f) mean custom fields need a **second**, later capability — a cross-grain report/rollup layer distinct from Wave-1 row-level fields — or does R1 simply mean the flagship *example* was wrong and Wave-1 row-level fields still ship, just not for that use case? | Phase it: Never / same wave / v2 |
| **D3** | Which reading of "search displays" (§4.2) does this brief's premise target — (a), (b), or a sequenced both? | Defend against §3d's guard and Rev 2's Option C reasoning |
| **D4** | Does `entity_search_docs` ever need new columns for custom fields, or does custom-field data stay outside full-text/semantic search until an explicit future decision? | Tie to the interview's own "decide up front" trap |
| **D5** | Rule on §4.1's narrowed universal-connector question (U1/U2/U3/U4, §6) | Accept/revise/reject the U2/U3 lean |
| **D6** | First system entity/entities for custom fields | receiving_line / orders / sku_catalog / serial_units — pick order; interview's own §4 Q10 is unanswered |
| **D7** | Do per-`entity_type` custom fields "travel" across stations (the interview's unresolved model question, §3f)? | If yes, does that change S3's shape (per-station-touch rows vs. one unit/carton-anchored field)? |
| **D8** | If D3 selects reading (b), must custom-field values flow into `build-search-text.ts` + `entity_search_outbox` on write, or stay search-invisible for v1? | Tie to the interview's own flagged trap |
| **D9** | Validate or amend the interview's join-cost plan ("one aggregated join returning a jsonb map, hydrated in JS") against a virtualized ~5k-row feed | Name a concrete alternative if you'd amend it (materialized view, denormalized cache column, etc.) |
| **D10** | Should `table-columns.ts`'s `TABLE_COLUMNS` (currently 100% static, §3e) grow a dynamic per-org branch, or should custom columns be modeled as a wholly separate concept from "Fields visibility of an existing column"? | |
| **D11** | Relationship to Horizon C's original C1–C8 (still open, unlanded) | Does this brief's answer become the Horizon C plan outright, or a narrower "Horizon C, Wave 1" that precedes the fuller original scope? |
| **D12** | Importable displays / saved custom views | Reuse the already-shipping polymorphic `saved_views` table (org-scoped, staff-owned, optional share) as the vehicle for "a view that includes my custom columns," or something new? |
| **D13** | Sharing/placement model | Ratify R2 (§3f) as-is, or amend — specifically address the interview's own flagged gap (no `Locked`-tier equivalent) |
| **D14** | Success metric for this wave | Pick and name a threshold: "a new custom field on receiving_line requires zero new TypeScript files" / "≤N new files" / both |

---

## 8. Output format (mandatory)

1. **Executive verdict** (≤15 lines) — one tattooable law; accept/revise/reject the §4.2 lean.
2. **Industry survey** answering the §0.2 classes with named systems + citations (2024–2026).
3. **ROI scoreboard** for every candidate in §5 and §6, consistent Blast convention, stated cut line.
4. **Forced rulings D1–D14** — one pick each, 1–3 sentence defense.
5. **Phased plan body**, paste-ready into `universal-table-connector-and-custom-columns-PLAN.md`:
   corrections-section placeholder (for the landing agent) → C0 (prereqs) → C1 → C2 → C3, each wave
   naming real modules from §3/Appendix A only — never invent a path.
6. **Explicit Never/Defer list** with one-line reasons.
7. **Ask-first questions for the human** (max 5).
8. **Appendix** — citation list.

### Landing note (for humans / a repo-capable agent — not for Gemini)

1. Create `docs/todo/universal-table-connector-and-custom-columns-PLAN.md` from §5 of the report.
2. Reconcile against `unbox-view-switcher-and-custom-fields-HANDOFF.md` — if that interview has
   advanced past R1–R3 by landing time, fold its newer rulings in; do not silently overwrite them.
3. **Not** implement anything in that landing pass.

---

## 9. Anti-patterns for your answer

- Re-deriving JSONB-vs-EAV-vs-schema-per-tenant from first principles as if §1.5/§3f/§0.4 didn't
  already narrow it — pressure-test the drafted schema, don't replace the exercise with a fresh one.
- Recommending (a) in §4.2 without engaging §3d's guard test or Rev 2's specific relevance/sparsity
  findings by name.
- Proposing a mega-row, EAV, or schema-per-tenant "because industry sometimes does it" without
  addressing why this product's closed-forever list already rejected it.
- Ignoring R1 and re-proposing "just add a custom field on the PO line" as if it serves the flagship
  motivating example — it was already ruled that it doesn't.
- Claiming to have read or modified repository files.
- Treating `cellMapKey`/`order` (§1.2/§1.3) as if they were live, wired features — both are confirmed
  dead code today.

## 10. Success criteria

A staff engineer reading your report can, without re-opening this research: (1) state the storage
shape for custom fields in one paragraph and defend it against S1–S6; (2) know exactly how far "any
backend table" can go before it needs a human engineer, and why; (3) know which "search display"
question this solves, and which it deliberately does not; (4) paste your phased plan into the repo
without contradicting R1–R3 or reopening the `/search` simplification without cause.

## 11. One-line mission

> Deep-research 2024–2026 multi-tenant custom-field storage and federated cross-entity search UX
> against Cycle Forge's landed, deliberately-narrow `TableDefinition` registry; validate or amend the
> schema this engineering org already drafted mid-interview; force D1–D14; return a paste-ready plan
> that reuses the grid kernel and the search-matching engine as two separate things, never one.

## 12. Paste-ready kickoff

```
Read this briefing end-to-end. You do not have the codebase — treat §1–§3 as ground truth and do not
invent facts past them.

Survey per §0.2; score §5 and §6 with the §0.3 formula; rule D1–D14 (§7), one pick each.
Reconcile with §1 (settled laws) and §0.4 (closed forever) — where industry conflicts, pick a side for
Cycle Forge and defend it in writing.
Do not re-derive what §1.5/§3f already narrowed; pressure-test the drafted S3 schema instead of
replacing it wholesale unless you have a specific, named reason.
Disambiguate "search displays" per §4.2 before answering anything about search.
Do not recommend foreign grids, EAV, schema-per-tenant, a blob-per-row custom_fields column, a
one-join-per-field query, or collapsing domain cells into a mega-row — all closed forever (§0.4).
Return the §8 sections in order.
```

---

## Appendix A — actual updatable contacts (file:line)

Every module a landing engineer (or your recommended plan) would touch, with its current role. Grouped
by concern.

### A.1 — The table-definition registry (Q1)

| File | Current role |
|---|---|
| `src/lib/tables/table-definition.ts` | Zod schema; `COLUMN_TYPE_VALUES` (10 closed types, lines 54-65); `TABLE_ENTITY_FAMILIES` (17 closed values, lines 89-107); `tableDefinitionColumnSchema` (131-151, strict, no render field); `superRefine` structural rules (183-230); `parseTableDefinition()` (249-251) |
| `src/components/tables/table-surface-binding.ts` | `TableSurfaceBinding<Row, C>` — definition + typed `columns` + `makeDescriptor` factory ref |
| `src/components/tables/NonlinearTableHost.tsx` | Mount host; explicit "Airtable mega-row the plan kills" rejection (27-31); mandatory `renderColumnHeader`/`renderGroup`/`renderRow` props (92-104) |
| `src/components/tables/table-definition-registry.ts` | `TABLE_DEFINITIONS` static registry; 15 imports / 17 bindings (24-79) |
| `src/components/tables/table-definition-registry.guard.test.ts` | `BINDINGS` array — deep-equality guard; a new definition must be added here |
| `src/lib/tables/grid-surface-capabilities.guard.test.ts` | `GRID_VIEW_FOREST` (shrink-only, **empty `[]` as of 2026-08-08**) + `MOUNTS` disk-walk map + `DECLARED_CAPABILITIES` |
| `src/design-system/components/grid/grid-surface-descriptor.ts` | `GridSurfaceDescriptor`/`GridSurfaceCapabilities` — plain TS interfaces, not Zod; `columnDefs` carries live TanStack `ColumnDef`s (not serializable) |
| 15 `*-table-definition.ts` files (full list) | `receiving-table-definition.ts` · `incoming-table-definition.ts` · `ready-table-definition.ts` · `pickup-table-definition.ts` · `unfound-table-definition.ts` · `tech-all-table-definition.ts` · `tracking-exceptions-table-definition.ts` · `warranty-table-definition.ts` · `my-day-table-definition.ts` · `catalog-table-definition.ts` · `repair-table-definition.ts` · `bins-table-definition.ts` · `units-table-definition.ts` · `catalog-link-table-definition.ts` (2 bindings) · `orders-table-definition.ts` (2 bindings) |
| `src/components/station/receiving-grid/ReceivingGridHost.tsx` | Shared non-forest adapter (4 mounts) — sort / PO-fold / day-band / render props → `NonlinearTableHost` |
| `src/components/dashboard/orders-queue/OrdersGridHost.tsx` | Shared non-forest adapter (9 mounts) — composes `useOrdersQueuePlane`; keep `OrdersQueueColumnHeader` fork |
| `src/components/inventory/UnitsWorkspaceView.tsx` | Units binds `UNITS_TABLE_BINDING` inline (former `UnitsGridView` burned) |
| `src/lib/receiving/receiving-grid-layout.ts` | Receiving column SoT — hard Product 16rem + trailing `_fill`; order `title · status · date · …` |
| `src/components/station/receiving-grid/cells/index.tsx` | Golden shape: `renderReceivingGridCell()` key-dispatch to per-column files (incl. empty `_fill`) |
| `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` | 1276-line hand-written switch; in-cell edit wired per column key |

### A.2 — Fields / column-visibility (a DIFFERENT system — Q1/Q2 boundary)

| File | Current role |
|---|---|
| `src/lib/tables/table-columns.ts` | `TABLE_COLUMNS` — static `Record<TableId, TableColumnSpec[]>`, ~20 table ids, hand-authored |
| `src/lib/schemas/staff-preferences.ts:162-248` | `tableColumns` Zod shape — delta only, `.strict()` |
| `src/design-system/components/grid/useGridColumnVisibility.ts:60-82` | `isGridColumnVisible()` — pure filter, cannot append a column |
| `src/components/ui/table-column-config/useGridColumnWidths.ts:59,114` | `setWidth(key, px)` — key must pre-exist |
| `src/components/ui/table-column-config/GridColumnDetailsPanel.tsx` | The column-management UI surface — where an "Add column" verb would live per the live interview |

### A.3 — Search matching engine (Q2)

| File | Current role |
|---|---|
| `src/lib/migrations/2026-07-03d_entity_search_docs.sql:68-91` | `entity_search_docs` DDL — one `search_text` blob + 4 shared typed facets |
| `src/lib/search/hybrid-retrieval.ts` | `hybridSearch()` — exact bypass / keyword / vector / RRF merge |
| `src/lib/search/build-search-text.ts` | 6 hand-written per-entity-type builders; `SearchDocFacets` (7 fixed keys) |
| `src/lib/search/search-hit.ts:62-80` | `SearchHit` wire shape |
| `entity_search_outbox` (referenced by the live interview) | Trigger-driven doc-freshness worker — would need wiring if D8 rules yes |

### A.4 — Search RESULTS rendering (Q2 — currently disconnected from A.1's kernel)

| File | Current role |
|---|---|
| `src/components/search/SearchResultsSurface.tsx` | `/search` results body |
| `src/components/search/SearchBrowseShell.tsx` | Mounts `MonitorListBlock` + row list |
| `src/design-system/components/monitor/MonitorListBlock.tsx:17-24` | Plain `<ul class="divide-y">` — not a table |
| `src/components/search/SearchResultRow.tsx` | The one row renderer (`OrderRow`/`UnitRow`/`GenericRow` fork) |
| `src/components/search/search-result-grid.ts` | `SEARCH_RESULT_GRID` — fixed 5-slot CSS template for ONE row, not a table |
| `src/components/search/search-result-grid.guard.test.ts` | Enforces flat list, bans `CATEGORY_TABS` regrouping |

### A.5 — Custom fields (Q2 — the interview's proposal)

| File | Current role |
|---|---|
| `docs/todo/unbox-view-switcher-and-custom-fields-HANDOFF.md` | The live interview — schema draft, R1–R3, 12 open questions |
| `0000_baseline_through_2026-03.sql:2799,2905,2922,2981` | The 4 existing (non-usable-precedent) `custom_fields JSONB` Zoho-mirror columns |
| `.claude/rules/polymorphic-tables.md` | The DDL contract any new `custom_field_defs`/`custom_field_values` pair must satisfy |
| `src/lib/tenancy/settings.ts` | `OrgSettingsSchema` — `.passthrough()` JSONB validator precedent |
| `src/lib/workflow/validate-config.ts` | `workflow_nodes.config` validator — hand-rolled, non-Zod; the still-open gap `polymorphic-tables.md` itself names |

### A.6 — Sibling research (context only; do not re-solve)

`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md` ·
`nonlinear-data-table-engine-PLAN.md` (+ its own `-GEMINI-RESEARCH-BRIEFING.md`) ·
`nonlinear-table-forest-finish-HANDOFF.md` (**DONE** — forest empty; hosts + History `_fill`) ·
`nonlinear-table-burn-forest-and-ratchet-HANDOFF.md` (**DONE** — Phase B closed) ·
`search-results-grid-GEMINI-RESEARCH-BRIEFING.md` (Rev 2) ·
`ledgergrid-add-column-track-HANDOFF.md` (prior non-goal stance) ·
`to-ship-pending-full-grid-handoff.md` (prior non-goal stance) ·
`inbound-intake-and-purchasing-view-COMBINED-HANDOFF.md` (references the same draft schema, defers it)

---

## Appendix B — 2026-08-08 ground-truth delta (Phase 3 burn + History geometry)

Verified in the app checkout the same day this brief was authored. Use this over any earlier
"14 → 2 wrappers remaining" wording elsewhere in the fleet docs:

| Fact | Was (brief draft earlier 2026-08-08) | Now |
|---|---|---|
| `GRID_VIEW_FOREST` | 14 → 2 mid-migration (`ReceivingGridView`, `OrdersGridView`) | **`[]`** — Phase 3 burn complete |
| `*GridView.tsx` on disk | 2 remaining | **0** |
| Receiving / Orders shared mounts | Thin `*GridView` wrappers still in the forest | Non-forest hosts: `ReceivingGridHost` · `OrdersGridHost` |
| Units | `UnitsGridView` wrapper | Inlined in `UnitsWorkspaceView` |
| Receiving Product track | `minmax(8rem, 1fr)` (regression — Product owned `1fr`) | Hard `minmax(16rem, 16rem)` + trailing `_fill` owns sole `1fr` |
| Receiving Date position | Immediately left of Product (`date · title`) | After Status (`title · status · date · …`) |
| Exit criteria (plan §5) | Unmet | Met: new queue = registry entry + binding (+ cell map only if new `entityFamily`); pages do not import `*GridView` |

**Unchanged by this delta (still load-bearing for Q1/Q2):** `cellMapKey` remains unwired dead schema;
domain cells stay per-family forever at this horizon; Airtable mega-row stay killed; Phase 2
constrained AI authoring still deferred; Horizon C / custom-field interview still open.
