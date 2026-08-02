# Research briefing — Document-bearing procedure steps (reveal, motion, advance)

**For:** Gemini Pro (deep research) — this one is a genuine open question, **not** a pressure-test of a
verdict we already hold. Engineering has a leaning (§6) but no ratified default.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** A procedure step that must show a **document** (a manual / insert / paper the operator
puts in the box) — where the document renders, how the step list moves to make room for it, and what
event advances the operator to the next step.
**Status:** ANSWERED → see [`step-document-reveal-RULING.md`](./step-document-reveal-RULING.md).
Phase 1 (Pack kit-part Candidate B) ships on the ruling's host resolution (a).
The step checklist that this builds on shipped 2026-08-01 and is described in §2 as measured fact.

**Do not re-litigate — these are settled and a recommendation that reverses one will be discarded:**

| Already decided | Where |
|---|---|
| The Unbox procedure **is** the checklist. One checklist per station, derived from evidence, never hand-ticked. | `.claude/rules/display/station-workbench.md`; `UnboxProcedureChecklist.tsx` docblock |
| The procedure does **not** live in the middle of the work surface. Attempt #1 put it there and was rejected outright ("completely terrible"). | §3.3 below |
| There is no ambient always-on right-edge region. Attempt #2 built one and it was deleted the same day. | `.claude/rules/source-of-truth.md` → Right-rail modality |
| Exactly two right-edge grammars exist: a `RightRailHost` float, and a station-scoped push column. There is no third. | same |
| Step order/vocabulary is data resolved from the station declaration, never hardcoded in a view. | `src/lib/stations/procedure.ts` |

---

## 0. How to use this brief

You do **not** have the codebase. Every number and file path below was measured on 2026-08-01.

Three deliverables, in priority order:

1. **Take a side on §6** — pick one of the five candidate designs (or name a sixth) and defend it for a
   warehouse bench, not for a marketing site. We care most about candidates **B vs D**.
2. **Answer §7's numbered questions** with named product evidence. "Some apps do X" is not useful;
   "ShipStation's pack view does X, Amazon FC's PackSlip station does Y" is.
3. **Rule on §5's collision** — our motion law bans the animation being asked for. Tell us whether the
   ban is right here, and if you'd carve an exception, state the exact conditions.

Prefer a decision an engineer can implement over a framework. If your answer is "it depends", name the
variable it depends on and give us the threshold.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (a used-electronics reseller, USAV, is the dogfood
tenant). UI identity is **Kinetic Ledger**: dense, state-colored, scan-aware, quiet chrome. Crews are
1–15 people. Benches are 1080p monitors at ~3ft, operators standing, hands on product and a
keyboard-wedge barcode scanner.

Four region contracts. Only the first two matter here:

| Contract | Job | Input | Selection |
|---|---|---|---|
| **Station** | act-and-clear | **scanner** | ephemeral, never in the URL |
| **Workbench** | pick a record → edit it | pointer | durable, URL-addressable |

The stations in scope:

- **Unbox** — opens inbound cartons at the receiving dock. Has the procedure checklist today.
- **Testing (tech)** — functional test of a unit. Has a manuals viewer today, no procedure checklist.
- **Packing (packer)** — packs an outbound order. Has a *different*, hand-ticked pack checklist today,
  no procedure checklist.

The operator in the user's request is "the packer or the tech" — so **the answer must survive three
different station geometries**, and today only one of them has the surface being extended.

---

## 2. Measured anatomy (2026-08-01)

### 2.1 The procedure checklist, as shipped today

`src/design-system/components/procedure/ProcedureChecklist.tsx` — station-agnostic, dumb, knows no
domain. It renders an `<ol>` of `divide-y` rows, one per step, **in vocabulary order, never reordered**:

```
[marker] Label ..................................... summary
  ● done        blue filled circle + check
  ② active      white circle, blue ring, 1-based position number
  ○ pending     gray disc
```

- Row: `inset-cozy` padding, `truncate` label at `text-role-caption`, right-aligned summary at
  `text-role-eyebrow`.
- Active row: `bg-blue-50 ring-1 ring-inset ring-blue-400`. **Selection never size-shifts** — house law.
- Optional `onSelectStep(key)` makes rows buttons. Unbox currently passes nothing (read-only).
- Emits `data-procedure-step` / `data-procedure-state` for E2E.
- Typical step count: **5 matched, 6 unfound, 4 local pickup.** Row height ≈ 32px. The whole list is
  ~160–200px tall. **It is a small component.**

