# Research briefing — ops data-table simplification & 2026 display standards

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-27
**Deliverable:** a table/grid design recommendation, benchmarked against named industry systems (with citations) and reconciled against the measured constraints in §2–§6.

---

## 0. How to use this brief

You do **not** have the codebase. Everything you need is embedded here: the measured anatomy of what exists, a per-station column-by-column inventory, the design laws already ratified in-repo, and the specific decisions that are blocked.

Two things are being asked, and they are **different questions** — answer both separately:

1. **What is the 2026 industry standard?** Survey how comparable products solve dense operational tables, with named examples and cited sources. Do not generalize into "it depends" — give the dominant patterns and the conditions under which each wins. Where practice has *changed* since ~2022, say what changed and why.
2. **What is right for *this* codebase?** Reconcile the industry answer against §2–§6. Where the standard conflicts with a constraint here, say so and pick a side with reasoning. We would rather have a defended deviation than a generic answer.

**Important framing correction, please read before answering.** The originating complaint from the product owner was: *"the tables are ugly and inconsistent station to station."* The engineering scan that produced this brief found that the **rendering engine is already highly converged** — six station grids share identical header typography, identical sort-chevron markup, identical row shells, identical frozen-column geometry, and zero page-local hex. The inconsistency is real but it lives in **four other layers**: the *semantic column vocabulary*, the *chrome above the table*, the *state affordances* (density/sort/selection/fields), and a *parallel population of un-migrated legacy tables*. Please treat "ugly" and "inconsistent" as **two separable diagnoses** and address each on its own evidence. If you conclude the aesthetic complaint and the consistency complaint have different root causes and different fixes, say so plainly.

Assume the reader is the engineer who will implement this over the next two weeks.

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers (electronics refurb/resale is the dogfood tenant). Operators move physical inventory through a pipeline: inbound carton arrives → triage → unbox → test → repair → list → pack → ship, with returns and warranty loops.

The UI identity is called **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. The stated bias is **legible throughput over document calm** — closer to Linear / Carbon / Stripe Dashboard chrome discipline and POS/scan floors than to a document-whitespace product.

Every UI region is classified into one of four **region contracts** (enforced house law, not aspiration):

| Contract | Driven by | Job | Selection model | Density |
|---|---|---|---|---|
| **Station** | scanner | act-and-clear | ephemeral, never in URL | `floor` |
| **Workbench** | pointer | pick a record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only, no edit | none (filters only) | `rollup` |
| **Canvas** | pan/zoom/focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

**Every surface in this brief is a Workbench region** (pick → edit → persist, durable URL selection), even when it sits on a page that also hosts a scanner Station. **This vocabulary is load-bearing — please use it in your answer.**

The tables in question are the operator's primary work surface. A warehouse staffer spends most of a shift in one of them. They are used at a desk with a mouse **and** at a standing bench next to a barcode scanner, on 1080p–1440p monitors, typically 8–14 hours a day.

---

## 2. What already exists — the measured anatomy

This section is here so you don't recommend building what is already built. **The grid engine is not the problem.**

### 2a. Three-tier rendering stack

| Tier | What it is |
|---|---|
| **Windowing engine** | `@tanstack/react-virtual`. Flattens either folded groups or flat day-sections into one linear item stream. `overscan: 10`. Sticky day-band pin via a custom `rangeExtractor`. Non-pinned items are absolutely positioned via `translateY`. |
| **Grid shell** | Sticky column header + always-virtualized body. Publishes its own header height as a CSS var via `ResizeObserver`. Has a **split-x mode** for ancestor-page-scroll + horizontal scroll, where the header band lives outside the inner h-scroll box and is translated by a synced offset var. |
| **Descriptor composer** | Owns the surface card shell, the loading skeleton, the empty state, and a **headless TanStack Table v8 state waist** (`manualSorting: true`, `enableSortingRemoval: false`, no grouping/expanded row models). TanStack owns *state math only* — column defs, sorting, visibility, order. Markup, widths, virtualization, grouping and fetch stay house-owned. |

Geometry is CSS-var-driven (`grid-template-columns` built from per-column `minmax()` strings), **not** a `<table>`. Frozen columns are `position: sticky` cells with a computed left offset.

### 2b. What is already identical across all six station grids

Measured, not asserted:

