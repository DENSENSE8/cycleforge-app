# Seller Table Program — plan of record

**Drafted** 2026-08-31 · **Source** the `Seller Table Program` execution artifact,
converted verbatim in substance · **Repo prompt**
[`docs/todo/enterprise-data-table-EXECUTION-PROMPT.md`](enterprise-data-table-EXECUTION-PROMPT.md) ·
**Kill SoT** [`docs/kill-list/07-slot-table-hand-models.md`](../kill-list/07-slot-table-hand-models.md)

Seven phases that take the desk from a good shared grid to the instrument an eBay
and Amazon seller runs their day on: one display across every family, every
marketplace fact bindable, actions at the foot of the table, import and export as
peers in the header, and a row that opens into the whole order without leaving it.

---

## 00 · The standard

Every phase is judged against these six. They are not aspirations; each was paid
for by a specific bug this table already had.

| Law | What it forbids |
|---|---|
| **One control per job** | Two controls that narrow the same rows is a fork, whatever chrome they wear. Bottom tab strips, a second toolbar band, a desk-local funnel beside the shared one — all fold into the single filter control. |
| **Data, not JSX** | A surface hands the table *values*; the table picks the component. It does **not** forbid the table reaching for a house component itself — that mistake was made twice and corrected both times. |
| **Honest absence** | No fake `0`. No `$0.00` nobody charged. No denominator for a set the operator is not looking at. No empty state where a failed fetch belongs. |
| **Interaction budget** | Primary information in ≤2 interactions, act in ≤3, status overview in ≤1. A fourth click on an existing flow is a regression even when the feature works. |
| **No layout animation** | Nothing tweens a property that reflows. Load-bearing for the row model: an expanding row must **show**, never animate open. |
| **Organization-wide by default** | A table's shape is a property of the table, not of whoever last touched it. Binding, unbinding, reordering — and saved views — write the org document. |

---

## 01 · Rulings already in force

Given in writing across the 2026-08-30 and 08-31 sessions and implemented. Read
them as constraints, not history — they are closed.

| # | Ruling | Where it lives |
|---|---|---|
| 1 | Status labels name what **has happened** — "Packed", never "Packed · Staged" | `orders.ts` |
| 2 | A pending step is icon + dash, blank second line, name screen-reader only | `CompoundStageStep` |
| 3 | An unclaimed step still paints the staff circle | `CompoundStageStep` |
| 4 | **Selection tabs are filters.** No row-narrowing tab strip; dataset-swap modes fold in too | `DataTableFilterMenu` |
| 5 | **No second chrome row** on any desk | `DashboardShippedTable` |
| 6 | Toolbar: search · filter · calendar — gap — export · columns · zoom · fullscreen, flush right | `DataTable` |
| 7 | Layout edits are **organization-wide** | `useSlotTableLayout` |
| 8 | Under the title: qty · condition · item # · notes, notes right-pinned as a glyph | `ORDERS_PRODUCT_LAYOUT` |
| 9 | Item number is a copy chip — copy-only, one click, no icon | `CompoundItem` |
| 10 | Quantity reserves two digits so 10–99 shifts nothing | `orders-resolve.ts` |
| 11 | White ground, no table border, a floor under the card, a visible scrollbar, shift+wheel scrolls sideways | `desk-stage` · `LedgerGrid` |
| 12 | Header ink is black; the image column names itself; headers drag to reorder and resize | `LedgerGridColumnHeader` |
| 13 | One popover primitive for every toolbar control | `radix-popover` |
| 14 | The export carries the lifecycle story — name and time per step, status, amount | `order-export-csv.ts` |
| 15 | The ⋮ row menu is gone from Orders; per-row work belongs to the record | `dashboard-order-row-layout` |
| 16 | **Selection actions live at the BOTTOM of the table**, as real buttons | phase 2 |
| 17 | **Double-click opens the order as a form inside the table** | phase 2 |
| 18 | **Export is a main feature button in the page header, left of the CTA** | phase 3 |
| 19 | **Import is a peer of export**, with **inline column mapping** | phase 5 |
| 20 | **Hovering a row's right edge reveals what needs doing next** | phase 2 |
| 21 | **The table is fully operable from the keyboard** | §12 |

---

## 02 · Phase graph

Seven phases. Families gates every phase that is built at the engine seam;
the row model runs in parallel because it touches the shell, not the catalogs.

```mermaid
flowchart TD
    subgraph GATE["Engine seam — must land first"]
        P1["<b>Phase 1 · Families</b><br/>16 hand arrays → catalogs<br/><i>gates everything at the seam</i>"]
    end

    subgraph PARALLEL["Shell — runs in parallel"]
        P2["<b>Phase 2 · Row model</b><br/>gesture table · bottom bar<br/>inline form · right-edge action"]
    end

    P3["<b>Phase 3 · Header cluster</b><br/>Views · Import · Export · CTA"]
    P4["<b>Phase 4 · Configurable export</b><br/>three tiers · one serializer"]
    P5["<b>Phase 5 · Import + mapping</b><br/>inline mapping · named profiles"]
    P6["<b>Phase 6 · Seller field catalog</b><br/>every marketplace fact bindable"]
    P7["<b>Phase 7 · Saved views + write paths</b><br/>versioned payload · price write"]

    P1 --> P3
    P1 --> P4
    P1 --> P6
    P2 --> P3
    P3 --> P4
    P3 --> P5
    P4 -.->|"field registry<br/>is shared"| P5
    P6 --> P4
    P1 --> P7
    P4 -.->|"export fields ride<br/>the view payload"| P7
    P2 --> P7

    K["<b>§12 Keyboard registry</b><br/>every phase owes it a map"]
    K -.-> P1
    K -.-> P2
    K -.-> P3
    K -.-> P4
    K -.-> P5
    K -.-> P7

    classDef gate fill:#E4F1F1,stroke:#0E6A70,stroke-width:2px,color:#0A4F54
    classDef shell fill:#F7EEDE,stroke:#9A6614,color:#5B4310
    classDef norm fill:#FFFFFF,stroke:#5B6572,color:#12161C
    classDef cross fill:#E6EFE8,stroke:#3A6544,color:#24402B
    class P1 gate
    class P2 shell
    class P3,P4,P5,P6,P7 norm
    class K cross
```

### Why the families come first

* Every capability below is built at the **engine seam**. Built while sixteen
  families still mount hand-written column arrays, each one becomes an *Orders
  feature* the next family has to be retrofitted into.
* The column picker flag is **a lie on most surfaces today** — only Orders
  supplies fields. Shipping a fields-driven export while that holds means the
  export and the picker disagree on fifteen desks.
* A hand array is a **frozen layout**: it cannot be captured for an organization
  and cannot share the skeleton. Saved views over frozen layouts save nothing.
* The ports are cheap now. Orders and Pickup proved the seam across **both
  morphs**; adoption is a catalog, a product layout and a registry entry.