### 2.2 Where it is mounted

Unbox only, as the `checklist` display inside the right-edge **Displays push column**:

```
┌ Unbox work canvas (the carton: PO lines → label preview) ┬ Displays push column ┐
│                                                          │  Classify | Listings │
│  scan bar (focus-locked, F2)                             │  Units | Zoho |      │
│  carton identity bookmark (absolute float)               │  ►Checklist◄  ⋯      │
│                                                          │  ─────────────────   │
│  PO lines accordion                                      │  ① PO / box photos   │
│  label preview                                           │  ② Packing material  │
│                                                          │  ③ Item photos       │
│  ┌ floating composer + Print·Receive CTA ┐               │  ④ Condition         │
└──────────────────────────────────────────┴───────────────┴  ⑤ Serial            ┘
```

Geometry, measured:

| Thing | Value | Source |
|---|---|---|
| Push column default width | **420px** | `DETAIL_STACK_LAYOUT.widthPx` |
| Push column min width | 360px | `DETAIL_STACK_RESIZE.minWidthPx` |
| Push column max | viewport − 420px of Unbox canvas | `UNBOX_PUSH_MAX_WIDTH_PAD` |
| Below 1023px viewport | column **overlays** instead of squeezing | `NARROW_PUSH_MQ` |
| Column is | resizable (leading grip), collapsible to a 32px strip, Escape-closable | `UnboxPushColumn` |

**This is the constraint that most threatens the request: a PDF page rendered at 420px wide is
roughly 55% of US Letter width.** A manual's body text at that scale is ~6pt equivalent — legible on a
27" desk monitor if you lean in, not legible at 3ft standing.

### 2.3 The step vocabulary is data, not code

`src/lib/stations/procedure.ts` declares each station's ordered steps with a BPMN-derived vocabulary
(step = activity, table = data store, payload = data object). Steps carry a `phase`:

- `intake` — how work reaches the bench (scan, classify). Studio renders it; the checklist does not.
- **`capture` — the per-carton / per-unit acts. This is the slice the checklist renders.**
- `commit` — terminal acts (print, receive). Driven from the terminal dock, not the checklist.

`src/components/receiving/workspace/derive-capture-step-states.ts` resolves that declaration against
one carton's facts and returns `{ key, label, state, position, summary }[]`. Current Unbox capture
vocabulary:

| key | gate | notes |
|---|---|---|
| `classify` | unfound cartons only | identity resolution comes first |
| `po_photos` | ≥1 photo at stage `arrival_package` | **verify-only at the bench** — the bench must never *write* this stage or it voids the receive gate |
| `packing_material` | ≥1 at `unbox_carton` | dropped on local pickup (no carrier dunnage) |
| `item_photos` | ≥1 at `unbox_item` | per-unit on multi-qty |
| `condition` | **ungated** — has a NOT NULL default, renders satisfied, pointer skips it | |
| `serial` | serial captured, or an explicit no-serial waiver | |

A declared step with no gate implementation is a **CI failure**
(`procedure-divergence.guard.test.ts`), so the bench can never render a step it cannot decide.

Photo counts come from `useReceivingPhotoStageCounts`, which carries a **`settled`** flag. Consumers
must gate on it — un-hydrated zeros read as "nothing shot" and paint the wrong active step.

### 2.4 The document machinery that already exists

| Piece | What it is |
|---|---|
| `DocumentPreviewFrame` | the shared canvas: PDF `<iframe src="…#toolbar=1&navpanes=0">`, raster `<img>`, or empty/loading. **This is the SoT for station document previews.** |
| `DocumentSlideOver` | resizable right-side slide-over, **default 640px**, with a document-*type* switcher (shipping label / packing slip / manual). Composes `DocumentPreviewFrame`. |
| Manual resolution | `GET /api/manuals/resolve?itemNumber=&sku=` — org-scoped, Upstash-cached 30 min, tag-busted on catalog/manual writes. Returns Google Docs `preview` / `view` / `export?format=pdf` URLs. |
| Manual bytes | either a direct Blob `source_url`, or `/api/documents/:id/content` (which requires `orders.view`, so the Blob URL is preferred for `tech.qc_pass` operators) |
| Consumers today | Testing `ManualsSection`, Labels print workspace, order documents |