- **Header row height:** `min-h-11` (44px) — all six.
- **Header typography:** one shared preset, `text-role-micro font-normal uppercase tracking-[0.06em] text-text-faint` — all six, no casing drift (the visible string is `gridLabel ?? label`, uppercased in CSS).
- **Sort chevron:** the class string `h-3 w-3 shrink-0 text-text-muted opacity-80` is byte-identical in all six header components.
- **Row shell:** `px-0 py-0` with cells owning padding via one shared inset constant `px-2 py-1.5` — five of six (the sixth, Orders, adds vertical padding only in its non-grid "board" skin).
- **Structural columns:** `select` = `minmax(2rem, 2rem)` and `title` = `minmax(12rem, 1fr)`, locked (non-hideable, non-reorderable), in all six.
- **A11y:** every header stamps `role="columnheader"`, `data-col`, and a correct `aria-sort`.
- **Theming:** a hex grep across all grid code returns **exactly zero** page-local hex. The visual skin is driven by data attributes (`data-grid-skin="airtable"`, `data-cf-grid`, `data-frozen-edge`, `data-grid-summary-row`) resolving to themed CSS vars, so `data-theme` re-skins the whole family for free.
- **Surface shell:** one token module — `rounded-xl` + `border-border-soft` + `bg-surface-card` + a raised elevation role + `overflow-hidden`; frozen header is a quiet `bg-surface-sunken` band. Pinned by a unit test.
- **Column visibility:** resolves in exactly one hook, with a documented 3-step order (structural → ephemeral viewport force-hide → staff delta), a `tier: 'core' | 'optional'` default-set model, and prefs persisted as a **delta** (`hidden` / `shown` arrays), never an absolute list. 12 unit tests + a CI tier guard.

**So: the pixels of a single row, in isolation, are consistent.** Any recommendation that amounts to "unify the row rendering" is already done and will read as wasted effort.

### 2c. The visual skin in question

The current look is an **Airtable-style skin**: continuous 1px column rules drawn on the *right* and *bottom* of every header cell, body cell, and group-summary cell, through the full grid, with the card shell clipping the perimeter. Frozen-column and scrolled-header shadows appear only once the user actually scrolls (`box-shadow: 8px 0 8px -8px rgba(15,23,42,0.22)` on the frozen edge, `0 4px 10px -6px` under the header).

This is one of the two things the "ugly" complaint may be about. See **Q1**.

---

## 3. The measured inconsistency inventory — nine defect classes

This is the evidence. Each item is a counted, verified fact.

### 3.1 — Column vocabulary has no shared semantic spine

Six station grids define **24 distinct column keys** between them. Only two keys (`select`, `title`) appear in all six.

| Station | Columns (in order) | Count |
|---|---|---|
| Orders (default) | select · title · date · age · qty · condition · order · tracking | 8 |
| Orders (tested lane) | select · title · date · age · **tester** · **testedAt** · qty · condition · order · tracking | 10 |
| Incoming | select · title · date · **age** · qty · condition · **status** · platform · order · tracking | 10 |
| Receiving / Unbox / History | select · title · date · qty · condition · **stage** · platform · order · tracking · **serial** | 10 |
| Pickup | select · title · **sku** · order · date · qty · condition · **price** · **status** | 9 |
| Catalog | select · title · sku · **inventory** · **channels** · **manuals** · **qc** · **orders** · **status** | 9 |
| Repair | select · title · date · **customer** · **phone** · price · order · **ticket** | 8 |

**The specific failures inside that:**

**(a) Three different columns are called `status` and mean three different things** — delivery state (Incoming), fulfillment state (Pickup), listing state (Catalog) — and a *fourth* concept, workflow stage, is called `stage` on Receiving. They are visually indistinguishable in the header.

**(b) The same semantic column has different widths per station.** `order`: **3.75 / 4.5 / 4.5 / 9 / 5.5 rem** across five stations (the 9rem is a long LCPU PO number). `date`: **4.5 / 4.5 / 4.5 / 5.5 / 6 rem**. `tracking`: **3.75 / 5.75 / 5.75 rem**. `status`: **4.5 / 5 / 5.5 rem**. (`qty` at 2.75rem and `condition` at 5.5rem *are* consistent.)

**(c) The same semantic column has different labels.** The date column reads **"Ship by" / "Expected" / "Date" / "Date" / "Created"** across the five stations that have it. The product column reads **"Product"** on four and **"Product Title"** on two.

