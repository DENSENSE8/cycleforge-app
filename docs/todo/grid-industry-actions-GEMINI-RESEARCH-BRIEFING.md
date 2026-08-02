# Research briefing — high-ROI spreadsheet actions for an ops data table

**For:** Gemini Pro (deep research) — **you do not have the codebase.** Every product constraint and current-state fact below is embedded. Do not invent file paths or claim to have inspected source.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** Which **Google Sheets / Excel / Notion / Airtable–class** data-table interactions — row highlighting, color/attention signals, bringing a row to someone’s attention, and in-cell / in-row mutation — have the **highest ROI** for a dense multi-tenant warehouse-ops SaaS queue table in 2026, and which should stay forever out of scope.
**Deliverable:** (a) industry survey with named systems + citations (prefer 2024–2026); (b) ranked ROI portfolio against the embedded constraints in §1–§3; (c) forced rulings on D1–D12; (d) a phased feature plan an engineer can implement without turning the product into a general spreadsheet/database builder.

**This brief is NOT “build Airtable” or “clone Google Sheets.”** Cycle Forge is sellable **reseller / warehouse-operations SaaS**. Spreadsheet chrome exists to raise **operator throughput on live queues** (scan, triage, dispatch, browse). Features that turn the product into a formula engine, collaborative whiteboard, or tenant-authored database are out of scope unless you prove floor ROI that clearly beats cost and cognitive load.

---

## 0. Method

### 0.1 Your job is industry research + constrained recommendation

1. **Survey the web** for how comparable products solve attention, color, highlighting, assignment, and in-grid editing on dense tables.
2. **Reconcile** every recommendation against the embedded house constraints in §1–§3. Where industry conflicts with a constraint, **pick a side and defend the deviation** (or tell us to change the constraint). Prefer a defended deviation over a generic Sheets clone.
3. **Rank by ROI** using the scoring model in §0.3. Cut ruthlessly.
4. Treat facts in §2–§3 as **ground truth about our product today.** If you need to speculate beyond them, label it `my reasoning:` — do not invent “we already have X” claims that contradict §2.

### 0.2 Sources to cover (minimum)

Cite **named systems** and **primary sources**. Prefer docs, design systems, changelogs, and research dated **2024–2026**.

| Class | Examples | Use for |
|---|---|---|
| **General spreadsheets** | Google Sheets, Excel Online / Microsoft 365, LibreOffice Calc | Fill/highlight, conditional formatting, comments, keyboard, paste |
| **Database–spreadsheet hybrids** | Airtable, Notion databases, Coda, Smartsheet, Rows | Record coloring, field types, collaborators, views, comments, automation |
| **Ops / SaaS dense tables** | Linear, Stripe Dashboard, Retool Table, Attio, Plain, Front, Zendesk agent workspace, Shopify Polaris IndexTable, IBM Carbon DataTable, Fluent 2 DataGrid | What real B2B queues ship (not hobby bases) |
| **WMS / warehouse / MES-adjacent** | At least 1–2 named warehouse, fulfillment, or inventory UIs (public docs, demos, or design writeups) | Floor-monitor / shift-handoff reality |
| **Research / a11y** | Nielsen Norman Group tabular data, WCAG 2.2, WAI-ARIA APG `grid` vs `table` | Keyboard cost vs benefit on dense floors |

Where industry splits, give **both** positions, the conditions each wins under, then pick one for **this** product and say why.

**Hard fork:** “what a spreadsheet product does” ≠ “what a dense, scan-driven warehouse-ops SaaS on a 1080p floor monitor should do.” This product is the latter.

### 0.3 ROI scoring (mandatory)

Score every candidate on **all five axes** (1–5). Report a table. Do not invent a sixth axis.

| Axis | Meaning |
|---|---|
| **Floor throughput** | Reduces time-to-decide or time-to-act on a live queue? |
| **Shift handoff** | Next operator understands the signal without Slack/tribal knowledge? |
| **Fit** | Compounds on patterns we already have (named flags, in-cell editors, multi-select bar / right rail, record inspector) vs requires a new paradigm? |
| **Blast radius** | How many surfaces, APIs, migrations, permission models, and edge cases does it touch? (5 = tiny; 1 = company-wide rewrite) |
| **Sellable SaaS** | Tenant-safe, auditable, permission-gated, not folklore for one dogfood warehouse? |