So "render the manual for this step" needs **no new document infrastructure** — the question is
purely one of placement, motion, and advance.

### 2.5 The pack station's checklist is a different thing

`OrderPackChecklist` (`src/components/packing/OrderPackChecklist.tsx`) is an accordion, one row per
order line, expanding to catalog photo + kit parts + QC steps. It is **hand-ticked**
(`tickedKitParts`, `tickedChecks`, persisted via `usePackingCheckPersist`). Readiness comes from
`evaluateKitReadiness(parts, confirmedIds, enforcement)`, where enforcement is
`block_until_matched` (hard block) or `advisory` (warn only). A kit part is `{ id, critical }`.

**"What kind of paper to include" is, today, a critical kit part with no document attached to it.**
The user's request is effectively: attach the document to that part, and show it at the moment the
operator needs it.

Note the shape mismatch: Unbox's checklist is **derived from evidence and read-only**; Pack's is
**hand-ticked and blocking**. A design that only works for one of them is half an answer.

### 2.6 Scan vocabulary

`detectStationScanType` → `TRACKING | SERIAL | FNSKU | SKU | REPAIR | COMMAND`. `COMMAND` is
currently a tiny closed set of literal words: `YES`, `USED`, `NEW`, `PARTS`, `TEST`. The focused scan
bar is a global F2 target; the most-recently-mounted bar wins.

Every station mutation already threads a client-minted `clientEventId` / `Idempotency-Key`, so a
double-fired wedge scan is a server-side no-op.

---

## 3. The request

### 3.1 Verbatim

> "adding overall animations like if it needs to display a document blob file render for a certain
> step then it should push all the completed steps up and whats on the bottom down and display the
> manual file for that step and so the packer or the tech can see what kind of paper to include then
> on scan of included or a trigger it will move to the next step"

### 3.2 Decomposed

1. A step may **carry a document** (a manual / insert / paper that physically goes in the box).
2. When that step becomes active, the list **splits at the active row**: completed steps translate
   **up**, pending steps translate **down**, and the document renders in the gap that opens.
3. The operator reads the document to know **which paper to include**.
4. A **scan** ("included") — or some other trigger — closes the document and advances to the next step.
5. The motion should feel like one system, not a per-step special case ("overall animations").

### 3.3 Two prior placements of this same procedure were rejected

Read this before recommending anything; the requested motion partially resembles the first rejection.

**Attempt #1 — the capture stack (rejected, deleted).** The procedure rendered as a bottom-anchored
stack of cards in the **middle of the work surface**, above the carton's PO accordion. It **hid
pending steps** and **reordered completed ones** to keep the current card pinned at the bottom.
Operator verdict: *"completely terrible."* Two distinct failures: (a) a read-only status display had
taken the work surface's seat, and (b) reordering made the procedure unreadable *as a procedure* —
you could not see the shape of the work before you were in it.

**Attempt #2 — the ambient region (rejected, deleted).** The procedure became a floating card pinned
to the top-right of the viewport via a new always-on region beside the right-rail host. Operator
verdict: *"an absolutely terrible display."* It was a detached overlay hanging next to the rail
rather than living in it, and it duplicated the checklist concept instead of replacing it.

**The lesson both missed, and the reason today's version works:** the procedure is not a new surface.
It is what the existing Checklist display should always have been. **A recommendation that grows a
new surface for the document is, on this evidence, likely to be rejected a third time.**

The relevant nuance for you to rule on: today's list is explicitly documented as *"steps render in
vocabulary order, always, with no reordering."* The requested motion **does not reorder** — the order
is preserved, a gap simply opens at the active row. Is that a meaningful distinction to a standing
operator, or does displacing the neighbors reproduce the disorientation that killed attempt #1?

---

## 4. What "included" means is an unsolved data question

This is not decoration; it decides whether the feature is honest.

Today's Unbox checklist derives every step from **evidence the carton already produced** — a photo
exists at a stage, a serial is captured, a grade is set. Its own docblock states the principle:

> "Nothing is ticked by hand, so nothing can be ticked falsely."

"On scan of included" fits that principle **if the scan is real evidence** — the operator scans a
barcode that is physically on the insert, so the scan proves the paper was in their hand. "…or a
trigger" does not, if the trigger is a button: a button restores exactly the hand-ticking the
current design deleted, and it will be clicked by muscle memory on a bench under time pressure.

Open sub-questions:

