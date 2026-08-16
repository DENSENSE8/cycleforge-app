# Research briefing — Unbox capture **de-fork**: one component per concern, benchmarked against Discord-class multimodal input

> **Paste this whole file into Gemini Pro Deep Research.** It is self-contained.
> Its job is to ground a **simplification** (not a feature) in **industry-standard
> input UX** *before* Claude Code writes the unification plan. The companion
> implementation handoff is
> [`unbox-capture-component-unification-HANDOFF.md`](unbox-capture-component-unification-HANDOFF.md)
> — do **not** treat that handoff's "recommended approach" as decided; this brief
> exists to pressure-test it against best-in-class references first.

---

## Locked product complaint (do not soften)

On the Unbox scan bench, three capture concerns — **serial · condition · item
photos** — each appear in **two places at once**:

1. the **bottom action dock** (Band 1 — the fixed floor where the wedge/scanner
   and the hand live), and
2. the **in-line capture row** under the active PO line (the record editor the
   operator mouses back into).

For **item photos** these two places render the **identical component**
(`ItemPhotoCaptureStrip`). Correct, and confirmed by the operator.

For **serial** and **condition** they render **different displays for the same
job**: when the serial step is active, the dock shows a `SerialCard`-shaped field
while the in-line row shows a bare `SerialScanField`; when the condition step is
active, the dock shows an **always-expanded** A·B·C·Used bar while the in-line row
shows a **collapsed Tags square that expands on hover**. Two surfaces, two
grammars, one job. The operator sees the bench "change shape" between the dock and
the row, and it reads as two different tools.

**The ask:** for each concern, the dock slot and the in-line row must compose the
**same exact component** (as photos already do), and we should **simplify** while
unifying — retire the older/forked component, keep the one the operator confirmed
is right (the in-line set). This is a **de-fork + compose** refactor.

**Why a research brief instead of just doing it:** the "keep the in-line one" bias
is an operator preference, not a validated pattern. Before we delete a component,
we want the *industry law* that says which primitive to keep, how ONE primitive
serves TWO loci without forking, and where (if anywhere) a documented divergence
is actually correct (e.g. multi-quantity serial explosion). **Establish the
industry standard first; derive our plan from it.**

---

## 0. How Gemini must work

### 0.1 Verify in the repo (mandatory)
Every claim in §2 is drawn from live source. Open the files in §7 and correct any
statement that has drifted. Do **not** re-guess composition from memory.

### 0.2 Search the web (mandatory for D1 + D2)
The core deliverable is a **comparable analysis of best-in-class multimodal /
contextual input surfaces**, Discord-class **first**, then WMS/retail. Cite real,
current product behavior (2024–2026), not blog theory. Minimum reference set in
§4; add better ones.

### 0.3 Two questions (answer separately — never fuse)

- **Q1 — the industry law (do this FIRST).** What is the best-in-class pattern for
  a keyboard/scanner-driven capture control that must appear in **two loci** — a
  fixed action bar *and* an in-record editable row — as **one component with
  contextual affordances**, with exactly one focus/wedge owner at a time? Derive a
  small set of **falsifiable principles** from Discord-class references + WMS.
- **Q2 — our delta.** Apply Q1's law to serial / condition / photos. For each:
  which component is the **keeper**, which is **retired**, what are the
  **contextual variant props** that let the dock slot and the in-line row compose
  the *identical* component, and where (if at all) a divergence is genuinely
  correct with a stated reason.

Never answer Q2 before Q1. The plan must be *downstream* of the industry law.

### 0.4 Deliverables (keep as separate numbered sections)

- **D1 — Comparable matrix.** One row per reference (Discord, Slack, Linear,
  Superhuman, Notion, Shopify POS, Square, a Zebra/Honeywell/Manhattan/Körber WMS,
  Retool, Airtable, Figma). Columns: *single vs forked input · contextual-affordance
  mechanism · focus/wedge discipline · single-vs-multi value handling · the one
  lesson we should steal.* Discord row first and most detailed.
- **D2 — The unification law.** 4–7 falsifiable principles (Q1 answer).
- **D3 — Serial verdict.** Keeper + retire list + wedge-owner rule + the
  single-vs-multi-quantity decision (see §2.3, handoff D2), with industry backing.
