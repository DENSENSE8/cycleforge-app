# Research briefing — Nonlinear data-table engine (display ↔ page decoupling + AI column authoring)

**For:** Gemini Pro / Gemini 2.5 Pro (deep research) — **you do not have the codebase.** Every path, line count, guard name, and measured behavior below is **embedded**. Do not invent modules. Do not claim to have inspected source. If you speculate past §2–§5, label it `my reasoning:`.
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Subject:** Should Cycle Forge replace today’s **page-coupled `*GridView` forest** with a **nonlinear architecture** — one polymorphic **data-table engine** (backend → frontend display) that is **not hard-linked to pages**, plus a **separate authoring / selection task** (human + AI) that defines column sets, defaults, and warehouse-dense placements — so most domain table UI code can be **deleted and restarted** on one SoT?
**Status:** RESEARCH CLOSED → plan landed. Adjudication + phased plan: [`nonlinear-data-table-engine-PLAN.md`](nonlinear-data-table-engine-PLAN.md) (**APPROVED** — C1 live; C2/C3 live with strict bounds; static code registry first; DB JSON deferred to Horizon C).
**Your deliverable (historical):** one markdown research report. Implementing agents follow the PLAN, not this briefing.

---

## 0. Method

### 0.1 Your job is industry research + constrained adjudication

1. **Survey the web** (prefer **2024–2026** primary docs) for how sellable B2B products separate:
   - **table engine / shell**
   - **table definition / schema / column registry**
   - **page / route binding**
   - **AI-assisted view / column authoring**
2. **Reconcile** every recommendation against the embedded house constraints in §1 and the measured state in §3–§5. Where industry conflicts with a constraint, **pick a side and defend** (or tell us to change the constraint with an Ask-first section).
3. **Score** candidates with §0.3. Cut ruthlessly.
4. Treat §3–§5 as **ground truth about the product today.** Do not invent APIs, descriptors, or shipped AI authoring that contradict them.

### 0.2 Sources to cover (minimum)

| Class | Examples | Use for |
|---|---|---|
| **Ops dense tables** | Linear, Stripe Dashboard, Retool Table, Shopify Polaris IndexTable, IBM Carbon DataTable, Attio | What sellable B2B queues ship |
| **DB–spreadsheet hybrids** | Airtable, Notion DB, Coda, Smartsheet | Linked records / views vs ops queues — **anti-pattern boundaries** |
| **Headless table engines** | TanStack Table, AG Grid (as competitor — **not** an adoption candidate), Glide Data Grid | Engine vs chrome vs column-def separation |
| **Metadata-driven / low-code tables** | Retool, Appsmith, Internal.io, Budibase, Salesforce List Views, Dynamics views | Definition registries decoupled from pages |
| **AI view / schema helpers** | Airtable AI, Notion AI, Retool AI, v0-style generators, “suggest columns” in BI tools | What AI is allowed to author vs what must stay eng-owned |
| **WMS / MES / floor UIs** | At least 1–2 named warehouse / fulfillment / MES station UIs | Condensed columns on 1080p benches |

Where industry splits, give **both** positions, conditions each wins under, then pick one for **this** product.

**Hard fork:** “what a spreadsheet / base builder does” ≠ “what a dense, scan-driven warehouse-ops SaaS on a 1080p floor monitor should do.” This product is the latter.

### 0.3 Scoring model (mandatory)

Score every architectural candidate on **all five axes** (1–5). Report a table. Do not invent a sixth axis.

| Axis | Meaning |
|---|---|
| **Fit** | Compounds on LedgerGrid / descriptors / `TableId` / capabilities / Kinetic Ledger vs requires a foreign paradigm |
| **Nonlinear purity** | Engine, definition, and page binding are separable; adjusting a table definition does not require editing a page component |
| **Operator throughput** | Floor/workbench queues stay simple, condensed, scannable; AI defaults must not produce desktop-BI column soup |
| **Blast radius** | How many surfaces, APIs, migrations, prefs shapes (5 = tiny; 1 = company-wide rewrite) |
| **Migration cost** | Cost from today’s measured forest (§4) to the candidate — including unfinished Horizon A forks |

