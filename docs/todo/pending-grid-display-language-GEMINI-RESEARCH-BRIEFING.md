# Research briefing — Pending grid display language: striping, alignment, editability, and the "departure board" status model

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Scope:** ONE surface — the **Pending** lifecycle tab of the outbound orders grid on `/dashboard`. Do not generalize to station benches, the receiving/incoming grids, `/o/[orderId]`, or mobile. Findings may be *promoted* later; this brief is about getting one surface right first.
**Predecessor:** `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` (2026-07-27) asked "are our six station tables consistent?" and concluded the render engine had already converged. **This brief is narrower and different**: the engine is fine; the *display language rendered by that engine* — banding, alignment, affordance, and semantic color — is what the product owner is now calling ugly and under-informative.

**Deliverable:** three things, kept separate.

1. **Industry answer.** What is 2026 best practice for each of the eight specific defects in §5, in dense operational data grids? Named products, cited sources, dominant-pattern calls — not "it depends."
2. **Codebase answer.** Reconcile that against the measured constraints in §2–§4 and the house laws in §3. Where the standard collides with a house law, name the collision and pick a side. A defended deviation beats a generic answer.
3. **Verdict on the departure-board model (§6).** The product owner proposes reframing this table from a *record list* into a *status/departure display* in the vein of an airport terminal board. Validate, refute, or reshape it, and give the concrete column + color model that follows from your verdict.

Assume the reader is the engineer implementing this next week, alone, with no design partner.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Inventory is **serialized** — individual physical units carrying serials, condition grades, test verdicts, and photo evidence — sold across eBay, Amazon/FBA, and walk-in/local pickup. Operators move physical goods through: inbound carton → triage → unbox → test → repair → list → **pack → ship**, with returns and warranty loops.

UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. Stated bias: **legible throughput over document calm** — Linear/Carbon/Stripe-Dashboard chrome discipline, not a whitespace-heavy document product.

Every UI region is classified into one of four **region contracts** (enforced house law — please use this vocabulary):

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

`/dashboard` outbound is a **Workbench** with a **Monitor** sub-region (a KPI strip that scrolls away). The Pending tab is the Workbench's collection map.

### 1.1 Who reads this table, and where

This matters more than usual and should shape your answer:

- **Primary reader:** a warehouse operator, standing, often 2–4 ft from a 1080p monitor in a lit warehouse — not a analyst leaning into a MacBook.
- **Primary question they ask the table:** *"what has to leave the building today, and what is already late?"* — a triage/dispatch question, not a browse question.
- **Secondary reader:** the owner/manager doing daily review, seated, who also edits values inline.
- Rows are **order lines**, not orders. One order can have multiple lines; multi-line orders collapse into one summary row with a disclosure.
- Typical Pending depth is tens-to-low-hundreds of rows. The grid is virtualized.

### 1.2 The complaint driving this brief, in the product owner's words

> "it's ugly because there's no adjustment for the stripes of the table … the title should not be editable since this is a warehouse operations SaaS … the condition dropdown should not have a condition dropdown pill, it should display the condition full width in the column … left aligned with the text, not middle aligned … the header seems like it can be upgraded to display more staff-friendly UX … the quantity column [alignment should match] the rest of the content … this table display needs more vibrant colors to lighten the table display up … I'm thinking the table should function as a status display, since this is just a pending table, similar to like an airplane terminal where the display would have a **set ship-by time** for its due date, not just days late."

---

## 2. Current implementation — measured

You do not have the codebase. Everything below is read from source; paths are given so the answer can cite them.

### 2.1 Render stack

```
DashboardScrollShell            ← page scroll port; chrome (tabs+filters) is a
│                                 NON-scrolling sibling above it
└── WORKBENCH_BODY_COLUMN       ← mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8
    └── [data-table-surface]    ← TABLE_SURFACE_CLIP_CLASS: rounded-xl +
        │                         border-border-soft + bg-surface-card +
        │                         elevationClass('raised') + overflow-hidden
        └── LedgerGrid          ← src/design-system/components/grid/LedgerGrid.tsx
            ├── sticky column header (role=rowgroup)
            └── VirtualGroupedSections (always virtualized)
```

