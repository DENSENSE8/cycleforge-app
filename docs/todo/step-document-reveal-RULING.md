# Ruling — document-bearing procedure steps

**Date:** 2026-08-01 · answers [`step-document-reveal-GEMINI-RESEARCH-BRIEFING.md`](./step-document-reveal-GEMINI-RESEARCH-BRIEFING.md)
**Status:** verdict RATIFIED · §5 ruling RATIFIED · Phase 1 host RESOLVED → **(a) Pack kit part** · Phase 1 **SHIPPED** (disclosure + DocumentSlideOver + print/acknowledgement origin)

---

## 1. Verdict — Candidate B

**In-list disclosure, document hands off to `DocumentSlideOver`.** A/E die on 420px:
a US-Letter page there is ~55% width, unreadable at 3ft standing. C is attempt #1's
failure wearing a new hat. **D dies on portability** — Pack and Testing have no
Displays strip, so D degrades into B at two of the three stations in scope and we
would build two document hosts for one component.

B's shape: the active row reveals a small fixed-height disclosure (thumbnail +
insert name + Print/View) via `framerPresence.collapseHeight`; the full read opens
the existing 640px `DocumentSlideOver`. The list never reorders and never splits.

**Right-edge grammar consequence (must be decided before code):** the slide-over is a
right-edge surface, and Unbox's right-edge surfaces are mutually exclusive by
construction. If B ever lands at Unbox, opening the document **suspends the Displays
column** and restoring it is the parked `ReceivingPushExpandStrip`. No third grammar.

## 2. §5 — the layout-animation ban HOLDS

**No exception is carved.** The requested split-reveal fails condition (1) as literally
stated: advance is at scan cadence, which is the "reflows on its own" case the law
exists to prevent. Two independent reasons it also fails on the merits:

- The active row is the operator's visual anchor. Displacing its neighbors forces eye
  re-acquisition on every scan, and §3.3's attempt #1 already paid that bill.
- Under the app-wide `MotionConfig` floor, `height` snaps. A 400px split becomes a hard
  cut — disorienting. A ~40px disclosure cut is not.

B needs no exception: `collapseHeight` is already sanctioned for low-frequency
expand/collapse, and a once-per-step disclosure of fixed small height qualifies.

**Unchanged and still binding:** tween not spring; no `setState` during render (measure
in an effect); reduced motion must be correct as a hard cut.

## 3. Evidence model — §7 Q8/Q9

Confirmation events, ranked by how hard each is to fake:

| Evidence | Trust | Notes |
|---|---|---|
| Scan of a barcode physically on the insert | durable | best, but most inserts carry no mark |
| **Print-success / spool event** | durable | the realistic default when the paper is printed at the bench |
| Scan of the bin/location the paper was picked from | durable-ish | proves the reach, not the insertion |
| Tap "included" | **none** | advisory override only, logged as acknowledgement |

**Q9 — do not mix classes silently.** Unbox's checklist is purely derived and its own
docblock stakes its credibility on that ("nothing can be ticked falsely"). Pack's is
purely acknowledged. If one list ever carries both, the acknowledgement class must be
**visibly distinct in the row**, not a step that merely happens to have been ticked by a
human. An unmarked mix corrodes the derived steps.

**Q11 — attribute, not a new step kind.** `hasReferenceDocument` / a `document` field on
the existing step declaration. A new kind breaks polymorphism the moment an existing step
(`classify`) needs a reference sheet.

**Q12 — Unbox does not need this.** Nothing goes *into* a box at Unbox; it is inbound and
evidence-derived. This is a Pack (outbound inserts) and Testing (manuals) feature that
happens to be built on a component Unbox owns. **This is the finding that creates §4.**

## 4. UNRESOLVED — Phase 1 has no host

The ruling says "ship B, render the disclosure in the active row" **and** "Unbox does not
need this." Verified against the tree, those two cannot both hold today:

| Station | Procedure list today | Can host an active-row disclosure? |
|---|---|---|
| Unbox | `UnboxProcedureChecklist` → DS `ProcedureChecklist` | yes — the only one |
| Pack | `OrderPackChecklist` — hand-ticked accordion, one row per **order line** | no such row exists |
| Testing | none | no |

`ProcedureChecklist` has exactly one consumer. Three ways out, in cost order:

- **(a) Pack kit part** — attach the document to a kit part, disclose it in
  `OrderPackChecklist`'s existing expanded line. This is the brief's own §2.5 framing
  ("a critical kit part with no document attached to it"), needs no port, and lands where
  the paper physically goes. `kit-readiness.ts` already gates on `{ id, critical }`.