**The counter-argument, honestly:** sixteen ports is real work with no visible
seller value, and the kill list itself says a big bang is a non-goal. So do not
big-bang — order them by what they de-risk.

---

## 03 · Phase 1 — Finish the displays  `16 families`

Per family: a catalog, a pure resolver, a registry entry, the materializer in
place of the array — then delete the array and ledger it.

### The engine, as it stands

```mermaid
flowchart LR
    subgraph SOURCES["Layout cascade — resolveEffectiveLayout"]
        SV["savedViewLayout<br/><i>declared, passed by<br/>no caller — phase 7</i>"]
        SL["staffLayout<br/>staff_preferences<br/>.tableLayouts[id]"]
        OL["orgLayout<br/>organizations.settings<br/>.tableLayouts[id]"]
        PD["productLayout<br/><i>*_PRODUCT_LAYOUT</i>"]
    end

    CAT["FieldCatalog<br/><i>*_FIELD_CATALOG</i><br/>the bindable vocabulary"]

    SV -.->|"dead param"| RES
    SL --> RES
    OL --> RES
    PD --> RES
    CAT --> RES

    RES["resolveEffectiveLayout<br/><i>drops stale bindings</i>"]
    RES --> EFF["SlotLayout<br/>morph · identityFieldId<br/>statusBindings[≤10]<br/>subtitleBindings[≤5]<br/>amountFieldId"]

    EFF --> MAT["materializeTracks<br/><i>keys are slot INDICES</i>"]
    BASE["family base skeleton<br/><i>select · title · …</i>"] --> MAT
    CAT --> MAT

    MAT --> COLS["mounted columns<br/>status:1…N · subtitle:1…N"]
    COLS --> DT["DataTable → LedgerGrid"]

    ROW["family row renderer"] --> DT
    RESV["*-resolve.ts<br/>row + fieldId → value<br/><i>pure, one case per field</i>"] --> ROW

    WRITE["PUT /api/tables/layouts"] -->|"parseSlotLayout<br/>+ slotMorphsFor gate"| OL
    REG["SLOT_LAYOUT_TABLES<br/><i>org-table-layouts.ts</i>"] --> WRITE

    classDef live fill:#E6EFE8,stroke:#3A6544,color:#24402B
    classDef dead fill:#F4F5F7,stroke:#8B94A1,stroke-dasharray:4 3,color:#5B6572
    classDef core fill:#E4F1F1,stroke:#0E6A70,stroke-width:2px,color:#0A4F54
    class SV dead
    class RES,MAT,EFF core
    class SL,OL,PD,CAT,COLS,DT,ROW,RESV,BASE,WRITE,REG live
```

### The per-family port recipe

Six files, in this order. Orders and Pickup are the two worked examples; Pickup
is the sheet morph, Orders the compound.

```mermaid
flowchart TD
    S1["<b>1 · Catalog</b><br/>src/lib/tables/field-catalog/&lt;fam&gt;.ts<br/>FieldDef[] + *_PRODUCT_LAYOUT + *_TABLE_LAYOUT_ID<br/><i>LEAF module — no client imports</i>"]
    S2["<b>2 · Resolver</b><br/>&lt;fam&gt;-resolve.ts<br/>(row, fieldId) → CompoundSlotValue | null<br/><i>pure; one switch case per field</i>"]
    S3["<b>3 · Registry</b><br/>SLOT_LAYOUT_TABLES[id] = { catalog, morphs }<br/><i>absent id = 404 at the API, never a silent blob</i>"]
    S4["<b>4 · Materialized model</b><br/>&lt;fam&gt;-grid-layout.ts<br/>BASE skeleton + &lt;fam&gt;SheetColumnsFor(layout)<br/><i>delete the hand array here</i>"]
    S5["<b>5 · Layout hook</b><br/>use&lt;Fam&gt;TableLayout.ts<br/><i>a CONFIG on useSlotTableLayout, never a fork</i>"]
    S6["<b>6 · Mount + row</b><br/>columns={…} fields={fields} on DataTable<br/>row renders isSlotTrackKey tracks by fieldId"]

    S1 --> S2 --> S3 --> S4 --> S5 --> S6

    S6 --> D1["<b>Delete + ledger</b><br/>TABLE_COLUMNS.&lt;id&gt; → []<br/>retired-symbols.test.ts entry<br/>fieldsMenu: true now honest"]
    D1 --> V["<b>Verify</b><br/>catalog test parses the product layout<br/>materialization reproduces pre-port scan order<br/>npm run verify"]

    classDef step fill:#FFFFFF,stroke:#0E6A70,color:#12161C
    classDef kill fill:#F7EEDE,stroke:#9A6614,color:#5B4310
    classDef ver fill:#E6EFE8,stroke:#3A6544,color:#24402B
    class S1,S2,S3,S4,S5,S6 step
    class D1 kill
    class V ver
```

### Rules for the port

* **Reproduce, then improve.** The port lands with the same columns in the same
  order. Any change ships as its own commit with a reason.
* **The picker flag becomes true only when the catalog exists.** Flipping it
  earlier is the lie this phase ends.
* **Two table ids, one cell map.** A second prefs bucket is not a second engine.
* Watch the budgets — ten status slots, five subtitle slots. The catalog is the
  menu; the product layout is the default plate.

### Wave order — by what it de-risks, never by size

```mermaid
flowchart LR
    W1["<b>1.1 Ready</b><br/>1 family<br/><i>mounts a literal</i> tested <i>track —<br/>the forbidden pattern, live</i>"]
    W2["<b>1.2 Amazon Prep</b><br/>1 family<br/><i>catalog + layout survived the<br/>teardown; only the mount is missing.<br/>Fixes the registry lie.</i>"]
    W3["<b>1.3 Compound families</b><br/>receiving · incoming · daily · tasks<br/>catalog-link · import-exception<br/><i>already share the compound row —<br/>each port is catalog-only</i>"]
    W4["<b>1.4 Sheet families</b><br/>units · catalog · unfound · repair<br/>tech-all · tracking-exceptions · bins<br/>warranty · my-day · orders-import"]
    W5["<b>1.5 The three missing guards</b><br/>definition→columns drift check<br/>registry coverage assertion<br/>desk-peek surface law"]

    W1 --> W2 --> W3 --> W4 --> W5

    classDef first fill:#E4F1F1,stroke:#0E6A70,stroke-width:2px,color:#0A4F54
    classDef norm fill:#FFFFFF,stroke:#5B6572,color:#12161C
    classDef guard fill:#E6EFE8,stroke:#3A6544,color:#24402B
    class W1 first
    class W2,W3,W4 norm
    class W5 guard
```

> **A live bug fixed on the way in.** ~~The `fba` table id is still registered in
> `SLOT_LAYOUT_TABLES`, so `/api/tables/layouts` accepts and stores organization
> column layouts for a table that renders nothing.~~ **Resolved 2026-08-31** by
> operator ruling: **unregistered**. Opt-in is per-MOUNT, not per-catalog. The
> catalog file survives; re-adding one registry line is the last step of the
> board rebuild, which remains open.

