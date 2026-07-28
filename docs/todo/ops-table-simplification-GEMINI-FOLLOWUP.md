# Follow-up brief — ops data-table simplification, round 2

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-27
**Prior round:** `ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` + your response
**Deliverable:** rulings on six blocked decisions, plus a re-ruling on accessibility given new measured evidence.

---

## 0. How to use this brief

Your round-1 answer was adopted in substantial part (§1). This round is narrower: **six decisions are blocking implementation** because your answer either (a) resolved one of our two complaints at the direct expense of the other, (b) left a question unanswered, or (c) was based on an assumption we have since measured and disproved.

Please do **not** re-argue round 1. Answer only §2–§5, and where an answer changes something you already ruled, say so explicitly.

**One meta-note that shapes everything below.** Our originating complaint had two halves — *"ugly"* and *"inconsistent station to station."* Two of your rulings fix "ugly" by introducing a **new** station-to-station visual difference. That may still be correct, but we need you to price it explicitly rather than treat the two complaints as independent. **When a fix for one complaint worsens the other, we need the trade named and a side picked.**

---

## 1. Adopted from round 1 — do not revisit

- Hybrid column registry: entity-level canonical definitions, view-level selection/order.
- Namespaced status columns (`deliveryStatus` / `fulfillmentStatus` / `listingStatus`), never a generic `status`.
- KPI rule: clickable-filter KPIs pin with chrome; pure readouts scroll away with the body.
- Sorting happens *within* groups; never silently dissolves grouping.
- Structural skeletons that mirror real column tracks; sub-resource errors degrade inline with retry.
- Two table tiers, with the boundary rule: virtualization needed (>100 rows) **or** reorderable columns **or** persisted per-user prefs → Grid; else the simple `DataTable`.
- The empty selection gutter collapses on surfaces with no selection.
- Delete the inert per-table density module; single well-chosen default; ~40px rows; keep the 44px header as a hierarchy anchor.

*(One scoping correction we applied ourselves: "delete the density system" is executed as deleting the per-table density module and its dead stylesheet rule only. The global `--cf-density` multiplier is load-bearing — it is baked into the spacing scale and every type token as `calc(<rem> * var(--cf-density, 1))`, synced across three lists in the build config and pinned by a guard test. It stays.)*

---

## 2. Three rulings where your fix worsens the other complaint

### R1 — The skin fork

**You ruled:** keep full gridlines for the editable queue, migrate the five read-only browse grids to horizontal-only rules. You argued the visual difference "is *good* — it signals affordance."

**The problem:** today **all six stations render identically** (one shared skin, driven by a single data attribute). Your change creates a visual split where none currently exists — and "inconsistent station to station" is half of the original complaint. You have resolved the noise complaint by manufacturing the variance complaint.

**Additional constraint you did not have:** an operator moves through Incoming → Unbox → Testing → Pending in a single shift, on the same monitor, on the same physical unit. The skin boundary would fall *in the middle of one continuous task*, not between unrelated areas of the product.

