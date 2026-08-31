# EXECUTION PROMPT — Enterprise Data Table for Marketplace Sellers

> Paste everything below the line into a fresh session at the repo root
> (`/home/michaelgarisek/Projects/cycleforge-app`).
>
> **Plan SoT:** this file. **Kill SoT:** [`docs/kill-list/07-slot-table-hand-models.md`](../kill-list/07-slot-table-hand-models.md).
> **Law:** [`AGENTS.md`](../../AGENTS.md) + [`CLAUDE.md`](../../CLAUDE.md). If this
> prompt conflicts with AGENTS.md, **AGENTS.md wins**. If it conflicts with an
> operator ruling in §2, **the ruling wins** — those were given in writing.

---

## 1. Mission

Take the table from "a good shared grid" to **the instrument an eBay/Amazon
seller runs their day on**: one display across every family, every marketplace
fact bindable, every view savable and shareable, every export configured in
place, and a row that opens into the whole order without leaving the table.

Done is not a feature list. It is: **an operator finds the exact rows they mean,
shapes the table to show exactly the facts that answer their question, opens one
row and sees everything about it, and takes that set somewhere useful — without
leaving the table and without a developer.**

---

## 2. Operator rulings in force (LAW — do not re-litigate)

Given in writing across the 2026-08-30 → 2026-08-31 sessions and implemented.

| # | Ruling | Where it lives |
|---|---|---|
| 1 | Status labels name what **has happened** ("Packed", never "Packed · Staged") | `orders.ts` `stageLabels` |
| 2 | A pending step is **icon + dash**, blank second line, name `sr-only` | `CompoundStageStep` |
| 3 | An **unclaimed** step still paints the staff circle — the band reads as one column of owners | `CompoundStageStep` |
| 4 | **Selection tabs are filters.** No row-narrowing tab strip; dataset-swap modes fold in too | `DataTableFilterMenu` |
| 5 | **No second chrome row** on any desk | `DashboardShippedTable` |
| 6 | Toolbar: **search · filter · calendar — gap — export · columns · zoom · fullscreen**, flush right | `DataTable` |
| 7 | Layout edits are **organization-wide** | `useSlotTableLayout` |
| 8 | Under the title: **qty · condition · item # · notes**, notes right-pinned as a glyph | `ORDERS_PRODUCT_LAYOUT` |
| 9 | Item number is a **copy chip** — copy-only, one click, no icon, sized with order id and tracking | `CompoundItem` |
| 10 | Quantity reserves **two digits** | `ordersSubtitleParts` |
| 11 | White ground, **no table border**, a floor under the card, a **visible scrollbar**, shift+wheel scrolls sideways | `desk-stage`, `LedgerGrid` |
| 12 | Header ink **black**; the image column names itself; headers **drag to reorder and resize** | `LedgerGridColumnHeader` |
| 13 | **One popover primitive** for every toolbar control | `radix-popover` |
| 14 | The export carries the **lifecycle story** — name + time per step, status, amount | `ORDER_EXPORT_COLUMNS` |
| 15 | The ⋮ row menu is **gone from Orders**; per-row work belongs to the record | `ordersCompoundColumnsFor` |
| 16 | **Selection actions live at the BOTTOM of the table**, as real buttons — not in the right rail | Phase 2 |
| 17 | **Double-click opens the order as a form inside the table**, not a side panel | Phase 2 |
| 18 | **Export is a main feature button in the page header, left of the CTA** — not only a toolbar glyph | Phase 3 |
| 19 | **Import is a peer of export**, and shows **inline column mapping** — their columns to ours | Phase 5 |
| 20 | **Hovering a row's right edge reveals what needs doing next** on that row | Phase 2 |
| 21 | **The table is fully operable from the keyboard** — every pointer verb has a key | §13 |

### The standard

- **One control per job.** Two controls narrowing the same rows is a fork.
- **Data, not JSX.** A surface hands the table *values*; the table picks the
  component. This does **not** forbid the table reaching for a house component
  itself — that mistake was made twice and corrected both times.
- **Honest absence.** No fake `0`, no `$0.00` nobody charged, no denominator for
  a set nobody is looking at, no empty state where a failed fetch belongs.
- **Interaction budget.** Primary information ≤2 interactions; act ≤3; status
  overview ≤1.
- **No layout animation.** Nothing tweens a property that reflows. This is
  load-bearing for Phase 2 — an expanding row must **show**, never animate open.
- **Org-wide by default.** A table's shape belongs to the table.

---

## 3. Sequencing — why the families come first

**Finish the display across every family before building seller features on it.**

The reasoning, because a future reader will want to challenge it:

- Every capability below — configurable export, saved views, the record form,
  the selection bar — is built at the **engine seam** (`DataTable`,
  `useSlotTableLayout`, `LedgerGrid`). Built while sixteen families still mount
  hand arrays, each one becomes an *Orders feature* the next family has to be
  retrofitted into.
- `fieldsMenu: true` is **a lie on most descriptors today** — only Orders passes
  `fields`. Shipping a fields-driven export while that is true means the export
  and the column picker disagree on fifteen surfaces.
- A hand array is a **frozen layout**: it cannot be org-captured and cannot share
  the skeleton. Saved views over frozen layouts save nothing worth sharing.
- The ports are now cheap. Wave 1 (Orders) and Wave 2 (Pickup) proved the seam
  across **both morphs**; adoption is a catalog + a product layout + a registry
  entry.

**The counter-argument, honestly:** sixteen ports is real work with no visible
seller value, and the kill doc itself says a big-bang is a non-goal. So do not
big-bang. Order the ports by what they de-risk:

1. **`ready`** — first, and not for size. It mounts a literal `{ key: 'tested' }`
   track: the forbidden pattern, live, teaching every next agent to copy it.
2. **`fba`** — the catalog and product layout survived the teardown; only the
   mount is missing. Highest value per unit of work, and it is an Amazon surface.
