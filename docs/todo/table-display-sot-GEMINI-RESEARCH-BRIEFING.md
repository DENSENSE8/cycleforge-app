# Research briefing — pinning every ops table onto ONE display source of truth

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Scope:** the **display layer** of every collection table/grid — column alignment, row separation (zebra vs rules), header rendering, and which cells are editable. **Not** data fetching, sorting/filtering semantics, virtualization, or the TanStack headless waist (already landed — see §3.1).

**This brief asks you to DELETE decision points, not add features.** Every recommendation must reduce the number of places a display decision is made. A proposal that adds a prop, a variant, or a config surface is out of scope unless it *removes* at least as many per-surface decisions — say which.

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

Prior runs of briefs in this series produced plans naming files that do not exist. You have repo access.

- **Every file path you name must be one you opened.** If inferring from a naming convention, mark it `[UNVERIFIED]`.
- **Every claim about what a module does must come from reading it.** Quote a line number, a function signature, or a type field for every load-bearing claim.
- **Never attribute a rationale to this brief that is not written in it.** If supplying your own, say "my reasoning:".
- The audit in §4 was performed by hand against the working tree at commit `3dd4a61c5`. Line numbers are from that state; re-confirm them, and **report any that have moved or that you believe are wrong** — that is a useful finding, not a failure.

### 0.2 Search the web for the industry half. Also not optional.

- Cite **named systems** and **primary sources**: Airtable, Linear, Notion, Retool, AG Grid, TanStack Table, Glide Data Grid, Stripe Dashboard, Carbon (IBM), Material 3 data tables, Atlassian Design System, Shopify Polaris, Fluent 2, Nielsen Norman Group tabular-data research, WCAG 2.2 / ARIA `grid` authoring practices.
- Prefer sources dated **2024–2026**. Where practice changed since ~2020 (zebra striping is one such case), say what changed and why.
- Where the industry genuinely splits, give **both** positions, the conditions each wins under, then pick one for this codebase and say why.
- Distinguish "what a general-purpose spreadsheet product does" from "what a **dense, scan-driven warehouse-operations SaaS on a 1080p floor monitor** should do." They diverge, and this repo is the latter.

### 0.3 What "one source of truth" means here — read this or you will propose the wrong thing

This repo already has a strong SoT discipline (`.claude/rules/source-of-truth.md`). **The failure mode is not "no SoT" — it is "an SoT that stops one level too high."** The column model SoT owns *geometry* (`width`, `label`, `type`, `tier`) and every surface reads it. It does **not** own *alignment*, *row separation*, *cell icon suppression*, or *editability* — so each of the seven grid surfaces re-decides those inline, and they have drifted.

Your recommendations must land as **fields on the column model or functions derived from it**, not as new props threaded through seven components.

---

## 1. Product + house-law context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized** — physical units with serials, condition grades, test verdicts, photo evidence.

The house UI identity is **Kinetic Ledger**: data-first, dense, state-colored, scan-aware. **Legible throughput over document calm.** Read `.claude/rules/kinetic-ledger.md` and `.claude/rules/ui-design-system.md` before proposing anything visual.

Non-negotiable laws that bound your answer:

- **Compose from the named SoT first; grow it when it is wrong.** Never fork a page-local twin for the same job. (`.claude/rules/pattern-evolution.md`)
- **Color, spacing, type, z-index, elevation, focus come from tokens.** No page-local hex, no raw `z-[N]`, no hand-picked `px-N py-M`.
- **600 is the font-weight ceiling.** `font-bold` and above are banned and not loaded.
- **Never mount a foreign UI grid** (AG Grid / MUI / Glide). The answer is always "grow Kinetic Ledger."
- **DS ratchet guards exist and baselines only shrink** (`npm run verify`). A proposal that would require raising a baseline is rejected by construction.

---

## 2. The three operator-reported defects (the trigger)

The human operator reported these against the Unbox grid, with a screenshot showing: a `TRACKING` header carrying a map-pin glyph, cells below it carrying a **second** blue map-pin before each number, an `UNBO…` truncated header, and left-aligned numerics.

1. **Numbers should be right-aligned; text left-aligned. Everywhere.** Today this is decided per-surface, per-cell, by hand.
2. **Zebra stripes should be removed from all tables.** Only the dashboard Pending grid has removed them; six other surfaces still stripe.
3. **The Unbox grid specifically:** remove the map icon from the tracking *cell*; the `Unboxed` header truncates to `UNBO…`; and the product **title must not be editable**, matching the change already made on the dashboard grid.