**(d) The same semantic column has a different *tier* — i.e. it is on by default in one station and hidden by default in the next.** `condition` is core on Orders but **optional** (ships hidden) on Incoming, Receiving and Pickup. `qty` is core on Incoming/Receiving but **optional** on Pickup. `sku` is optional on Pickup but core on Catalog. `order` is core on three stations and optional on Repair.

**(e) The same semantic column is structural in one station and hideable in another.** `date` carries **no hide key** (can never be removed) on Orders/Incoming/Receiving, but **is** hideable on Pickup and Repair.

**(f) The persistence key namespace has collisions and legacy leakage.** The order column persists under key `orderid` on three stations and `order` on two. Incoming's `status` and Receiving's `stage` both persist under the key **`rest`** — a leftover slot name from a retired row primitive.

**(g) Two different grids share one preference bucket.** Incoming and Receiving both mount under `tableId: "receiving"`. They have **different column sets**. A code comment warns that their tier assignments "must match key-for-key" or a staffer's saved preference on one silently corrupts the other. This is enforced by human vigilance and a doc comment, not by a type.

**Why this is the top-line finding:** a single physical carton is viewed on Incoming, then Unbox, then History — three grids — and the columns **rename, resize, reorder, and change default visibility** underneath it at each hop. That is a far more likely source of "inconsistent station to station" than any pixel.

### 3.2 — Sort has three parallel mechanisms and inconsistent defaults

- **Column-header click sort** writes `?colsort=` / `?coldir=`. Live on **4** surfaces.
- **Server ordering vocabularies** write `?sort=` / `?dir=` (e.g. `zoho_newest`) on the *same pages*. Two sort systems can be in one URL simultaneously.
- **A dropdown sort control** (`QueueSortSwitch`) is mounted on **3** surfaces. On Repair, the dropdown and column-header sort are both visible at once, with no stated precedence.
- **Two older copy-pasted sort hooks** still run in parallel with the extracted shared one.
- **Default sort direction for the same column differs by station:** `qty` sorts descending-first on Pickup and ascending-first everywhere else; `price` descending-first on Pickup but not declared on Repair.
- Sorting by a column **silently suppresses date-band grouping** on the descriptor-driven surfaces — an unannounced mode change.

### 3.3 — Chrome above the table is a free-for-all

Of ~22 workspace headers: all have tabs, most have search, but only **8 have a sort affordance** and only **10 have a trailing action slot**.

| Affordance | Surfaces that have it |
|---|---|
| Columns/fields menu | **6 of ~20** (Orders, Incoming, Receiving History, Unbox, Pickup, Repair, Catalog) |
| URL column sort | **4** |
| KPI strip | present on ~11, **absent on 5** (Receiving History, Pickup, Repair, Catalog, Products Labels) |
| Filter popover | ~7 |
| Staff/assignee filter | 4 |

**KPI strip placement is a three-way split:** in the scrolling body (scrolls away) on most; **pinned inside the chrome** on one; pinned as a `shrink-0` sibling on another.

**Three stations skip the shared scroll shell entirely** and hand-pin their own chrome band.

**Eleven separate KPI-strip files** each re-declare their own tile-band class plus local skeleton/error/empty states.

The scoped-search toggle primitive has **two live import paths** (a design-system path and a legacy `ui/` alias), split roughly half and half across consumers.

### 3.4 — Five different empty / loading / error recipes coexist

1. Descriptor surfaces: a dashed box, `text-sm font-semibold text-text-soft`, with a 12-row skeleton above it.
2. Orders surfaces: a **different** dashed box — same border, but `text-role-caption text-text-muted`, no `<p>`, no semibold — and loading is folded *into* the empty box as the literal string `Loading…`.
3. Legacy station history: **no box at all** — `opacity-20` italic ghost text.
4. Support: a shared `EmptyState` component + an 8-row skeleton, with a hand-rolled CTA class string.
5. Catalog: a raw `bg-red-50 / border-red-200 / text-red-700` error box (non-token shades, and not the house dashed-rose recipe) plus a separate spinner row.

Repo-wide there are **241 occurrences of `border-dashed`** in component code.

### 3.5 — Density is declared but inert