3. **The compound families** — `receiving`, `incoming`, `daily`, `tasks`,
   `catalog-link`, `import-exception`. They already share the compound row, so
   the port is catalog-only and each re-proves the same seam.
4. **The sheet families** — `inventory-units`, `catalog`, `unfound`, `repair`,
   `tech-all`, `tracking-exceptions`, `bins`, `warranty`, `my-day`,
   `orders-import`.

Phase 2 may run **in parallel** with the ports: it touches the shell, not the
catalogs.

---

## 4. Phase 1 — Finish the family displays

For each family, in the order above:

1. Write `src/lib/tables/field-catalog/<family>.ts` — a `FieldCatalog` plus a
   `<FAMILY>_PRODUCT_LAYOUT` that **reproduces today's visible columns**. A port
   is not a redesign; if the default changes, that is a separate operator call.
2. Write `<family>-resolve.ts` — pure `row → CompoundSlotValue`, no hooks, no JSX.
3. Register in `SLOT_LAYOUT_TABLES` with its permitted morphs.
4. Replace the hand array with `materializeTracks` over the family's skeleton.
5. Mount `useSlotTableLayout` as a **config**, never a fork.
6. **Delete** the hand array and add it to `retired-symbols.test.ts`.
7. Add `<family>.test.ts`: the product layout parses against its own catalog, and
   the materialization reproduces the pre-port scan order.

### Rules

- **Reproduce, then improve.** The port lands with the same columns in the same
  order. Any change ships as its own commit with a reason.
- **`fieldsMenu` becomes true only when the catalog exists.** Flipping it earlier
  is the lie this phase ends.
- **Two tableIds, one cell map.** `incoming` / `incoming_embed` are two layouts,
  not two engines.
- Watch the budgets: `MAX_STATUS_SLOTS = 10`, `MAX_SUBTITLE_SLOTS = 5`. The
  catalog is the menu; the product layout is the default plate.

### FBA specifically

Most of it survived — the data model, the feeds, ~30 API routes, the sidebar, the
combine/plan/detail workspaces, **and the slot catalog and product layout**.
Missing: the materializer, sheet columns, the `TableSurfaceBinding`, the layout
hook. Five symbols in the retired ledger, each saying "rebuild the display".

**Fix on the way in:** `FBA_TABLE_LAYOUT_ID` is still registered in
`SLOT_LAYOUT_TABLES`, so `PUT /api/tables/layouts?tableId=fba` accepts and stores
org layouts for a table that renders nothing. Rebuild the mount or unregister it.

---

## 5. Phase 2 — The row interaction model

Two rulings, one coherent model. **The right rail stops being the answer for
both.**

### 5.1 One gesture table, written down

Build this first and make the code match it. The row has accumulated click,
double-click, mousedown, keydown, context-menu and a removed ⋮, and no single
place says what they mean.

| Gesture | Does |
|---|---|
| Click row | Toggle selection (click-select surfaces) |
| Shift+click | Extend selection from the anchor — **plumbed and hardcoded off today**, `{ shiftKey: false }` at both call sites. Fix it here. |
| Double-click | **Open the record form inline** (ruling 17) |
| `Enter` | Same as double-click |
| `Space` | Toggle selection |
| `j` / `k` / `↑` / `↓` | Move the record cursor |
| `Esc` | Close the form; if closed, clear the selection |
| Right-click | Reserved. Do not re-add a per-row menu without a ruling. |

### 5.2 Selection → the bottom action bar

Today `TableStatusBar` shows tabs, counts and a lone Copy. Eight bulk verbs live
in a rail that only registers at **3+ rows**, so an operator who checks one row
is told the product can copy and nothing else.

**The bar becomes the action surface.**

```
  ── no selection ────────────────────────────────────────────────
  [ Must ship 99+ ][ Urgent ]                     200 of 847  ↓
  ── 12 selected ─────────────────────────────────────────────────
  12 selected │ Copy │ Assign │ Ship-by │ Print labels │ Export │ Delete
```

- **Full-bleed, zero-padding, full-height buttons.** The hit target *is* the
  column. Compose `IconButton size="fill"` inside `FlushTerminalFooter`
  (`bleed` / `spread`) — the house primitive whose docblock already states this
  law. Do **not** hand-roll a bar.
- **Verbs come from the existing `SelectionAction` list**, unchanged: copy,
  assign tester/packer, set ship-by, print product labels, print shipping labels,
  flag, export CSV, delete — grouped as they already are (*set on these orders* /
  *take away* / destroy), delete separated by a rule.
- **Available from ONE row.** The 3+ gate goes. A verb that works on one row must
  be offered on one row.
- **The multi-select rail is removed**, not hidden (ruling 16). `OrderRailShell`
  stops registering. The two-row compare plane is a separate question — put it to
  the operator before deleting it.
- **Overflow is a menu, not a scroll.** Below the measured width, verbs past the
  first three collapse into one "More" popover on the shared primitive.
- **Undo or confirm.** Seven of eight verbs have neither. Count-scaled
  confirmation exists for ship-by and flag; extend it or add real undo.
- **Announce it.** The bar changing from counts to verbs is a live-region change.

### 5.3 Double-click → the record form, inside the table

*"A double click to open hint that will display the exact order information like
a form in the data table so the user will be able to exactly triage through the
form and the more information very easily."*

**Shape.** The row expands into a full-width panel directly beneath it holding
the whole order as a form: identity (read-only), the lifecycle steps with their
stamps, the editable facts, the note trail, documents and labels. Not a modal,
not a side panel.

**Non-negotiables, each with its reason:**

- **It shows; it does not animate.** An expanding row that tweens its height
  reflows every row below it, which AGENTS.md forbids outright — and the tween
  occupies the space for its duration, which is backwards for a disclosure.
- **One row open at a time.** Two panels make scroll position unmanageable and
  double the measurement problem below.
