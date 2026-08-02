# Horizon B — high-ROI spreadsheet actions on LedgerGrid (verdict + plan)

**Date:** 2026-08-01 · **Status:** plan, nothing built · **Lane:** main (WS-DOGFOOD)
**Answers:** [`grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md`](grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md)
**Related:** [`table-action-bar-fields-PLAN.md`](table-action-bar-fields-PLAN.md) · [`ops-table-simplification-GEMINI-FOLLOWUP.md`](ops-table-simplification-GEMINI-FOLLOWUP.md) · [`grid-surface-descriptor-plan.md`](grid-surface-descriptor-plan.md) · [`ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md`](ledgergrid-unified-table-sot-RESEARCH-HANDOFF.md) · Horizon C (tenant extensibility, after A pin — research only until plan lands): [`tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md`](tenant-table-extensibility-HORIZON-C-GEMINI-RESEARCH-BRIEFING.md)

This doc reconciles the external research answer against the **actual repo state as of
2026-08-01**. The answer's *direction* is right and matches house law. Its *current-state
model* is stale in two places, its *ROI arithmetic* is not usable as a ranking, and one
citation is fabricated. Read §1 before acting on any number in the answer.

---

## 1. Corrections to the research answer

### 1.1 A1 and A8 are **already shipped**, not Phase-4 candidates

The answer ranks *"Named semantic row flags (org-wide tint)"* and *"Bulk flag from
multi-select"* as `SHIP`. Both landed 2026-07-31:

| Piece | Where |
|---|---|
| Flag vocabulary (5 named ids + label + hint + wash + dot + chip) | [`order-row-flags.ts`](../../src/lib/orders/order-row-flags.ts) |
| Store + writer | [`2026-07-31_order_flags.sql`](../../src/lib/migrations/2026-07-31_order_flags.sql) · [`order-flags.ts`](../../src/lib/orders/order-flags.ts) |
| Row wash gate | `ledgerRowFillClass` in [`queue-row-chrome.ts`](../../src/components/ui/queue-row-chrome.ts) |
| Row plane | [`OrdersQueueTableRow.tsx`](../../src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx) |
| Record plane | [`OrderTriageSection.tsx`](../../src/components/shipped/details-panel/OrderTriageSection.tsx) |
| **Multi-select plane (A8)** | [`BulkFlagDialog.tsx`](../../src/components/dashboard/BulkFlagDialog.tsx) + the `flag` action in [`useDashboardBulkSelection.tsx`](../../src/hooks/useDashboardBulkSelection.tsx) |

The answer's own §2b in the briefing described these as shipped; the response re-scored
them as new work. **Do not re-plan them.** What is genuinely open on the flag axis is
narrower: whether a *second* family earns `rowTriageFlags: true` (see §3.1).

Same for **A4 (assign-to-staff)**: `assign` is already a `SelectionAction` on the
dashboard (`'Assign tester / packer'`, lane-gated to pre-pack). The open part is not
"add assignment" — it is whether assignment gets a **row-scoped** plane beside the
existing multi-select one.

### 1.2 The ROI table is arithmetically inconsistent — do not rank from it

The briefing's formula is `(Throughput × Handoff × Fit × Sellable) / (6 − Blast)`, with
**blast scored 5 = tiny**. The answer restated the denominator as `/ Blast Radius` and
then used **both** conventions across rows:

| Row | Answer's ROI | `/(6−blast)` | `/blast` |
|---|---|---|---|
| B1 | 133.3 | **133.3** ✓ | 66.7 |
| A4 | 100.0 | **100.0** ✓ | 66.7 |
| A8 | 250.0 | 125.0 | **250.0** |
| B2 | 200.0 | 100.0 | **200.0** |
| A1 | 62.5 | 156.3 | 312.5 | *(matches neither)* |
| B4 | 1.8 | 9.0 | **1.8** |
| B7 | 45.0 | 90.0 | **45.0** |