**Score ≈ (Fit × Nonlinear purity × Operator throughput) / ((6 − Blast) × Migration friction)**  
where Migration friction is `6 − Migration cost`.  
**Blast scoring:** 5 = tiny blast, 1 = huge. Rank descending. State your cut line.

### 0.4 Closed forever (do not recommend unless Ask-first with strong evidence)

- Adopting a **foreign UI grid** as the product shell (AG Grid, Handsontable, MUI DataGrid, Glide, embedded Sheets)
- **Schema-per-tenant** / **database-per-tenant** as the default multi-tenant model
- Collapsing **all domain cell JSX** into one mega-row that renders “any SQL column” without typed atoms
- Letting AI **bypass Zod / capability bags / `transition()` / tenant GUC** when writing table defs or mutations
- Raising any Design-System ratchet baseline to make a migration “pass”
- Treating DB **polymorphic hubs** (`entity_type` + `entity_id`) as the same thing as a **polymorphic UI GridView**
- Porting open-carton Station accordion (`PoLinesAccordion` / `PoLineMetaGrid`) onto the Workbench spreadsheet engine without Ask-first
- A second action system that bypasses the four Workbench planes or the status state machine

---

## 1. Settled laws (do not re-litigate casually)

A recommendation that reverses one of these without an explicit “change the house law” Ask-first section will be discarded.

| Already decided | Meaning |
|---|---|
| **Shell SoT = LedgerGrid family** | Virtualized Workbench queues mount `LedgerGrid` / `LedgerGridSurface` with `GridSurfaceDescriptor` + `GridSurfaceCapabilities` |
| **DataTable sibling** | Non-virtualized admin / settings / reports use sibling `DataTable` (same visual table-surface chrome) |
| **No foreign UI grids** | Never AG Grid / MUI / Glide / embedded Sheets as the product shell |
| **Shared-schema multi-tenancy** | One Postgres schema; `organization_id` from auth `ctx`; tenant transaction / GUC |
| **Domain cells stay per family (today)** | Orders cells ≠ Receiving cells ≠ Catalog cells. Unify shell + chrome + atoms; do **not** collapse all JSX into one mega-row **unless you explicitly overturn this law** |
| **Capabilities gate feature bleed** | Bag booleans: `rowTriageFlags` · `multiSelect` · `inCellEdit` · `fieldsMenu` · `dayBands` |
| **Status is a state machine** | Status changes only via `transition()` + audit — never raw status cell overwrites |
| **Four action planes** | In-cell · row-scoped · multi-select · record (right rail). Horizon B owns growing actions |
| **Compose → grow SoT → compound** | Never fork a page-local twin for the same job; grow the named SoT when it is wrong |
| **Retirement needs a guard** | A prose-only retirement is incomplete; allowlists shrink-only |
| **DB polymorphic ≠ UI polymorphic** | `.claude/rules/polymorphic-tables.md` is a **DDL contract** for hubs (`entity_type`/`entity_id`). It is **not** a UI spreadsheet law |
| **Unbox History is the golden spreadsheet** | Display / chrome / ▦ / sheet flush / Band 3–View topics recipe |
| **Station ≠ Workbench** | Scan benches act-and-clear; Workbench queues pick→edit→persist. Do not turn Station into Sheets |
| **Right edge pushes** | Record inspectors are non-modal push rails, not floating modals as default |

### Region contracts (use this vocabulary)

| Region | Job | This brief |
|---|---|---|
| **Workbench** | pick → edit → persist on queues | **In scope** (collection map = data table) |
| **Station** | scanner act-and-clear | Out of scope for the engine rewrite (except “do not leak Station into the engine”) |
| **Monitor** | observe streams | Mention only if engine defs leak here |
| **Canvas** | Studio / reshape definitions | **In scope** as the likely home of AI table authoring |

---

## 2. Product hypothesis (state it back in your own words)

### 2.1 Owner thesis (trigger)