- A global density multiplier (`--cf-density`) and a `[data-density='compact']` rule exist in the stylesheet. **Nothing in the entire app sets `data-density`.** It is dead code.
- A table density module exists with `comfortable → py-1.5` / `compact → py-1`, a `density` URL param, and a per-table storage key. Under the current grid skin, rows are hard `py-0` and cells are a fixed `px-2 py-1.5`, so **these classes only apply to one legacy non-grid path.** Density is effectively unavailable on five of six stations.
- **Seven distinct row-level vertical padding values** are in play across table surfaces: `py-0`, `py-0.5`, `py-1`, `py-1.5`, `py-2`, `py-2.5`, `py-3` — only two of which are token-driven.
- The header is **44px** while body rows compute to roughly **40px**. The virtualizer's row-height estimate is a **single global constant (44)** shared by six different row anatomies and is never overridden by any caller.

### 3.6 — Selection is inconsistent in *kind*, not just presence

Five different models on one product:

| Station | Model |
|---|---|
| Orders | **Always-on** Airtable-style checkbox column; the "select mode" toggle only gates pencil chrome |
| Incoming / Receiving / Unbox | **Gated** — checkboxes appear only after arming an edit mode |
| Repair | Always armed, with a bulk bar whose primary action is "open selected" (max 1) |
| Catalog | Always armed, selection scope declared — **but no bulk action bar is mounted.** Selection is dead UI |
| Pickup | **None by design** (read-only browse); the select column renders as an inert invisible gutter that still consumes 2rem |
| Triage | A **separate, non-shared** edit-mode/bulk-bar mechanism |
| Testing, Shipping, Pack, Labels, Ready, FBA board, Support, Walk-in, Review | No row selection at all |

Checkbox *styling* also drifts: rows use a raw `bg-blue-600` for the checked state while the headers directly above them use the semantic `bg-accent-bg` token.

### 3.7 — Two parallel table civilizations

- **~20 surfaces** compose the virtualized grid family.
- **~30 files still ship hand-rolled `<table>` / `<thead>` markup**, several of them operator-facing queues (a ready-to-ship queue, an unfound-PO queue, warranty claims, tracking exceptions, warehouse bins, plus the whole admin-inventory section). These use raw `z-10` sticky headers, their own `px-3 py-3` cells, and in one case a hand-copied clone of the surface-shell class string instead of the token.
- The sanctioned bridge for simple non-virtualized tables — a proper `DataTable` primitive that *does* compose the surface tokens — has **exactly two consumers.**

So there are three tiers where the design intends two, and the middle tier is nearly unused.

### 3.8 — Cell rendering is half-shared

A shared value-cell module exports six primitives (dash, date, age, platform mark, staff, datetime). But row components still hand-render status chips, count cells, checkboxes and identifier chips with divergent classes:

- Catalog renders **bespoke status chips** (`border-amber-200 bg-amber-50 …` / `bg-surface-sunken …` / bare text) rather than any shared status source of truth.
- Repair renders order and ticket as **plain spans**; Incoming/Receiving render the same concepts as typed copy-chips.
- Catalog is the only family with a row thumbnail, and uses `gap-2` where every sibling uses `gap-1.5`.
- Pickup's group summary uses `font-bold` / `font-black` weights that appear nowhere else.
- Column **alignment is not declared in the column model at all.** A shared column spec has an `align` field that is **declared but never populated and never read** — so right-alignment of numerics is hardcoded independently in each row and header component.

### 3.9 — Churn

The grid layer has been modified in **9 of the last 10 commits** (2026-07-17 → 2026-07-26). The most recent commit added the column-visibility and URL-sort waists. This is a layer mid-migration: consistency is being actively built, and the complaint is arriving in the middle of it. Any recommendation should account for **partial adoption as the steady state during migration**, not assume a greenfield rewrite.

---

## 4. Laws already ratified in-repo (do not silently overturn)

Your recommendation must compose with these or explicitly argue one should change.