Because the scales are inverted relative to each other, a row scored `blast: 5` reads as
*tiny blast* under the briefing and *huge blast* under the answer's divisor. B4 is scored
`blast: 5` **and** described as "high cost" — those cannot both be true. The verdicts
happen to be defensible on judgment; the numbers are not a basis for ordering. §2 gives a
recomputed table.

### 1.3 One citation is fabricated; one is correct and stronger than claimed

- **`hooks.ts:227` / `CockpitReceiptEntry.origin` (`'durable' | 'session'`) does not
  exist.** No such symbol anywhere in `src/`. Ignore the paragraph that builds an
  in-cell state-truth argument on it. *(The underlying point — that an in-cell edit must
  declare whether it mutates a draft or commits durably — stands on its own; it just has
  no existing precedent to copy.)*
- **`grid-aria-roles.guard.test.ts` is real** and the answer's `[UNVERIFIED]` marker can
  be dropped. It is *stronger* than the answer assumed: it not only bans `role="grid"`,
  its docblock states the rule explicitly — *"Do not 'upgrade' the role without shipping
  the keyboard model with it"* — and it records the known remaining gap (body rows carry
  no `role="row"` / `aria-rowindex`). B4 is therefore not merely low-ROI; **it is
  guard-blocked**, and the guard already names the price of unblocking it.

### 1.4 D3 and D4 are transposed

The briefing defines `D3 = board/calendar as an alternate view` and `D4 = filter UI glued
to the table`. The answer ruled `D3 = filter chips (ACCEPT)` and `D4 = board/calendar
(REJECT)` — the substance of both rulings is fine, the **ids are swapped**. Read them by
description, not by id.

Also: the briefing's header says "rulings on D1–D12" but §4 Cluster D only lists D1–D4.
The header is the typo; four candidates is the real set.

### 1.5 Coverage gap — ~20 of ~30 candidates were never scored

Scored: A1–A4, A7, A8, B1, B2, B4, B7, C1, D1–D4. **Unscored:** A5, A6, B3, B5, B6,
C2–C6, E1–E5. Several of those are cheap and sit directly on shipped primitives —
notably **A6 (aging / recently-changed heat)**, **B3 (harden the commit contract)**, and
**E5 (one selection-actions pattern across queues)**. Treat the answer as a partial
portfolio, not a complete cut line.

---

## 2. Recomputed ranking

Briefing formula, briefing blast scale (**5 = tiny**), blast values re-grounded in what
the repo would actually have to change. Shipped items dropped.

| ID | Candidate | Thru | Hand | Fit | Sell | Blast | ROI | Verdict |
|---|---|---|---|---|---|---|---|---|
| **B3** | Harden Enter/F2/Tab/blur commit contract on the one editor | 4 | 3 | 5 | 5 | 5 | **300** | Ship now |
| **B2** | Typed editors by `ColumnType` (date · enum · qty · staff) | 4 | 4 | 5 | 5 | 4 | **200** | Ship now |
| **B1** | Broaden in-cell edit to a 2nd family | 5 | 4 | 4 | 5 | 3 | **133** | Ship next (gated — §3.2) |
| **A6** | Aging / recently-changed marker (derived, no new store) | 4 | 4 | 4 | 4 | 4 | **128** | Ship next |
| **A4** | Assign-to-staff as a **row-scoped** plane | 4 | 5 | 3 | 5 | 3 | **100** | Ship next |
| **E5** | One selection-actions pattern (bar vs rail) across queues | 3 | 4 | 4 | 5 | 3 | **80** | Ship next |
| **D4→chips** | Filter chips proximal to the table | 3 | 3 | 4 | 4 | 4 | **72** | Defer to `table-action-bar-fields-PLAN` |
| **A5** | "Needs attention" lane without row paint | 3 | 3 | 3 | 4 | 4 | **54** | Defer |
| **B7** | Optimistic inline PATCH + conflict UX | 5 | 3 | 3 | 4 | 2 | **45** | Defer |
| **A7** | Personal pin/star | 3 | 1 | 2 | 3 | 4 | **9** | Defer |
| **B4** | Full arrow-key cell nav (`role="grid"`) | 3 | 1 | 1 | 3 | 1 | **1.8** | **Never** (guard-blocked) |
| **A2** | Freeform colour picker | 2 | 1 | 1 | 2 | 5 | **4** | **Never** |
| **A3** | Conditional-formatting rules | 2 | 1 | 1 | 1 | 2 | **0.5** | **Never** |
| **C1** | Cell-level comments | 1 | 2 | 1 | 3 | 2 | **1.5** | **Never** |