> All tables besides the Unboxed data table are terrible. Unboxed is the source of truth. Instead of pouring updates into every sibling component, **delete those table components**, reconnect them to the Unboxed-quality engine, and make the codebase **nonlinear**: one **data-table engine** separate from all **data-table displays / page bindings**. Building and selecting a data table (columns, defaults, warehouse-dense placement) is a **separate task**, using **AI** for column placement and best-default inputs — simple but condensed enough to read in a warehouse. The data table must be **polymorphically linked** to other tables while keeping distance from being hard-coded to a page. It must act as a **display engine** from backend → frontend. This is a **huge SoT change** — delete most of the duplicate table code and start over.

### 2.2 Engineering framing — three independently falsifiable claims

| # | Claim | If true… | If false… |
|---|---|---|---|
| **C1 — Nonlinear engine** | Page components must not own column models, cell registries, or sheet chrome; they only **reference a table definition id** + supply a row feed + selection/open intents | Delete / thin most `*GridView` files into bindings | Keep thin adapters; grow shared shell only (status quo Horizon A) |
| **C2 — Polymorphic display link** | One engine can render many entity families via a typed definition registry (row schema + column defs + cell atoms + capabilities), without hard page routes | Registry + mount API becomes the SoT | Per-family adapters remain required; “polymorphic” stops at DB hubs + shared shell |
| **C3 — AI authoring task** | Creating/adjusting a table definition (columns, tiers, defaults, warehouse density) is a **Canvas/Studio task** (human + AI), not an eng PR that edits seven layout files | Ship an authoring waist + validation; eng owns atoms + capabilities | Keep eng-authored `*-grid-layout.ts` files; AI only drafts PRs / suggestions offline |

**You must rule each claim live/die independently.** A common failure mode is accepting C1’s pain while smuggling Airtable (C2 overreach) or unsafe AI writes (C3 overreach).

### 2.3 What “nonlinear” means in this brief (load-bearing)

```text
                    ┌─────────────────────────────┐
                    │  Table Definition Registry  │  ← authoring task (human + AI)
                    │  id · entity · columns ·    │
                    │  tiers · caps · default view│
                    └──────────────┬──────────────┘
                                   │ references by id
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
   Page / Route A            Page / Route B           Studio preview
   (feed + intents)          (feed + intents)         (same engine)
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │     Data Table ENGINE       │  ← LedgerGrid family (grow, don’t replace)
                    │  shell · virtualization ·   │
                    │  Fields · sort · drill · ▦  │
                    └─────────────────────────────┘
                                   ▲
                    ┌──────────────┴──────────────┐
                    │  Backend row contracts      │
                    │  (typed feeds / DTOs)       │
                    └─────────────────────────────┘
```

**Nonlinear** = changing the definition does **not** require editing the page file; mounting a table on a new page is **bind by id**, not copy a GridView.  
**Not nonlinear** = fourteen `*GridView.tsx` files that each re-wire `LedgerGridSurface` + local sort + local portal + local open semantics.

---

## 3. Product context (embedded)

**Cycle Forge** — multi-tenant B2B **reseller-operations SaaS** (used-goods: receive → unbox → test → repair → catalog → pack → ship → returns/warranty). USAV is the **dogfood tenant only** — answer for a sellable product.

**UI identity — Kinetic Ledger:** data-first, dense, state-colored, scan-aware; **legible throughput over document calm**.

**Operator reality**

- Dense queues on desktop / floor monitors (often ~1080p), long shifts.
- Mouse-first on Workbench queues; barcode scanner-first on Station benches.
- Rows are **work items**, not freeform spreadsheet cells.
- Color/meaning must survive shift handoff.
- Every write is tenant-scoped, permission-gated, auditable.
- Vendor systems (Zoho, Zendesk, …) are **capability facades** — never the product noun in operator copy (except Integrations).

**Golden display recipe today:** Unbox History spreadsheet (sheet flush · Band chrome · ▦ Column Display · typed cells · drill/compare).

---

## 4. Measured anatomy today (do not re-invent)