- **The virtualizer must be told.** `VirtualGroupedSections` sizes from
  `estimateSize`; its own docblock notes `measureElement` corrects per surface.
  In order of preference:
  1. **Fixed-height panel (recommended)** — known height keeps the scroll math
     exact and the runway honest, and a form that always opens the same size is
     easier to learn.
  2. `measureElement` on the expanded item — correct, but every open/close
     re-measures and the scrollbar moves under the operator.
  Do **not** render it outside the virtual item; an absolutely-positioned panel
  detaches from its row on scroll.
- **The URL is the state.** Reuse `?openOrderId` — the deep-link contract the
  right pane already uses. A pasted link opens the row's form, which is also what
  keeps the interaction budget.
- **The hint must exist.** "Double-click to open" is invisible today. Put a
  visible affordance on the row — an open glyph on hover and on keyboard focus,
  itself clickable. A gesture nobody can discover is not a feature, and it must
  be operable without a double-click by anyone who cannot make one.
- **Editing lives here.** Price, item number, and anything else the list refuses
  (ruling 15). Write paths in Phase 6.
- **Focus management.** Opening moves focus into the form; `Esc` closes and
  returns focus to the row. Without this a keyboard operator is stranded.

### 5.4 The row's right edge — what needs doing next

*"A hover on the most right of the row will display something like an appear,
like three dots for exactly what needs to be done."*

**Reconcile this with ruling 15 before you build it**, because it looks like a
reversal and is not. What was removed was a **permanent 2.5rem track** holding a
generic ⋮ whose only item duplicated the row click — a column spent on a
duplicate. What is asked for now is a **hover-revealed, contextual affordance
that names this row's next action**. Different thing, and a better one.

**Shape.**

```
│ … Bose Wave IV        ● TESTED   47d late  │   Pack  ⋮ │  ← on hover / focus
│   1 · USED · 9M52B2C4                      │           │
```

- **It spends no column.** It overlays the row's right edge on hover and on
  keyboard focus, inside the row, over the `_fill` slack. Ruling 15 stands: no
  permanent actions track returns.
- **It names ONE next action**, resolved from the row's lifecycle: an order with
  no label offers *Create label*; picked-not-packed offers *Pack*; packed offers
  *Print label*; a blocked row offers *Clear the block*. A row with nothing
  outstanding shows nothing — honest absence.
- **The ⋮ beside it is the remainder**, not the primary. It reuses
  `compound-row-actions.ts`, which already exists and already gives the row
  `Shift+F10`, the Menu key and right-click — that work survived the ⋮ removal
  and serves the other compound families.
- **The next action is DATA.** A family supplies a pure
  `row → { label, run, disabledReason? } | null`. The chrome renders it. No
  lifecycle branching in a cell.
- **It appears on keyboard focus too.** A hover-only action is unreachable for
  half the operators, and this one is the row's primary verb.
- **Opacity only.** It fades in; it never shifts the row (AGENTS.md).

This is the highest-value single addition in the program: it turns a queue you
read into a queue you can work straight down.

---

**What happens to the right pane.** The single-record inspector is a different
surface with real consumers. Decide explicitly and record it: the inline form
either replaces it on this desk, or the two coexist with the form as the triage
view and the pane as the deep record. Do not ship both silently doing one job.

---

## 6. Phase 3 — The header cluster

Ruling 18 moves export up: it is a **main feature button in the page header, to
the left of the CTA**, not only a toolbar glyph. That promotion raises the real
question — what else earns a place there?

### The cluster

```
  Shipping                        [ Views ▾ ]  [ Import ]  [ Export ]  [ + Add order ]
  To ship   Amazon Prep   Shipped
  ─────────
```

Four controls, which is the working-memory ceiling for a decision point. Each
earns it for a stated reason:

| Control | Why it is a main button |
|---|---|
| **Views ▾** | The named view is *which table you are looking at*. Every enterprise table puts this at the top because it frames everything below it. Ships with Phase 7. |
| **Import** | Getting data IN is a primary job, not a settings action. Peer of export by ruling 19. |
| **Export** | Getting data OUT is the other half of the same job (ruling 18). |
| **+ Add order** | The existing CTA. Unchanged, still rightmost — it creates the thing the page is about. |

### What does NOT earn a button, and why

State this in code review terms, because the cluster will attract candidates:

- **Print / labels** — a verb that acts on *chosen rows*. It belongs in the
  bottom bar with the other selection verbs, not in a header that acts on
  nothing.
- **Refresh** — the desk is realtime-patched. A manual refresh button is an
  admission that the live data is not live; fix the invalidation instead.
- **Columns / filter / zoom / fullscreen** — already in the toolbar, next to the
  table they change. Promoting them duplicates a control, which is the fork this
  program exists to end.
- **Search** — already the toolbar's first control and its widest.
- **New view** — lives *inside* the Views control, not beside it.

### Rules

- **The toolbar export glyph goes when the header button lands.** Two doors to
  one panel is the same fork as two funnels. The header button opens the same
  configurable panel from Phase 4.
- **Import and Export share one visual weight** — they are peers, and a seller
  who can get data out expects to get it in the same way.
- The cluster is **desk chrome**, so it mounts through the existing
  `DeskActionSlot` channel that already carries the CTA. Do not have the table
  reach up into the page header.
- On a narrow stage the cluster collapses label-first (glyph + tooltip), CTA
  last — never wraps to a second row (ruling 5).

---

## 7. Phase 4 — Configurable inline export

*"The export should not just be a blind download. It should be a configurable
download that will be inline — download default, download what's shown, configure
more."*

Today: one button writing every column for every rendered row. Correct and dumb —
it cannot answer *"just the SKUs and quantities for these forty rows"*, which is
what a seller does before a reprice or a restock order.

```
┌─────────────────────────────────────┐
│  Download this view          ⏎      │  ← default, one click
│  Download selected (12)             │  ← only when a selection exists
├─────────────────────────────────────┤
│  Columns                            │
│   ☑ Order      ☑ Status             │
│   ☑ Item       ☑ Picked by / at     │  ← the fields menu's own options,
│   ☐ Buyer      ☑ Packed by / at     │    plus export-only facts
│   ☐ Fees       ☐ Scanned out        │
├─────────────────────────────────────┤
│  Rows:  ◉ This view  ○ Selected     │
│  Format: ◉ CSV  ○ TSV               │
│  ⟳ Reset to default    ↓ Download   │
└─────────────────────────────────────┘
```