1. **Compose the shared primitive; grow it when wrong; never fork a page-local twin.** A genuinely different job earns a *new sibling that composes the same primitive*, not a copy.
2. **Never mount a foreign UI grid.** AG Grid, MUI DataGrid, Glide, react-data-grid and shadcn's table are explicitly and permanently closed. TanStack Table is permitted **for state math only** — it must never own widths, markup, or virtualization.
3. **No foreign design kit.** "Better" means stronger *within* Kinetic Ledger and its existing tokens. Importing another product's visual language is out of scope.
4. **Color only from semantic tokens**; no page-local hex; themes via a data attribute.
5. **Anything durable must be URL-addressable** — a shared link must reproduce the exact view.
6. **One sticky layer per scroll port.** Pinned chrome lives *outside* the scrolling body so in-body sticky headers dock at `top-0` with no offset math.
7. **Motion budget:** opacity + transform only, sub-300ms, ease-out for discrete swaps; never animate `width`/`height`/`padding`; reduced-motion must collapse transforms to a pure opacity fade. **Never crossfade the collection map** — only the focus/detail surface.
8. **Two expand jobs, never merged:** "open this record in a detail pane" and "unfold this group's child rows" are different affordances with different controls.
9. **The select column is frozen-left and never reorderable; every other column must be user-reorderable.**
10. **Enforcement is by ratchet guard, not prose.** ~29 CI guards (typography, spacing, control-size, focus-ring, surface-box, color, queue-row chrome, column tier) hold baselines that **only shrink**. A recommendation that requires raising a baseline is a non-starter.

**Explicitly closed, do not propose:** Excel-style range-select and fill handle; per-surface search engines; schema-driven auto-CRUD; reviving the retired per-table overflow "⋯" options menu.

**Already decided and shipped, do not re-litigate:** grids open lean by default with secondary columns off and staff opting in; preferences persist as a delta rather than an absolute list; the primary queue is grid-only with no board/grid switcher.

---

## 5. Known open work (so you don't recommend it as new)

Already planned and sequenced in-repo, currently unstarted:

- **A cell-type registry** — adding an optional `cellType` to the column model plus a dispatch helper, so a column declares `date` / `age` / `orderChip` / `conditionTone` and the renderer resolves it, instead of each row hand-writing it. (Zero visual diff intended.)
- **Collapsing the ~11 bespoke `<table>`s** onto the `DataTable` primitive, growing that primitive **once** (candidates named in-repo: a row-action slot, `onRowHref`, a footer row, a density variant, an empty-state slot).
- **TanStack grouping behind the existing day bands** — gated ask-first, with an explicit bail-out clause if virtualizer indices and sticky pins misalign.
- Relocating the workbench shell module out of a domain folder (29 cross-domain importers).
- Retiring a duplicate design-token system (a separate ~10-day plan).

**Please tell us if any of these are the wrong priority order**, and specifically whether the cell-type registry or the column-semantics fix should come first.

---

## 6. Constraints on any recommendation

- **Scale:** hundreds to low-thousands of rows per view; virtualization is non-negotiable. Grouping is by day band, sometimes with a second fold level (multi-line POs / multi-item orders).
- **Environment:** desktop-first at 1080p–1440p, 8–14h shifts. Some surfaces are also used at a standing bench beside a barcode scanner, where a global focus hotkey must never be stolen.
- **Mobile:** most of these tables are **route-gated off phones entirely** — a phone hitting them hard-redirects to a mobile home. Only the floor-station routes render on mobile, where a row reflows to a **stacked flex column**, not a card. There is deliberately **no card fallback** for the desk tables.
- **Multi-tenant:** every view is org-scoped; a rollup or preference that leaks across tenants is a hard failure.
- **Editing:** one surface (the primary order queue) supports in-cell editing via portal-anchored popovers. The rest are browse/select surfaces. Assume in-cell edit will spread, but not to every station.
- **Team size:** small. A recommendation requiring a 6-week freeze will not be executed. Prefer changes with a clear ratchet: each step lands independently and is CI-enforceable.

---

## 7. The questions

### Q1 — Is the visual skin itself the problem? (the "ugly" diagnosis)

The grid currently draws **continuous full gridlines** (right + bottom rules on every cell, header and body), Airtable-style, inside a rounded raised card with a sunken header band.