- **What barcode is on a warranty card, a spec sheet, or a printed manual?** In practice: often none.
  If there is no scannable mark, is the honest evidence a **photo** of the packed box with the paper
  visible? A **print event** (we printed it, therefore it exists)? Or is the step legitimately an
  *acknowledgement* rather than an *evidence* step — and if so, should the checklist grow a second
  class of step, and does that class corrupt the first?
- **Pack's existing kit-part model is already an acknowledgement model** (`tickedKitParts` +
  `block_until_matched`). So Pack has arguably already answered this question the other way. Which
  station's model should win when the two surfaces converge?
- If we do print the insert on demand, the print itself is a durable event we could gate on. Does
  "print it now" belong on the step, making the document viewer also an action surface?

---

## 5. The collision with our motion law — rule on this

This is the crux. Our house motion law (`.claude/rules/display/motion-crossfade.md`) says, verbatim
in effect:

> **Animate `opacity` + a small `transform` only; never animate layout (`width` / `height` /
> `padding`).** For height, use `grid-template-rows`. If a transition touches `width`, `height`,
> `top`, `left`, or `padding`, it is wrong.

There is **one** sanctioned exception, a deliberate PUSH toggle, with three conditions **all**
required:

1. **The operator asked for it** — an explicit toggle, once per request. *Not* on selection,
   keystroke, filter, or scan cadence. "A surface that reflows on its own is still the bug this law
   exists to prevent."
2. **Tween, never spring** (`motionBezier.layout`) — a spring overshoots the width every sibling lays
   out against.
3. **Inner content is fixed-size and edge-anchored inside an `overflow-hidden` host**, so it slides
   out from behind the frame edge instead of squashing its own rows while the host grows.

We also have `framerPresence.collapseHeight` (`height: 0 → auto`, with opacity), explicitly permitted
for *low-frequency* expand/collapse.

**The request fails condition (1) as literally stated.** Advance-to-next-step is driven by a scan, at
scan cadence, not by an operator toggling a panel. That is the exact "reflows on its own" case.

Two further hard facts you must design within:

- **Reduced motion is an app-wide floor** (`<MotionConfig reducedMotion="user">`), and we
  Playwright-measured what it actually does in framer-motion 12.42.2: transforms **snap** (24 animated
  frames → 2), `width`/`height`/`top`/`left` **snap**, layout animations are **disabled**, and
  **`opacity` keeps animating** (31 → 33 frames). So reduced motion here means *the split does not
  animate at all* — it cuts. Whatever you propose must be correct as a **hard cut**, because for some
  operators that is what ships.
- **No `setState` during render.** Attempt #2's flakiness was a child reporting a measured height to
  its parent mid-render. Any measurement happens in an effect.

**Questions for you:** Is condition (1) too strict for a *procedural* surface, where the reflow is the
operator's own work advancing rather than the app moving on its own? Would you carve an exception,
and if so what exactly bounds it — a minimum dwell time per step, a cap on how far anything travels,
a requirement that the active row stay optically fixed? Or is the correct answer that **nothing
should move at all** and the document should appear somewhere that costs the list no height?

---

## 6. Five candidate designs

Engineering leans **D**, with **B** as the strong alternative. We are not confident. Rank them.

### A — In-list split reveal (the request, literally)

The active row expands; done steps translate up, pending translate down; the document renders in the
gap inside the 420px push column.

- **For:** exactly what was asked. The document is spatially bound to the step that needs it. Zero new
  surfaces — the thing the last two rejections both got wrong.
- **Against:** a PDF at ~400px of usable width is not readable at bench distance. Violates the layout-
  animation ban at scan cadence. Under reduced motion it is a hard cut with a large jump. The column
  is only ~200px of list today, so the document dominates and pending steps get pushed below the fold
  — which is *hiding pending steps*, the specific failure of attempt #1.

### B — In-list disclosure, document hands off to `DocumentSlideOver`