**ROI ≈ (Floor throughput × Shift handoff × Fit × Sellable) / (6 − Blast radius).**  
Rank descending. State your cut line. A beautiful feature with weak shift-handoff fails.

### 0.4 Closed forever (do not recommend unless Ask-first with strong evidence)

- Adopting a foreign grid product (AG Grid, Handsontable, MUI DataGrid, Glide, embedded Sheets) as the UI shell
- Tenant-authored table schemas / “add any column type” Airtable-as-product
- Excel fill-handle and arbitrary multi-cell range select as product features
- Full realtime collaborative cursors / OT co-edit as near-term scope
- Putting spreadsheet chrome into **scanner-first Station** regions (those are act-and-clear, not browse grids)

---

## 1. Product context (embedded)

**Cycle Forge** is multi-tenant B2B SaaS for used-goods **reseller operations**: inbound receiving, testing/QA, repair, catalog, outbound pick/pack/ship, warranty, support tickets. USAV is only the first dogfood tenant — frame everything as a **sellable product**, not an internal tool.

**Operator reality**

- Dense queues on desktop / floor monitors (often ~1080p), long shifts, mouse-first on Workbench queues, barcode scanner-first on Station benches.
- Rows are **work items** (orders, receiving lines, repair jobs, etc.), not a freeform spreadsheet of cells.
- Color and highlight must survive **shift handoff**: the next person must know *why* a row is painted.
- Status changes are lifecycle transitions with audit — not casual cell overwrites of “status” text.
- Multi-tenant: org isolation, staff permissions, and audit trails are non-negotiable on every write.

**UI identity (Kinetic Ledger)**

- Data-first, dense, state-colored, scan-aware.
- Bias: **legible throughput over document calm** (closer to Linear / Carbon / Stripe Dashboard + POS floors than to Notion whitespace).
- One virtualized spreadsheet shell for Workbench queues (“LedgerGrid”), not a zoo of table libraries.
- Inspectors float in a non-modal right rail; navigators push. Do not recommend modal-heavy edit flows as the default for queue work.

### Region contracts (use this vocabulary)

| Region | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode scanner | act-and-clear | ephemeral | very dense |
| **Workbench** | pointer | pick → edit → persist | durable / shareable | ops-dense |
| **Monitor** | filters over a stream | observe | none | rollup |
| **Canvas** | pan/zoom | reshape a definition | durable focus | studio |

**This brief is Workbench-only** (collection / queue spreadsheets). Do not propose Station scan UIs become Sheets clones.

### Four action planes (ratified — map every feature)

| Plane | Job | Example |
|---|---|---|
| **In-cell** | Edit one typed field without leaving the map | Change ship-by date in the cell |
| **Row-scoped** | Act on one row without full record | Flag this row; assign this one |
| **Multi-select** | Act on N rows | Bulk flag; bulk ship-by; bulk assign |
| **Record** | Full edit superset (relations, notes, history) | Right-rail inspector / detail page |

**One primary plane per action.** Saying “also put it everywhere” is a failed answer unless you name the primary and defend secondaries as redundancy for unavailable planes (e.g. in-cell disabled on mobile → record plane must still edit the same fields).

---

## 2. What we already ship (embedded current state)

Treat this as measured product truth as of 2026-08-01.

### 2a. Spreadsheet shell (already good enough to build on)

- Virtualized framed Workbench grid with sticky headers
- **Frozen leading identity pane** (checkbox + title / order id) — never hideable, never in-cell editable (destructive typo risk)
- Typed column headers (Airtable-like type glyphs); staff can show/hide optional columns (“Fields”)
- URL-durable sort; comfortable/compact density
- Empty state vs “no matches for this search” distinguished
- Selection wash on selected rows (blue fill). **Blue is reserved for selection** — triage colors must not use blue
- No zebra striping on the ops spreadsheet skin (hover + rules + selection + semantic wash carry tracking)
- Shell uses semantic table roles optimized for our partial keyboard contract — **full spreadsheet arrow-key cell navigation is not implemented** and is expensive