**Done when:** every hand array is deleted and ledgered; a test proves the layout
parses and the materialization reproduces the pre-port scan order; the picker
flag is true only where a catalog exists.

---

## 04 · Phase 2 — The row model  `new`

Two rulings, one coherent model — and the right rail stops being the answer for
either. Build the gesture table **first** and make the code match it.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Browsing

    Browsing --> Browsing: j / k / ↑ / ↓ — move the record cursor
    Browsing --> Selected: click · Space · x — toggle selection
    Selected --> Selected: shift+click · Shift+↑↓ — extend from the anchor
    Selected --> Browsing: Esc — clear the selection
    Selected --> Acting: bottom bar registers at ONE row

    Acting --> Selected: verb runs (undo or confirm)

    Browsing --> FormOpen: double-click · Enter · o · the visible hint
    Selected --> FormOpen: double-click · Enter · o
    FormOpen --> Browsing: Esc — focus returns to the row
    FormOpen --> FormOpen: edit price · item # · condition · notes

    Browsing --> Overflow: right-click · Shift+F10 · Menu · .
    Overflow --> Browsing: Esc

    note right of FormOpen
        URL is the state — the existing
        open-order param. It SHOWS;
        it never animates open.
        One row open at a time.
        Fixed-height panel so the
        virtualizer's scroll math stays exact.
    end note

    note right of Acting
        Bottom bar, not the right rail.
        Full-bleed, zero-padding,
        full-height buttons — the hit
        target IS the column.
        Overflow is a "More" popover,
        never a scroll.
    end note
```

### The gesture table, written down

> **Landed 2026-09-01.** The table below is no longer prose: it is declared in
> `src/lib/tables/row-gestures.ts` and bound by `useRowGestures`, and
> `row-gestures.test.ts` enforces the law — *every verb the pointer can reach,
> the keyboard can reach* — as an assertion rather than a heading.

| Gesture | Keyboard | Does |
|---|---|---|
| Click | `x` · `Space` | Toggle selection |
| Shift+click | `Shift+↑` / `Shift+↓` | Extend from the anchor. ~~plumbed and hardcoded off~~ **fixed** — the checkbox now forwards its click's modifier, and a source guard fails on a literal `shiftKey: false`. |
| Double-click | `Enter` · `o` | Open the record |
| — | `j` / `k` / `↑` / `↓` | Move the record cursor (clamps; never wraps) |
| — | `Home` / `End` | First row · last row |
| Header checkbox | `⌘A` | Select every row in the current view |
| — | `Esc` | Close the form; if none is open, clear the selection |
| Right-click | — | Reserved. No per-row menu without a ruling — recorded by ABSENCE from the table, since an entry would be a binding. |

**One anchor, two input devices.** Shift+click and Shift+↓ resolve through the
same `selection-anchor.extendTo`, so they cannot mean different things. The span
takes the *target* row's new state, which is what makes a range-DESELECT
expressible at all.

**The suppressor is real now.** `table-key-layer.ts` implements the §11
flowchart, and `hasScanTarget()` is the missing predicate it needed: a wedge
scan of `SKU-1129` types eight ordinary keydowns, and on a screen where single
letters run verbs that is ship-by, print, a cursor move, then Enter. Shift is
deliberately **not** treated as protection — a scanner shifts for uppercase.

### Selection becomes the bottom bar

```
── no selection ────────────────────────────────────────────────
[ Must ship 99+ ][ Urgent ]                     200 of 847  ↓
── 12 selected ─────────────────────────────────────────────────
12 selected │ Copy │ Assign │ Ship-by │ Print labels │ Export │ Delete
```

* **Full-bleed, zero-padding, full-height buttons.** Compose the fill-size icon
  button inside the flush terminal footer — the house primitive whose docblock
  already states this law. Do not hand-roll a bar.
* **Verbs come from the existing selection-action list**, unchanged and grouped
  as they already are, with destroy separated by a rule.
* **Available from one row.** The three-row gate goes.
* **The multi-select rail is removed**, not hidden. Put the two-row compare
  plane to the operator before deleting it.
* **Overflow is a menu, not a scroll.**
* **Undo or confirm.** Seven of eight verbs have neither today.
* **Announce it.** The bar switching from counts to verbs is a live-region change.

### The row's right edge — what needs doing next

```
│ … Bose Wave IV        ● TESTED   47d late  │   Pack  ⋮ │  ← on hover / focus
│   1 · USED · 9M52B2C4                      │           │
```

> **Reconcile this with the ⋮ removal before building it.** What was removed was
> a *permanent column* holding a generic menu whose only item duplicated the row
> click. What is asked for now is a **hover-revealed, contextual affordance that
> names this row's next action**. Different thing, and a better one. Say so in
> the docblock or the next agent reverts it.

* **It spends no column** — overlays the row's right edge over structural slack,
  on hover *and* on keyboard focus.
* **It names one next action**, resolved from lifecycle. A row with nothing
  outstanding shows nothing — honest absence.
* **The next action is data.** A family supplies a pure
  `row → { label, run } | null`. No lifecycle branching in a cell.
* **Opacity only.** It fades in; it never shifts the row.

> **Decide what happens to the right pane.** Either the inline form replaces it
> on this desk, or the two coexist with the form as triage and the pane as the
> deep record. Do not ship both silently doing one job.

---

## 05 · Phase 3 — The header cluster  `new`

```
Shipping                    [ Views ▾ ]  [ Import ]  [ Export ]  [ + Add order ]
To ship   Amazon Prep   Shipped
─────────
```

Four controls, which is the working-memory ceiling for a decision point.

| Control | Why it is a main button |
|---|---|
| Views ▾ | The named view is *which table you are looking at*. It frames everything below it. |
| Import | Getting data *in* is a primary job, not a settings action. |
| Export | Getting data *out* is the other half of the same job. |
| + Add order | The existing CTA. Still rightmost — it creates the thing the page is about. |

**What does not earn a button** — this list is the review standard:

* **Print and labels** — verbs that act on *chosen rows*; they belong in the
  bottom bar, not a header that acts on nothing.
* **Refresh** — the desk is realtime-patched. Fix the invalidation instead.
* **Columns, filter, zoom, fullscreen** — already in the toolbar, next to the
  table they change.
* **Search** — already the toolbar's first and widest control.
* **New view** — lives *inside* the views control.

> **The toolbar glyph goes when the header button lands.** Two doors to one panel
> is the same fork as two funnels. Import and export carry equal visual weight.

### The CTA is page-level and top-right, on every desk  `landed 2026-08-31`

The frame already has the channel — `DeskActionSlot`, whose own law reads *"the
CTA is page-level, top-right of the header"* — and desks like To-ship and Unbox
were already registering into it. **Home was not.** Its two tables each docked a
full composer ROW under the grid: a permanent input, an Add button and a border,
on the first screen of a shift, for every operator whether or not they were ever
going to add anything.

Both now register a `+ Add task` CTA into the slot and summon the composer.

* **The control moved, it did not multiply.** One control per job — the CTA is
  the create control, and the composer is the surface it opens, not a second
  button beside it.
* **The fast loop survives.** Once open, the composer behaves exactly as before
  — type, Enter, repeat — so bulk entry costs one extra click in total, not one
  per item. Pressing the CTA with text already typed COMMITS rather than
  re-focusing: the operator has said what they want twice, and asking for a
  third gesture is the interaction-budget regression this program's own standard
  names.
* **A period is never inferred.** On Tasks the CTA commits a *general* task;
  recurring stays a deliberate choice inside the composer.
* Home reclaims that vertical band on the screen an operator opens first —
  which its own frame docblock already argued for when it deleted the mode rail.

---

## 06 · Phase 4 — Configurable export  `start here after families`

> "The export should not just be a blind download. It should be a configurable
> download that will be inline — download default, download what's shown,
> configure more."

Today one button writes every column for every rendered row. It is correct and it
is dumb: it cannot answer *"just the SKUs and quantities for these forty rows"*,
which is exactly what a seller does before a reprice or a restock order.

```mermaid
flowchart TD
    T["Export trigger<br/><i>one glyph · header button · e</i>"]
    T --> P{"Panel — three tiers,<br/>increasing specificity"}

    P --> T1["<b>Tier 1 · default</b><br/>Download this view ⏎<br/><i>ONE CLICK — never gets slower</i>"]
    P --> T2["<b>Tier 2 · scope</b><br/>Download selected (12)<br/><i>only when a selection exists</i>"]
    P --> T3["<b>Tier 3 · configure</b><br/>Columns · Rows · Format<br/>Reset to default"]

    T1 --> SCOPE
    T2 --> SCOPE
    T3 --> SCOPE

    SCOPE["Row scope = the CURRENT narrowing<br/>after search + filter + date range<br/><i>never the unfiltered collection</i>"]
    SCOPE --> EMPTY{"rows > 0 ?"}
    EMPTY -->|no| DIS["control DISABLED<br/><i>not a header-only file</i>"]
    EMPTY -->|yes| SER

    FIELDS["<b>One field registry</b><br/>catalog fields ∪ export-only facts<br/><i>record ids · raw stamps · fee breakdowns</i><br/>persists ORGANIZATION-WIDE"]
    FIELDS --> SER

    SER["<b>One serializer</b><br/>toCsv / toTsv — format is a RADIO,<br/>not a second code path"]
    SER --> FILE["&lt;lane&gt;.csv"]

    X1["4 independent CSV serializers"] -.->|"this phase collapses them"| SER
    X2["ORDER_EXPORT_COLUMNS<br/><i>a hand list, not a projection<br/>of the catalog</i>"] -.->|"reconciling these two<br/>vocabularies IS this phase"| FIELDS

    classDef tier fill:#E4F1F1,stroke:#0E6A70,color:#0A4F54
    classDef warn fill:#F7EEDE,stroke:#9A6614,color:#5B4310
    classDef norm fill:#FFFFFF,stroke:#5B6572,color:#12161C
    class T1,T2,T3 tier
    class X1,X2,DIS warn
    class T,P,SCOPE,EMPTY,FIELDS,SER,FILE norm