The active row expands *slightly* (a thumbnail strip + the insert's name + a Print control) using the
sanctioned `collapseHeight`. Tapping/scanning opens the **existing 640px `DocumentSlideOver`** for the
full read.

- **For:** composes the document SoT instead of forking a viewer. Full-size readable page. The in-list
  motion is small and stays inside an already-sanctioned preset. Works identically at Pack and Testing,
  neither of which has a push column.
- **Against:** two surfaces to look at; the operator's eyes leave the checklist. The slide-over is a
  right-edge surface and Unbox's right-edge grammars are already mutually exclusive — we would have to
  decide whether the slide-over suspends the Displays column (probably yes) and whether that reads as
  losing your place.

### C — Document in the work canvas centre

The manual renders in the middle of the Unbox/Pack work surface while the step is active; the
checklist stays untouched in its column.

- **For:** the biggest, most readable rendering. The centre is where the operator is already looking.
- **Against:** **this is attempt #1's failure mode wearing a new hat.** The centre belongs to the
  carton / the order. A read-only reference display taking the work surface's seat was rejected in the
  strongest terms available. We would need a very strong argument that *a document you must physically
  act on* is categorically different from *a status display*. It might be — argue it if you believe it.

### D — The document IS a display, and the operator picks it

Unbox already has a right-edge **Displays** strip (Classify · Listings · Units · Zoho · Checklist, plus
overflow). The document becomes an ordinary display in that strip — auto-**offered** when the active
step carries one (a badge on the strip, and the checklist row shows a paper icon + the insert name),
and the operator switches to it with one click. The checklist never moves at all.

- **For:** it is the pattern the codebase already ratified after two failures — *"a surface that should
  stay visible while the operator works is a DISPLAY the operator picks, not a region that outranks the
  picker."* Zero layout animation, so no motion-law conflict and no reduced-motion cliff. Switching
  displays is already a crossfade we ship. Composes `DocumentPreviewFrame` inside the existing column.
- **Against:** it is **not what was asked** — nothing pushes, and the operator takes one action to see
  the paper. Still 420px wide unless they drag the column out (which persists per staff, so it is a
  one-time cost, but a discoverability problem). And Pack/Testing have no Displays strip, so they need
  a different host — likely `DocumentSlideOver` (i.e. it degrades into B).

### E — Two-pane checklist (list left, document right, inside one wide surface)

The checklist column widens when a document-bearing step is active, becoming list + document
side-by-side.

- **For:** both readable at once; no vertical displacement at all; the list stays whole and in order.
- **Against:** a width animation on the push column at scan cadence squeezes the Unbox work canvas
  under the operator's hands — worse than a height change, not better. Needs ~900px of right edge,
  which at 1440px leaves the carton canvas unusable. Probably only viable on a 1920px+ bench.

---

## 7. Numbered questions — answer these with sources

**Motion**

1. In real warehouse/pack/kitting software, does the step list **move** when a step expands, or does
   the detail open elsewhere? Name the products and describe what actually happens on screen.
2. Is there published evidence on **displacement vs. static-list** disorientation for a standing
   operator whose eyes are on product, not the screen? We care about eye re-acquisition cost after
   looking away, not about desktop reading comfort.
3. If a list must displace, what keeps the operator anchored — does the **active row stay optically
   fixed** (scroll-compensated, FLIP-style) while its neighbors move, or does the whole list slide? Is
   there an established name and a reference implementation for the anchored variant?
4. Our reduced-motion floor turns every height/transform animation into a **hard cut**. For a large
   reveal, is a hard cut acceptable, or does it argue against reveal-in-place entirely?

**Document rendering**

5. What is the minimum readable width for a scanned/PDF **product manual or insert page** on a 1080p
   monitor at ~3ft standing? Is there a usable "identify which paper this is" mode that works at
   400px — a first-page thumbnail, a cropped title band, a generated cover chip — that does not
   require reading body text?
6. **Reframe check:** the operator's actual question is *"which of these papers goes in this box?"*,
   not *"let me read this manual."* Do best-in-class pack stations answer that with a **document
   render** at all, or with a **photo of the item + a name + a count**? If the latter, the entire
   premise of rendering a blob at this step may be wrong — say so.
7. Print-on-demand: at stations that include paper, is the paper pre-picked from a bin or **printed at
   the bench during the pack**? If printing is the norm, the step's primary control is a Print button
   and the preview is secondary confirmation — which changes the design substantially.

**Advance / evidence**

8. What event do real pack stations use to confirm a **non-serialized, often unbarcoded** insert went
   in the box? Scan of a bin/location barcode? Scan of a printed-on-demand label? A photo? A tap? Rank
   them by how hard each is to fake under time pressure.
9. Is there precedent for a **single station procedure mixing evidence-derived steps with
   acknowledgement steps**, and does the mix corrode trust in the derived ones? (Our Unbox checklist is
   purely derived; our Pack checklist is purely acknowledged; this feature forces them together.)
10. **Auto-advance:** on confirm, should the next step's document open automatically, or should the
    list return to its resting state and wait? Auto-advance is faster but chains reflows; wait is calmer
    but costs an action per step. What do high-throughput stations do?

**Scope**

11. Should the document-bearing step be a **new step kind** in the procedure declaration (with its own
    gate + evidence contract), or an **attribute** on any existing step ("this step has a reference
    document")? Which generalizes better as more stations adopt the checklist?
12. Does the answer differ between Unbox (inbound, evidence-derived, no paper goes in a box) and Pack
    (outbound, acknowledged, paper genuinely goes in a box)? **Concretely: does Unbox need this feature
    at all,** or is it a Pack/Testing feature that happens to be built on Unbox's component?

---

## 8. Constraints that cannot move

Any recommendation violating one of these is unimplementable here.

- **One checklist per station.** Not two lists, not two cards, not a tab beside a tab.
- **Step order and state come from the declaration + its derivation.** A view never re-derives a gate
  and never hardcodes the steps — that breaks unfound, local pickup, returns and multi-qty.
- **No third right-edge grammar.** Float (`RightRailHost`, one occupant, app-wide) or station push
  column (`UnboxPushColumn`). Unbox's right-edge surfaces are mutually exclusive by construction.
- **The scan bar keeps focus.** Anything that steals wedge focus, or a modal that blocks the next scan,
  is a station regression. Confirmations belong on the active card, never in `window.alert`.
- **Compose `DocumentPreviewFrame`.** No second PDF viewer, no page-local iframe.
- **Tokens only** — color, spacing, type, z-index, elevation, focus from the design system. Motion
  through the named presets in `motion-framer.ts`; a hand-written cubic-bezier fails review.
- **Opacity + transform** unless you can defeat §5 on the merits.
- **Reduced motion must be correct as a hard cut.**
- **The permission split is real:** the tech operator may hold `tech.qc_pass` but not `orders.view`, so
  document bytes must come from the Blob URL, not the document-content proxy, at that station.

---

## 9. Deliverable format

1. **Verdict** — one candidate from §6 (or a named sixth), in one paragraph, with the single strongest
   reason.
2. **Ruling on §5** — does the layout-animation ban hold for a procedural reveal at scan cadence? If
   you carve an exception, give its exact conditions in the same form as our existing three.
3. **§7 answers** — numbered, each with at least one named product or source. Explicitly flag any
   question where the honest answer is "no established practice exists."
4. **Evidence model** — your recommendation for question 8, and whether acknowledgement steps may live
   beside derived ones (question 9).
5. **Sequencing** — what ships first, what needs a second phase, and what should not be built. Assume a
   phase after this one already exists and is separately planned: *the current step follows the next
   scan*, plus back/forward between steps, the multi-qty `n of N` loop, and an anchored input. Say
   whether the document reveal should land **before** or **after** that phase, and why.
6. **What would change your mind** — the measurement or user observation that would flip your verdict.
   We can run it on a live bench.

---

## 10. In-repo reading list (paths, for the engineer implementing your answer)

| Concern | File |
|---|---|
| The checklist component | `src/design-system/components/procedure/ProcedureChecklist.tsx` |
| Unbox adapter | `src/components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx` |
| Step derivation | `src/components/receiving/workspace/derive-capture-step-states.ts` |
| Step declaration | `src/lib/stations/procedure.ts` |
| Displays column host | `src/components/receiving/workspace/line-edit/UnboxPushColumn.tsx` |
| Tab registry | `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts` + `terminal/unbox-tabs.tsx` |
| Document canvas | `src/design-system/components/DocumentPreviewFrame.tsx` |
| Document slide-over | `src/design-system/components/DocumentSlideOver.tsx` |
| Manual resolution | `src/app/api/manuals/resolve/route.ts` |
| Pack checklist (the other model) | `src/components/packing/OrderPackChecklist.tsx`, `src/lib/packing/kit-readiness.ts` |
| Motion presets | `src/design-system/foundations/motion-framer.ts` |
| Motion law | `.claude/rules/display/motion-crossfade.md` |
| Station anatomy law | `.claude/rules/display/station-workbench.md` |
| Right-edge grammar law | `.claude/rules/source-of-truth.md` → Right-rail modality |
| E2E precedent | `tests/e2e/unbox-procedure-checklist.spec.ts` |