**These three reports are symptoms of one structural cause.** Treat them as evidence, not as the work item. The work item is §3.2.

---

## 3. What already exists (do not re-invent these)

### 3.1 The landed waist

| Concern | Module |
|---|---|
| Grid shell (virtualized, day bands, groups) | `src/design-system/components/grid/LedgerGrid.tsx`, `VirtualGroupedSections.tsx` |
| Station recipe | `src/design-system/components/grid/LedgerGridSurface.tsx` |
| Column model type + TanStack lift | `src/design-system/components/grid/grid-surface-descriptor.ts` — `LedgerGridColumnModel`, `buildLedgerColumnDefs`, `makeGridSurfaceDescriptor` |
| Headless state (sort/visibility/order) | `useGridSurface.ts` (keep `"use no memo"` — React Compiler trap), `useGridColumnVisibility.ts` |
| Header justification | `grid-header-align.ts` — `gridHeaderCellAlignClass(align)` |
| Zebra parity math | `group-stripe-index.ts` |
| Column data-type → glyph | `src/components/ui/table-column-config/column-type-glyph.tsx` |
| Column-type vocabulary | `src/lib/tables/table-columns.ts` — `ColumnType`, `TableColumnSpec` |
| Shared VALUE cells | `src/components/ui/grid-cells.tsx` |
| Surface shell tokens | `src/design-system/tokens/table-surface.ts` |
| Typed identifier chips | `src/components/ui/CopyChip.tsx` |

The seven grid surfaces and their column SoTs:

| Surface | View | Column SoT |
|---|---|---|
| Pending / Tested / Packed / Shipped (dashboard) | `src/components/dashboard/orders-queue/OrdersGridView.tsx` | `src/lib/dashboard-order-row-layout.ts` |
| Unbox / History / Testing | `src/components/station/receiving-grid/ReceivingGridView.tsx` | `src/lib/receiving/receiving-grid-layout.ts` |
| Incoming | `src/components/station/incoming-grid/IncomingGridView.tsx` | `src/lib/receiving/incoming-grid-layout.ts` |
| Products catalog | `src/components/products/catalog/catalog-grid/CatalogGridView.tsx` | `src/lib/products/catalog-grid-layout.ts` |
| Repair | `src/components/repair/repair-grid/RepairGridView.tsx` | `src/lib/repair/repair-grid-layout.ts` |
| Local pickup | `src/components/receiving/pickup/grid/PickupGridView.tsx` | `src/lib/receiving/pickup-grid-layout.ts` |
| HTML `DataTable` (sibling family, not a LedgerGrid) | `src/design-system/components/DataTable/DataTable.tsx` | n/a |

### 3.2 The actual work item

> **`LedgerGridColumnModel` describes a column's geometry but not its presentation contract.** Alignment, row separation, cell-glyph suppression, and editability are each decided inline at seven call sites. Move them onto the model (or onto pure functions derived from it), delete the inline decisions, and add ratchet guards so they cannot come back.

Everything below is evidence for that sentence.

---

## 4. The audit — verified findings

### 4.1 Alignment is not in the SoT at all

`LedgerGridColumnModel` (`grid-surface-descriptor.ts:24–72`) has fields `key`, `width`, `label`, `gridLabel`, `labelFitRem`, `type`, `hideKey`, `tier`. **There is no `align` field.**

`TableColumnSpec` (`src/lib/tables/table-columns.ts:47–60`) *does* declare:

```ts
/** Horizontal content alignment (e.g. numbers right-align). Optional. */
align?: 'start' | 'end';
```

**No entry in `TABLE_COLUMNS` sets it, and no consumer reads it.** It is a vestigial field on the *legacy* row-primitive registry, not on the grid model. Confirm this — a repo-wide `align` search is the check.

Consequence — alignment is hardcoded twice per column, in two different files, in two different vocabularies:

**Headers** (the ternary the SoT was supposed to prevent):

| File | Line | Code |
|---|---|---|
| `ReceivingGridColumnHeader.tsx` | 218 | `gridHeaderCellAlignClass(column.key === 'qty' ? 'end' : 'start')` |
| `IncomingGridColumnHeader.tsx` | 216 | `gridHeaderCellAlignClass(column.key === 'qty' ? 'end' : 'start')` |
| `PickupGridColumnHeader.tsx` | 155 | `gridHeaderCellAlignClass(alignEnd ? 'end' : 'start')` |
| `CatalogGridColumnHeader.tsx` | 195 | `gridHeaderCellAlignClass()` — **always start** |
| `OrdersQueueColumnHeader.tsx` | 405 | `gridHeaderCellAlignClass()` — **always start** |