```

### Contract

```ts
export interface DataTableExportMenu<Row> {
  /** Column ids offered, in export order. Labels are the operator's words. */
  fields: readonly {
    id: string; label: string; group?: string; default: boolean;
  }[];
  /** Serialize one row for a chosen field set. Pure. */
  toRow: (
    row: Row,
    fieldIds: readonly string[],
  ) => readonly (string | number | null | undefined)[];
  /** Base filename without extension — the lane, e.g. `to-ship`. */
  filename: string;
}
```

> **Unify while you are here.** There are **four independent CSV serializers** and
> eight export paths — and no FBA or catalog export at all. `ORDER_EXPORT_COLUMNS`
> is a hand list rather than a projection of the catalog, so the two vocabularies
> already disagree: the export names `product_title`, `sku`, `status`, `platform`,
> `record_id`, and the catalog names none of them. **Do not add a fifth.**

**Done when:** one serializer and one field registry across toolbar, rail and
packed; the default tier is one click; field choice round-trips org-wide.

---

## 07 · Phase 5 — Import, with inline column mapping  `new`

Export and import are one axis, and only one has ever been designed.

**More exists than you would guess:** a descriptor pipeline, seventeen canonical
fields with the order number the only required one, header auto-mapping, per-row
Ready / Action-required classification, a real staging grid with its own table id
and prefs bucket, and a permission-gated commit.

**What is missing is the mapping step.** Headers are auto-mapped or they are not,
and when they are not the operator edits cells in staging to compensate.

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator
    participant UI as Import surface<br/>(the real table)
    participant Map as Mapping step
    participant Prof as Mapping profiles<br/>(org-wide)
    participant Stage as Staging grid<br/>(orders-import)
    participant API as Commit route

    Op->>UI: drop supplier-oct.csv (412 rows)
    UI->>Map: parse headers
    Map->>Prof: match a saved profile?
    alt profile hit
        Prof-->>Map: "Supplier — October" — full mapping
        Note over Map: next week's file maps itself
    else no profile
        Map->>Map: header auto-map by name
        Note over Map: unmatched → "don't import",<br/>NEVER a nearest match
    end
    Map-->>Op: their column → our field, each marked auto | needs you
    Op->>Map: correct the ambiguous ones (inline, tabbable)
    Map-->>Op: preview rows in the REAL table cells
    Op->>Map: ☐ Remember this mapping as "…"
    Map->>Prof: persist named profile (org-wide)
    Map->>Stage: land rows, per-row Ready / Action-required
    Note over Stage: required fields gate the commit as a<br/>BLOCKING row count, not a toast after the fact
    Op->>API: ⌘Enter — Import 412
    API-->>Op: committed
```

```
Import · supplier-oct.csv · 412 rows

THEIR COLUMN            OUR FIELD
─────────────────────────────────────────────────────
Order #            →    [ Order number      ▾ ]   auto
Item Title         →    [ Item title        ▾ ]   auto
Qty Ordered        →    [ Quantity          ▾ ]   auto
Cust Ref           →    [ — don't import —  ▾ ]   needs you
Ship By            →    [ Ship-by date      ▾ ]   auto
─────────────────────────────────────────────────────
☐ Remember this mapping as "Supplier — October"
```

* **Mapping is inline, in the table** — not a wizard in a modal.
* **Auto-mapped rows are marked as such** and stay editable. Confidence is shown.
* **Unmapped columns default to "don't import"**, never to a nearest match.
* **The preview uses the real table** — same cells, same row model.
* **Mappings persist as named profiles, organization-wide.**
* **Required fields gate the commit**, surfaced as a blocking row count.

**Done when:** a supplier file with foreign headers imports without hand-mapping
twice.