- `LedgerGrid` is the house **Workbench spreadsheet SoT**. Pending is its golden path: `showDayHeaders={false}`, Date as a per-row column, `gridSkin="airtable"`.
- ARIA is `role="table"` (deliberately **not** `grid` — the APG composite-widget keyboard contract is not implemented). Rows are `role="row"` with `aria-selected`.
- Column state math (defs / sort / visibility / order) runs through a headless TanStack Table v8 waist (`useGridSurface`, `buildLedgerColumnDefs`). **TanStack owns state only** — never widths, markup, or grouping. Widths live in a house geometry model.
- Cell markup lives in a domain registry: `OrdersQueueTableRow.renderDesktopCell` + `OrderGroupSummary`, both mapping over the **same ordered column list** as the header, so the three can never disagree on order.

### 2.2 The column model (default Pending lane)

`src/lib/dashboard-order-row-layout.ts` → `ORDERS_QUEUE_COLUMNS`. `title` is the **only** flex track; every fact track is content-hard `minmax(X,X)`.

| # | key | width | full label | header label at width | type glyph | notes |
|---|---|---|---|---|---|---|
| 1 | `select` | 2rem | — | — | — | checkbox gutter |
| 2 | `title` | `minmax(12rem, 1fr)` | Product | "PRODUCT" | text | **frozen** (sticky-left), the only flex column |
| 3 | `date` | 4.5rem | Ship by | **"BY"** (`gridLabel`) | calendar | civil day only, e.g. `Jun 17` |
| 4 | `age` | 3rem | Age | **glyph only** (clock) | clock | e.g. `41d`, SLA-toned |
| 5 | `qty` | 2.75rem | Qty | **glyph only** (`#`) | number | right-aligned under `gridSkin` |
| 6 | `condition` | 5.5rem | Cond | "COND" | tag | pill-as-trigger dropdown |
| 7 | `order` | 3.75rem | Order | **glyph only** (`#`) | id | last-4 CopyChip |
| 8 | `tracking` | 3.75rem | Tracking | **glyph only** (pin) | location | last-4 CopyChip |

**Header label rule:** each column carries `labelFitRem`; when the resolved track is narrower than that, the header **drops its text and renders only its type glyph, centered** (`gridHeaderCellAlignClass`, `src/design-system/components/grid/grid-header-align.ts`). At the default widths above, four of eight headers are glyph-only. Full labels survive only as `HoverTooltip` text.

**A second, richer lane exists** — `?tested` swaps in `tester` (6rem) + `testedAt` (10rem) columns. Any recommendation must survive that lane too.

Columns are: drag-reorderable (dnd-kit, whole-header-cell drag, keyboard path via KeyboardSensor), drag-resizable, click-to-sort (URL-durable `?sort=`/`?dir=`), and per-staff show/hide via a `tier: 'core' | 'optional'` default set persisted as a delta.

### 2.3 The airtable skin — what draws the lines

`src/styles/globals.css:645–684`, opted in via `data-grid-skin="airtable"`:

```css
[data-grid-skin='airtable'] {
  --cf-grid-line:   var(--ds-color-border-default);
  --cf-grid-line-w: var(--ds-border-width-thin);
  --cf-queue-row-px: 0px;               /* cells own their own padding */
  background-color: var(--ds-color-background-surface);
}
/* header + body + summary cells: RIGHT + BOTTOM rules only */
[data-grid-skin='airtable'] [data-grid-col-header] [role='row'] > *,
[data-grid-skin='airtable'] [data-order-row-id] > *,
[data-grid-skin='airtable'] [data-grid-summary-row] > * {
  border-right:  var(--cf-grid-line-w) solid var(--cf-grid-line);
  border-bottom: var(--cf-grid-line-w) solid var(--cf-grid-line);
}
/* trailing column drops its right rule — the shell owns the perimeter */
/* container row hairlines are zeroed so cell rules are the only seams */
/* header band fill: var(--ds-color-surface-sunken) */
```