### 4.1 Engine already exists (partial nonlinear waist)

| Concern | Module (path) | Approx size / note |
|---|---|---|
| Virtualized shell | `src/design-system/components/grid/LedgerGrid.tsx` | ~444 lines |
| Descriptor composer (sheet/framed, Fields gutter, widths) | `src/design-system/components/grid/LedgerGridSurface.tsx` | ~503 lines |
| Column model + caps + TanStack lift | `grid-surface-descriptor.ts` — `LedgerGridColumnModel`, `GridSurfaceCapabilities`, `makeGridSurfaceDescriptor` | house waist |
| Headless state | `useGridSurface.ts` (TanStack v8 **state math only**; keep `"use no memo"`) | |
| Header SoT | `LedgerGridColumnHeader.tsx` + `makeLedgerGridColumnHeader.tsx` | Orders header is allowlisted fork |
| Leaf row shell | `LedgerGridLeafRow.tsx` | |
| Drill (list ≠ drill ≠ compare) | `LedgerDrillHost.tsx`, `ledger-drill-layout.ts` | WMS-wide |
| Visibility / widths / display / row fills | `useGridColumnVisibility.ts`, applied widths, `grid-column-display.ts`, `useGridRowFills.ts` | staff prefs |
| Cell chrome / overflow / sticky X | `grid-cell-chrome.ts`, `grid-overflow-x.ts`, `GridStickyXScrollbar.tsx` | |
| Shared value atoms | `src/components/ui/grid-cells.tsx`, `CopyChip` | |
| Fields vocabulary | `src/lib/tables/table-columns.ts` — `TableId`, `TableColumnSpec` | |
| Caps guard + disk walk of mounts | `src/lib/tables/grid-surface-capabilities.guard.test.ts` | ratchet |

**~61 files** live under `src/design-system/components/grid/`. The rendering engine is **already highly converged**. Prior research (`ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md`) found that “ugly/inconsistent” often lives in **semantic column vocabulary, page chrome, state affordances, and unmigrated forks** — not in the row pixel engine.

### 4.2 Domain forest (the delete target)

**14 `*GridView` adapters** (plus raw `LedgerGrid` mounts):

| View path | Typical `tableId` | Notes |
|---|---|---|
| `…/receiving-grid/ReceivingGridView.tsx` | `receiving` / `testing` | **Golden** Unbox / History / Testing (~352 lines) |
| `…/incoming-grid/IncomingGridView.tsx` | `incoming` | Same host family; different columns (~203 lines) |
| `…/orders-queue/OrdersGridView.tsx` | `orders` | **Fat** (~652 lines) — rail selection, cursor, Labels popovers leak in |
| `…/catalog-grid/CatalogGridView.tsx` | `catalog` | |
| `…/repair-grid/RepairGridView.tsx` | `repair` | Thin adapter pattern (good) |
| `…/pickup/grid/PickupGridView.tsx` | `pickup` | Different row type (`PickupLine`) |
| `…/warranty/grid/WarrantyGridView.tsx` | `warranty` | |
| `…/ready/grid/ReadyGridView.tsx` | `ready` | |
| `…/tracking-exceptions/…/TrackingExceptionsGridView.tsx` | `tracking-exceptions` | |
| `…/unfound/grid/UnfoundGridView.tsx` | `unfound` | Inline patch/push actions |
| `…/bins-grid/BinsGridView.tsx` | `bins` | |
| `…/my-day/grid/MyDayGridView.tsx` | `my-day` | |
| `…/tech/all/TechAllGridView.tsx` | `tech-all` | |
| `…/review/catalog-link/…/ReviewCatalogLinkGridView.tsx` | `catalog-link` + `import-exception` | |

**Raw mounts (no GridView):** `StationListTable.tsx` (`station-history`), `FbaBoardTable.tsx` (`fba` — **hand geometry**, bypasses layout SoT).

**Fat composition host:** `ReceivingLinesTable.tsx` (~769 lines) — data/selection/chrome/drill switch for Receiving + Incoming. Intentionally a host; still a coupling magnet.