---

## 08 · Phase 6 — Seller field catalog  `open`

The catalog has nine fields. The feed returns far more. Every fact a marketplace
gives us that an operator triages on should be bindable, not hardcoded in a cell.

### Method — do this, do not guess

1. Read the queue projection and the order row type.
2. List every column the feed returns that the catalog does not name.
3. For each, decide its slot: identity, status, subtitle, amount, or export-only.
4. Give it a `displayType` that already has geometry. **Do not invent a display
   type to fit one field** — a genuinely new type is a deliberate addition with
   its own geometry row and a test.

> **Two constraints before you start.** The slot budgets are real — ten status
> slots, five subtitle slots. And there are **three independent order readers**;
> the queue route says so in its own comment: *"a fact added to one does not reach
> the others."* Every new field must land in all three or it silently becomes
> lane-dependent, present on one desk and blank on another, with no error.

```mermaid
flowchart TD
    FEED["Queue projection<br/><i>what the feed already returns</i>"]

    FEED --> BOUND["<b>Bound today — 9 fields</b>"]
    FEED --> UNB["<b>Returned, nothing binds it</b><br/>currency · carrier<br/>tracking-status block<br/>(code · label · category ·<br/>exception flags · last event)<br/>pack location · row flag<br/>note count · urgency · tech-scan<br/><b>catalog_image_url</b><br/><i>the photo the thumbnail track has<br/>been faking this whole time</i>"]
    FEED --> MIG["<b>Migrated, no reader at all</b><br/>parcel dimensions<br/>release-gate columns"]

    ABS["<b>Absent everywhere — ingestion projects,<br/>not binding work</b><br/>fees · cost · margin<br/><i>nearest cost fact lives on the SKU<br/>catalog and is never selected</i><br/>service level<br/><i>does not exist anywhere</i>"]

    UNB --> DECIDE
    MIG --> DECIDE
    ABS -.->|"open question 1 —<br/>in scope at all?"| DECIDE

    DECIDE{"Slot it:<br/>identity · status<br/>subtitle · amount<br/>export-only"}

    DECIDE --> R1["<b>All three readers</b><br/>or it is lane-dependent,<br/>silently"]
    R1 --> R2["resolver case + test"]
    R2 --> R3["bindable without a deploy"]

    CAND["<b>Candidates — accept or refuse in writing</b><br/>Buyer · Destination · Carrier + service<br/>Listing URL / offer id · SKU vs item number<br/>Sale / fees / net · Age + lateness<br/>Bin · Warranty + returns state"]
    CAND --> DECIDE

    classDef have fill:#E6EFE8,stroke:#3A6544,color:#24402B
    classDef gap fill:#F7EEDE,stroke:#9A6614,color:#5B4310
    classDef miss fill:#F4F5F7,stroke:#8B94A1,stroke-dasharray:4 3,color:#5B6572
    class BOUND have
    class UNB,MIG,CAND gap
    class ABS miss
```

> **Platform behaviour stays data.** **No `if (platform === 'ebay')` in a cell.** A
> fact that applies to one marketplace resolves to `null` on the others and paints
> the house blank.
>
> But be honest about how much is data today. The platforms table lets an org
> rename, recolour and hide a marketplace. It carries **no URL template and no
> order-id pattern** — the Amazon and eBay id regexes and the Seller Central /
> eBay / Walmart links are code literals. An org cannot teach the system a new
> marketplace without a deploy. Close that or defer it explicitly.
>
> One eBay specific: the listing handle is written into `item_number`, there is
> **no listing URL on the order**, and "open on marketplace" links the order page,
> never the listing. "Open the listing" is a join, not a field.

**Done when:** each new field resolves in all three readers, has a resolver case
and a test, and is bindable without a deploy.

---

## 09 · Phase 7 — Saved views + write paths

Smaller than it looks. The system exists; the payload is one field and the layout
layer was never connected.

**What exists:** a real saved-view system — a table with organization, staff,
surface, name and a JSONB `filters` blob; twenty-four registered surfaces
including all three order lanes; full CRUD, routes, a hook and a menu. A migration
guard even pins the surface list against the live database constraint.

**What is missing — two different things.** First, the payload is a search string:
the save path writes `{ query }` and nothing else. Second, the layout layer is a
dead parameter:

```ts
const picked = savedViewLayout ?? staffLayout ?? orgLayout ?? productDefault;
//            ^^^^^^^^^^^^^^^ declared, typed, passed by no caller
```

```mermaid
flowchart LR
    subgraph NOW["Today"]
        N1["saved_views.filters<br/>= { query }"]
        N2["savedViewLayout<br/><i>declared · typed ·<br/>passed by no caller</i>"]
        N1 -.->|"nothing else<br/>round-trips"| N3["the screen"]
        N2 -.->|"dead"| N3
    end

    subgraph NEXT["The work"]
        V["<b>versioned bundle</b><br/>{ v: 1, query, layout,<br/>filters, sort, dateRange,<br/>exportFields }"]
        V --> CAP["capture the EFFECTIVE<br/>layout on save"]
        CAP --> THREAD["thread it into<br/>resolveEffectiveLayout"]
        THREAD --> CASC["savedView ?? staff ?? org ?? product<br/><i>the cascade already handles the rest</i>"]
        V --> URL["<b>the view IS the URL</b><br/>applying one writes params<br/>the desk already reads —<br/>a pasted link reproduces the<br/>screen with NO view record"]
    end

    NOW ==>|"filters is untyped JSONB —<br/>nothing in the DB blocks this"| NEXT

    classDef dead fill:#F4F5F7,stroke:#8B94A1,stroke-dasharray:4 3,color:#5B6572
    classDef live fill:#E6EFE8,stroke:#3A6544,color:#24402B
    class N1,N2,N3 dead
    class V,CAP,THREAD,CASC,URL live
```

* Views are **organization-wide**, extending the layout law. The table already
  carries a staff id and a shared flag — decide whether personal views survive.
* **The view is the URL.**
* Views live **in the filter popover's own band**. Not a fourth control, never a
  tab strip.
* Deleting a view must never delete the rows it named.

### Write paths

The record form needs somewhere to write to.

> **Price has no write path at all.** `saleAmount` is absent from the assign
> payload, absent from the route's SQL, and absent from the strict PATCH body
> schema — while the database helper already accepts it. Pick *one* waist and wire
> it end to end with an audit row. Extending the assign route keeps the optimistic
> update and rollback the inline editors depend on.

* Item number editing moves off the chip and onto the record plane.
* Notes already append to the trail and refresh the denormalized column in the
  same transaction. **Do not add a second author of that field.**

**Done when:** a saved view restores layout, filters, sort and date range; the URL
alone reproduces the screen; the payload is versioned. Price edits persist with an
audit row; no field has two authors.

---

## 10 · Quality of life

Not a phase — a standing list. Each is small, each removes a daily irritation.

**Reading**

