# Lane B — the deck, its scroll, its motion

**Index:** [`INDEX.md`](./INDEX.md) · inherits **S4 · S6 · S7**
**Owns:** `src/design-system/components/procedure/**` (geometry + motion) ·
`StationWorkbench.tsx` + the clearance constants
**Blocks:** nothing. Start immediately.

**Research before expanding host geometry (Items + Procedure section expand):**
[`../station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md`](../station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md)
— do not invent a second scrollport or section-host primitive until that brief pins SoT.

---

## The job

`ProcedureDeck` and `ProcedureChecklist` are already domain-free DS primitives — that part
is done. What is *not* done is making the surface they live in a **station-generic scroll
contract**. Today the host geometry is Unbox's: `bodyAlign="end"`, a clearance constant
tuned to Unbox's dock, and a scroll behaviour that was reasoned about but never measured.

This lane is where "scroll animations" gets adjudicated. Read the refusals below **before**
designing anything; three of the obvious answers are already ruled out with reasons, and
re-proposing them is the most likely way this lane wastes a week.

---

## What is already ruled, and stays ruled

| Refused | Why it stays refused |
|---|---|
| **Multi-sliver depth pile** (translucent layers double-imaging labels) | Ghosted records. Killed twice. **Superseded in part 2026-08-02:** a *single* history peek above focus (mirroring the queued peek) is now the Smart Stack law — covered history may tuck behind that peek; the peek itself stays fully legible. The multi-sliver ghost pile stays refused. |
| **Scroll-linked animation** (`animation-timeline`, `useScroll`) | Travel is native scrolling; scroll-linked motion re-introduces the thing reduced-motion users cannot opt out of, and at scan cadence it reads as lag. **Exception 2026-08-02:** imperative direct-DOM top-compress on the host port's `scroll` (same paint path as crown scrub, reduced-motion gated) is allowed — it is not a CSS scroll timeline or Motion `useScroll`. |
| **Layout animation on step advance** | Fires 9–24 times per carton — verbatim the "reflows on its own" case the motion law bans (S6) |
| **Per-step timing** | S8 |

**What is NOT refused, and is this lane's actual opportunity:** the deck currently animates
nothing but the focus card's *contents*, and its travel is a bare
`scrollIntoView({ behavior: 'smooth', block: 'nearest' })`. That is under-specified rather
than settled. B-1 and B-2 are about making the travel *correct*, not about adding motion.

---

## B-1 — the deck host contract

Extract what Unbox proved into props the next station gets for free.

- **`bodyAlign="end"`** — bottom-pinned, grows upward. Currently opt-in and correct; make
  it the documented default for a station **work** surface and say why: the eye path is
  product → down → the live step → the input that commits it. A work surface floating at
  the top of an empty canvas has put the operator's eye in the wrong place.
- **Clearance is a named variant, never a bumped shared constant.** Three exist now
  (`pb-32` · `pager` `pb-40` · `step-action` `pb-48`). The next station adds a fourth *only*
  if its dock has a different row count. The four stations without a step-action row must
  not pay 32px of dead canvas for one that has it.
- **One scroll port.** The deck adds no `overflow-*`, no `flex-1`, no `h-full` — the host
  owns the port. An operator with a scanner in one hand cannot be asked which of two
  scrollers they are in.

**The trap this phase exists to prevent:** a nested port whose `flex-1` has no basis. It
never height-constrains, so it does not scroll, and every `h-full` / `snap-*` / `min-h-*`
on it becomes dead CSS **that still occupies space**. The Unbox procedure column shipped
exactly this once and rendered its height floors as empty white voids.

### Guard

`procedure-host-geometry.guard.test.ts` — no `overflow-*` inside
`design-system/components/procedure/**`; every clearance value resolves from a named
constant, never a literal `pb-*` at a call site.

---

## B-2 — travel: measure before you choose

**The current behaviour is unverified.** `scrollIntoView(smooth, nearest)` on step advance
was reasoned to be correct — no framer transition, no `layout`, and reduced motion becomes
an instant jump, which is the right reduced form. It has **not been watched at a bench**.

Do that first. Three questions, and they are cheap:

1. On advance, does the focus card land where the operator's eye already is, or does the
   port over-scroll and make them re-acquire?