- **(b) Port `ProcedureChecklist` to Pack** — replaces or wraps `OrderPackChecklist`.
  Large, and forces the Q9 derived-vs-acknowledged collision immediately.
- **(c) Build at Unbox anyway** — where the component lives, against the ruling's Q12.
  Fastest to demo, ships a feature to the station that does not need it.

**RESOLVED 2026-08-01 → (a) Pack kit part.** The only option that is both small and lands
at the station whose operator asked the question. Unbox is untouched by this lane;
`ProcedureChecklist` is not ported. Testing's manuals stay on `ManualsSection` until a
Testing-specific need is measured (§6).

## 5. Sequencing

**Phase 1 (this lane):** document attribute on the declaration + in-row disclosure via
`collapseHeight` + `DocumentSlideOver` handoff. **No auto-advance.** Evidence = print
event where the insert is printed at the bench; tap is advisory and logged as such.

**Phase 2 (after):** auto-advance, current-step-follows-scan, back/forward, the multi-qty
`n of N` loop, anchored input. The ruling is explicit that Phase 1's static list must be
observed stable on a live bench *before* cadence is accelerated — so this reveal lands
**before** that phase, not after.

### Phase 1 slice, as scoped against the tree (2026-08-01)

| # | Change | File |
|---|---|---|
| 1 | `sku_kit_parts` gains an optional document reference. **The table has no such column today** (`2026-04-07_create_sku_catalog_hub.sql`: `component_name · component_type · qty_required · required_for · is_critical · sort_order`). Dated migration + Drizzle model in the same PR (`skuKitParts`, `schema.ts:2642`). | new migration + `src/lib/drizzle/schema.ts` |
| 2 | Carry it on the DTO as an optional field — absent ⇒ today's row, unchanged | `PackKitPartDto` in `src/lib/packing/order-pack-checklist.ts` |
| 3 | Read it in the BOM query | `getKitParts` (`src/lib/neon/sku-catalog-queries.ts`) |
| 4 | `SubCheckRow` reveals thumbnail + insert name + Print/View **only when the part carries a document**, via `framerPresence.collapseHeight` through `useMotionPresence`. Fixed small height. Every other row is byte-identical to today. | `src/components/packing/PackChecklistLineRow.tsx` |
| 5 | View opens the existing `DocumentSlideOver` (640px) composing `DocumentPreviewFrame`. No second viewer. | `src/design-system/components/DocumentSlideOver.tsx` |
| 6 | Evidence: a print event ticks the part durably; the existing tap stays and is recorded as **acknowledgement**, visibly distinct per §3 Q9. `evaluateKitReadiness` is unchanged — it already gates on `{ id, critical }`. | `src/hooks/usePackingCheckPersist.ts`, `packing-checks.ts` |

**Permission constraint is live at Pack too.** `packing.*` is a distinct category from
`orders.view` (`permission-registry.ts:76–83`), so a packer holding `packing.scan_order`
may not hold `orders.view`. Document bytes must come from the Blob `source_url`, **never**
`/api/documents/:id/content`. Same split the brief flags for `tech.qc_pass`.

**Unbox is untouched.** `ProcedureChecklist`, `UnboxProcedureChecklist`,
`derive-capture-step-states.ts` and `procedure.ts` are out of this lane's file ownership.
The §3 Q11 `hasReferenceDocument` attribute is declared on the **kit part**, not on a
procedure step, until a station with a procedure list actually needs one.

**Do not build:** the split-reveal (A), the centre-canvas render (C), the widening
two-pane column (E), a second PDF viewer, or an ambient right-edge document region.

## 6. What would change the verdict

A live-bench measurement at **Testing** showing technicians spend >30% of station time
cross-referencing multi-page schematics — i.e. constantly toggling the slide-over rather
than glancing at it. That would justify C *at Testing only*, treating the document as the
primary work canvas for that persona. It would not move Pack or Unbox.

## 7. Provenance caveats

- The ruling cites `CockpitReceiptEntry.origin` at `hooks.ts:227` as an in-repo precedent
  for a `durable` vs `session` fact split. **No such symbol exists in this repo.** The
  durable/advisory distinction in §3 stands on its own merits; the citation does not.
- §7 was asked for named products with on-screen descriptions and returned three
  name-drops (ShipStation, Amazon FC PackSlip) without them. Treat §7 as reasoned opinion,
  not as the evidence base the brief requested. The §5 and §6 rulings do not depend on it.
- Hardware suggestions in the source ruling (a specific printer model) are out of scope
  and carried no reasoning; ignored.