**Already proves reuse-by-engine:** Testing History mounts `ReceivingGridView` with `tableId="testing"` (separate Fields prefs bucket). Compare panes mount the same view. That is the **correct direction** — incomplete.

### 4.3 Column layout SoTs (eng-authored today — AI target surface)

| Export | Path |
|---|---|
| `RECEIVING_GRID_COLUMNS` | `src/lib/receiving/receiving-grid-layout.ts` |
| `INCOMING_GRID_COLUMNS` | `src/lib/receiving/incoming-grid-layout.ts` |
| `ORDERS_QUEUE_COLUMNS` (+ tested variant) | `src/lib/dashboard-order-row-layout.ts` |
| `CATALOG_GRID_COLUMNS` | `src/lib/products/catalog-grid-layout.ts` |
| `REPAIR_GRID_COLUMNS` | `src/lib/repair/repair-grid-layout.ts` |
| `PICKUP_GRID_COLUMNS` | `src/components/receiving/pickup/grid/pickup-grid-layout.ts` |
| `WARRANTY_GRID_COLUMNS` | `src/components/warranty/grid/warranty-grid-layout.ts` |
| `READY_GRID_COLUMNS` | `src/components/outbound/ready/grid/ready-grid-layout.ts` |
| `TRACKING_EXCEPTIONS_GRID_COLUMNS` | `src/components/tracking-exceptions/grid/tracking-exceptions-grid-layout.ts` |
| `UNFOUND_GRID_COLUMNS` | `src/components/receiving/unfound/grid/unfound-grid-layout.ts` |
| `BINS_GRID_COLUMNS` | `src/components/warehouse/bins-grid/bins-grid-layout.ts` |
| `MY_DAY_GRID_COLUMNS` | `src/lib/my-day/my-day-grid-layout.ts` |
| `TECH_ALL_GRID_COLUMNS` | `src/lib/tech/tech-all-grid-layout.ts` |
| `CATALOG_LINK_GRID_COLUMNS` / `IMPORT_EXCEPTION_GRID_COLUMNS` | `src/features/review/catalog-link/grid/*` |

Each pairs with a `*-grid-descriptor.ts` that declares capabilities.

**Staff prefs:** `staff_preferences.tableColumns[TableId]` stores **deltas** (hidden/shown, widths, highlights, row fills) — never absolute column lists as the only source. Layout `tier: 'core'|'optional'` + `hideKey` drive Fields.

**`TableId` union today includes:** `receiving` · `incoming` · `orders` · `shipped` · `tech` · `testing` · `packer` · `catalog` · `pickup` · `repair` · `warranty` · `ready` · `bins` · `unfound` · `my-day` · `tech-all` · `catalog-link` · `import-exception` · `tracking-exceptions` · `support-tickets` (layout file for support-tickets **does not exist** yet — registry ahead of UI).

### 4.4 Page-coupling smells (why the owner wants deletion)

| Smell | Evidence |
|---|---|
| Fat GridView | `OrdersGridView` embeds rail occupancy, record cursor, Labels tracking popover, force-hide |
| History semantics in adapter | `ReceivingGridView` carries `historyTriageMenu`, dual select planes, `onOpenWorkspace` |
| Parallel chrome forks | Residual workspaces still invent Band-3 / filter bars (Warranty, Unfound, Tracking exceptions called out as chrome debt in workbench-ops-queue docs) |
| Bypass descriptor | `FbaBoardTable` hand `FBA_GRID` string geometry |
| Twin retirement incomplete | Pattern-evolution law: knip cannot see dual doors; only guards prove single entry |

### 4.5 What is intentionally NOT the spreadsheet

| Surface | Job | Law |
|---|---|---|
| Unbox open-carton `PoLinesAccordion` / `PoLineMetaGrid` | Edit lines in a scanned carton | Station work — **not** LedgerGrid |
| Search order feedback | Search hit feedback | Never import desk `ShippedDetailsPanel` |
| Support ticket thread | Service-workspace | Different Workbench branch |