```ts
export interface DataTableExportMenu<Row> {
  /** Column ids offered, in export order. Labels are the operator's words. */
  fields: readonly { id: string; label: string; group?: string; default: boolean }[];
  /** Serialize one row for a chosen field set. Pure. */
  toRow: (row: Row, fieldIds: readonly string[]) => readonly (string | number | null | undefined)[];
  /** Base filename without extension — the lane, e.g. `to-ship`. */
  filename: string;
}
```

### Rules

- **The default tier stays one click.** Tiering exists so the common case does
  not get slower.
- **Field selection persists org-wide**, like the layout — an export shape is a
  decision about what the business reports on.
- **The export list is a superset of the catalog, not a copy.** Record ids, raw
  stamps and fee breakdowns belong in a file and not on screen; model them as
  export-only fields in the same list, grouped.
- **Row scope respects the narrowing** — after search, filter and date range.
- Empty is **disabled**, not a header-only file.
- Large sets stream or chunk; never build a 50 MB string on the main thread.

### Unify while you are here

Verified: **four independent CSV serializers** (`order-export-csv`'s `csvCell`,
`DataTable`'s `toCsv`, `warranty/reports`' `toCsv`, plus hand-rolled joiners in
Bins and Operations) and **eight export paths**. There is no FBA export and no
catalog export at all.

And `ORDER_EXPORT_COLUMNS` is a **hand list, not a projection of the catalog** —
the vocabularies already disagree (the export names `product_title`, `sku`,
`status`, `ship_by`, `tracking`, `serial`, `platform`, `record_id`; the catalog
names none of them). Reconciling those two lists **is** this phase. Do not add a
fifth serializer.

---

## 8. Phase 6 — The seller field catalog

Nine fields today. The feed returns far more.

### Two constraints before you start

**The budgets are real** (10 status / 5 subtitle). Adding fields to the catalog
is free; binding them by default is not.

**There are THREE independent order readers**, and the queue route says so in its
own comment: `/api/orders`'s projection, `ORDER_SERIALS_CTE`, and
`getActiveOrders`. *"A fact added to one does not reach the others."* Every new
field lands in all three or it silently becomes lane-dependent — present on one
desk, blank on another, no error anywhere.

### Facts the feed already returns that nothing binds (verified)

- **Money:** `currency`. **No fees, cost or margin exist on `orders` at all** —
  the nearest cost fact is `sku_catalog.last_known_cost_cents`, joinable and
  never selected. Margin is an ingestion project, not a display change.
- **Buyer:** `customer_id` is returned as an FK and the queue **never joins
  `customers`**, which holds name, email, phone and the full shipping address.
  `buyer_note` exists only on `SELECT *` reads.
- **Carrier / status:** `carrier`, `latest_status_code|label|description|category`,
  `latest_event_at`, `has_exception`, `exception_at`, `is_terminal`, `is_shipped`,
  `is_delivered`, `tracking_added_at`, `label_printed_at`. **No service-level
  column exists anywhere** — ingestion, not binding.
- **Time:** `created_at`, `order_date`, `pack_duration`, `test_duration`,
  `next_pack_activity_at`, `next_test_activity_at`.
- **Location:** `pack_location_id|name|kind`. No inventory bin on the order row.
- **Triage:** `row_flag`, `note_count`, `is_urgent`, `has_tech_scan`,
  `serial_number`, `verification_outcome`.
- **Catalog:** `sku_catalog_id`, `catalog_image_url`, `catalog_category` — three
  columns nothing binds. **`catalog_image_url` is the photo the compound row's
  thumbnail track has been painting a placeholder for.** Bind it first: highest
  value in this list, and it costs nothing to fetch.
- **Marketplace:** `fulfillment_channel` (filtered on, never returned), and
  `account_source` — on the type but **absent from the queue projection**, so the
  platform chip derives from order-id shape alone.
- **Migrated with no reader:** `parcel_weight_oz|length|width|height`;
  `release_state`, `released_at`, `released_by`, `docs_not_required`,
  `release_gates` (filtered on, never selected).

### Method

For each candidate: decide its slot (`identity` / `status` / `subtitle` /
`amount` / export-only), give it a `displayType` that already has geometry, add
it to all three readers, write the resolver case. **Do not invent a display type
to fit one field** — a genuinely new type is a deliberate addition with its own
geometry row and a test.

### Platform behaviour stays data

**No `if (platform === 'ebay')` in a cell.** A fact that applies to one
marketplace resolves to `null` on the others and paints the house blank.

Be honest about how much is data today: the `platforms` table carries slug,
label, tone, colour, provider, order and active flag — an org can rename,
recolour and hide a marketplace. It carries **no URL template and no order-id
pattern**. The Amazon `3-7-7` and eBay `2-5-5` regexes and the Seller Central /
eBay / Walmart links are code literals. **An org cannot add a marketplace without
a deploy.** Close that here or defer it explicitly.

### eBay specifics before you bind anything

The eBay sync writes the listing handle into **`orders.item_number`**
(`legacyItemId || lineItemId`). There is **no `orders.listing_url`** — listing
URLs live on the catalog side (`sku_platform_ids.listing_url`, with
`platform_item_id`, `listing_title`, `listing_status`, `account_name`,
`confidence`). And `marketplaceOrderUrl` links the **order page**, never the
listing. "Open the listing" is a join, not a field.

---

## 9. Phase 5 — Import, with inline column mapping

Ruling 19. Export and import are one axis, and only one has ever been designed.

### What exists