2. With nine steps and a settled history above, does `nearest` do anything at all?
3. Does the peek's overhang survive the scroll, or does it get clipped at the port edge?

**Scroll-snap is the one candidate worth evaluating**, and it has a hard precondition: snap
belongs on the **host** port, behind an opt-in prop — never globally for every station —
with `snap-start` on the sections. It has already shipped once on a **zero-height nested
port**, where it silently did nothing. So: *a scroll-snap surface must be verified to
actually snap.* A surface that scrolls correctly and does not snap is usable; one that
neither scrolls nor snaps is not. **Ship without snap rather than with a dead port.**

### SoT delta (hand to F)

> Procedure travel is native scrolling on the HOST port. No scroll-linked animation, no
> `layout`, no framer transition on step advance. Snap is an opt-in host prop and must be
> verified to engage — a nested port with an unresolved height silently swallows it.

---

## B-3 — the optical anchor: deferred, with the evidence that would land it

Holding the active card at a fixed Y while rows move under it (FLIP) is the one refused
idea that addresses a real cost: **eye re-acquisition after the operator looks back from
the product.** It is also a layout animation, so it cannot land under S6 without evidence,
and the evidence does not exist publicly.

**The measurement that would land it:** instrument or observe three cartons. Time from
"operator's eyes return to screen" to "operator's hand moves". If the anchored variant is
measurably faster, the layout-animation ban gets a **scoped, named exception** — not a
repeal.

**The measurement that would re-open the depth pile** is different and equally specific:
the whole flat-deck ruling rests on the premise that operators *glance ahead to see what is
coming*. Watch three cartons and count forward glances. If they never look ahead, showing
every pending step buys nothing and a compressed form becomes correct.

**Neither should be re-litigated without its measurement.** Both are recorded here so the
next agent does not "restore" them as missing work, and so that a real observation is not
dismissed as already-decided.

---

## B-4 — the checklist's own geometry

The right-edge checklist is the *map*; the deck is the *work*. It has one open geometry
question: `maxVisibleRows` caps the hover peek, but the mounted display is fit-height and
unbounded. On a station with a 15-step procedure that overflows the push column.

Answer it the same way the deck did: the **host** owns the port. The checklist is content.

---

## B-5 — the card's own anatomy (rejected at the bench 2026-08-02)

B-1 through B-4 are about the surface the cards sit *in*. This is the card itself, and it
is the one part of the deck an operator has actually rejected in words: *"the hierarchy and
the outlines and the row divs themselves are very AI slop."*

**Today every card is one horizontal row** — medallion left, label + time inline, summary +
state mark right, on a fixed `h-[4.5rem]` box with a tinted fill, a coloured border and a
shadow. That is a *list row* wearing a card's chrome. The focus card is the station's work
surface; a list row is what you scan a hundred of.

### The ruled anatomy

Operator instruction, 2026-08-02 — **left-anchored and vertical, not a row**:

| Order | Element | Notes |
|---|---|---|
| 1 | **the exact step name**, top-left | the anchor. Not centred, not beside the glyph — the thing the eye lands on first |
| 2 | **the icon**, below the name | the glanceable mark, under its own label rather than competing with it for the left edge |
| 3 | **the description** — what needs to be done | see below; the copy already exists |

Then the body (for steps whose work is a surface), then nothing else — **no action button
ever** (S4, and `procedure-step-dock.guard.test.ts` enforces it on the import).

### The description already exists and is rendered nowhere

`ProcedureStep.summary` in `procedure.ts` is declared on **every** step, operator-voiced,
and its own field docblock reads *"One line, operator-voiced: what the person does here."*
Example, already written: *"Photograph the carrier label on the unopened box — the tracking,
the sender and the service, in one shot a claim can be argued from."*

`captureStepVocabulary` drops it on the floor. Carrying it through the waist is ~4 lines and
**needs no backend, no migration and no new copy** — the highest ratio of operator-visible
gain to risk anywhere in this lane.

**One trap, and it will bite silently:** `ProcedureStepRow.summary` in F's `types.ts`
already means something *else* — the right-hand fact (`"3 photos"`, `"2 of 5"`). Two
different things called `summary`, one of them already rendered. Carry the declaration's
through as **`description`**; do not overload the existing field.