- What is the 2026 dominant treatment for dense operational tables: full gridlines, horizontal-rules-only, zebra striping, or hairline-free with hover/selection as the only row delineation? Name who does what — Linear, Airtable, Notion databases, Retool, Stripe Dashboard, Shopify Admin (Polaris `IndexTable`), Atlassian/Jira, ServiceNow, Salesforce Lightning, Google Sheets, Excel on the web, Height, Attio, Rows, Sigma Computing, Hex, Snowflake/Databricks consoles.
- Has this **changed** recently? Our reading is that spreadsheet-grade products moved *toward* full gridlines (Airtable, Attio) while app-grade products moved *away* (Linear, Polaris). If so, what actually determines which side a product belongs on — in-cell editing? column count? session length? Give us the discriminator, not the taxonomy.
- Does the answer differ for a **browse** grid vs an **editable** grid **within the same product**? We have both. Is a visual difference between them good (signals editability) or bad (reads as inconsistency — exactly the complaint we received)?
- Specifically evaluate: **is the aesthetic complaint plausibly caused by the gridline density, or by something else in §3** (e.g. the 44px header over 40px rows, the seven padding values, the un-toned bespoke status chips)? If you think "ugly" is really "visually noisy," name the specific contributor you'd remove first.

### Q2 — Column semantics across sibling views (the core "inconsistent" question)

One physical entity is viewed in 3+ grids as it moves through the pipeline, and the columns rename, resize, retier and reorder at each hop (§3.1).

- **What is the standard mechanism** for keeping columns coherent across sibling views of the same entity? Candidates we can see: (a) a single global column registry per entity, with views selecting a subset; (b) per-view free authorship with a naming convention; (c) a hybrid — shared "identity/spine" columns fixed globally, view-specific columns free. Which do shipping products actually use, and how do they prevent exactly the drift in §3.1?
- Look specifically at products with **stage-based pipeline views over one entity**: Salesforce (list views over one object), ServiceNow (a table with multiple views), Jira (board vs backlog vs list over one issue type), Linear (views over one issue), Airtable (multiple views over one table), Attio, HubSpot, Zendesk (views over one ticket), Monday, Retool table sharing. **Airtable's "one table, many views" model is the closest analog we can see** — is it the right answer for a product where the "views" are different *routes with different jobs*, not saved filters?
- **Naming.** Is there an established convention for the case where the same word (`status`) genuinely means different things per stage? Do products namespace it (`delivery.status`), rename it per view (`Delivery` / `Fulfillment` / `Listing`), or force one canonical status with per-view value sets?
- **Width.** Should the width of a semantic column be global to the entity, or per-view? Our `order` column is 3.75rem on one station and 9rem on another because one carries short marketplace order IDs and the other long PO numbers. Is per-view width correct here, or is that a data-modeling smell?
- **Default visibility (tier).** Same question: should "is this column on by default" be a property of the *column* or of the *view*? Our current answer is per-view, which produced §3.1(d).
- Give us a **ruling plus a concrete data-model sketch** for a shared column registry — what lives on the entity-level column, what lives on the view-level override, and what must never be overridable.

### Q3 — Toolbar anatomy: what belongs above a table in 2026, in what order?

Our chrome is a free-for-all (§3.3): 6 of 20 surfaces have a fields menu, 4 have URL sort, 5 have no KPI strip, and KPI placement is a three-way split.