- **D4 — Condition verdict.** The single variant both loci show (handoff D1:
  collapsed-Tags-everywhere vs always-expanded-in-dock), argued from bench speed +
  Fitts reach, not taste.
- **D5 — Photos confirmation.** Why it is already the reference shape, stated as
  the pattern the other two must match (so D3/D4 have a concrete target).
- **D6 — Shared-component API per concern.** The exact prop that switches *locus
  behavior only* (wedge-owner/autofocus, single-vs-multi, collapsed-vs-expanded) —
  proving one component, two loci, no fork.
- **D7 — Retirement + guard shape.** The delete/allowlist sequence and the
  anti-fork guard (`unbox-capture-shared-component.guard.test.ts`) that pins
  "dock slot and in-line row reach the same component per concern."
- **D8 — Risks / do-not-break.** Map each §5 constraint to how the unification
  could violate it.

### 0.5 Paste prompt (give Gemini this whole file)
> You are advising on a warehouse-ops (WMS) scan-bench UI. Do **industry-standard
> input-UX research first** (Discord-class multimodal input, then retail/WMS
> capture), derive a falsifiable "one primitive, contextual affordances, single
> focus owner, two loci" law, and only then map it onto three specific capture
> components (serial, condition, item photos) that today fork between a dock and an
> in-line row. Verify the code facts in §7 before recommending. Produce D1–D8 as
> separate sections. Do not reopen the closed decisions in §3.

---

## 1. Product + design-system frame (non-negotiable)

### 1.1 Kinetic Ledger — five laws
Data-first reseller ops: dense, state-colored, scan-aware. **Facts drive chrome;
chrome never invents a second story. Compose named shells; grow the SoT when
wrong; never fork a page-local twin for the same job.** This brief is literally an
application of the last clause.

### 1.2 The dual-loci law (already decided — cite, do not reopen)
Unbox runs **dual edit loci**: the **dock owns input / the wedge / the scanner**;
**every editable in-line row is a state visualizer + mouse go-back editor**. The
contract is *same component, single wedge & scan-sink owner*. The dock instance
holds the wedge (autofocus + one scan sink per `po-line:<lineId>`); the in-line
instance is a go-back editor that must **not** register a competing sink or steal
autofocus. Photos already honors this; serial/condition must.

### 1.3 The dock is a flush two-band floor (geometry law — do not break)
Band 1 is a **flush instrument**: `h-11`, host `gap-0` · `items-stretch`, every
control a **full-height abutting segment** — never a content-sized chip floating
in air. **Serial dominance:** while the serial step is active, the serial field
owns **≥80%** of the floor band. Any shared component you drop into the dock slot
must satisfy this (guard: `unbox-dock-one-shell.guard.test.ts`).

### 1.4 The moving outline (Phase 1 — preserve its markers)
A `2px` inset accent outline tracks the active step onto the in-line capture face.
It keys off `data-active-step` (on `data-capture-row`) → lighting
`[data-capture-segment="serial|photos"]` / `[data-capture-condition]`. **Whatever
shared component you compose must keep these data markers**, or the outline loses
its target (guard: `active-step-ring.guard.test.ts`).

---

## 2. Current implementation — measured (open these; do not re-guess)

### 2.0 The three concerns, side by side (from live source)

| Concern | Dock (Band 1) renders | In-line `PoLineCaptureRow` renders | Verdict |
|---|---|---|---|
| **Item photos** | `ItemPhotoDockControl` → `ItemPhotoCaptureStrip` → `PhotoStepDockStrip` | `ItemPhotoCaptureStrip` → `PhotoStepDockStrip` | **UNIFIED (golden)** — same component + same internal strip, both loci |
| **Serial** | `SerialDockControl` slot → `UnboxSerialStepSurface` → **single-qty** `SerialCard` (wraps `SerialScanField`) / **multi-qty** `ReceivingUnitRows` | `SerialScanField` (bare, `appearance="flush"`) | **FORK** at the wrapper + a real multi-qty display divergence |
| **Condition** | `ConditionDockControl` slot → `ConditionPills collapsible={false} layout="barDistribute"` (always-expanded bar) | `ConditionPills collapsible startCollapsed layout="barDistribute" labelVariant="full"` (collapsed Tags → hover-expand → pick-collapses-advances) | **FORK** — *same component, different variant props* |