So: **full cell grid** (every cell has a right + bottom rule) **plus** zebra striping **plus** a raised card frame. That is three simultaneous separation mechanisms.

### 2.4 Zebra striping — the mechanism

`src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx:~955–975`:

```
selected           → QUEUE_ROW.selectedClass (bg-blue-50 ring-1 ring-inset ring-blue-400)
alternate stripe   → bg-surface-canvas   (opaque under gridSkin; /40 translucent off-grid)
default            → bg-surface-card
hover              → hover:bg-surface-hover
```

Stripe index comes from `src/design-system/components/grid/group-stripe-index.ts`:

- The counter advances **by 1 per top-level group**, never by leaf count — because a collapsed multi-child order occupies one visible row. (Using `rows.length` previously skipped parities and produced consecutive same-color rows.)
- With `showDayHeaders={false}` (Pending), the index runs **continuously across date buckets**, so a day boundary never doubles a stripe.

**Light-theme values (the ones on screen):** `surface-card` = `#ffffff`, `surface-canvas` = `#eef2f7`. That is a deliberately large step — it was widened so the raised card shadow had a ground plane to cast onto.

> **This is our leading hypothesis for "no adjustment for the stripes," and we want it challenged.** `#eef2f7` was tuned as a *page background* behind floating cards. Reused as an *in-table zebra fill* against a full cell-rule grid, it plausibly reads as heavy banding rather than a scan aid — the shaded rows look like a different surface, not the same surface alternately tinted. See §5.1.

### 2.5 Cell alignment — the actual defaults

`ordersQueueGridCell()` returns `flex min-w-0 items-center self-stretch` + inset + optional right rule. **Default justification is `start`** for every column. Exactly one column opts out:

```ts
// qty cell
gridSkin && 'justify-end'   // comment in source: "Numbers right-align (place-value scan)"
```

So today: everything left, **qty right**. The `condition` cell is also nominally `justify-start`, but its content is a `rounded-full` pill inside a 5.5rem track with cell inset, which reads as floating/centered rather than aligned to the text column above it.

### 2.6 Per-cell affordances as currently built

| Column | Value presenter | Interaction |
|---|---|---|
| `title` | plain truncated text, `text-role-data` | **in-cell editable** — click, Enter, F2, or any printable char opens `LedgerCellEditor` and commits `productTitle` |
| `date` | `GridDateCellValue` → `formatDateKeyShort` (e.g. `Jun 17`), `text-text-muted`, tooltip `Ship by · Tue, Jun 17, 2026` | in-cell date editor |
| `age` | `GridAgeCellValue` → `41d` when late, else compact lane age `4h` | read-only |
| `qty` | `tabular-nums`, toned by `orderRowQtyTone(qty)` | in-cell number editor |
| `condition` | **pill-as-trigger**: `rounded-full inset-chip text-role-micro uppercase tracking-widest ring-1 ring-inset` + `ChevronDown`, toned by `conditionGradeTone()` | `aria-haspopup="listbox"` single-select |
| `order` / `tracking` | last-4 `CopyChip` (typed identifier family, mono) | copy |

Empty condition renders a quiet `— ⌄` set-affordance.

**Corner indicators** ride on the frozen `title` cell (Excel/Sheets vocabulary): a **slate triangle top-right** = has note; a **rose triangle top-left** = out of stock. These are the small triangles visible in the screenshot. Rationale in source: *"sparse facts never earn a column."* They survive horizontal scroll because the title cell is frozen.

### 2.7 Semantic color actually in use in the body

Today the *only* chromatic ink in a Pending row is:

- `age` — `getDaysLateTone(daysLate)`: `≥8d → text-text-danger` · `≥3d → text-text-warning` · `≥1d → text-amber-600` · else `text-text-muted`. (Lane-age fallback uses `getLaneAgeTone` with an 8h/24h/72h/192h ladder.)
- `condition` — per-grade tone from `src/lib/condition-tone.ts`.
- `qty` — `orderRowQtyTone` (the orange `3` in the screenshot).
- selection blue.