### 2b. Attention / color today

- **Named semantic row flags** exist on the **Orders / outbound dispatch queue only**:
  - `priority` (violet) — pull forward
  - `hold` (amber) — do not pick/pack yet
  - `damaged` (rose) — needs a decision
  - `awaiting_customer` (sky/teal family — not selection blue) — blocked on customer
  - `ready` (emerald) — cleared to move
- Each flag = **id + operator label + hint + row wash + dot + chip**. Not a raw swatch.
- Flags are **org-wide** (next shift sees them), with author stamped for accountability.
- Selection fill **outranks** flag wash when both apply.
- **No freeform color picker. No conditional-formatting rule builder.**
- Other queue families (Receiving, Catalog, Repair, Pickup, Warranty, Ready, …) do **not** get triage row paint today — on purpose. Catalog especially must stay display-safe (no dispatch vocabulary “for consistency”).

**House philosophy already chosen for flags:**

> A flag is a **named tag, never a raw swatch.** Colour alone does not survive shift handoff — two staffers will use yellow for different things inside a week.

Your research must **defend this**, or propose a **narrow, evidenced exception** — not casually recommend “let operators pick any color like Sheets.”

### 2c. In-cell / row mutation today

- **In-cell editing ships on Orders only** (desktop spreadsheet skin; disabled on mobile) with Enter / F2 / printable-to-edit, Esc cancel, Tab/blur commit.
- Identity columns (select, title, order id) are never in-cell editable.
- The **record inspector remains a complete superset** of anything editable in-cell.
- One secondary queue (Unfound receiving) has hand-rolled debounced in-cell PATCH on a not-yet-unified table — candidate to promote later, not a second editor paradigm.
- Most other families are browse + open-record, not Sheets-everywhere edit.

### 2d. Multi-select, assign, tickets, notes today

- Multi-select + bulk actions exist on several queues (flag, ship-by, lifecycle-scoped actions).
- Dashboard selection is moving toward a **non-modal right-rail** selection/compare plane; some benches still use a **bottom floating selection bar**.
- Staff assignment and support-ticket linkages exist as **domain workflows** (not as universal grid chrome on every table).
- Notes / comments live on **records** (order notes, line notes, ticket threads) — **not** as Google Sheets–style cell comment anchors.
- Saved views = named filter/sort URL snapshots — **not** Airtable Interfaces with personal decorative overlays.
- No collaborative live cursors; no spreadsheet undo stack (domain mutation + audit instead).

### 2e. Capability gating (how we avoid feature bleed)

Every queue declares a boolean capability bag. Conceptually:

| Capability | Meaning today |
|---|---|
| `rowTriageFlags` | May paint named triage wash (Orders only) |
| `multiSelect` | Checkbox N-select + bulk plane |
| `inCellEdit` | Sheets-style cell editors allowed |
| `fieldsMenu` | Staff column show/hide |
| `dayBands` | Sticky civil-day group headers |

**Rule:** dangerous capabilities stay off on display-safe surfaces. New shared capabilities get a bag boolean only when **≥2 families** need the gate.

### 2f. Sequencing

We already invested in **one excellent display shell**. Industry actions (this brief) are the **next** horizon — do not recommend ripping up the shell or adopting a third-party grid to “get Excel features faster.”

---

## 3. Constraints that bound every recommendation

1. **Named meaning > anonymous paint** for anything that must survive a shift handoff.
2. **Status is a state machine** with audit — never “type a new status in a cell.”
3. **Tenant + permission + audit on every write.**
4. **Identity fields locked** in-grid; correction happens in the record plane.
5. **Record plane stays superset** when in-cell is unavailable (mobile / capability off).
6. **One primary action plane** per feature.
7. **Catalog / pure browse surfaces** must not grow dispatch triage chrome.
8. **Station regions** stay scanner-short — out of scope here.
9. Prefer **growing existing patterns** (named flags, cell editor, selection bar/rail, inspector) over inventing parallel systems.
10. Prefer features that work on a **shared floor monitor** and a **personal laptop**.

---

## 4. Candidate portfolio (score all of these)