### 2.1 Photos — the reference (already correct)
`ItemPhotoCaptureStrip` is the ONE photo component. It internally composes
`PhotoStepDockStrip`: three equal `flex-1` flush segments
`[ Link a photo | Upload photos | Send to phone ]`, hairline divide, no host gap.
- **Dock** mounts it via `ItemPhotoDockControl` — a pure ~10-line context→props
  mapper (verified: it does nothing but pass `receivingId/lineId/staffId/poRef`).
- **In-line** mounts the *same* `ItemPhotoCaptureStrip` directly (`hostMarker="data-po-line-item-photos"`, `emptyFallback={false}`).
- Result: identical display in both loci, one source, zero drift. **This is the
  target shape for the other two.**

### 2.2 Serial — the shared leaf already exists; the fork is the wrapping
`SerialScanField` is *already* documented as the shared serial leaf ("Composed by
`SerialCard` (legacy lanes) and `PoLineCaptureRow` (Unbox in-row open panel).
Never fork a second serial-field implementation."). So the leaf is not the fork —
the **wrapping** is:
- **In-line:** `PoLineCaptureRow` mounts `SerialScanField` **bare**, `autoFocusSerial={false}` by default (it does not fight for the wedge).
- **Dock:** `UnboxSerialStepSurface` (single-qty) mounts `SerialCard embedded showSavedChips={false}` — i.e. `SerialScanField` **plus** an embedded flush wrapper, an (unused-here) condition picker slot, a `resultSlot` for `SerialMatchResult` (RETURN lookup), and inline-notice plumbing. It **owns the wedge**: `useRegisterScanSink({ id: 'po-line:<lineId>' })` + autofocus + `receiving-focus-scan`.
- So the visible fork is: dock = `SerialCard`-framed field with match-result slot; in-line = raw field. The keeper leaf is agreed (`SerialScanField`); the question is whether the dock still needs `SerialCard` at all, or can compose the same bare field the in-line uses + a thin match-result slot.

### 2.3 Serial multi-quantity — a **real** display divergence (decide, don't assume)
- **Dock, multi-qty:** `UnboxSerialStepSurface` branches to `ReceivingUnitRows`
  (`hideCondition`) — **N selectable serial rows** in an `h-11` horizontal-scroll
  strip, one per physical unit.
- **In-line, multi-qty:** `PoLineUnitCaptureList` → **one** `PoLineCaptureRow`
  capture face + (`qtyRollup`) `BulkQuantityPanel`, or (`unitTrack`) the single
  face; multi-unit browse lives in Units Displays, **not** N rows.
- This is the sharpest divergence and it may be *legitimately two displays for two
  loci* (a fixed floor that shows N unit slots vs an in-record face that rolls
  up + defers unit browse to a Display). **D3 must rule this explicitly** —
  converge to one, or keep two with a stated reason + guard (handoff D2).

### 2.4 Condition — same component, forked *variant*
Both loci already mount `ConditionPills` (one component, supports both
`collapsible` Tags and `barDistribute` bar). The fork is purely **props**:
- **Dock:** `collapsible={false} layout="barDistribute"` → a full-width,
  always-expanded A·B·C·Used bar (every grade always visible; grade = one tap).
- **In-line:** `collapsible startCollapsed expanded={condExpanded} layout="barDistribute" labelVariant="full"` → a collapsed **Tags square** (default `USED_A`) that **expands on hover** and **collapses + advances to serial on pick**.
- Same widget, two grammars. **D4 must pick one** (handoff D1), justified by bench
  ergonomics: always-visible-grades (fewer interactions, more floor width) vs
  collapsed-progressive (less chrome, hover-to-expand, matches the in-line trio
  rhythm). This is a genuine speed/reach trade an industry survey can adjudicate
  (segmented-control reach vs progressive-disclosure density).

---

## 3. Locked / closed — do NOT recommend reopening (Ask-first only)

- **Photos is the reference and is correct.** Do not "improve" it; use it as the
  shape D3/D4 must match.
- **The dual-loci law is decided** (dock = wedge input, in-line = go-back editor).
  Do not propose collapsing to a single locus or moving the wedge to the in-line
  row.
- **`SerialScanField` is the keeper serial leaf.** Do not propose a new serial
  input primitive.
- **`ConditionPills` is the keeper condition primitive.** Do not propose a new
  grade control; the only open question is which single *variant* both loci use.
- **The no-serial waiver is the single `serial_absent` store.** Do not grow a
  second waiver on either locus (guard: `per-unit-no-serial-ui.guard.test.ts`).
- **The flush floor geometry, the wedge single-owner rule, and the moving-outline
  markers are law** (§1.3, §1.4, §5). A recommendation that breaks any of these is
  out of scope.
- **Porting to sibling stations (Testing / Arrival) is out of scope** — Unbox
  dogfood first.

---

## 4. Reference set for D1 (Discord-class first, then retail/WMS)

Survey these; the thesis to validate or refine is **"one input primitive per
concern, contextual affordances, single focus owner, rendered in whatever locus
needs it — never a second component for the same job."**

**Multimodal / contextual composers (the archetype):**
- **Discord** *(lead reference)* — the message composer is ONE text field. Attachments arrive by drag / paste / `+` picker and render as a tray on the **same** composer, never a second input; slash-commands, mentions, and emoji resolve as **contextual overlays over the same field**; the `+` affordance and drag and paste all fan into **one** upload path. This is exactly our target: one surface, contextual affordances, one focus owner.
- **Slack** — composer + formatting toolbar + file tray on one input; how it keeps a single focus target while exposing many verbs.
- **Superhuman / Linear** — keyboard-first, single-focus discipline, command palette; how a "primary action bar" and an "in-record editor" stay the same control.
- **Notion** — slash menu + inline block transforms: one editable surface, contextual mode changes, no forked "command field."

**Retail / point-of-sale capture:**
- **Shopify POS** and **Square Register** — barcode scan + attribute/variant pickers with a single scanner focus; how a scan target and a manual-entry field coexist as one.

**Warehouse / handheld WMS (closest domain):**
- **Zebra / Honeywell** device UIs, **Manhattan Active WM**, **Körber**, **Blue Yonder** — serial/lot/qty capture, condition/disposition pickers, **keyboard-wedge focus discipline** ("one active field," auto-advance, re-focus after submit), and the single-vs-multi-unit entry pattern (one field that accepts N vs N discrete rows).

**Cell / property editors (single-vs-multi + collapsed-vs-expanded):**
- **Airtable / Retool** — a cell shows a compact value and **expands into the full editor on focus** (same data, one primitive) — directly relevant to condition's collapsed-Tags→expanded-bar question and to serial single-vs-multi.
- **Figma properties panel** — collapsed value chip → expanded control, one component; segmented single-selects (condition grade is a segmented-control archetype).

For each, extract the **mechanism** (how one component serves multiple presentations) and the **focus rule** — those are what we port.

---

## 5. Constraints Gemini must respect (map each in D8)

- **Flush floor geometry** — Band 1 `h-11`, host `gap-0` / `items-stretch`, full-height abutting segments; serial dominance ≥80%; no soft pill; no co-mounted terminal + step studio. Guard: `unbox-dock-one-shell.guard.test.ts`.
- **Wedge / scan sink** — exactly **one** owner per `po-line:<lineId>` at a time. The dock instance owns the wedge while its step is active; the in-line go-back editor must not autofocus or register a competing sink. A shared component must expose a *prop* that decides "am I the wedge owner in this locus," not two implementations.
- **Moving outline (Phase 1)** — keep `data-capture-segment` / `data-capture-condition` / `data-capture-row` / `data-active-step` markers on the shared components.
- **Either-or dock registry** — `procedure-step-dock.guard.test.ts` (every step has a dock control **or** a declared reason) and `scan-cockpit.guard.test.ts` (step → railLeaf) stay green.
- **Capture entry single owner** — `po-line-capture-entry.guard.test.ts` ("the capture gate has exactly one owner").
- **No-serial waiver** — single `serial_absent` store (`per-unit-no-serial-ui.guard.test.ts`).
- **Multi-qty / roll-up** — `units-explosion.guard.test.ts`, `bulk-qty-display.guard.test.ts`.

---

## 6. Acceptance shape (preview — Gemini finalizes in D6/D7)

For each concern, after unification:

```text
serial     dock slot ─┐                       ┌─ in-line PoLineCaptureRow
                       ├─▶ ONE component ◀─────┤   (contextual props: wedgeOwner=false,
                       │   (SerialScanField)   │    autoFocus=false, no scan sink)
condition  dock slot ─┤                       │
                       ├─▶ ONE component ◀─────┤   (contextual props: same variant
                       │   (ConditionPills)    │    flags both loci)
photos     dock slot ─┘                       └─  ItemPhotoCaptureStrip (already this)
```

- The dock's per-concern control ends up **as thin as `ItemPhotoDockControl`**:
  mount the shared component + flush framing, map context → props.
- A guard asserts the dock slot and the in-line row reach the **same** component
  per concern (photos as the passing reference).
- The bench looks identical at each step whether the operator's eye is on the dock
  or the in-line row; the wedge lands once; the moving outline still tracks.

---

## 7. Files Gemini must open (verify §2 before recommending)

**Golden (photos — the reference):**
- `src/components/receiving/workspace/line-edit/ItemPhotoCaptureStrip.tsx`
- `src/components/receiving/workspace/line-edit/steps/dock/PhotoStepDockStrip.tsx`
- `src/components/receiving/workspace/line-edit/steps/dock/ItemPhotoDockControl.tsx`

**Serial (the fork):**
- `src/components/receiving/workspace/SerialScanField.tsx` *(keeper leaf)*
- `src/components/receiving/workspace/line-edit/steps/UnboxSerialStepSurface.tsx` *(dock fork origin)*
- `src/components/receiving/workspace/SerialCard.tsx` *(retirement candidate)*
- `src/components/receiving/workspace/ReceivingUnitRows.tsx` *(multi-qty dock explosion)*
- `src/components/receiving/workspace/line-edit/PoLineUnitCaptureList.tsx` *(in-line multi-qty path)*

**Condition (the variant fork):**
- `src/components/receiving/workspace/ConditionPills.tsx`

**In-line row + mount chain + dock wiring:**
- `src/components/receiving/workspace/line-edit/PoLineCaptureRow.tsx`
- `src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx`
- `src/components/receiving/workspace/line-edit/steps/dock/SlotDockControls.tsx`
- `src/components/receiving/workspace/line-edit/steps/dock/index.ts` *(dock registry)*
- `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` → `buildUnboxStepDock` (~L240–271) *(the exact fork origin — `conditionSlot` / `serialSlot`)*

**Law + guards:**
- `.claude/rules/pattern-evolution.md` (compose-don't-fork; retirement discipline)
- `.claude/rules/display/unbox-station.md` (dual loci; capture trio Serial→Condition→Photos)
- `.claude/rules/display/station-workbench.md` ("the card reads; the dock acts"; flush two-band floor)
- `.claude/rules/source-of-truth.md` → *Unbox centre (main)* · *Unbox dock flush floor* · *Active-step outline*
- Existing guards: `unbox-dock-one-shell.guard.test.ts` · `procedure-step-dock.guard.test.ts` · `scan-cockpit.guard.test.ts` · `active-step-ring.guard.test.ts` · `po-line-capture-entry.guard.test.ts` · `per-unit-no-serial-ui.guard.test.ts` · `units-explosion.guard.test.ts` · `bulk-qty-display.guard.test.ts`

---

## 8. Out of scope reminder

- Not re-theming or re-timing the two-band dock floor.
- Not the KNOW cockpit rail (`railLeaf`) / Displays leaves.
- Not the moving-outline *behavior* (only preserve its markers).
- Not porting to Testing / Arrival (separate port, after Unbox dogfood sign-off).
- Not a new serial or condition primitive — the keepers are named.

**Deliver D1 (industry comparable) first. The unification plan is downstream of
the law, never the other way around.**