**Cells** (`justify-end` typed by hand per `data-col`):

| File | Line(s) | Right-aligned cells |
|---|---|---|
| `ReceivingGridRow.tsx` | 321 | `qty` |
| `IncomingGridRow.tsx` | 352 | `qty` |
| `CatalogGridRow.tsx` | 140, 148, 156, 164 | `channels`, `manuals`, `qc`, `orders` |
| `RepairGridRow.tsx` | 160 | `price` |
| `OrdersQueueTableRow.tsx` | — | **none** |

**The two defects this produces:**

- **Catalog and Repair headers left-align over right-aligned numeric cells.** `CatalogGridColumnHeader.tsx:195` passes no argument while four of its cells are `justify-end`. The header floats off its own numbers.
- **Pending `qty` is `type: 'number'` (`dashboard-order-row-layout.ts:104`) and is left-aligned in both header and cell.** The SoT already knows the column is numeric; nothing consumes that fact for alignment.

Note the near-miss in `grid-header-align.ts`: its doc comment says *"pass the SAME alignment the cells use, never a different one"* — an instruction to a human, enforced by nothing. That comment is the strongest possible evidence that the alignment decision belongs one level up.

### 4.2 Zebra striping — one surface removed it, six did not

The dashboard Pending grid removed the stripe under the airtable skin, with a documented rationale (`OrdersQueueTableRow.tsx:263–272`, verbatim):

> Zebra is OFF under the airtable skin. That skin already draws a full cell rule grid (right + bottom on every cell) inside a raised card frame, so a stripe is a THIRD separation system — and its fill (`surface-canvas`) is a page-canvas value tuned as a ground plane for floating cards, not a row tint, so at that luminance step the shaded rows read as a different surface rather than the same one alternately banded. Rules + hover carry row tracking here. Board / Packed / mobile keep the stripe: they have no cell rules, which is the condition zebra actually exists for.

Implemented as `const stripeRow = useAlternateStripe && !gridSkin;` (line 271).

Every other grid stripes unconditionally, with the identical hand-typed expression:

```tsx
index % 2 === 1 ? 'bg-surface-canvas' : 'bg-surface-card'
```

- `ReceivingGridRow.tsx:436–438`
- `IncomingGridRow.tsx:449–451`
- `CatalogGridRow.tsx:213–215`
- `RepairGridRow.tsx:220–222`
- plus `StationQueueRow.tsx:89` and `StationListTable.tsx:307–314` on the row-primitive family

`group-stripe-index.ts` exists purely to keep the *parity counter* correct across collapsed groups — it is a good module solving the wrong-level problem. If striping is removed, decide explicitly whether that module dies with it or survives for a legitimate remaining consumer.

**The operator wants stripes gone everywhere.** The dashboard rationale says stripes exist *for surfaces with no cell rules*. Those two statements are in tension. **Resolve it with evidence, not by deferring to either one.** The real question is whether the answer is "delete zebra" or "make every ops grid draw cell rules, at which point zebra is redundant by the dashboard's own argument." Those are different amounts of work with different risks. §7 Q2.

### 4.3 The Unbox grid — three symptoms, three distinct causes

**(a) The doubled map pin.** `TrackingChip` (`CopyChip.tsx:388–422`) defaults `showIcon` true, rendering a blue `MapPin` (tone definition at `CopyChip.tsx:88–93`). `ReceivingGridRow.tsx` case `'tracking'` renders `<TrackingChip value={…} display={getLast4(…)} />` with no suppression. Independently, the column is `type: 'location'` (`receiving-grid-layout.ts:85`), and `ColumnTypeGlyph` maps `location → MapPin` (`column-type-glyph.tsx:24`). **So the same pin is drawn twice: once in the header, once in every cell below it.**

The dashboard already solved this. `OrdersQueueTableRow.tsx:367` passes `variant: 'plain'` into `OrderIdentityChips`, whose doc (`OrderIdentityChips.tsx:71–78`) states:

> `plain` — quiet, icon-less chips for the Sheets-like queue grid: the sticky column header already labels Platform / Order / Tracking, so the leading glyphs are noise there. Copy + hover menus stay intact. Never strips icons globally — scoped to this prop.

That reasoning is correct and generalizes: **in a grid with a typed header, the cell glyph is redundant with the header glyph.** It is currently a per-call-site prop rather than a property of "being in a typed grid."