### 4.6 Existing multi-horizon program (do not duplicate blindly)

| Horizon | Doc | Intent |
|---|---|---|
| **A** Display SoT pin | `ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`, `table-display-sot-GEMINI-RESEARCH-BRIEFING.md` | One excellent shell; migrate forks |
| **B** Industry actions | `grid-industry-actions-HORIZON-B-PLAN.md` (+ GEMINI briefing) | Four planes on same shell |
| **C** Tenant extensibility | `tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md` | Saved views / custom fields / optional custom tables |

**This brief asks:** is the owner’s **nonlinear engine + AI authoring** (a) the missing **Horizon D**, (b) a **reframing that accelerates A+C**, or (c) a **dangerous big-bang** that should be rejected in favor of finishing A with stricter “thin binding” rules?

Prior related briefs (cite or supersede with a dated note):

- `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` — engine already converged; inconsistency elsewhere
- `table-display-sot-GEMINI-RESEARCH-BRIEFING.md` — move presentation onto column model
- `tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md` — multi-tenant views/fields/tables
- `studio-scan-station-templates-AI-first-GEMINI-RESEARCH-BRIEFING.md` — AI authoring lives in Canvas/Studio patterns
- `unbox-receiving-grid-CONTEXT-MAP.md` — Unbox cell waist
- `search-results-grid-GEMINI-RESEARCH-BRIEFING.md` — future engine consumer

---

## 5. Warehouse density constraints (AI must obey)

Any AI / human authoring of default columns must optimize for:

| Constraint | Rule of thumb |
|---|---|
| Viewport | 1080p–1440p landscape; often standing bench ~3 ft |
| Column count default | Prefer **≤ 8–10 visible core** tracks; optional via Fields (▦) |
| Identity pane | Frozen select + one identity key (order/PO) — never hide |
| Magnitude vs label | Qty/price/date **end**-align; title/tracking/SKU/serial **start**-align (`resolveGridColumnAlign` only) |
| Truncation | Prefer condensed typed chips over wrapping prose |
| No desktop-BI soup | No default “show every DB column”; no multi-line cell novels |
| Tier model | `core` vs `optional` must remain; AI proposes tiers, eng/validation enforces |
| Capability honesty | Catalog must never gain Orders triage wash “because AI thought it looked consistent” |

**Golden reference for density:** Unbox `RECEIVING_GRID_COLUMNS` — select · order · date · title · status · qty · price · condition · location · tracking · serial (with Fields hiding optionals).

---

## 6. Candidate architectures (you must score all)

### A0 — Status quo + finish Horizon A

Keep `*GridView` adapters. Grow `LedgerGridSurface`. Migrate fat views toward Repair-thin. No definition registry. No AI authoring product.

### A1 — Strict thin-binding (nonlinear **without** metadata DB)

Introduce a single mount API, e.g. conceptually:

`mountOpsTable({ tableId, descriptorId, rows, onOpen, onToggle, columnTriggerPortalTarget })`

Delete fat GridViews; **keep** eng-owned `*-grid-layout.ts` + cell registries as code. Pages only bind. No runtime AI writes.

### A2 — Definition registry in code (typed modules)

One `tables/` registry: `{ id, entity, columns, capabilities, cellMapKey, defaultSort }`. Pages import by id. Cell maps stay typed TypeScript modules keyed by entity family. AI may **propose diffs** to registry modules (PR), not mutate prod prefs.

### A3 — Runtime definition registry (DB / org-scoped JSON) + engine

Table definitions stored as validated JSON (Zod) per org or system, versioned. Engine loads by id. Studio/Canvas AI authors definitions. Pages bind `tableDefinitionId` + feed. Closest to owner “polymorphic + AI task.” Highest blast / closest to Horizon C.

### A4 — Big-bang delete & rewrite

Delete most GridViews + layout files; rebuild only engine + registry + Unbox-proven cells first; re-bind pages in waves. Accept temporary feature loss. Highest migration friction; only valid if A1–A3 cannot reach nonlinear purity.