**Cut line: ROI ≥ 70.** Everything above it compounds on a primitive that already exists;
everything below either invents a paradigm or fails shift-handoff.

The three `Never`s are the answer's strongest contribution and they are **already house
law**, which is the point — A2 contradicts `order-row-flags.ts`'s opening rule (*"a flag
is a NAMED TAG, never a raw swatch"*), C1 contradicts the order-note grain SoT (notes
belong to the record), and B4 contradicts the ARIA guard. An external survey landing on
the same three independently is corroboration worth recording.

---

## 3. What is actually left to build

### 3.1 The flag axis: one question, not a feature

Nine descriptors set `rowTriageFlags: false`; only `orders-queue-descriptor.ts` sets
`true`. That is deliberate — triage wash is **outbound dispatch vocabulary**, and
`warranty-grid-descriptor.ts` says so in a comment. The only live question:

> Does a second family have a triage vocabulary of its own worth naming?

Answer it per family with its own words, or leave it alone. **Do not** flip
`rowTriageFlags: true` to reuse the *order* vocabulary elsewhere — `hold` and
`awaiting_customer` mean nothing on Catalog, and the guard
(`grid-surface-capabilities.guard.test.ts`) exists precisely to make that flip a
deliberate, reviewed act.

### 3.2 In-cell edit: the prerequisite the answer got right

`inCellEdit: true` on exactly one descriptor (Orders). The natural second family is the
**Unfound receiving queue** — and the answer's gate is correct for a reason it did not
state:
[`UnfoundQueueTable.tsx`](../../src/components/receiving/unfound/UnfoundQueueTable.tsx) **is
not a LedgerGrid**. It is a hand-rolled `<table className="w-full table-fixed">` with its
own debounced-PATCH inline editor (`queue-table/QueueTableRow.tsx`). Flipping a
capability on it is meaningless; it has no descriptor to flip.

So B1 on Unfound is really **two** pieces of work, in order:

1. **Port Unfound onto `LedgerGridSurface` + a descriptor** (Horizon A work — display
   parity, column model, frozen pane, Fields, capabilities bag). The hand-rolled editor
   dies with the hand-rolled table.
2. *Then* `inCellEdit: true` and wire cells to the one shared `LedgerCellEditor`.

Doing (2) without (1) creates the second editor paradigm §2c of the briefing explicitly
flagged as debt.

### 3.3 B2 / B3 — there are THREE cell editors today. Unify the ENGINE.

Full inventory of everything in the repo that lets an operator type into a value.

**Collection / grid plane — three mechanisms, one job:**

| # | Module | Lines | Mechanism | Keyboard contract | Consumers |
|---|---|---|---|---|---|
| 1 | [`LedgerCellEditor.tsx`](../../src/design-system/components/grid/LedgerCellEditor.tsx) | 161 | `absolute inset-0` opaque overlay inside the cell | Enter · Esc · Tab · blur-commits · **commit-on-unmount** | `OrdersQueueTableRow` — **`qty` only** |
| 2 | [`cell-editors.tsx`](../../src/components/dashboard/orders-queue/cell-editors.tsx) | 436 | house `Popover` / `AnchoredLayer` portal, anchored to the cell | same contract **restated in a docblock**, implemented separately ×4 | `OrdersQueueTableRow` — `note` · `condition` · `shipBy` · row menu |
| 3 | [`queue-table/QueueTableRow.tsx`](../../src/components/receiving/unfound/queue-table/QueueTableRow.tsx) | 189 | raw `<input>` / `<textarea>` in a hand-rolled `<table>` | **none** — debounced auto-PATCH, no Enter, no Esc, no revert | Unfound queue |