**(b) `UNBO…`.** The `stage` column is `minmax(4.5rem, 4.5rem)` with `labelFitRem: 4.5` (`receiving-grid-layout.ts:82`). `receivingGridHeaderShowsLabel` (`receiving-grid-layout.ts:106–109`) returns `trackRem >= labelFitRem` → `4.5 >= 4.5` → **true**, so the text label renders and then truncates inside the cell. Two compounding bugs:

- The fit test compares **track width against a threshold**, never against the **actual label's rendered width** — and it ignores the glyph, sort chevron, and cell padding that share the track.
- The header label is **injected at runtime**: `ReceivingGridColumnHeader` takes a `stageLabel` prop (values `Unboxed` / `Scanned` / `Tested`) and overrides the column at line 124. `Unboxed` is materially wider than the SoT's placeholder `Stage`, and the fit test never re-runs against it.

So the SoT's fit contract is being evaluated against a label the SoT does not know about. Any fix must close that hole, not just widen the track.

**(c) Editable title.** `ReceivingGridRow.tsx:276–306` mounts a `LedgerCellEditor` on the `title` cell plus `focusRing('cell')` and `titleTriggerProps`. The dashboard removed exactly this, with a rationale worth quoting in full (`OrdersQueueTableRow.tsx:716–728`):

> NOT an editable cell. The product title is a catalog fact that arrives from the marketplace listing, not an operator-authored value — and it is this row's only identity anchor, so a text caret on it (previously armed by click, Enter, F2, *or any printable key*) put a destructive typo one keystroke away. Identity columns stay read-only in the collection map; correction happens at the record plane, which house law already requires to be a complete superset of editable fields. No focus ring here either: the ring is the tell that a cell edits, and clicks must fall through to the row (open record).

This invokes the **action-planes law** (`.claude/rules/display/workbench.md` → Action planes; `.claude/rules/source-of-truth.md` → Collection-surface action planes): the **record plane must stay a complete superset** wherever the in-cell plane is unavailable. **Verify that the Unbox record plane can actually edit the title before recommending removal** — if it cannot, removing the in-cell editor makes the field unreachable, which is a worse defect than the one being fixed. This is a real gate, not a formality.

### 4.4 Summary — the four decision points that escaped the SoT

| Decision | Should live on | Lives today at |
|---|---|---|
| Horizontal alignment | column model (derivable from `type`) | 5 header ternaries + 7 hand-typed cell classes |
| Row separation (zebra vs rules) | one grid-level policy | `!gridSkin` on one surface; `index % 2` inline on six |
| Cell glyph suppression | grid-level (header is typed ⇒ cell is not) | one `variant: 'plain'` prop on one surface |
| Cell editability | column model (`editable` / identity flag) | inline `LedgerCellEditor` mounts, inconsistently |

---

## 5. Deliverable

Three separate answers, in this order.

### Part 1 — the industry answer (web research, cited)

What is 2026 best practice for each of the four decision points in §4.4, in a **dense operational data grid**? Named systems, primary sources, dated 2024–2026. Cover specifically:

1. **Numeric alignment.** Establish the actual rule, not the folk version. Right-alignment for magnitude comparison is well-established — but what about *identifiers* that are numeric-looking but not quantities (order numbers, tracking last-4, SKUs)? What about **mixed-width numerics with tabular figures** (this repo binds `tabular-nums` intrinsically to `role-data`/`role-title`/`role-display` — does that change the calculus?) And **header alignment relative to cells** — is matching mandatory, or do some systems deliberately keep headers left while right-aligning values?
2. **Row separation.** Zebra striping vs horizontal rules vs full cell grid vs whitespace-only. Cite the empirical work (there is real research here, and it is more equivocal than the design-blog consensus). Give the **conditions** each wins under: row height, column count, scan direction (across a row vs down a column), viewing distance, ambient light. This repo's operators read at 3–6 feet on a warehouse floor monitor — weight that.
3. **Redundant iconography.** When a column header carries a data-type glyph, what do Airtable / Notion / Linear / AG Grid do in the cells below it? Is header-typed + cell-typed ever correct?
4. **In-cell editability of identity columns.** What is the convention for which columns are editable in place vs only at the record level? Is "identity columns are read-only in the collection view" an actual named pattern, or is the dashboard rationale a local invention?

Where the literature splits, give both sides and the conditions.

### Part 2 — the codebase answer

Reconcile Part 1 against §4. Produce:

**(a) The target contract.** The exact field additions to `LedgerGridColumnModel` (or the exact derivation functions from `type`), with TypeScript signatures. Explicitly answer: **derive from `type`, or declare explicitly per column?** `type: 'number'` → right, `type: 'id'` → ? — `order` and `tracking` are `type: 'id'` / `'location'` and render as last-4 chips, which are neither prose nor magnitudes. Say what each of the eight `ColumnType` values resolves to and why.

**(b) A deletion-ordered migration.** Ordered waves, each independently shippable and verifiable, each naming the exact lines it deletes. Prefer the order that removes the most inline decisions first.

**(c) The guards.** This repo enforces DS law with ratchet tests (`*-tokens.guard.test.ts`, baselines only shrink, documented `ds-*` escapes). Propose the specific guard for each new rule — what it greps for, what the escape hatch is, and why that escape is genuinely needed. A rule with no guard will drift back; say so if you think one cannot be guarded.

**(d) The three operator defects,** mapped to the waves that fix them, so the human can see when each lands.

### Part 3 — the two contested calls

Answer these two explicitly and pick a side. They are the decisions the human cannot delegate to convention.

1. **Zebra: delete, or make it redundant?** The dashboard's own rationale says zebra earns its place where there are no cell rules. The operator says remove it everywhere. Is the right answer (i) delete zebra and accept rule-less surfaces lose row tracking, (ii) delete zebra *and* extend the airtable cell-rule skin to every ops grid, or (iii) something else? Cost, risk, and what breaks under each.
2. **Unbox title editability.** Given §4.3(c) and the record-plane-superset law: verify in the repo whether the Unbox record plane (`LineEditPanel` / the Unbox station workbench — see `.claude/rules/display/station-workbench.md`) can edit the product title today. If it can, recommend removal and say so. **If it cannot, removing the in-cell editor is blocked** — say that plainly and specify what must ship first.

---

## 6. Explicit non-goals

Do not propose: a foreign grid library; a new design language; a runtime theming/config UI for alignment; per-tenant display preferences; changes to sorting, filtering, virtualization, or the TanStack headless waist; changes to `DataTable` (the sibling HTML-table family) beyond stating whether the rules apply to it too; a "design tokens for tables" abstraction layer on top of the existing token modules.

Do not raise any ratchet baseline.

---

## 7. Open questions the human wants answered along the way

1. Should `TableColumnSpec.align` be **deleted** (dead field on a legacy registry) or **promoted** to the grid model? Verify it is truly unread before recommending deletion.
2. Does `group-stripe-index.ts` survive a zebra removal? If yes, who consumes it and for what?
3. `receivingGridHeaderShowsLabel` compares track width to a threshold, not to a measured label. Is a threshold ever the right model, or should the fit test take the **resolved** label (post-`stageLabel`-override) as an argument? Is there a container-query or `text-overflow`-based approach that removes the arithmetic entirely?
4. `gridHeaderCellAlignClass`'s doc comment instructs humans to keep header and cell alignment in sync. If alignment moves onto the model, does that function still need to exist, or does it collapse into the cell-class builder?
5. Seven surfaces render `index % 2 === 1 ? 'bg-surface-canvas' : 'bg-surface-card'` character-for-character. Independent of the zebra decision, is there a case for a row-shell function that owns *all* row-state fills (default / stripe / hover / selected / focused), given that `QUEUE_ROW.selectedClass` already centralizes exactly one of the five?

---

## 8. Reading order

1. `AGENTS.md`, `CLAUDE.md` — the constitution and the map.
2. `.claude/rules/kinetic-ledger.md`, `.claude/rules/ui-design-system.md` — identity, density, one-row anatomy, the type/spacing/focus token laws.
3. `.claude/rules/source-of-truth.md` — the SoT invariant list; note the *Grid column visibility + sort* and *Ops table / spreadsheet surface shell* sections.
4. `.claude/rules/display/workbench.md` — the action-planes decision table (load-bearing for §4.3(c)).
5. `.claude/rules/pattern-evolution.md` — compose → grow the SoT → compound. Read the Always / Ask-first / Never lists; your proposal must land in Always.
6. `src/design-system/DESIGN_SYSTEM.md` → *Workbench spreadsheet (SoT)*.
7. Then the code in §3.1 and the specific lines in §4.
8. `docs/todo/grid-surface-descriptor-plan.md` and `docs/todo/all-tables-improvements-EXECUTION-PROMPT.md` — the adjacent in-flight initiative. **Say explicitly where your proposal overlaps or conflicts with it.** It is granted GO for TanStack grouping and descriptor-driven Fields work; do not duplicate or contradict that.