### A5 — Foreign grid / Airtable-shaped product

Rejected by §0.4 unless Ask-first with extraordinary evidence. Score it only to show why it loses.

**You may propose a hybrid** (e.g. A1 now → A2 → A3 later) but must still score the pure candidates and name the cut line.

---

## 7. Forced rulings (D1–D14) — one pick each, no “it depends”

| ID | Decision | Options (pick one) |
|---|---|---|
| **D1** | Is the owner thesis directionally correct? | Accept C1+C2+C3 / Accept C1 only / Accept C1+C3 / Reject big rewrite; finish A |
| **D2** | Best near-term candidate | A0 / A1 / A2 / A3 / A4 / hybrid (name stages) |
| **D3** | What may be deleted in wave 1? | Only chrome twins / GridViews that are pure wrappers / layouts+cells too / nothing until A excellence |
| **D4** | Domain cell registries | Stay per-family forever / per-family until A3 / collapse to typed atom map keyed by `ColumnType` only |
| **D5** | Polymorphic UI meaning | Bind-by-`tableId` only / entity-family cell maps / runtime JSON defs / DB polymorphic hubs drive columns (discouraged) |
| **D6** | Page open/select intents | Stay in page host / declared in definition as intent vocabulary / free function props only |
| **D7** | AI authoring locus | Studio Canvas / Settings admin / offline PR assistant only / nowhere in v1 |
| **D8** | AI write authority | Suggest-only / write draft defs requiring publish / live write to staff prefs / live write to org defs |
| **D9** | Validation waist for AI output | Zod table-def schema + capability bag + density linter (mandatory name the gates) |
| **D10** | Relationship to Horizon C | This IS C / This precedes C / This is D after A+B / Replace C |
| **D11** | Unbox golden | Freeze as visual reference only / Promote Unbox layout as default template for receiving-like entities / Clone Unbox columns onto non-receiving entities (usually wrong) |
| **D12** | Orders fat view | Thin to A1 binding first / Special-case forever / Rewrite last |
| **D13** | Prefs identity | Keep `TableId` buckets / Map 1:1 to definition id / Org definition + staff delta overlay |
| **D14** | Success metric | “Pages import no GridView” / “≤N lines per binding” / “New queue ships without new GridView file” / all three (name thresholds) |

---

## 8. Research questions (answer with citations)

### 8.1 Industry — engine vs definition vs page

How do Retool / Linear / Stripe / Salesforce List Views / Dynamics separate **shell**, **column definition**, and **page**? What breaks when those collapse? What is the thinnest successful “mount by id” API in production systems?

### 8.2 Warehouse density & default columns

What evidence exists for **default visible column counts** on warehouse / MES / dispatch boards? How do products prevent AI or admins from creating unreadable wide sheets? Any published density heuristics for 1080p ops monitors?

### 8.3 AI authoring of schemas / views

Where has “AI suggests columns / views” shipped in 2024–2026? What is **safe** (suggest, draft, require publish) vs unsafe (direct prod mutation)? How do products validate AI output against a typed schema?

### 8.4 Polymorphism boundaries

Distinguish carefully:

1. DB polymorphic hubs (`entity_type`/`entity_id`) — Cycle Forge DDL law  
2. UI polymorphic **shell** (one engine, many defs)  
3. UI polymorphic **row** (one component renders any entity)  

Which of (2)/(3) do mature ops products actually ship? Where does (3) become an unmaintainable mega-row?

### 8.5 Migration strategy

When companies move from N forked tables to one engine, what wave order works? Big-bang delete vs strangler fig? What is the failure mode of “delete most code and start over” in a dogfood-critical warehouse product?

### 8.6 Conflict with prior Cycle Forge research

Prior briefs claimed the **engine is already converged** and inconsistency lives in vocabulary/chrome. Does the owner thesis **contradict** that, **refine** it (delete adapters, not the engine), or **overturn** it? Be explicit.

---

## 9. Deliverable shape (mandatory sections)