Everything else is gray/black text on white or `#eef2f7`. **The product owner's "needs more vibrant colors" is aimed at this.**

### 2.8 What the screenshot shows (so we agree on the artifact)

Eight rows. Header: `T PRODUCT | # | 📅 BY | 🕐 | 👁 COND | # | 📍`. Row 1 has an orange `3` qty and a `41d` in red; rows show `USED ⌄`, `NEW ⌄`, or `— ⌄` in COND; order and tracking are underlined last-4 chips. Alternating rows carry the `#eef2f7` fill. Small dark triangles sit at the right edge of several title cells.

---

## 3. House laws you must not break (or must explicitly argue against)

These are enforced by CI guards, not just prose. Baselines only shrink; a PR cannot raise one.

1. **Compose the SoT, or grow the SoT — never fork it page-locally.** A "just for this table" card shell, tone map, or second grid is banned. *Improving* the shared primitive so the next caller inherits it is the sanctioned path and is encouraged.
2. **Color only from semantic tokens.** `bg-surface-*`, `border-border-*`, `text-text-{default,soft,muted,faint,success,warning,danger,info,inverse}`. No page-local hex, no arbitrary Tailwind shades. Themes swap via `data-theme` + `src/design-system/themes/*` — 8 themes ship, including dark. **Any color proposal must survive a theme swap and a dark family.**
3. **Font weight is capped at 600.** `font-bold`/`extrabold`/`black` are banned — the 700 cut is not loaded, so a stray one renders as synthesized faux-bold, and at 10–14px on a warehouse monitor 700+ closes counters. Emphasis must come from **contrast and tracking, not ink weight.** This constrains "make it pop" answers.
4. **One type family (IBM Plex), three cuts.** sans (body/data) · condensed (**intrinsic** to `text-role-eyebrow` / `text-role-micro`) · mono (identifiers). Pick a *role*, never a family. Numerals in `role-display`/`-title`/`-data` are `tabular-nums` by default.
5. **Spacing from a density-aware scale** (`calc(rem × var(--cf-density))`) plus named intents (`inset-chip`, `inset-field`, `inset-cozy`, …). No arbitrary px.
6. **Selection is background + ring only — never a size or height shift.** Row height must be identical across default/hover/focus/selected.
7. **Action planes.** Every operator action belongs to exactly one primary plane: **in-cell** (single typed value) · **row-scoped** (hover controls / single-row menu) · **multi-select** (`ContextualSelectionBar`) · **record** (the detail inspector). *Plane redundancy is required where the primary plane is conditionally unavailable* — in-cell editing is gated `gridSkin && !isMobile`, so the record inspector must remain a **complete superset** of editable fields.
8. **Actions diverge by lifecycle stage; column layout and grid components diverge only by data domain.** All four outbound tabs (Pending · Tested · Packed · Shipped) share one grid and one persisted column layout. **A Pending-only column model is a house-law violation** unless you argue the case explicitly. This is a hard constraint on §6.
9. **Kinetic Ledger, not a foreign kit.** "Better" means stronger *within* this family. Importing a different product's aesthetic wholesale is a stated Never.

---

## 4. Data actually available (this unlocks §6)

The Pending query already selects more than the grid renders. Relevant to a departure-board reframe:

| Field | Shape | Currently rendered? |
|---|---|---|
| `deadline_at` | **`timestamptz`** from `work_assignments`, aliased in SQL as `ship_by_date` via `to_char(…, 'YYYY-MM-DD HH24:MI:SS')` | **only as a civil day** (`Jun 17`) — the time is dropped |
| `created_at` | timestamp | fallback for the date column |
| `has_tech_scan` | boolean | → derived state, not shown as a column on Pending |
| `is_out_of_stock` | boolean | → rose corner triangle only |
| `quantity`, `condition`, `order_id`, `tracking_number` | — | yes |
| `sale_amount` + currency | — | formatted helper exists, **not rendered on desktop grid** |
| `packed_at`, `test_date_time`, `test_activity_at`, `serial_number` | — | only on the `?tested` lane |