* **A totals row that follows the narrowing.** A seller triages on money; the
  table paints a column of amounts and never sums it.
* **Filter within a column.** A per-column value picker for tag and person
  columns — narrows *by the column you are looking at*.
* **Secondary sort.** Ship-by, then platform.
* **Operator column pinning.** The frozen prefix is fixed today.

**Working**

* **A keyboard sheet on `?`.**
* **Selection survives a refresh.**
* **Return to the row.** Closing the form lands you back on the row you opened,
  scrolled into view.
* **Undo on bulk writes.** A ten-second undo beats a dialog for reversible verbs.

**Marketplace-specific**

* **Same-buyer grouping.** Two orders from one buyer to one address is a combine
  opportunity and a postage saving.
* **"Why is this late."** The delay tip already computes the reason — make it a
  *bindable fact* so it can be filtered on, not just hovered.
* **Marketplace deadline versus ours.** Amazon and eBay each impose their own
  ship-by; the row shows one date.

---

## 11 · The keyboard  `cross-cutting`

Every verb the pointer can reach, the keyboard can reach.

> **53 files register their own window keydown listener.** That is the finding.
> The ownership *model* is already right; nothing composes it. Every feature adds
> listener 54 with its own copy of the guards, so precedence is decided by mount
> order and no file can answer "what does `x` do right now". **Do not add a 54th.**

```ts
useKeymap(layer, [
  { keys: 'j',     run: cursor.next,   label: 'Next row' },
  { keys: 'x',     run: toggleSelect,  label: 'Select row' },
  { keys: 'mod+c', run: copySelection, label: 'Copy details', when: hasSelection },
]);
```

```mermaid
flowchart TD
    KEY(["keydown"])
    KEY --> S1{"typing target<br/>has focus?"}
    S1 -->|yes| DROP1["yield — reuse the existing<br/>editable-target guard,<br/>never re-implement it"]
    S1 -->|no| S2{"scanner armed?"}
    S2 -->|yes| S3{"modifier held?"}
    S3 -->|no| DROP2["single-key verbs INERT<br/><i>a wedge scan of SKU-1129 would<br/>otherwise be ship-by, cursor-up,<br/>digits, then OPEN</i>"]
    S3 -->|yes| L
    S2 -->|no| S4{"does the table<br/>OWN focus?"}
    S4 -->|no| L
    S4 -->|yes| L

    L{"innermost layer wins"}
    L --> L1["<b>overlay</b> — dialog/popover:<br/>everything, incl. Escape<br/><i>yields to nothing</i>"]
    L --> L2["<b>editor</b> — open inline editor:<br/>all text keys, Enter, Escape<br/><i>yields to overlay</i>"]
    L --> L3["<b>form</b> — open record form:<br/>Tab, field keys, Escape<br/><i>yields to overlay, editor</i>"]
    L --> L4["<b>table</b> — rows, selection,<br/>single-key verbs<br/><i>yields to all above</i>"]
    L --> L5["<b>global</b> — palette, help,<br/>go-to sequences<br/><i>yields to all above</i>"]

    L1 --> RUN(["run the binding"])
    L2 --> RUN
    L3 --> RUN
    L4 --> RUN
    L5 --> RUN

    RUN --> ENT{"is it Enter?"}
    ENT -->|yes| NODES["never a destructive verb —<br/>a scanner ends with Enter"]

    classDef sup fill:#F7EEDE,stroke:#9A6614,color:#5B4310
    classDef layer fill:#FFFFFF,stroke:#0E6A70,color:#12161C
    class DROP1,DROP2,NODES sup
    class L1,L2,L3,L4,L5 layer
```

### The map

| Keys | Does |
|---|---|
| j · k · ↑ · ↓ | Move the row cursor |
| g g · G | First row · last row |
| x | Toggle selection on the focused row |
| Shift+↑ / ↓ | Extend the selection |
| ⌘A | Select every row in the current view |
| Enter · o | Open the record form |
| Esc | Close the form, then clear the selection |
| . | Open the row's overflow (alias of Shift+F10) |
| / | Focus the find field |
| f · d · c · v · e · i · z · F | Filter · date · columns · views · export · import · zoom · fullscreen |
| ⌘C | Copy details — the natural key, which is *why* copy is not `c` |
| a · s · p · ! | Assign · ship-by · print · flag |
| ⌫ | Delete (confirms) |
| ⌘K · ? · g t/p/s | Palette · keyboard sheet · desk tabs |

### Discoverability — Linear's real lesson

The shortcuts are not the hard part; knowing they exist is.

* **`?` opens a keyboard sheet** scoped to the current layer.
* **Every menu prints its own shortcut.** Highest-leverage move by a distance:
  nobody reads a help sheet, everybody reads the menu they already opened.
* The row-edge next action shows its key when it appears on focus.

### Accessibility obligations

* **WCAG 2.1 SC 2.1.4** requires single-character shortcuts to be remappable,
  switchable off, or **active only on focus**. The focus-ownership rule is what
  satisfies it — say so in the docblock so nobody "simplifies" it away.
* **Focus is always visible.**
* **Announce what the keyboard changed.**
* **The row window is one tab stop** with a roving index, not two hundred.
* **Escape has exactly one meaning at a time** — the innermost layer's.

### Per-phase obligations

| Phase | Owes |
|---|---|
| Families | The registry lives at the engine seam so every ported family inherits one map. **No family-local listener** — porting means deleting its listener, not moving it. |
| Row model | The gesture table gains a keyboard column. Shift-click's fix and Shift+arrow selection are the same anchor logic — write it once. |
| Header | `v` / `i` / `e` open Views / Import / Export; each trigger shows its key in its tooltip. |
| Export | `e` opens; Enter runs the default tier; Escape closes without downloading. |
| Import | Tab between mapping columns, type-ahead in each select, ⌘Enter commits. |
| Views | `v` opens, arrows walk, Enter applies — and it announces. |
| Writes | Every inline editor: Enter commits, Escape restores, Tab commits and moves on. |

> **Done means this passes, mouse unplugged.** Find the must-ship orders, select
> four, print their labels, open one, edit its condition, close it, export the
> view. Plus: `?` lists every binding live in the current layer and each also
> appears in the menu holding the same verb; a wedge scan with rows focused writes
> nothing; the row window is one tab stop; and no file outside the registry
> registers a keydown listener for the table.

---

## 12 · Cross-cutting

**Accessibility** — no live regions anywhere today (filtering, searching,
row-count changes and bulk results are silent); the focus ring is likely under the
3:1 floor on every chrome control (**never "fix" a focus test by removing a
ring**); two hundred row tab stops and no skip link; explanatory tooltips are
hover-only; the form is a named region.

**Performance** — Lighthouse ≥ 92 on every route is standing law and LCP is the
whole gap. The record form must not join the first paint. The virtualizer is why
1,189 rows are usable; nothing here may render every row to satisfy an export or a
form. Payload budgets ratchet down, never up. Assert seeds reach the first HTML
with rows.