For each: industry pattern + citations · recommended plane · fit to §2 · ROI scores · **Ship now / Ship next / Defer / Never / Ask-first**.

### Cluster A — Highlight, color, attention

| ID | Candidate | Sheets / Airtable / Notion analogue |
|---|---|---|
| A1 | Named semantic row flags (org-wide tint + label) | Airtable record color; Sheets highlight; “flag” semantics |
| A2 | Freeform row/cell color picker | Sheets fill; Notion block color |
| A3 | Conditional formatting rules (formula → color) | Sheets / Excel CF |
| A4 | Assign-to-staff as the primary “attention” signal | Airtable Collaborator; Notion person; Linear assignee |
| A5 | “Needs attention” filter/lane without row paint | Filtered views; priority queues |
| A6 | Unread / recently-changed / aging heat markers | Comment indicators; SLA heat |
| A7 | Personal pin/star (private) vs org-wide flag | Gmail star vs shared label |
| A8 | Bulk apply highlight/flag from multi-select | Paint many rows; bulk field update |

### Cluster B — Change something in the row / cell

| ID | Candidate | Analogue |
|---|---|---|
| B1 | Broaden in-cell edit to more queue families | Sheets edit-anywhere |
| B2 | Strong typed editors by field kind (date, enum, qty, staff…) | Airtable field types |
| B3 | Harden Enter/F2/Tab/blur commit contract | Sheets / Excel |
| B4 | Full arrow-key cell navigation like a spreadsheet | Sheets grid focus model |
| B5 | Clipboard paste / multi-paste into grid | Sheets paste |
| B6 | Spreadsheet-style undo stack | Sheets Undo |
| B7 | Optimistic inline save + conflict UX | Airtable / Notion |

### Cluster C — Bring a human in (not just paint)

| ID | Candidate | Analogue |
|---|---|---|
| C1 | Cell-level comment threads | Sheets comments |
| C2 | Record notes opened from a row shortcut | Sheets comment UX attached to record instead of cell |
| C3 | Create / link a support ticket from a row | Helpdesk side conversation |
| C4 | Watch / subscribe to a row | Notion follow; Linear subscribe |
| C5 | @mention in notes that notifies staff | Notion / Docs mentions |
| C6 | Realtime presence / cursors on the grid | Sheets / Notion live |

### Cluster D — Structure / views (only if ROI beats A–C)

| ID | Candidate | Analogue |
|---|---|---|
| D1 | Saved views with personal decorative colors | Airtable Interfaces cosmetics |
| D2 | Arbitrary group-by column | Airtable / Sheets group |
| D3 | Board/calendar as alternate view of same grid | Airtable views |
| D4 | Filter UI glued to the table like Sheets | Filter views / IndexFilters |

### Cluster E — Multi-select dispatch

| ID | Candidate | Notes |
|---|---|---|
| E1 | Assign / send to staff (1 or N) | |
| E2 | Exact status transition (record-primary; bulk only when safe) | Must respect state machine |
| E3 | Bulk ship-by / due-date style fields | Already exists on Orders — generalize? |
| E4 | Compare 2+ selected records in side rail | |
| E5 | One selection-actions pattern across queues | Bottom bar vs right rail |

---

## 5. Industry survey questions (answer explicitly)

### Q1 — Highlight & color on ops floors

What is the 2026 best practice for making rows “pop” on dense operational tables?

- Named statuses / flags vs free color
- When conditional formatting helps vs becomes unmaintainable
- How products prevent “yellow means three different things by Friday”
- What WMS / support inbox / CRM queues actually ship vs what Sheets markets

### Q2 — “Bring to someone’s attention”

Which signal wins for shared warehouse queues?

| Pattern | Description |
|---|---|
| A | Org-wide colored flag/tag |
| B | Assignee / owner |
| C | Ticket / task created from the row |
| D | Personal star (private) |
| E | Unread / SLA / aging heat |
| F | Hybrid (name the primary + secondary) |

Separate **floor monitor shared attention** from **personal laptop attention**. They may differ.

### Q3 — In-cell edit vs side inspector