**The single most important finding in this brief: a ship-by *time of day* already exists in the data and is being thrown away at the presentation layer.** `formatQueueRowDateCell()` reduces the timestamp to a civil day key. So the departure-board idea in §6 is not a data-model request — it is a presentation decision that could ship against existing columns.

A lifecycle state registry also already exists — `deriveFulfillmentState({hasTechScan, isOutOfStock})` → `PENDING | TESTED | BLOCKED`, each with a label, a one-line description, a soft pill class, and a dot class, all tenant-overridable through a label registry. **Pending currently renders none of it** on the grid (a `status` accessor is defined for sort math but no status column is in the default set). An invariant holds there: no two state dots share a hue.

There is also a **warehouse business timezone** SoT (`America/Los_Angeles`), with a hard house rule separating *instant* / *civil date* / *zoned wall-clock* — a civil day key may never be reparsed as a local midnight. Any time-of-day proposal must state which of the three types it is using.

---

## 5. The eight defects — please answer each

For each: (a) what is 2026 standard practice, with named products and citations; (b) what specifically to do here, expressed in this codebase's vocabulary; (c) what it costs or risks.

### 5.1 Striping is wrong — "no adjustment for the stripes"

The table simultaneously runs **three** separation systems: a full cell-rule grid (right + bottom on every cell), zebra striping at a ~4–5% luminance step (`#ffffff` ↔ `#eef2f7`), and a raised outer card.

**Questions.** Is zebra striping still defensible in 2026 for a ruled operational grid, or is it redundant with the cell rules — and what does the evidence actually say (the frequently-cited claim that zebra helps only past a row-count/width threshold)? If striping stays, what is the correct **luminance delta** for a ruled grid at `ops` density on a warehouse monitor? Is `#eef2f7` — a value tuned as a *page canvas* behind floating cards — categorically the wrong token to reuse as an *in-table* fill, and should the house add a dedicated `surface-row-alt` token instead? Does the answer change for the *frozen* title pane, which inherits the row fill and so carries the band across the freeze seam? And how does zebra interact with the **selection ring** and the **hover fill**, given house law 6 forbids any height change and requires selection to win over stripe?

Also: rows are virtualized and multi-child groups collapse to one visible row. Stripe parity is computed per top-level group. Does any striping recommendation survive a fold/unfold without a parity flip mid-scroll?

### 5.2 The product title must not be in-cell editable

Product title is currently a first-class in-cell text editor (click / Enter / F2 / type-to-replace). The owner's position: *this is warehouse operations software; the title is a catalog fact arriving from a marketplace listing, not an operator-authored field, and putting a text caret on it invites destructive typos on the row's only identity anchor.*

**Questions.** Do you agree, and on what principle — is the right rule "identity columns are read-only in the collection map; correction happens at the record plane," or something sharper? What is standard in comparable products (Airtable primary field, Linear issue title in list view, Retool tables, Shopify order line items, ShipStation)? If the title becomes read-only in-cell, **where does correction go** given house law 7 requires the record plane to be a complete superset — is a row-scoped "Edit product" action, an inspector-only field, or a deliberate no-edit-at-all the right answer? And what should the title cell's click then *do* — open the record (the current row-level behavior) with no competing cell target? Note the title cell is also the **frozen** cell and the host for both corner indicators, so its interaction budget is already crowded.

### 5.3 Condition should not be a pill-with-caret

Currently a `rounded-full` soft-toned pill + `ChevronDown`, floating inside a 5.5rem track. The owner wants the condition **rendered full-width in the column, left-aligned with the text above it**, not as a centered pill.

**Questions.** For a **single-select enum with a semantic tone** in a dense ops grid, what is the 2026 standard cell rendering — Airtable-style pill, Notion-style pill, a bare left-aligned toned label, a left color bar / edge rail plus plain text, or a full-cell tinted fill? Which of those best preserves (a) scannability down the column, (b) the affordance that the value is editable, and (c) tone legibility at 10–11px? Is the caret needed at all when the whole cell is the trigger — or does removing it break discoverability for a non-obvious editable cell? If condition becomes a **full-cell tinted fill**, how does that coexist with zebra striping (§5.1) and with the airtable cell rules without producing a checkerboard? Does the answer differ for the empty state (`—`)?