- What is the **canonical toolbar inventory and left-to-right order** for a dense ops table in 2026? Cover: view/lifecycle tabs, search, filter, sort, group, fields/columns, density, row height, export/import, saved views, bulk-action bar, result count, refresh/sync status, primary CTA.
- **What is progressive disclosure vs. always-visible?** Which of those must be a permanently visible control and which belong behind an icon or an overflow menu? Cite the systems (Polaris `IndexFilters`, Carbon `DataTable` toolbar, Atlassian, Material 3 data tables, Fluent 2 `DataGrid`, Base UI/MUI toolbar, TanStack's own recipes).
- **Should the toolbar be uniform across every table in a product, or vary by surface?** We have surfaces that genuinely differ (a read-only browse vs an editable queue vs a KPI-topped dashboard). Is a *fixed slot skeleton with empty slots* the standard answer, or is per-surface authorship correct and our error is only that the shared slots aren't shared?
- **KPI strips above tables:** should they scroll away with the body or pin with the chrome? What's the argument each way, and does the answer depend on whether the KPIs are filters (clickable) or pure readouts? Five of our surfaces have none at all — is that a gap to fill or a correct restraint?
- **Result count / total:** where does it live in 2026? We currently have it as a micro-line on one surface, inside a KPI tile on others, and absent on most.

### Q4 — Density: is user-controlled row density still standard in 2026?

We have a density system that is **fully declared and completely inert** (§3.5) — the classes exist, the URL param exists, the storage key exists, and no surface uses them. So we can either finish it or delete it.

- Is a user-facing density control (comfortable / compact, or a 3-step row height) still an expected affordance for an ops table in 2026, or has it been superseded by a single well-chosen default? Who ships it (Gmail, Jira, Linear, Airtable row height, Notion, Polaris, Carbon, Fluent) and who deliberately doesn't?
- If it should exist: what is the **standard granularity and persistence scope** — global to the user, per table, or per view? URL param, localStorage, or server-side profile? (We persist column prefs server-side per staffer per table already.)
- What are the **right row heights** for a dense ops table at 1080p/1440p on an 8–14h shift? Give numbers, and give the accessibility floor (we have a 44px tap-target rule that currently applies only to the header). Is a ~40px row too tall, about right, or too tight for this use?
- **Should the header be taller than the body rows?** Ours is 44 vs ~40. Is that intentional-good, or drift?
- If density should be **deleted** rather than finished, say so plainly and tell us what the single correct default is.

### Q5 — Selection and bulk actions

Five different selection models ship today, including one that is armed but has **no bulk bar mounted** (dead UI) and one that renders an invisible 2rem gutter for a surface that has no selection at all (§3.6).

- What's the 2026 standard: an **always-visible checkbox column**, a **hover-reveal checkbox** (checkbox replaces the row number/dot on hover), or an explicit **"select mode"** the user arms? Name who does what and what drove the change. Polaris `IndexTable`, Gmail, Linear, Airtable, Notion, Jira, Google Drive, Figma's file browser, Finder/Explorer are all relevant.
- **Is it acceptable for selection to be present on some tables in a product and absent on others?** If yes, what's the rule that makes it read as intentional rather than inconsistent? If the answer is "the gutter should collapse when selection is unavailable," confirm — that is a one-line fix for us.
- **Where does the bulk-action bar live** — pinned to the viewport bottom, floating over the table, replacing the toolbar in place, or in a header slot? What happens to it on scroll? Cite.
- **Keyboard model:** what is the expected set (space to select, shift-click range, cmd/ctrl-click, cmd-A scope, escape to clear) and how much of it is genuinely expected in 2026 vs. nice-to-have?

### Q6 — Sort: one mechanism or several?

We have three concurrent sort mechanisms and two URL param pairs on the same pages (§3.2).

- **Is header-click sort plus a separate sort dropdown ever correct in one view?** We suspect not, but one of our surfaces needs *composite* sorts ("priority", "newest") that don't map to a single column. What's the standard resolution — a sort menu that *is* the single mechanism (with columns listed in it), a header-click mechanism plus named "saved sorts", or something else?
- **Multi-column sort:** expected in 2026 for ops tables, or a power-user affordance behind a menu? What's the interaction (shift-click? explicit sort builder?) and the standard visual indication of sort priority?
- **Sort + grouping interaction.** Our grids group by day band; sorting by a column currently **silently drops the grouping**. What do products that do both actually do — sort within groups, dissolve groups, or disable one? Is silent mode-switching ever acceptable, and if not, what's the standard signal?
- **URL contract.** Is encoding sort in the URL standard for ops tools? How do products with both a *server ordering* concept and a *column sort* concept keep them from colliding? Is our two-param-pair split (`?sort=` server / `?colsort=` column) sane or a smell?
- **Default direction per column type.** Should descending-first be a property of column *type* (dates/counts descend first; text ascends) rather than authored per-station? Ours is authored per-station and has drifted (§3.2).

### Q7 — Empty, loading, and error states

Five recipes coexist, including one that shows `Loading…` as literal text inside the empty box and one that uses `opacity-20` italic ghost text (§3.4).

- **Skeleton vs spinner vs neither** for a virtualized table in 2026. Does the answer depend on expected latency? Is there a threshold below which you should show *nothing*?
- **Should the skeleton mirror the real row anatomy** (column tracks visible) or be a generic shimmer? One of our surfaces does the former and it's clearly better — is that the standard?
- What is the standard **taxonomy of empty states** for an ops table, and how many genuinely need distinct copy + CTA? We can see: first-run (no data ever), no-results-for-filter, no-results-for-search, permission-locked, error, offline. Which of these must be visually distinct?
- **Error handling:** a table is often one of several panels on a page. What's the standard for a *sub-resource* failure — degrade to empty, show an inline retryable error, or fail the page? (Our house law says degrade-not-fail; confirm or challenge.)

### Q8 — Two table tiers, or one?

We intend two tiers — a virtualized grid for ops queues, a simple HTML table for admin/settings/lifecycle lists — but the simple tier has **2 consumers while ~30 files hand-roll their own `<table>`** (§3.7).

- **Is a deliberate two-tier table system standard practice, or an anti-pattern?** Who ships two tiers on purpose (and calls them what), and who forced everything onto one primitive? What did each pay for the choice?
- If two tiers is right, **what is the correct boundary rule** — row count, virtualization need, editability, selection, or something else? Give a one-line test an engineer can apply without debate.
- If one tier is right, **what does the simple case cost** — is a virtualized grid acceptable for a 12-row settings table, or does it bring unacceptable complexity/a11y cost?
- **Semantic HTML / accessibility.** Our ops grid is CSS-grid divs with ARIA roles, not `<table>`. Is that the 2026 standard for virtualized grids, and what specifically must be right (`role="grid"` vs `role="table"`, `aria-rowcount`/`aria-rowindex` with virtualization, `aria-colindex`, focus management, screen-reader row announcement)? **Please be concrete and cite APG** — this is the area where we are least confident we're compliant, and virtualization is known to break naive ARIA row indexing.

### Q9 — Mobile and narrow viewports

Most of these tables are **route-gated off phones**; the floor-station ones reflow a row to a **stacked flex column**, not a card (§6).

- Is "this surface has no mobile version by design" a defensible 2026 position for an internal ops tool, or is it technical debt with a story? What do comparable products do — and do any of them ship an explicit desktop-only admin surface?
- For the tables that *do* need narrow-viewport support: **stacked rows vs card list vs horizontal scroll vs column-priority collapse**. Which wins for scan-heavy floor work where the operator has one hand free? We already implement automatic column collapse at breakpoints on one surface — is priority-based column collapse the right general answer?
- Is there a principled **one-line rule** for when a table earns a mobile treatment?

### Q10 — The unifying decision rule

Produce a **decision rule** an engineer can run per table surface, answering: *which tier does this table use; which columns does it get and from where; which toolbar slots does it fill; does it have selection, density, and sort, and in which form; what are its empty states.*

It must slot into the existing four-contract vocabulary (Station / Workbench / Monitor / Canvas) rather than introducing a fifth taxonomy. Where a contract already implies the answer, say so.

Ideally a compact table or a 4–6 question flowchart, not an essay.

---

## 8. Requested output format

1. **Executive answer** — 5–10 sentences. State the recommendation as a decision, up front. Include your ruling on the "ugly vs inconsistent — two diagnoses or one?" framing from §0.
2. **Industry survey** — organized **by pattern, not by company**, each with named shipping examples and citations. Flag where practice has changed recently and why.
3. **Per-question rulings** — Q1 through Q10, each with a clear verdict, the reasoning, and the strongest counter-argument you rejected.
4. **The decision rule** (Q10) as a compact table or flowchart.
5. **A column-registry data-model sketch** (Q2) — concrete enough to implement: what's entity-level, what's view-level, what's non-overridable.
6. **Reconciliation with this codebase** — an explicit list of which §4 ratified laws your recommendation composes with, and which (if any) it asks us to change, with the argument for each change.
7. **Phased implementation sketch, ordered by blast radius** — what to do first (lowest risk, highest perceived-consistency gain), what to defer, and what needs a product decision rather than an engineering one. Explicitly place the already-planned work from §5 in that order. Given a small team mid-migration (§3.9), tell us the **single highest-leverage change** if we only do one thing.
8. **Open risks** — where you're least confident, and what evidence would resolve it.

Cite sources throughout — design-system documentation (Polaris, Carbon, Material 3, Fluent 2, Atlassian, Spectrum, Primer), published product decisions and changelogs, HCI research on tabular scanning and gridline density, and WAI-ARIA APG guidance on grid/table patterns are all in scope. Where evidence is thin and you're extrapolating from convention, say so explicitly rather than dressing it up.

**One request on tone:** we have received generic "use consistent spacing and a design system" advice before and it was not actionable, because we already have both. Assume the reader has a mature token system, CI-enforced ratchet guards, and a working virtualized grid — and that the remaining problem is *semantic and organizational*, not *stylistic*. Answer at that level.