### The shadow behind the queued step

`elevationClass('raised')` is applied **unconditionally** to every `<li>` — the focus card,
the peek, *and* the collapsed cards that are never on screen. The pile then layers
`scale-[0.97]` + `opacity-70` on top of that shadow, so the peek's sliver is a translucent
card over a stack of shadows nobody can see the source of. That is the murk the operator
named.

**Elevation belongs to the focus card and to nothing else.** A queued card is a *hint that
more exists*, not a surface — and a shadow cast by an object the operator cannot see is
depth without a referent.

### What must survive this phase unchanged

Anatomy is free to change; **structure is not**. Three guards already pin the structure and
a re-skin must keep all three green without edits:

- every step mounted, in vocabulary order — no filter, no sort (`procedure-deck-order`)
- exactly one focus card; a covered card is never a `button` (`procedure-deck-order`)
- the checklist stays reachable as the path past the peek (`unbox-procedure-checklist-coupling`)

Removing the peek/pile mechanic *entirely* is a different change: it needs a rules amendment
in `station-workbench.md` → *The Procedure Focus Deck* plus edits to both guards, because
they assert the pile's **existence**, not merely its correctness.

### SoT delta (hand to F)

> A procedure step card is **left-anchored and vertical**: the step's name is the top-left
> anchor, its icon sits beneath the name, and its declared `summary` renders as the
> instruction line. It is not a one-row list item with a leading medallion — a list row is
> for scanning a hundred; the focus card is a work surface for exactly one.
>
> **Elevation belongs to the focused card alone.** A queued or covered card carries no
> shadow: depth cast by an object the operator cannot see is depth with no referent, and it
> reads as murk under the peek.

### Guard

Extend `procedure-deck-order.guard.test.ts` — it already parses this file's constants:

- `elevationClass('raised')` appears on the **focus branch only**, never on the shared
  class list (a string search for the call inside the queued/covered branch fails).
- The card renders `step.description` when present — so the day someone re-flattens the
  anatomy, the instruction line does not silently vanish with it.

---

## Requests to other lanes

- **F:** `ProcedureStepRow` / `ProcedureStepState` live in F's `types.ts`. B needs
  `skipped` drawn distinctly from `done` in both surfaces — B renders it, F owns the type.
- **F:** add `description?: string` to `ProcedureStepRow` for B-5, **beside** the existing
  `summary` rather than replacing it. They are two different facts (the instruction vs the
  right-hand count) and collapsing them loses one.
- **A:** `evidence` on the step (A-1) is what lets B render a read-only body generically
  instead of every station writing its own gallery body.
- **A:** carry `ProcedureStep.summary` through `captureStepVocabulary` → `deriveProcedureSteps`
  as `description`. A owns that waist; B only renders it.

---

## Do not re-open

- Depth pile · scroll-linked animation · layout animation on advance · per-step timing —
  each with its falsifier above.
- **Height never animates.** Face → active is a plain reflow in one un-animated frame.
- **`min-h-*` floors on dynamic bodies.** A height floor on a container whose content is
  dynamic renders as an empty void; at a bench an empty box reads as *"this step is
  broken"*. It shipped once as a literal empty white box on a one-button step.
- **Exactly ONE queued peek.** Three translucent slivers did not read as depth — they read
  as one card that had failed to paint, with two labels double-imaged through each other.
- **A covered card takes no pointer events** and is not a `button`. The peek's sliver was
  pointer-dead for a revision because later siblings painted over it.
- **A step card carries no action button** (S4). B-5 changes the card's *anatomy*; it does
  not re-open where the action lives. The guard fails on the import, not on review.
- **`space-y-*` between deck cards.** Tailwind v4 compiles it to `margin-block-END` on the
  preceding sibling, so the queued cards' negative `margin-top` cannot cancel it — the pile
  shipped 12px apart while both the computed margin and the class list read exactly as
  intended. Card gaps are per-item margins.
- **The pull-up is rem, never px.** The root font size moves with the Settings text-size
  control; a px pull-up against a rem card is correct at exactly one setting, and nobody
  testing at the default would ever see it.