Constraint: per-grade tone must keep resolving through `src/lib/condition-tone.ts`; grade→label through `conditionLabel(code, variant)` (six variants exist). Do not invent a per-screen map.

### 5.4 Column alignment is inconsistent

Everything is `justify-start` except `qty`, which is `justify-end` under an explicit "place-value scan" rationale. The owner wants qty to match the rest of the content.

**Questions.** This is a real, citable tension: the classic typographic rule is *numbers right-align, text left-aligns, headers align with their data*. But it is usually argued for **columns of comparable magnitudes** (currency, totals) — and this column is a warehouse pick quantity that is `1` for the overwhelming majority of rows, with the occasional `3`. Does right-alignment earn anything at a max width of 2–3 glyphs in a 2.75rem track, or does it just create a ragged visual gutter mid-table and break the eye's left rhythm? What is the threshold at which right-alignment starts paying? Is there a third answer (center; or left-align but keep `tabular-nums`; or right-align *and* shrink the track to hug)? And whatever you pick — how must the **header** align to match (`gridHeaderCellAlignClass` takes `'start' | 'end'` and currently centers any glyph-only header regardless of its data alignment, which means today the `#` glyph is *centered* over *right-aligned* numbers)?

### 5.5 The header is cryptic

At default widths, four of eight headers render **glyph only**: age = clock, qty = `#`, order = `#`, tracking = pin. Full labels exist only in tooltips. Two different columns show the identical `#` glyph. `Ship by` abbreviates to `BY`.

**Questions.** What should a header row in an operational grid do for a **non-analyst warehouse operator** who did not configure the table? Is adaptive label-dropping (drop text below `labelFitRem`, keep the type glyph) a sound pattern or a failure mode — and if the label doesn't fit, is the correct fix widening the track, wrapping/rotating the label, using the condensed cut more aggressively, dropping the *glyph* instead of the text, or a two-line header? Two columns sharing `#` seems plainly wrong — what is the right glyph vocabulary here (Airtable's field-type glyph system is the obvious reference; is it the right one for a fixed-schema ops table, where the type is *never* a question the operator has)? Should the type glyph exist at all when the schema is fixed and not user-authored — or should that slot carry **state/sort/filter** information instead, which is what the operator actually needs? What about a second header line carrying per-column aggregates (count, sum of qty, count late) — standard in ops tables, and free capacity here?

Also please rule on: `Ship by` → `BY` is arguably the single worst string in the header. Fix by widening, by relabeling, or by folding date+age into one column (see §6)?

### 5.6 Not enough color — the table reads flat and gray

Only four things carry chromatic ink today (§2.7). Everything else is gray text on white/`#eef2f7`.

**Questions.** How do you add **vibrancy without becoming a rainbow** in an ops grid — what is the disciplined 2026 answer (semantic-only color; color reserved for exceptions; a single accent hue plus a status ramp; row-level tinting vs cell-level tinting vs left edge rails)? Given house law 3 caps weight at 600, **contrast and hue are the only emphasis tools left** — how should they be rationed? Specifically: should *state* get color (a status column / dot / row rail), should *urgency* get color (it already does, in one column), or both — and if both, how do they avoid competing? What is the ceiling on simultaneously-colored elements per row before scanning degrades? And WCAG: at `ops` density with 10–14px condensed type, what contrast floors apply, and does color-as-status need a redundant non-color encoding (shape, glyph, position) to satisfy 1.4.1?

### 5.7 Age says "41d" but never says *when*

`41d` in red is the only urgency signal, and it is a **relative** one. The absolute ship-by is one column to the left, reduced to a civil day.