For B2B ops tables in 2026, when do products allow edit-in-grid vs force a side panel? Which field classes stay locked? What commit/cancel keyboard contract is standard? When is full spreadsheet focus navigation worth the a11y/engineering cost?

### Q4 — Comments: cell vs record

Do mature ops products put comment threads on **cells** or on **records**? Under what conditions do Sheets-style cell comments create more noise than value on a fulfillment queue?

### Q5 — Anti-patterns

List at least **seven** spreadsheet features that look impressive in demos but destroy ops-SaaS clarity, auditability, or shift handoff. Be specific.

### Q6 — Minimum “Excel-grade” bar for ops SaaS

In ≤5 bullets, define what “Excel/Sheets-grade” should mean for a warehouse-ops queue in 2026 — and in ≤5 bullets what it must **refuse** to mean.

---

## 6. Forced decisions (pick a side)

Each decision: **Current (from §2)** · options · your ruling (**Ship now / Ship next / Defer / Never / Ask-first**) · defense · primary plane · capability implication.

| # | Decision |
|---|---|
| **D1** | Freeform row/cell color picker forever **Never**, or a narrow exception? |
| **D2** | Keep named triage flags **Orders-only**, or expand to which other entities (Receiving lines, Repair, Warranty…)? What taxonomy? |
| **D3** | Primary model for “attention”: org flag · assignee · ticket · personal star · new primitive? Name secondary. |
| **D4** | Highest-ROI next in-cell expansion after Orders: Unfound-style receiving · Repair · none yet · something else? |
| **D5** | Invest in full spreadsheet arrow-key navigation, or keep partial edit keyboard + table semantics? |
| **D6** | Cell comment threads: Never, or narrow cell-anchored notes? |
| **D7** | Conditional formatting rule engine: Never / Defer / Ask-first — when would it win on an ops floor? |
| **D8** | Personal pin/star alongside org flags: both, one, or neither? How do they compose with selection blue + flag wash? |
| **D9** | Which dispatch actions dogfood first on Orders (assign, ticket, status, bulk date), and what is the **second** surface? |
| **D10** | Multi-select UI: consolidate on right rail, keep bottom bar, or two altitudes by region? |
| **D11** | Your ≤5-bullet “Excel-grade ops table” definition + ≤5-bullet refuse list. |
| **D12** | Rank the top **7** features to implement. For each: plane, build on which existing pattern from §2, size S/M/L, risk, prerequisite. |

---

## 7. Output format (mandatory)

Produce one markdown report in this order:

1. **Executive verdict** (≤12 lines) — top 7 portfolio + the one attention/color law you would tattoo on the product.
2. **Industry survey** answering Q1–Q6 with citations.
3. **ROI scoreboard** for every candidate in §4.
4. **Forced rulings D1–D12**.
5. **Phased plan** — Wave 0 (prereqs) → Wave 1 Orders dogfood → Wave 2 second surface → Wave 3 generalize. Each wave: outcomes, risks, proof ideas (E2E / audit / permission).
6. **Explicit Never / Defer** list with one-line reasons.
7. **Ask-first questions for the human** (max 5).
8. **Appendix** — citation list.

### Anti-patterns for your answer

- “Just embed Google Sheets / adopt AG Grid.”
- Freeform hex pickers without defeating the shift-handoff argument.
- Status typed freely into cells.
- Spreading dispatch triage paint to Catalog “for consistency.”
- 40-feature roadmaps with no ranking.
- Treating Notion aesthetic whitespace as the target for a floor queue.
- Assuming realtime co-edit is required for “modern.”

---

## 8. Success criteria

Research is done when a product engineer can:

1. Ship from a **ranked top-7** list with clear planes.
2. Know whether **color** means named flags forever (or your defended exception).
3. Know what **“attention”** means in product vocabulary (flag vs assign vs ticket vs star).
4. Know the **next in-cell surface** after Orders — or that there isn’t one yet.
5. Know what “Excel-grade” means **here**, including what we refuse.

---

## 9. One-line mission

> Deep-research 2024–2026 spreadsheet and ops-table patterns for highlight, color, attention, and in-row/in-cell change; rank the highest-ROI subset for a Kinetic Ledger warehouse-ops queue — and kill the rest with evidence.