**States** — every surface owes four settled states, and the fourth is the one
that gets dropped: **loading → absence → no-match → degraded.** A queue painting
"your warehouse is clear" on a failed fetch is the bug the degraded state exists
to prevent. The record form owes the same four.

---

## 13 · Risks

| Risk | How it bites | Mitigation |
|---|---|---|
| Sixteen ports as one big bang | A broken shared skeleton takes every desk down at once | Port in the stated order, verify per family, never batch |
| Form height vs. virtualizer | Scroll math drifts; the scrollbar lies | Fixed-height panel; measure only if forced |
| Bottom bar vs. tabs | The bar still hosts tabs on some surfaces | Largely resolved in flight — a peer session retired the tab half. Confirm before building on the bar. |
| Row-edge affordance reads as a reversal | The next agent reverts it as "the ⋮ we removed" | It spends no column and names a contextual verb — say so in the docblock |
| Header cluster creep | Every feature wants to be a main button | The "what does not earn one" list is the review standard |
| Three order readers | A field appears on one desk and not another, silently | Add to all three in one commit; test one row per reader |
| Concurrent sessions | A red gate is often someone else's in-flight file | Check the diff before repairing anything you did not write |
| Silent seeds | A seed returning nothing renders as an empty warehouse | Assert seeds reach the first HTML with rows |

> **Known blocker at time of writing.** A peer session repointed the To-ship
> server-side seed to a different scope; it seeds zero rows, the client hydrates
> that and never refetches, and the desk renders the first-run empty state.
> Confirm this is resolved before trusting any visual check.

---

## 14 · Invariants

`npm run verify` before done — lint, typecheck, unit is the whole gate.

| Guard | Asserts |
|---|---|
| `retired-symbols` | 30+ retired symbols stay at zero live references. Shrink-only. Add every kill. |
| `color-neutrals` | Raw neutral utilities stay at zero — theme tokens only. |
| `focus-ring-tokens` | Hand-rolled focus recipes may only shrink. **Never "fix" this by deleting a focus ring.** |
| `surface-box-tokens` | Hand-rolled card shells may only shrink — compose the panel primitive. |
| `slot-layout` | The write gate: unknown fields, wrong slot kinds, non-id identity, over-budget bands, duplicates. |
| `resolve-effective-layout` | Cascade precedence and soft-drop of stale bindings. |
| `materialize-tracks` | Band insertion after anchors, sheet versus compound, collision throw. |
| `saved-views/surfaces` | The surface list equals the live database constraint — **relevant to phase 7**. |
| `route-permission-manifest` | Every route's gate matches the committed manifest. |
| `order-export-csv` | Columns, quoting, stamp format, filename — **phase 4 rewrites this**. |

### Three guards named in live docblocks did not exist  `resolved 2026-08-31`

A repo-wide search returned **zero** `*.guard.test.ts` files. Three were cited as
house law and enforced nothing: the definition-to-columns **drift check**, the
registry **coverage assertion**, and the desk-peek surface law. The bindings file
documented, at length, the exact regression the first two exist to prevent — two
surfaces silently escaping the drift check for their entire life. **Phase 1
registered sixteen bindings into that seam**, which is why wave 1.5 closed it.

All three are written and green across every registered surface:

| Guard | Enforces |
|---|---|
| `table-definition-registry.guard.test.ts` | `binding.columns` and `definition.columns` are the same keys in the same order, and agree on width and frozen-ness — derived from `REGISTERED_BINDINGS`, because a hand-typed list is exactly what failed last time. |
| `table-record-plane.guard.test.ts` | The registry and the array name the same set, hold the same definition OBJECTS (identity, not deep equality — a rebuilt definition would pass a shape check and still be a second declaration), carry unique tableIds, and every non-`inspector` record plane states a real reason. A type can require the field; only a test can require it to say something. |
| `band3-find-only.guard.test.ts` | The desk-peek law in BOTH directions: a ruled surface may not grow a peek, and — the direction that matters more — a surface not on the list may not quietly become `kind: 'none'`. |

One correction fell out of writing them: the desk-peek docblock said "three"
honest-absence surfaces and there are two. The guard is the authority now, which
is the argument for putting a list in code rather than in a sentence.

### A guard that compares a thing to itself  `resolved 2026-08-31`

The definition↔columns drift check passed for all six compound families while
every one of their desks painted a different model — because `binding.columns`
and `definition.columns` were the *same reference*. An assertion whose two sides
cannot disagree is not a check; it is a comment with a test runner attached.

The guard now also asserts that a slot-opted **compound** family declares
compound tracks, which is checkable without family knowledge because the
skeleton is one shared declaration. It was verified RED against the pre-fix tree
before being kept.

### Two lessons that cost real bugs

> **Never build a Tailwind class with a template literal.** The scanner reads
> source text, so `w-[var(${VAR})]` generates nothing and the class ships with no
> rule behind it. This removed the grid's entire horizontal scroll — and the unit
> test passed the whole time, because it asserted the class *string*.

> **A test that pins a literal is not a test of the invariant.** A padding value,
> a track width, a class name — each of these failed on a legitimate change and
> passed through a real bug. Assert the behaviour or the shape, never the value.

---

## 15 · Open questions

Do not guess these. Ask, then record the answer in the repo prompt.

1. **Margin.** Half-answered by the code: there are no fees, no cost and no margin
   on the order row, and the only cost fact in the schema lives on the SKU catalog
   and is never read. So this is an ingestion project, not a display change. Is it
   in scope at all — and if so, does cost come from the catalog or from
   marketplace settlement?
2. **Buyer data.** How much customer identity belongs on a warehouse desk that
   packers can see?
3. **Per-marketplace views.** Different default layouts for eBay and Amazon, or
   one layout with marketplace facts blank where they do not apply? Related: an
   org currently *cannot add a marketplace* without a deploy. Is closing that in
   scope?
4. **View ownership.** The organization layout write is gated on
   feature-management permission, so today only a manager can change columns.
   Should saved views inherit that gate — and do *personal* views survive at all?
5. **Export destinations.** Is a file download the end state, or is the real ask a
   scheduled push to a sheet or a supplier?
6. **The right pane's future.** With the record form inline and the actions at the
   foot of the table, what is the right rail still for — and does the two-row
   compare plane survive?

---

## 16 · Execution ledger