**Rule on this specifically:**
- Is affordance signaling worth a mid-task visual discontinuity, or does that argument only hold when the surfaces are in different areas of an app that users don't traverse consecutively?
- Is there a **third option** — one skin for all six, chosen to serve both jobs? E.g. horizontal-only rules everywhere with cell borders appearing only on hover/focus of an editable cell, or vertical rules at a much lower contrast rather than binary on/off. Do any shipping products signal editability *without* a persistent skin change (Notion, Attio, Sigma, Rows, Smartsheet, Google Sheets' read-only view)?
- If you still want the fork, **where exactly does the boundary belong** so it doesn't bisect a task — per surface, per region contract (Station vs Workbench), or per editability of the *focused cell* rather than the *table*?

### R2 — The selection fork

**You ruled:** hover-reveal checkboxes for browse surfaces, always-on for triage/bulk queues.

**Same structural objection**, plus three constraints you did not have:

1. These surfaces are used at **standing bench monitors** as well as at a desk. Hover-reveal degrades where the pointer isn't resting on the target, and several stations are operated with one hand while the other holds product.
2. Rows are **virtualized**; hover-reveal interacts badly with shift-click range selection across a windowed list (the anchor row may be unmounted).
3. Always-on Airtable-style selection on the primary queue is **already ratified in-repo** as a shipped decision.

**Rule on this specifically:** given (1)–(3), is hover-reveal still correct here, or is that a pattern optimized for pointer-precise knowledge-work tools (Linear, Notion) that does not transfer to a warehouse bench? If you hold the ruling, address the bench and virtualization cases directly. If you reverse it, say what the single selection model should be.

### R3 — Your registry deliberately preserves half the drift

**You ruled:** width and visibility tier "should be view-specific overrides," because "a marketplace order ID and a wholesale PO number require different widths" and "visibility tier is inherently contextual to the station's job."

**The consequence you did not state:** under that model, everything in the original complaint's §3.1(b) and §3.1(d) **remains legal**:
- the same `order` column stays 3.75 / 4.5 / 4.5 / 9 / 5.5 rem across five stations
- `condition` stays on-by-default on one station and hidden-by-default on three others
- `date` stays permanently-visible on three stations and hideable on two

So the registry fixes *naming* and *cell rendering* drift, and blesses *width* and *visibility* drift. That is a defensible position — but it means the registry does **not**, on its own, fix what the product owner is complaining about.

**Rule on this specifically:**
- Is per-view width genuinely correct, or is "the same logical column holds a 9-character marketplace ID here and a 22-character PO number there" a **data-modeling smell** — i.e. two different fields wearing one name? (We suspect the latter. Push back if we're wrong.)
- For tier: is there a middle position — e.g. the entity declares a **default** tier and a view may override only with a recorded reason, or tier may vary only across *different region contracts* but must be constant across views of the same contract?
- Concretely: **which of the two drifts, if either, should we actually eliminate**, and what does the user-visible improvement look like if we eliminate neither?

---

## 3. Four questions round 1 did not answer

### F1 — Two views sharing one preference bucket *(highest risk item in the inventory)*

Incoming and Receiving are two different grids with **different column sets** that persist staff column preferences under **one shared storage key**. Today this is kept safe only by a code comment warning that their tier assignments "must match key-for-king" — human vigilance, not a type.

A shared registry makes this *more* pressing, not less: once columns are entity-level, the temptation to share one preference bucket per entity grows.

**Rule on:** what is the correct scoping unit for persisted column preferences — per entity, per view, per (entity × view), or per (entity × region contract)? What do multi-view products actually key user column prefs on (Salesforce list views, Jira, Airtable views, Attio, Notion database views, ServiceNow)? Name the failure mode each scoping choice produces.

### F2 — Migrating already-saved preferences through a rename

Persisted preference keys have collided and drifted: the order column persists as `orderid` on three stations and `order` on two; two semantically different columns (a delivery state and a workflow stage) both persist under a legacy key `rest` inherited from a retired row primitive.

Adopting your registry renames these keys. Real staff have real saved preferences under the old names.

**Rule on:** the standard migration strategy for renaming persisted user-preference keys in a live multi-tenant product. Specifically: silent forward-map on read, one-time write migration, drop-and-reset with a notice, or dual-read during a deprecation window? What do design systems and product teams actually do, and what is the accepted answer when a key genuinely **merges** or **splits** (our `rest` key must split into two)? Is there a case for versioning the preference blob?

### F3 — Sort direction as a property of column *type*

Default sort direction is currently authored per station and has drifted: a quantity column descends-first on one station and ascends-first everywhere else; a price column descends-first on one and is undeclared on another.

**Rule on:** should descending-first be derived from **column type** (dates, ages, counts, currency descend first; text and identifiers ascend first) rather than authored per view? Is that the standard, and are there principled exceptions? This is the cheapest possible fix for a whole class of drift and we want to know if it's the right one.

### F4 — One virtualizer row-height estimate for six row anatomies

The windowing layer uses a **single hardcoded row-height estimate (44px)** shared by all six grid families, never overridden by any caller. Measured actual row height is ~40px, and the six families have genuinely different row anatomies (one has a thumbnail, one has a two-line stack, one has an inline editor).

**Rule on:** how much does estimate accuracy actually matter for a virtualizer at these scales (hundreds to low-thousands of rows, day-grouped, with sticky group pins)? Is the standard practice a per-surface estimate, dynamic measurement, or a fixed row height enforced by CSS so the estimate is exact? Which do high-quality implementations choose, and what is the observable symptom when the estimate is wrong by ~10%?

---

## 4. New measured evidence — please **re-rule** on accessibility

Round 1 you warned: *"Naive virtualization sets `aria-rowindex` to the rendered index (1-20), which breaks screen reader context for a 1000-row table."*

We audited. **The actual state is more fundamental than that failure mode**, and it changes the question:

| Attribute | Occurrences in the entire codebase |
|---|---|
| `role="grid"` / `role="table"` | **0** |
| `aria-rowcount` | **0** |
| `aria-rowindex` | **0** |
| `aria-colcount` / `aria-colindex` | **0** |
| `role="rowgroup"` | **0** |
| `role="gridcell"` / `role="cell"` | **0** |
| `role="row"` | 7 — **all seven are column-header rows** |
| `role="columnheader"` | 6 |

So: the grid container carries **no role and no ARIA at all**. Six header rows carry `role="row"` containing `role="columnheader"` — but they sit inside a plain `<div>` with no `grid` / `table` / `rowgroup` ancestor. **Body rows carry no row role whatsoever**; their only ARIA is on inner controls (a checkbox, a button).

The `aria-rowindex` problem you predicted **cannot arise yet**, because there is nothing to index.

Per ARIA, `row` has a required context role of `rowgroup` / `grid` / `table` / `treegrid`, and `columnheader` likewise requires a row within a table/grid context. Our current markup therefore appears to be **spec-invalid partial table semantics** — arguably worse than plain divs, because it asserts a structure that isn't there.

**Please re-rule on Q8's accessibility half, treating this as the starting state rather than a virtualization-indexing bug:**

- Is partially-applied, context-less table semantics genuinely worse than no semantics? What does a screen reader actually announce today, and is "remove the orphaned roles" a legitimate interim step while the full pattern is built?
- Give the **minimum correct implementation** for a virtualized CSS-grid table: exactly which roles and attributes are required, on which elements, and what each must be set to when only ~30 of 1,000 rows are in the DOM. Be concrete — element by element.
- **Grouped rows:** our grids are day-banded with an optional second fold level. Does that make this a `treegrid` rather than a `grid`? What do `aria-level` / `aria-posinset` / `aria-setsize` need to be, and does the day-band header become a `rowgroup` or a `row`?
- **Frozen columns** are `position: sticky` cells in normal DOM order — does that create any ARIA or focus-order problem?
- **Keyboard:** does APG's grid pattern (roving tabindex, arrow-key cell navigation, Home/End, Ctrl+Home) become mandatory once `role="grid"` is asserted? If asserting the role obligates the full keyboard contract, is `role="table"` the more honest choice for our five browse surfaces, with `role="grid"` reserved for the one editable queue? **This may be the single most useful thing you tell us** — it determines whether accessibility is a one-day fix or a multi-week one.
- Is there a **credible reference implementation** of a virtualized grid with correct ARIA we should read rather than derive? Name it.

Cite WAI-ARIA APG and the ARIA spec directly here. This is the one section where we want chapter-and-verse rather than pattern survey.

---

## 5. One cost you did not price

You ruled: *"Consolidate `?sort=` and `?colsort=` into a single URL param pair. If server ordering and column sorting are genuinely different concerns, the API is leaking into the UI."*

The architectural critique may be right, but the two concerns are genuinely different in our case: `?sort=` carries **server ordering vocabularies** (e.g. an integration-specific "newest by vendor sync date") that map to SQL ordering across joined tables and have no corresponding column in the grid. The two-pair split exists because `?sort=`/`?dir=` were already taken by that older vocabulary.

**Rule on:** is a product with both a *server ordering vocabulary* and a *column sort* obligated to unify them, or is a two-namespace URL contract legitimate? If unification is right, what is the standard migration for live deep links — and what happens to an ordering mode that has no column to attach to? If two namespaces are legitimate, what naming convention makes the split self-evident to the next engineer?

---

## 6. Requested output format

1. **Rulings on R1, R2, R3** — for each: hold or reverse, the trade named explicitly (which complaint you are choosing to satisfy and which you are accepting damage to), and the strongest counter you rejected.
2. **Answers to F1–F4** — each with a verdict and a named precedent.
3. **The accessibility re-ruling (§4)** — element-by-element minimum implementation, the `grid` vs `table` role decision with its keyboard-contract consequence, and a named reference implementation. Cite APG.
4. **The URL-namespace ruling (§5).**
5. **A revised phase order**, if anything above changes the round-1 sequencing. State plainly whether the semantic column registry is still the single highest-leverage change now that the accessibility state is known.

Same tone request as round 1: assume a mature token system, CI-enforced ratchet guards, and a working virtualized grid. The remaining problems are semantic, organizational, and now accessibility-structural — not stylistic.