That is the fork. One surface (Orders) mounts **two** of them, and the keyboard contract
is written twice in prose and implemented twice in code. #3 has no contract at all — an
operator cannot cancel an edit on the Unfound queue, because Esc was never wired.

**Record plane — legitimately different jobs, NOT forks. Leave them:**

- [`ShippingEditableRow.tsx`](../../src/components/shipped/details-panel/shipping-information/ShippingEditableRow.tsx) (118) — a details-panel row with copy / paste-replace / external-link affordances. Not a grid cell; no virtualization, no cell geometry.
- [`role-editor/InlineEdit.tsx`](../../src/components/admin/roles/role-editor/InlineEdit.tsx) (33) — renames a role title on an admin card. One field, one page.

**Dead — delete:**

- [`InlineEditableValue.tsx`](../../src/design-system/components/InlineEditableValue.tsx) (130) — a DS component with **zero consumers**. Referenced only by its own file, `DESIGN_SYSTEM.md`, and the `export *` barrel that hides it from knip. It carries its own 7-value `InlineTone` map, which is a second colour vocabulary beside the semantic tokens.

#### The unification: one engine, two displays

Collapsing all three into one *component* is the wrong target and would fail — a
condition listbox and a civil-day calendar do not fit inside a 90px cell overlay, which
is exactly why #2 was written as portalled popovers in the first place. The thing that
must be single is the **engine**, not the markup:

| Layer | Single? | What it owns |
|---|---|---|
| **Engine** (`useCellEditSession`) | **Yes — one** | draft state · `replaceWith` typing-seed · normalize/validate per `ColumnType` · Enter / Esc / Tab / blur / printable · idempotent settle · commit-on-unmount (the virtualization hazard) · "commit only if changed" |
| **Display** | **Two, by geometry** | `inset` — opaque overlay in-cell (text, number, short enum) · `anchored` — portalled `Popover` for anything that cannot fit a cell (calendar, listbox, multiline note) |
| **Variant choice** | **Derived** | from the column model's existing `type: ColumnType` — never a per-call-site decision |

Two displays is a real distinction (does the editor fit in the cell?), not taste. Three
implementations of Esc is not.

**Do:** extract the engine out of `LedgerCellEditor` first, keep both display shells,
point all four Orders cells at the engine, then delete the duplicated key handling in
`cell-editors.tsx`. **Don't:** add a `typedCellMutation` capability boolean (§4), and
don't merge the record-plane editors in — different job, different plane.

B3 (commit contract) then rides along free: one engine is one place to pin the keys, and
one test file instead of three that do not exist.

### 3.4 A4 — assignment's missing plane

Assignment exists at the **multi-select** plane and the **record** plane. The gap is
**row-scoped**: "send this one to Maya" without selecting a checkbox first. That is a
single-row action in the row info menu, reusing `handleAssign`'s existing path. It needs
no capability boolean and no new store.

The answer's suggestion to route `@mention` through the right rail is right and is
already the house answer — `OrderNotesTrail` at the record plane is the one writable
note home ([`order-note-grain.guard.test.ts`](../../src/lib/orders/order-note-grain.guard.test.ts)).

---

## 4. Capability-bag ruling: reject both proposed booleans

The answer proposes adding `typedCellMutation` and `assignableRows` to
`GridSurfaceCapabilities`. **Both fail the house test** (§2e of the briefing: a new bag
boolean requires **≥2 families** needing the gate):