| Wave | Landed | Notes |
|---|---|---|
| 1.1 Ready | **2026-08-31** | `READY_FIELD_CATALOG` (7 facts) + `READY_PRODUCT_LAYOUT` (sheet) + `ready-resolve.ts` + registry entry + `readySheetColumnsFor` + `useReadyTableLayout`; `READY_GRID_COLUMNS` deleted with the last live `{ key: 'tested' }` track in `src/`; `TABLE_COLUMNS.ready` emptied; 4 symbols ledgered; 12 new unit tests. Detail: [kill-list 07 § Wave 3a](../kill-list/07-slot-table-hand-models.md). |
| 1.2 Amazon Prep | **2026-08-31** (partial) | Operator ruling: **unregister, do not rebuild yet.** `fba` dropped from `SLOT_LAYOUT_TABLES`, so `/api/tables/layouts` 404s instead of storing an org layout for a table that renders nothing; `field-catalog/fba.ts` kept intact so the rebuild is one line. A regression test now pins `slotCatalogFor('fba') === null` with the reason. **The board display rebuild itself is still open.** |
| 1.3 Compound families | **in progress** | **receiving (compound mount) landed 2026-08-31** — `RECEIVING_FIELD_CATALOG` (8 facts) + compound `RECEIVING_PRODUCT_LAYOUT` with an empty band (byte-for-byte parity), `receivingCompoundColumnsFor`, `useReceivingTableLayout`, a `fields` passthrough on `ReceivingGridHost`, slot values into the shared `CompoundRowView`; 12 new unit tests. Two facts refused in writing (activity stamp, Zoho chip). **Receiving's FLAT mount (`/test` history) is a separate port** — it needs its own layout id. **incoming landed 2026-08-31** — `INCOMING_FIELD_CATALOG` (7 facts) + compound product layout with an empty band, `incomingCompoundColumnsFor`, `useIncomingTableLayout`, both mounts wired; 13 new unit tests. The resolver is deliberately NOT shared with receiving: one row, two questions (`delivery_state` vs `workflow_status`), routed by `linePhase`. Refused in writing: age, Zoho chip. **daily landed** — 4 facts, `dailyCompoundColumnsFor`, `useDailyTableLayout`, both render paths collapsed onto one `dailyRowView` helper; 10 tests. **tasks landed** — 6 facts, its own vocabulary (a staffer's list vs the org's roster-backed checklist); 13 tests; refuses a lateness fact because the surface's shared `nowMs` owns it. **catalog-link landed** — 6 facts; 11 tests; refuses `status` (every row in the queue is unlinked by definition). **import-exception landed** — 7 facts; 13 tests; same `status` refusal. **Wave 1.3 is complete**: six compound families, all with empty default bands (byte-for-byte parity) and honest Fields menus; the slot engine now serves ten tables. Their FLAT models survive as unmounted definition defaults — a separate sweep. |
| 1.4 Sheet families | **2026-08-31** | All ten landed: **units** (5 facts) · **bins** (7; the flag composite never sorts, and that rule rides the fact) · **warranty** (7; ticket CONTROL structural, linked-ticket FACT bindable) · **catalog** (9; the four roll-ups, cost and category unbound, and a zero roll-up paints blank) · **tech-all** (4; urgency is a RANK, so it opens ASCENDING against the house number default) · **unfound** (6; an interactive fact binds, the Push control does not; the queue ascends on every track so the oldest uncleared row surfaces) · **repair** (8; sort stays the `?sort=` URL vocabulary and a mounted track maps ONTO a word, never mints one — bookmarks keep their meaning) · **my-day** (6; `fieldsMenu: true` was "leftover lip copy" and is now honest) · **tracking-exceptions** (10) · **orders-import** (6; the triage status is structural, resolvers do not coerce — `02` stays `02`). Each: catalog + resolver + registry + `*SheetColumnsFor` + `use*TableLayout`, cells switched onto the bound field id, `TABLE_COLUMNS` bucket emptied, symbols ledgered. **One geometry change, with its reason:** staging's sole `1fr` moved off the `customer` FACT onto a trailing `_fill`, the house law every other family follows. |
| 1.5 Missing guards | **2026-08-31** | All three written, and each one now passes across every registered surface. **`table-definition-registry.guard.test.ts`** — the definition↔columns DRIFT CHECK, derived from `REGISTERED_BINDINGS` (a hand-typed list is what failed last time); it pins keys-in-order, width and frozen-ness for all 19 bindings. **`table-record-plane.guard.test.ts`** — the COVERAGE ASSERTION (registry ↔ array, same set, same objects by identity, unique tableIds) plus "every row says what it opens": a non-`inspector` arm must carry a reason of real substance, because a type can require the field but only a test can require it to say something. **`band3-find-only.guard.test.ts`** — the desk-peek surface law, enforced in BOTH directions: a ruled surface may not grow a peek, and — the direction that matters more — a surface not on the list may not quietly become `kind: 'none'`. Its prose count was stale (two, not three); the guard is now the authority. The three citing docblocks were corrected to say the guards exist. |
| 1.3 (reopened) | **2026-08-31** | **Audit of the tree, not the ledger, found wave 1.3 half-landed.** All six compound families had their MOUNT on the materialization and their CANONICAL model (`binding.columns` / `definition.columns`) still on the flat hand array — and each derived its `?colsort=` vocabulary from that array, so `useUrlColumnSort` rejected every mounted track key and **clicking a column header did nothing on six desks**. The same bug `queue-display-sort` documents for To-Ship one wave earlier. Fixed: definitions repointed; `TestingHistoryList` passes the flat model EXPLICITLY (a declared second mount, not a silent fallback); a track→fact map per family on the `COMPOUND_TRACK_SORT_KEYS` shape, with four refusals written down; sortability moved onto the bound fact and wired into the daily/tasks descriptors so a header stops offering a sort it cannot perform; `catalog-link` / `import-exception`'s half-patch completed (dead `item` header, `undefined` comparator type); seven prefs buckets emptied — including `receiving`, whose justification cited `useIsColumnHidden`, **which does not exist**. Detail: [kill-list 07 § Wave 3f](../kill-list/07-slot-table-hand-models.md). |
| 1.5 (staging) | **open** | The three guard files exist on disk and pass, but are **untracked** — a git-based audit reads them as missing. This tree is shared by concurrent sessions; nothing has staged them. |
| 2 · gestures/keys | **2026-09-01** | **The gesture half.** `selection-anchor.ts` (the range walk, lifted out of `useTableSelectMode` so the keyboard can reach it — 20 tests) · `row-gestures.ts`, the gesture table as DATA with its keyboard column, guarded by the pointer/keyboard parity law · `table-key-layer.ts`, the §11 suppressor, plus `hasScanTarget()` — the scanner predicate that did not exist · `useRowGestures`, bound to the table REGION and not to `window`, so it is not listener 54 and WCAG 2.1.4 holds by construction · roving tabindex (one tab stop, not 900). **Shift-click now works**: `GridRowCheckbox.onToggle` was `() => void`, swallowing the event, so every caller hard-coded `{ shiftKey: false }` against a range walk that had unit coverage and no reachable caller. A source guard fails on that literal. 52 new tests; `npm run verify` green (7,587 pass). |

---

*Working conditions worth carrying into the next session: this checkout is shared
by several concurrent sessions, so a red gate is often someone else's in-flight
file — check the diff before repairing anything you did not write. Verification is
possible and expected: mint a session and drive the real DOM. The worst bug in
this program was invisible to every test and obvious in one `scrollWidth` reading.*