More than you would guess: a descriptor pipeline (`ORDER_IMPORT_DESCRIPTOR`),
**17 canonical fields** with `order_number` the only required one, header
auto-mapping (`autoMapCsvOrderHeaders`), per-row Ready / Action-required
classification, a real staging grid with its own `tableId` and prefs bucket, and
a commit endpoint gated on `orders.import`.

### What is missing

**The mapping step is invisible.** Headers are auto-mapped or they are not, and
when they are not the operator is left editing cells in staging to compensate.
A seller's supplier file never matches your header row, and re-solving that by
hand every week is the tax this removes.

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
  ☐ Remember this mapping as “Supplier — October”

  Preview  ┌───────────────────────────────────────────┐
           │ 09-88231  Bose Wave IV   2  USED  Oct 14  │
           │ 09-88232  Bose Solo 5    1  NEW   Oct 14  │
           └───────────────────────────────────────────┘
                                   [ Back ]  [ Import 412 ]
```

### Rules

- **Mapping is inline, in the table**, not a wizard in a modal. It is the same
  surface the rows will land in.
- **Auto-mapped rows are marked as such** and are still editable. Confidence is
  shown; it is never hidden behind a silent guess.
- **Unmapped columns default to "don't import"**, never to a nearest-match. A
  wrong column silently populated is worse than a missing one.
- **The preview uses the real table** — the same cells, the same row model. A
  preview that renders differently from the destination is a promise the import
  cannot keep.
- **Mappings persist as named profiles, org-wide** — the same law as the layout
  and the export field set. Next week's file from the same supplier maps itself.
- **Required fields gate the commit.** `order_number` is the only one today;
  surface it as a blocking row count, not a toast after the fact.
- Row-level Ready / Action-required classification is unchanged — this phase
  feeds it better data, it does not replace it.

---

## 10. Phase 7 — Saved views (half-built, wrong payload)

Smaller than the cascade suggests, and different.

**What exists:** a real `saved_views` table (`organization_id, staff_id, surface,
name, filters jsonb, is_shared, sort_order`), 24 registered surfaces including
all three order lanes, full CRUD, routes, a hook, a menu, and a migration guard
pinning the surface list to the live DB constraint.

**What is missing — two different things:**

1. **The payload is a search string.** `saveView` writes
   `const filters = { query: currentQuery };`. No columns, no layout, no sort, no
   date range.
2. **The layout layer is a dead parameter.** `resolve-effective-layout.ts`
   declares and implements
   `savedViewLayout ?? staffLayout ?? orgLayout ?? productDefault`, and
   `savedViewLayout` appears in exactly one non-test file — that one. The hook
   calls the resolver without it and says so: *"saved-view layouts are a later
   ship."*

**The work.** `filters` is untyped JSONB, so nothing in the database blocks this:
extend the payload to a **versioned** bundle (`{ v, query, layout, filters, sort,
dateRange, exportFields }`), capture the effective layout on save, thread it into
the resolver.

**Rules.** Views are organization-wide (extending ruling 7) — but the table
already carries `staff_id` and `is_shared`, so personal views remain possible;
decide whether they survive. **The view is the URL**: applying one writes the
params the desk already reads plus a view id, so a pasted link reproduces the
screen with no view record. Views live **in the filter popover's own band** — not
a fourth control, never a tab strip. Deleting a view never deletes rows.

---

## 11. Phase 8 — Write paths

**Price has no write path at all.** `saleAmount` is absent from
`OrderAssignPayload`, absent from the assign route's SQL, and absent from the
`.strict()` PATCH body schema — while the DB helper `updateOrder` already accepts
it. Pick **one** waist (extending the assign route keeps the optimistic update
and rollback the editors depend on), wire it end to end, and write an audit row.

Item number editing moves onto the record form. Notes already append to the trail
and refresh the denormalized column in the same transaction — **do not add a
second author of that field**; that is precisely why the assign route's notes
branch was removed.

Note that **bulk actions carry no permission strings today** — they gate on lane
only, with enforcement server-side per route. If the bottom bar makes verbs
reachable at one row, confirm the server gate for each is actually present.

---

## 12. Quality of life

Not a phase — a standing list. Each is small, each removes a daily irritation,
and each is defensible on this product rather than borrowed from a feature grid.
Take them opportunistically while touching the surface they live on.

### Reading

- **A totals row that follows the narrowing.** A seller triages on money; the
  table paints a column of amounts and never sums it. One sticky line in the
  status bar — count and sum for the current view — answers "what is this batch
  worth" without an export.
- **Filter within a column.** A per-column value picker for tag and person
  columns (condition, carrier, packer). The filter menu narrows the *row set*;
  this narrows *by the column you are looking at*, which is where the question
  actually forms.
- **Secondary sort.** Sort by ship-by, then by platform. One sort is enough for
  a list and never enough for a queue.
- **Column pinning by the operator.** The frozen prefix is fixed today. Let a
  staffer pin the column they are comparing against; it is the same persisted
  layout the drag-resize already writes to.

### Working

- **A keyboard sheet on `?`.** The desk has `j` / `k` / `Enter` / `Esc`, a
  record cursor, and now `Shift+F10` — and nothing anywhere tells anyone. A
  shortcut nobody can discover is a shortcut nobody uses.
- **Selection survives a refresh.** Riley's finding: a mid-selection reload
  loses the set with no warning. Park the id list in the URL or session storage.
- **Return to the row.** Closing the record form should land the operator back on
  the row they opened, scrolled into view — not at the top of a re-virtualized
  list.
- **Undo on bulk writes.** Seven of eight verbs have neither undo nor
  confirmation. The count-scaled confirm exists; an undo toast with a 10-second
  window is better for the reversible ones.

### Marketplace-specific

- **Same-buyer grouping.** Two orders from one buyer shipping to one address is a
  combine opportunity and a postage saving. FBA already models combine; the
  outbound queue does not surface the signal at all.
- **"Why is this late."** The delay tip already computes the reason. Make it a
  *bindable fact* so an operator can filter on it, not just hover it.
- **Marketplace deadline vs. our deadline.** Amazon and eBay each impose their
  own ship-by. The row shows one date. If the two differ, the operator is
  managing to the wrong one — surface both or state which one wins.

---

## 13. The keyboard — a full model, not a pile of listeners

**Ruling 21: the table is fully operable from the keyboard.** Not "has some
shortcuts". Every verb the pointer can reach, the keyboard can reach, and an
operator who never touches the mouse loses nothing.

### 13.1 What exists, and the problem with it

More than you would expect, and that is the problem:

- **`⌘K` command palette** (`CommandBar`) — records search.
- **`useRecordCursorKeyboard`** — `j` / `k` / `↑` / `↓` / `Enter` / `Esc` record
  stepping, already guarded by `isTypingTarget` and `hasOpenOverlay()`.
- **`compound-row-actions.ts`** — `Shift+F10`, the Menu key and right-click open
  a row's overflow (built this program; survives the ⋮ removal).
- **A real ownership stack**: `overlay-stack` (innermost overlay owns Escape) →
  `list-key-scope` ("the focused list owns its navigation keys") →
  `keyboard-region-owner` (which frame column owns horizontal keys). Plus
  `nav-keys` (⌘; letter teleport), `segment-chords`, `shortcut-nudge`.
- **A scanner stack**: `wedge-scan-listener`, `wedge-scan-machine`,
  `find-field-scan`, `scan-hotkey/store.ts`, all guarding on
  `is-editable-key-target`.

And **53 files register their own `window` keydown listener.** That is the
finding. The ownership *model* is already right and already written down; what is
missing is that nothing composes it. Every feature adds listener 54 with its own
copy of the guards, so precedence is decided by mount order and no file can
answer "what does `x` do right now".

**Do not add a 54th listener.** Build the registry that the existing ownership
primitives were clearly heading toward.

### 13.2 One registry, layered

```ts
/** Register a binding for as long as this layer owns the keyboard. */
useKeymap(layer, [
  { keys: 'j',        run: cursor.next,      label: 'Next row' },
  { keys: 'x',        run: toggleSelect,     label: 'Select row' },
  { keys: 'mod+c',    run: copySelection,    label: 'Copy details', when: hasSelection },
]);
```

**Layers, innermost wins.** This is not new precedence — it is the precedence
`overlay-stack` and `list-key-scope` already encode, made explicit:

| Layer | Owns | Yields to |
|---|---|---|
| `overlay` | A dialog or popover: everything, including `Esc` | nothing |
| `editor` | An open inline editor: all text keys, `Enter`, `Esc` | overlay |
| `form` | The open record form: `Tab`, field keys, `Esc` | overlay, editor |
| `table` | Rows, selection, single-key verbs | all of the above |
| `global` | `⌘K`, `?`, `g`-sequences | all of the above |

**Two suppressors cut across every layer:**

1. **A typing target has focus** — reuse `is-editable-key-target`; never
   re-implement it.
2. **The scanner is armed.** See 13.4. This one is the product's, not Linear's.

### 13.3 The keymap

Mnemonic, conflict-free, and deliberately close to what an operator already
knows from Gmail, Linear and vim.

**Navigate (table layer)**

| Key | Does |
|---|---|
| `j` / `↓` | Next row |
| `k` / `↑` | Previous row |
| `g` `g` | First row |
| `G` | Last row |
| `PageUp` / `PageDown` | Page the cursor |
| `Home` / `End` | First / last row |

**Select**

| Key | Does |
|---|---|
| `x` | Toggle selection on the focused row |
| `Shift+↑` / `Shift+↓` | Extend the selection |
| `mod+A` | Select every row in the current view |
| `Esc` | Clear the selection (when nothing is open) |

**Open**

| Key | Does |
|---|---|
| `Enter` / `o` | Open the record form for the focused row |
| `Esc` | Close the form, focus returns to the row |
| `.` | Open the row's overflow — alias of `Shift+F10` |

**Chrome (opens the same one control the pointer opens)**

| Key | Does |
|---|---|
| `/` | Focus the find field — **the critique's top Alex finding** |
| `f` | Filter menu |
| `d` | Date menu |
| `c` | Columns / fields menu |
| `v` | Views |
| `e` | Export panel |
| `i` | Import |
| `z` | Zoom |
| `F` | Fullscreen |

**Act — on the selection, or the focused row when nothing is selected**

| Key | Does |
|---|---|
| `mod+C` | Copy details — the natural key, which is *why* copy is not `c` |
| `a` | Assign tester / packer |
| `s` | Set ship-by date |
| `p` | Print labels |
| `!` | Flag rows |
| `Backspace` / `Delete` | Delete (confirms) |

**Global**

| Key | Does |
|---|---|
| `mod+K` | Command palette (exists) |
| `?` | Keyboard sheet |
| `g` `t` / `g` `p` / `g` `s` | To ship / Amazon Prep / Shipped |

### 13.4 The scanner problem — the part Linear does not have

**A wedge scanner types.** It emits a burst of characters and an `Enter`. With
single-key verbs live, one scan of `SKU-1129` is `s`(ship-by) `k`(up)
`u` `-` `1` `1` `2` `9` and then `Enter`(open) — a scan becomes a sequence of
commands, some of them writes.

This is not hypothetical: the repo already has an entire scan stack precisely
because scanners and keyboards share one input channel, and the orders feed even
annotates a value as *"non-scan-critical"*.

**Rules, and none of them are optional:**

- **Single-key verbs are inert while the scanner is armed.** The scan-hotkey
  store already knows armed state; the registry subscribes to it.
- **Single-key verbs require the table to own focus.** Not "no input focused" —
  actual ownership via `list-key-scope` / `keyboard-region-owner`. A key that
  fires from anywhere on the page is a key that fires during a scan.
- **Modifier verbs (`mod+…`) stay live**, because a scanner cannot press a
  modifier.
- **`Enter` never runs a destructive verb.** A scanner ends with `Enter`.

### 13.5 Discoverability — Linear's real lesson

The shortcuts are not the hard part; **knowing they exist** is.

- **`?` opens a keyboard sheet**, grouped exactly as 13.3 is, scoped to the
  current layer — it shows what works *here*, not a global list.
- **Every menu prints its own shortcut.** The filter menu's rows, the fields
  menu, the row overflow, the bottom action bar — each item shows its key on the
  right, the way Linear and every mature tool does. This is the single highest-
  leverage discoverability move: nobody reads a help sheet, and everybody reads
  the menu they already opened.
- **The row-edge next action shows its key** when it appears on focus.
- `shortcut-nudge` already exists — use it rather than inventing a second
  teaching mechanism.

### 13.6 Accessibility obligations

- **WCAG 2.1 SC 2.1.4 (Character Key Shortcuts)** requires single-character
  shortcuts to be remappable, switchable off, or **active only on focus**. The
  focus-ownership rule in 13.4 is what satisfies this — say so in the docblock so
  nobody "simplifies" it away.
- **Focus is always visible.** The ring is currently likely sub-3:1 (§13
  cross-cutting); a keyboard-first table with an invisible focus ring is not
  keyboard-operable.
- **Announce what the keyboard changed.** Selection count, filter applied, form
  opened — all through the live region, or the keyboard operator acts blind.
- **A skip link over the row window.** 200 tab stops between the toolbar and the
  status bar is not navigable; the row cursor is `j`/`k`, so the rows themselves
  should be one tab stop with a roving `tabindex`, not two hundred.
- **`Esc` always has exactly one meaning at a time** — the innermost layer's.
  That is what the ownership stack is for.

### 13.7 Per-phase keyboard obligations

Nothing here is a separate "keyboard phase". Each phase carries its own:

| Phase | Owes |
|---|---|
| **1 · Families** | The registry lives at the engine seam, so every ported family inherits the same map. **No family-local keydown listener** — porting a family means deleting its listener, not moving it. |
| **2 · Row model** | The gesture table gains a keyboard column: `x`, `Enter`, `Esc`, `.`, `Shift+↑/↓`. Shift-click's fix and `Shift+↑/↓` are the same anchor logic — write it once. The row-edge next action binds to `Enter` when the row is focused and nothing is selected. |
| **3 · Header cluster** | `v` / `i` / `e` open Views / Import / Export. Each control's trigger shows its key in its tooltip. |
| **4 · Export** | `e` opens the panel; `Enter` runs the default tier; `Esc` closes without downloading. The panel is fully tabbable — it is a form. |
| **5 · Import** | The mapping step is a form: `Tab` between columns, type-ahead in each field select, `⌘Enter` commits. An import an operator cannot map by keyboard is an import they will not use twice. |
| **6 · Catalog** | Nothing new — but every bound fact must be readable by a screen reader in the row, which is what the sr-only work on stage steps already established. |
| **7 · Views** | `v` opens; `↑`/`↓` walk the list; `Enter` applies. A view is a navigation, so it announces. |
| **8 · Writes** | Every inline editor: `Enter` commits, `Esc` cancels and restores, `Tab` commits and moves on. Never lose a keystroke to a re-render. |
| **QoL** | `?` is the sheet. The totals row is `aria-live` when the narrowing changes. |

### 13.8 Definition of done for the keyboard

- A new session can complete this, mouse unplugged: **find the must-ship orders,
  select four, print their labels, open one, edit its condition, close, export
  the view.**
- `?` lists every binding that works in the current layer, and each of those
  bindings also appears in the menu that holds the same verb.
- A wedge scan into the desk with rows focused writes nothing and triggers no
  verb.
- The row window is one tab stop, not two hundred.
- No file outside the registry registers a `keydown` listener for the table.

---

## 14. Cross-cutting requirements

Not a phase. Every phase carries them.

### Accessibility

Real gaps found in the critique. Close them as you touch each surface:

- **No live regions anywhere.** Filtering, searching, row-count changes and bulk
  results are silent. The bottom bar switching to verbs, and the form opening,
  both need announcing.
- **The focus ring is likely sub-3:1** (`ring-blue-500/40` on white) against WCAG
  2.2 SC 1.4.11, on every chrome control. Measure it; fix the token, not the call
  sites. **Never "fix" a focus test by removing a ring.**
- **200 row tab stops, no skip link.** A keyboard operator crosses the whole
  window to reach the status bar — which is about to become the action bar, so
  this gets worse before it gets better.
- **Explanatory tooltips are hover-only** (`focusable={false}`) — invisible to
  keyboard and screen reader.
- The form is a named region, focus moves in, `Esc` returns focus to the row.

### Performance

- **Lighthouse Performance ≥ 92 on every route** is standing law and LCP is the
  whole gap. The record form must not join the first paint — render it on open,
  not behind a hidden `display:none`.
- The virtualizer is why 1,189 rows are usable. Nothing here may render every row
  to satisfy an export or a form.
- **Payload budgets ratchet down, never up** (`bundle-budget.json`). The date
  picker, the form and the export panel are all lazy-load candidates.
- `npm run perf:seeds` asserts each seeded route's dehydrated query key reaches
  the first HTML with rows. A silent seed is invisible — it happened during this
  program (§14).

### States

Every surface owes four settled states, and the fourth is the one that gets
dropped: **loading → absence → no-match → degraded**. `GridDegradedBox` is the
house degraded state; To-ship painting "your warehouse is clear" on a failed
fetch is the bug it exists to prevent. The record form owes the same four.

---

## 15. Definition of done, per phase

| Phase | Done when |
|---|---|
| 1 · Families | Every ported family's hand array is deleted and ledgered; `<family>.test.ts` proves the product layout parses and the materialization reproduces the pre-port scan order; `fieldsMenu` is true only where a catalog exists. |
| 2 · Row model | The gesture table is implemented exactly; shift-click extends; the bar offers every lane verb at one row; the rail no longer registers for multi-select; the form opens from `?openOrderId`, from double-click, and from a visible hint; `Esc` returns focus to the row. |
| 3 · Export | One serializer and one field registry across toolbar / rail / packed; the default tier is one click; field choice round-trips org-wide. |
| 4 · Catalog | Each new field resolves in all three readers, has a resolver case and a test, and is bindable without a deploy. |
| 5 · Views | A saved view restores layout + filters + sort + date range; the URL alone reproduces the screen; the payload is versioned. |
| 6 · Writes | Price edits persist with an audit row; no field has two authors. |
| 3 · Header | Export opens the same panel from the header as it did from the toolbar, and the toolbar glyph is gone; the cluster never wraps. |
| 5 · Import | A supplier file with foreign headers imports without hand-mapping twice; the mapping is saved as a named profile. |
| Row edge | The next action is derived from lifecycle, appears on hover AND focus, spends no column, and shows nothing when nothing is outstanding. |

---

## 16. Invariants

`npm run verify` before done — lint · typecheck · unit is the whole gate.

**Live ratchets:** `retired-symbols` (retired symbols stay at 0 — add every
kill), `color-neutrals` (no raw neutrals), `focus-ring-tokens` (shrink-only),
`surface-box-tokens` (compose `Panel`), `slot-layout` (the write gate),
`resolve-effective-layout` (cascade + soft-drop), `materialize-tracks` (band
insertion, sheet-vs-compound, collision throw), `saved-views/surfaces` (matches
the live DB constraint — **relevant to Phase 5**), `permission-registry` +
`route-permission-manifest`, `source-platform` (hue parity), `order-export-csv`
(**Phase 3 rewrites this**).

### ⚠️ Three guards named in live docblocks DO NOT EXIST

A repo-wide search returns **zero** `*.guard.test.ts` files. These three are
cited as house law and enforce nothing:

- `table-definition-registry.guard.test.ts` — the **definition↔columns drift
  check**, cited in `registered-bindings.ts`.
- `table-record-plane.guard.test.ts` — the **coverage assertion** that the
  registry and the bindings array name the same set.
- `band3-find-only.guard.test.ts` — `NO_DESK_PEEK_SURFACES`, cited in
  `table-surface-binding.ts` and in a Playwright spec.

`registered-bindings.ts` documents at length the exact regression the first two
prevent: two surfaces silently escaping the drift check for their whole life. The
prose is there; the enforcement is not. **Phase 1 registers sixteen bindings into
that seam.** Write these three first — the cheapest item in the program and the
one that protects everything after it.

### Two lessons that cost real bugs

- **Never build a Tailwind class with a template literal.** The scanner reads
  source text, so `` `w-[var(${VAR})]` `` generates nothing and the class ships
  with no rule behind it. This removed the grid's entire horizontal scroll, and
  the unit test passed the whole time because it asserted the class *string*.
- **A test that pins a literal is not a test of the invariant.** A padding value,
  a track width, a class name — each failed on a legitimate change and passed
  through a real bug. Assert the behaviour or the shape, never the value.

---

## 17. Risks

| Risk | How it bites | Mitigation |
|---|---|---|
| Sixteen ports as one big bang | A broken shared skeleton takes every desk down at once | Port in the §3 order, verify per family, never batch |
| Form height vs. virtualizer | Scroll math drifts; the scrollbar lies | Fixed-height panel; measure only if forced |
| Bottom bar vs. tabs | The bar still hosts tabs on surfaces that have them | Resolve the collision per surface before removing the rail |
| Three order readers | A field appears on one desk and not another, silently | Add to all three in the same commit; test one row per reader |
| Concurrent sessions | A red gate is often someone else's in-flight file | Check `git status` and the diff before repairing anything you did not write |
| Silent seeds | An RSC seed returning nothing renders as an empty warehouse | `npm run perf:seeds`, and see the blocker below |
| Row-edge affordance vs. ruling 15 | Reads as re-adding the ⋮ that was just removed | It spends no column and names a contextual verb; say so in the docblock or the next agent reverts it |
| Header cluster creep | Every feature wants to be a main button | The "what does NOT earn one" list in §6 is the review standard |

**Known blocker at time of writing:** a peer session repointed the To-ship RSC
seed (`unshipped-queue-seed.server.ts`) from `fulfillmentScope` to `inWarehouse`;
it seeds zero rows, the client hydrates that and never refetches, and the desk
renders the first-run empty state. Confirm this is resolved before trusting any
visual check.

---

## 18. Working conditions

- **Shared worktree.** Several sessions edit this checkout concurrently. Report,
  do not repair, what you did not write.
- **Never create a branch.** Work on `main`, stage only your own files, never
  `git stash`, commit/push only when asked.
- **Verification is possible and expected.** `:3050` is auth-gated; mint a
  session with
  `LH_BASE_URL=http://localhost:3050 node scripts/lighthouse-mint-session.mjs`
  and drive Playwright with the `cf_sid` cookie. **Measure the DOM.** The worst
  bug in this program was invisible to every test and obvious in one
  `scrollWidth` reading.

---

## 19. Open questions

Do not guess. Ask, then record the answer here.

1. **Margin.** Half-answered by the code: there are no fees, cost or margin on
   `orders`, and the only cost fact lives on `sku_catalog` and is never read — so
   it is an ingestion project. Is it in scope, and does cost come from the SKU
   catalog or from marketplace settlement?
2. **Buyer data.** How much customer identity belongs on a warehouse desk that
   packers can see?
3. **Per-marketplace defaults.** Different layouts for eBay and Amazon, or one
   layout with marketplace facts blank where they do not apply? Related: an org
   currently cannot add a marketplace without a deploy.
4. **View ownership.** The org layout write is gated on `admin.manage_features`,
   so only a manager can change columns today. Do saved views inherit that gate,
   and do **personal** views survive at all?
5. **Export destinations.** Is a file download the end state, or is the real ask
   a scheduled push to a sheet or a supplier?
6. **The right pane's future.** With the record form inline and the actions at
   the bottom, what is the right rail still for — and does the two-row compare
   plane survive?