- **`typedCellMutation`** is redundant with `inCellEdit`. Editor *kind* is already
  derivable from `LedgerGridColumnModel.type` — that is what the model is for. A second
  boolean would let a surface be `inCellEdit: true, typedCellMutation: false`, a state
  with no meaning.
- **`assignableRows`** has exactly one family (Orders) and no second candidate named.
  Assignment is a `SelectionAction` + a row-menu item; neither reads the bag.

**The bag stays at five booleans.** If a second family later needs assignment gated, add
it then — the guard's disk walk means an undeclared mount cannot slip through in the
meantime.

---

## 5. Sequencing

| Phase | Work | Gate |
|---|---|---|
| **B-0** | This doc + record the three `Never`s in `source-of-truth.md` / `display/workbench.md` | — |
| **B-1a** | Delete `InlineEditableValue` (zero consumers) + its barrel line | `npm run verify` (knip) |
| **B-1b** | B3: extract `useCellEditSession` from `LedgerCellEditor`; point all 4 Orders cells at it; delete duplicated key handling in `cell-editors.tsx`; one contract test | `npm run verify` · `grid-column-display.guard.test.ts` |
| **B-1c** | B2: derive the display variant (`inset` vs `anchored`) from the column model's `ColumnType` | `grid-column-display.guard.test.ts` |
| **B-2** | A4 row-scoped assign (row menu → existing `handleAssign`) | `npm run verify` |
| **B-3** | A6 aging / recently-changed marker — derived from existing timestamps, **no new column, no new store** | `queue-row-chrome.guard.test.ts` |
| **B-4** | Unfound → `LedgerGridSurface` + descriptor (Horizon A port) | `grid-surface-capabilities.guard.test.ts` disk walk |
| **B-5** | `inCellEdit: true` on the Unfound descriptor; delete `queue-table/QueueTableRow` inline editor | `grid-column-tier.guard.test.ts` |

B-1 → B-3 are independent of B-4/B-5 and can land first.

---

## 6. Guards every phase inherits

Already enforced under `npm run verify` — none of this plan may raise a baseline:

- [`grid-surface-capabilities.guard.test.ts`](../../src/lib/tables/grid-surface-capabilities.guard.test.ts) — hand-listed bags **plus** a disk walk of every `<LedgerGrid` / `<LedgerGridSurface` mount
- [`grid-column-tier.guard.test.ts`](../../src/lib/tables/grid-column-tier.guard.test.ts) — frozen pane derived from `frozen`, contiguous prefix, never hideable
- [`grid-column-display.guard.test.ts`](../../src/design-system/components/grid/grid-column-display.guard.test.ts) — no row mounts an in-cell **title** editor
- [`grid-aria-roles.guard.test.ts`](../../src/design-system/components/grid/grid-aria-roles.guard.test.ts) — `role="table"` not `role="grid"`; required accessible name
- [`order-note-grain.guard.test.ts`](../../src/lib/orders/order-note-grain.guard.test.ts) — one writable note home

---

## 7. Open questions

1. **Second triage family** — does Receiving or Repair have a triage vocabulary worth
   naming, or is `rowTriageFlags` correctly a one-surface capability forever? (§3.1)
2. **A6 aging marker** — derived-only, or does "recently changed by someone else" need a
   real `changed_at`/`changed_by` read? Derived-only is the cheap version; scope it before
   building.
3. **E5** — the bottom `ContextualSelectionBar` vs the right-rail selection plane. Two
   patterns ship today; the briefing flagged it and the answer never scored it.
4. **Body-row ARIA** (`role="row"` / `aria-rowindex` through the virtualizer) stays parked
   in [`ops-table-simplification-GEMINI-FOLLOWUP.md`](ops-table-simplification-GEMINI-FOLLOWUP.md) §4 — independent of this plan.