1. **Executive ruling** (≤12 lines) — accept/reject owner thesis per C1/C2/C3; pick D2 candidate.
2. **Industry survey** with named systems + citations (2024–2026).
3. **Scored candidates table** (§0.3 + §6) + cut line.
4. **Forced rulings D1–D14** — one pick each + 1–3 sentence defense.
5. **Target architecture diagram** (engine · definition registry · page binding · AI authoring · backend feed) using Cycle Forge names (`LedgerGridSurface`, `TableId`, capabilities, Studio/Canvas).
6. **What to delete vs keep** — concrete lists mapped to §4 paths (categories OK if exhaustive).
7. **Phased plan P0–P4** paste-ready for an implementing agent (no invented paths beyond §4).
8. **SoT update sketch** — what one-liners land in `AGENTS.md` / `source-of-truth.md` / `pattern-evolution.md` if this ships (text proposals only).
9. **Risks & dogfood rollback** — how a warehouse keeps shipping if wave N fails.
10. **≤40-line Claude Code / Cursor P0 prompt** that starts the first deletion/thinning wave without re-opening this research.

---

## 10. Paste prompt (give Gemini this entire file)

```
Read nonlinear-data-table-engine-GEMINI-RESEARCH-BRIEFING.md end-to-end.

You do not have the codebase. Use ONLY facts embedded in the brief.

Deliver the §9 sections in order.
Force D1–D14 (§7) — one pick each, no "it depends."
Score A0–A5 (§6) with the §0.3 formula.
Reconcile with house laws (§1). Where industry conflicts, pick a side for Cycle Forge and defend it.
Do not invent file paths not listed in §4.
Do not recommend foreign UI grids or schema-per-tenant.
Distinguish DB polymorphic hubs from UI polymorphic engine (C2).
Label speculation as "my reasoning:".
```

---

## 11. Implementation notes for the human / later agent (not for Gemini)

- Land Gemini’s report as `docs/todo/nonlinear-data-table-engine-PLAN.md`.
- Cross-link from `ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md` (Horizon relationship).
- If D2 = A1/A2, prefer strangler: thin `OrdersGridView` / delete pure wrappers **before** any runtime JSON registry.
- Never start AI live-writes (D8) before Zod density + capability validation exists (D9).
- Golden dogfood gate: Unbox History must not regress; Testing must keep mounting the receiving-family definition via `tableId` overlay.
- `npm run verify` + sheet/capabilities guards remain the definition of done; ratchets only shrink.
- Portfolio: after landing, `pnpm portfolio:sot` to register this DOC.

---

## Appendix A — Golden path today (reference)

```text
Unbox workbench / History
  → ReceivingLinesTable          (host: feed, selection, chrome, drill switch)
    → ReceivingGridView          (adapter)
      → LedgerGridSurface surface="sheet" tableId="receiving"
        → ReceivingGridColumnHeader → LedgerGridColumnHeader
        → ReceivingGridRow / cells/* → grid-cells atoms
```

Target nonlinear path (hypothesis — Gemini must confirm or rewrite):

```text
Page host (feed + intents + chrome slots only)
  → mountOpsTable({ definitionId: 'receiving.browse', tableId, rows, intents })
      → LedgerGridSurface (engine)
        → registry columns + family cell map
```

## Appendix B — Capability bag (do not forget in AI defs)

```ts
// Conceptual — from grid-surface-descriptor.ts
type GridSurfaceCapabilities = {
  rowTriageFlags: boolean;
  multiSelect: boolean;
  inCellEdit: boolean;
  fieldsMenu: boolean;
  dayBands: boolean;
};
```

Catalog/Receiving/Incoming/Repair/Pickup keep `rowTriageFlags: false` today. Only Orders may paint staff triage wash. AI must not “normalize” that away.

## Appendix C — Pattern-evolution warning

From house law: **knip cannot see a fork whose doors are both imported.** Dual Fields entry points shipped for months. Any nonlinear migration must ship **guards** that assert: pages do not import retired GridViews; only `mountOpsTable` (or successor) mounts `LedgerGridSurface` outside the engine package + allowlisted hosts.