**Questions.** For a dispatch/triage table, is relative-only urgency (`41d`) sufficient, or does an operator need the absolute commitment beside it? What is the standard treatment (relative with absolute tooltip — the current design; both inline; absolute with relative badge; a single fused cell)? Does the answer change when the deadline is *today* (hours matter) versus *41 days ago* (the day is all that matters)? Is there a defensible model where the cell **switches representation by proximity** — clock time inside the current day, weekday inside the week, date beyond — and what is the cost of a non-uniform column?

### 5.8 Multi-line orders and the frozen seam

Not raised by the owner, but load-bearing for anything above: multi-child orders collapse into one summary row with a disclosure, the summary row is styled by the same cell registry, and the title column is frozen (sticky-left) with a scroll shadow at its edge. Any striping, tinting, or full-cell-fill proposal must state what happens **at the freeze seam** and **on a group summary row**.

---

## 6. The departure-board reframe — the central question

The owner's proposal, restated as a design thesis:

> *Pending is not a record list. It is a **dispatch queue with commitments** — the operator's question is "what leaves today, in what order, and what has already blown its window." That is the same job an airport departure board does: a stable list of committed departures, each with a scheduled time, a live status word, and color that means one thing. So the table should render a **set ship-by time**, not just a days-late count, and should carry a **status** the way a board carries `ON TIME / BOARDING / DELAYED / DEPARTED`.*

Two independent claims are bundled here. Please separate them.

**Claim A — the display model.** Should a Workbench collection map for a time-committed queue adopt a status-board display language at all? Departure boards are a **Monitor** artifact in our vocabulary — observe-only, no selection, no editing, read at distance. This table is a **Workbench** — durable URL selection, in-cell editing, multi-select bulk actions, a record inspector. House law forbids blending two region contracts in one region, and explicitly warns against bolting edit affordances onto an observe surface (and vice versa). **Is a "board-flavored Workbench" a coherent thing, or is it two contracts in a trenchcoat?** If it is coherent, what exactly transfers (semantic status vocabulary, one-meaning color, sort-by-commitment, glanceability at 4 ft) and what must not (no-selection, no-edit, all-caps monumental type, auto-cycling, flip-board motion)? If it is not coherent, is the right answer to **split the region** — a Monitor status strip above a Workbench grid — and what does that cost in vertical space that the KPI strip already consumes?

**Claim B — the ship-by time.** A `timestamptz` deadline already exists and is being truncated to a civil day (§4). Should the Date column render a **time of day**?

Please rule on:
- **Is the underlying commitment actually a time?** `deadline_at` comes from a work-assignment record. If in practice it is set to a date with a meaningless midnight/EOD time component, rendering `12:00 AM` would be **inventing false precision** — the worst outcome here. What is the right way to decide this, and what should the UI do when precision is *unknown or heterogeneous across rows*?
- If time is real: what format at `ops` density (`3:00p`, `15:00`, `3p`)? The app has a per-staff 12h/24h preference SoT that display formatters must honor.
- Should Date and Age **fuse into one column** — commitment + urgency in one cell, which frees ~3rem and kills the worst header label (`BY`) — or stay separate for sortability? (Both are independently sortable today via URL-durable column sort.)
- **Carrier cutoff.** A real departure board's "scheduled time" is a hard external event. The warehouse analogue is the **carrier pickup cutoff**, which is not currently modeled. Is a per-order deadline without a cutoff concept enough to justify board semantics, or is cutoff the missing primitive that would make this genuinely board-like? (If your answer requires cutoff, say so — that is a data-model change and we need to know.)

**Claim C — the status vocabulary.** `deriveFulfillmentState` already yields `PENDING | TESTED | BLOCKED` with tenant-overridable labels, descriptions, pill classes, and a no-shared-hue dot invariant — and Pending renders none of it. A board's power is that one word plus one color tells you everything.

- Should Pending gain a **Status column**? Note house law 8: all four outbound tabs share one column layout, and the `?tested` lane deliberately *dropped* a status pill as redundant ("every row here is TESTED, so show *who* and *when* instead"). Does adding Status to the shared layout regress that reasoning, or is per-lane column divergence the thing that should actually change?
- Is the correct encoding a **pill**, a **dot**, a **left row rail**, or a **row tint**? A rail or tint would be the most board-like and the most compatible with §5.1 (it could *replace* zebra rather than fight it). Is "state drives the row's own color, and zebra is deleted" a defensible unification — or does it destroy row-scanning when 80% of rows share one state?
- If status is derived rather than stored, what are the failure modes of showing it as if it were authoritative?

**Constraint on your answer to §6:** it must be expressible as (i) a column-model change, (ii) presenter changes in the shared value-cell registry (`src/components/ui/grid-cells.tsx`), and (iii) at most one new *semantic token* — not a new grid, not a page-local component, not a second visual language.

---

## 7. Explicit tensions we want adjudicated

Do not resolve these by splitting the difference. Pick a side and defend it.

1. **Zebra vs. full cell rules.** Both are separation. Keeping both may be the actual root cause of "ugly." Which one goes, or how are they retuned to coexist?
2. **Number right-alignment vs. left rhythm** (§5.4) — the textbook rule vs. a 1-glyph column.
3. **Adaptive glyph-only headers vs. plain labels** (§5.5) — a clever space saver vs. a comprehension failure for the actual reader.
4. **Editable-everywhere spreadsheet vs. operations-record discipline** (§5.2). The grid currently leans Airtable. The owner is arguing that a warehouse system should lean the other way — that a text caret on a catalog fact is a liability, not a feature. Where is the correct line between "typed operational value" (qty, condition, ship-by — edit freely) and "identity/catalog fact" (title, order id, tracking — read-only in the map)?
5. **Board glanceability vs. Workbench density** (§6). A departure board is legible at 30 ft because it shows ~12 rows at 28px. This table wants 25+ rows on screen with 11px condensed labels. These are opposing optimizations. Which wins on this surface, and is there a defensible density mode switch (the house has `floor`/`ops`/`rollup`/`studio` and a `--cf-density` multiplier already wired) rather than one compromise?
6. **Color vibrancy vs. the 600-weight cap and 8 themes** (§5.6). More hue is the only lever left, but every hue must survive a dark theme and WCAG at 11px.

---

## 8. Deliverable format

Please return, in this order:

1. **Executive verdict** — ≤10 lines. Is the table's core problem (a) too many separation systems, (b) the wrong information model for the job, (c) affordance/editability mismatch, or (d) something we have not named? One primary diagnosis, ranked.
2. **Industry survey** — the 2026 standard per §5 defect and per §6 claim. Named products, cited sources, dominant-pattern calls. Flag anything that changed since ~2022.
3. **Recommended target state** — a column-by-column spec table for Pending: `key | width | header treatment | alignment | value presenter | tone source | interaction plane | read-only?`. Include the `?tested` lane's two extra columns.
4. **Departure-board verdict** — separate rulings on Claim A / B / C in §6, with the concrete column + color model that follows. If you refute the idea, say what the owner is *actually* right about underneath it, because the underlying complaint (relative-only urgency, no state on screen, flat gray) is real regardless.
5. **Token / SoT deltas** — every new or retuned semantic token, tone function, or shared value-cell presenter your answer needs, named against the modules in §2 and §4. Flag which are *promotions* (improve the shared SoT, all callers inherit) vs. *scoped* (Pending only) — the house strongly prefers the former.
6. **Sequenced plan** — phased, each phase independently shippable and independently revertible, with the phase that most reduces "ugly" per unit of risk placed first. Note anything that requires a data-model change (§6 Claim B cutoff) as explicitly out-of-band.
7. **What you would NOT do** — the plausible-sounding moves you are rejecting and why. This is as valuable as the recommendations; we have a standing bias against conservative reskins that leave the root cause untouched.

**Two standing instructions.** (1) Where a recommendation conflicts with a house law in §3, say so by number and argue the case — the laws are evolvable, but only against a stated argument. (2) Do not import a foreign design system's aesthetic wholesale; "better" here means stronger within Kinetic Ledger's own token family. Naming what Airtable/Linear/Retool/ShipStation do is exactly right; telling us to look like them is not.
