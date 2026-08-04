# Research briefing — The guided procedure **stack**: depth, motion, radius, receipt, and time

**For:** Gemini Pro (deep research). This is a genuine open question. Engineering has a leaning on
each section, marked as such, but nothing below is ratified and nothing below is shipped.
**From:** Cycle Forge engineering
**Date:** 2026-08-01
**Subject:** An operator-requested "one row behind the other" step stack in the Unbox work surface —
its **depth geometry** (Apple-Watch-like layering of completed vs. upcoming steps), its **scroll and
advance motion**, its **exact corner radii**, its terminal **mobile-app-style confirmation receipt**,
and a **per-step + total time breakdown**.
**Companion brief:** [`step-document-reveal-GEMINI-RESEARCH-BRIEFING.md`](./step-document-reveal-GEMINI-RESEARCH-BRIEFING.md)
— same surface, different question (rendering a document *inside* a step). Answers must not conflict;
where they interact, say so.

**Companion (section host / dock clearance — research before implement):**
[`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md`](./station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md)
— Items + Procedure as sibling stacks under one divider above the floating dock.
**Plan under review:** [`unbox-guided-procedure-INDEX.md`](./unbox-guided-procedure-INDEX.md) (shared
decisions D1–D11) + [`unbox-guided-procedure-FRONTEND-PLAN.md`](./unbox-guided-procedure-FRONTEND-PLAN.md)
(FE-0 … FE-8). **The plan is written but not started.** You are reviewing a design before it is built.

---

## 0. How to use this brief

You do **not** have the codebase. Every number below was measured on 2026-08-01 and is cited to its
file. Where we say "there is no such thing today", that is a measured absence, not an oversight we
forgot to mention.

Six deliverables, in priority order:

1. **Rule on §4 (the depth pile).** The operator asked for "one row behind the other." Pick one of the
   five geometries in §4.6 or name a sixth. This is the highest-value answer in the brief, because a
   near-identical surface has been **rejected twice** (§2.3) and the pile is the part most likely to
   reproduce the first rejection.
2. **Rule on §5 (motion).** Our motion law bans most of what a stack implies, and our reduced-motion
   floor turns the rest into a hard cut. Tell us what survives.
3. **Answer §6 (corner radius) with numbers**, not adjectives.
4. **Answer §7 (the receipt)** — what a "mobile-app-like confirmation display" actually is in
   best-in-class products, and which of its parts survive a 1080p warehouse monitor.
5. **Rule on §8 (time).** This is the section we are least sure of and the one with a
   **non-UI hazard** (worker surveillance law). Do not skip it.
6. **Answer §9's numbered questions** with named product evidence. "Some apps do this" is unusable;
   "watchOS 10's Smart Stack does X, Wallet does Y, and here is the measured difference" is what we
   need.

Prefer a decision an engineer can type over a framework. If the answer is "it depends," name the
variable and give us the threshold.

---

## 1. Product vocabulary (skip if you read the companion brief)

**Cycle Forge** — multi-tenant reseller-ops SaaS; a used-electronics reseller (USAV) is the dogfood
tenant. UI identity is **Kinetic Ledger**: dense, state-colored, scan-aware, quiet chrome. Crews are
1–15 people.

**The physical bench, which governs every answer below:**

| Fact | Value |
|---|---|
| Display | 1080p monitor, landscape |
| Viewing distance | ~3 ft (~0.9 m) |
| Operator posture | **standing**, hands on product and on a keyboard-wedge barcode scanner |
| Primary input | the **scanner**, not the pointer |
| Eyes | on the product most of the time; the screen is glanced at between physical acts |
| Session shape | one carton at a time, act-and-clear, minutes not hours |

**Station** (scanner-driven, act-and-clear, ephemeral selection) is the region contract in play. The
scan bar is **focus-locked**: a global hotkey re-focuses it, and anything that steals focus silently
drops scans. That invariant is non-negotiable and is a Playwright row in the plan.

---

## 2. Measured anatomy (2026-08-01)

### 2.1 The surface being replaced

Today the Unbox work canvas centre holds a PO-lines accordion + a label preview, with the procedure
rendered as a **read-only checklist** inside a right-edge push column. The plan deletes that checklist
and puts an **interactive step stack in the centre**.

`src/design-system/components/procedure/ProcedureChecklist.tsx` (138 lines, station-agnostic, dumb)
renders an `<ol>` of `divide-y` rows **in vocabulary order, never reordered**:

```
[marker] Label ..................................... summary
  ● done      blue filled circle + check
  ② active    white circle, blue ring, 1-based position number
  ○ pending   gray disc
```

- Row padding `inset-cozy`; label `text-role-caption` truncated; right summary `text-role-eyebrow`.
- Active row: `bg-blue-50 ring-1 ring-inset ring-blue-400`. **Selection never size-shifts** (house law).
- Row height ≈ **32px**; the whole list is ~160–200px. It is a small component.

### 2.2 The stack the plan specifies (FE-0)

```
┌─ StationContextBar ────────────────── (unchanged, absolute float) ──┐
└────────────────────────────────────────────────────────────────────┘
┌─ ProcedureStack ─ max-w-[720px] ────────────────────────────────────┐
│  header:   10:42 AM                              ⟨placeholder⟩      │  ← time left / EMPTY SLOT right
│  ─────────────────────────────────────────────────────────────────  │
│  ✓ Shipping label            2 photos              10:38            │  ← done rows, collapsed
│  ✓ The box                   3 photos              10:39            │
│  ⤳ Packing material          skipped · no damage   10:41            │  ← skipped ≠ done
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ CONTENTS                      4 of 4    Looks good → Condition│  │  ← the ONE active card
│  │ · Sony WH-1000XM4          SKU-4471                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ○ Condition                                                        │  ← pending (shape TBD — §4)
│  ○ Item photos                                                      │
│  ○ Serial                                                           │
└─────────────────────────────────────────────────────────────────────┘
┌─ StationComposerDock (floating, contextual) ────────────────────────┐
│  Notes for this carton…                                             │
│  [+]                                        [ ▾ | Confirm contents ]│  ← primary = THIS step
└─────────────────────────────────────────────────────────────────────┘
```

| Thing | Value | Source |
|---|---|---|
| Locked column width | **`max-w-[720px]`** | `STATION_WORKBENCH_COLUMN`, `station/workbench/workbench-layout.ts:9` |
| Capture steps declared | **9 max** (~7 on a typical matched carton, 4 on local pickup) | INDEX §"new capture vocabulary" |
| Step states | `done \| active \| pending \| skipped` (skipped is new, D10) | FE-0 |
| Per-unit steps | `condition`, `item_photos`, `serial` loop **per unit** on multi-qty | INDEX vocabulary table |
| Active-step resolution | one pure function, `resolveActiveStep(steps, {skipped, focusedKey})` | D11 |
| The `headerEnd` slot | **declared but empty — no decided occupant** | FE-0 `ProcedureStack` props |

Two things to notice, because they are open doors this brief wants closed:

- **`headerEnd` is a placeholder with no content.** The plan reserves the top-right of the frame and
  says nothing about what goes there. §8 proposes total elapsed time; that is a proposal, not a
  decision.
- **The pending steps' rendering is unspecified.** The plan's ASCII shows done rows and the active
  card in detail and is silent on what "upcoming" looks like. That is precisely the operator's "one
  row behind the other" ask, and it is the gap §4 exists to fill.

### 2.3 The two prior rejections — read before recommending anything

**Attempt #1 — the capture stack (deleted at commit `33a3eb609`).** The procedure rendered as a
bottom-anchored stack of cards in the middle of the work surface. It **hid pending steps** and
**reordered completed ones** to keep the current card pinned at the bottom. Operator verdict:
*"completely terrible."* Two distinct failures: (a) a read-only status display had taken the work
surface's seat, and (b) reordering made the procedure unreadable **as a procedure** — you could not
see the shape of the work before you were in it.

**Attempt #2 — the ambient right-edge region (deleted the same day).** The procedure became a floating
card pinned top-right via a new always-on region. Operator verdict: *"an absolutely terrible display."*

**What is different in attempt #3, and therefore what must be true:** row-focused, **locked width**,
**anchored to the composer**, **terminating in a receipt**, and **interactive** (it is now the work
surface, not a status display beside one). The plan states plainly: *"If you find yourself building a
free-floating mid-canvas card, you have rebuilt the rejected one."*

**This matters to your answer on §4.** A depth pile that puts completed steps *behind* one another,
or that collapses upcoming steps out of view, is one design decision away from *hiding pending steps
and reordering completed ones* — the literal text of failure #1. Argue explicitly why your
recommendation is not that, or tell us the request cannot be honored as stated.

### 2.4 The corner-radius system, exactly

`src/design-system/tokens/radius.ts`. The scale **mirrors Tailwind's stock values byte for byte** —
it is deliberately *not* wired into `tailwind.config.ts`, so `rounded-lg` renders 8px, not 12px.

| Role | Class | px | Used for |
|---|---|---|---|
| `flush` | `rounded-none` | 0 | grid cells, full-bleed rows |
| `chip` | `rounded` | 4 | chips, badges, copy chips |
| `row` | `rounded-md` | 6 | list rows, menu items |
| `control` | `rounded-lg` | 8 | buttons, inputs, menus |
| `field` | `rounded-xl` | 12 | form fields, ops tables, popovers |
| `card` | `rounded-2xl` | 16 | cards, panels, dialogs, docks |
| `canvas` | `rounded-3xl` | 24 | glass worksheets, large containers |
| `pill` | `rounded-full` | ∞ | pills, dots, avatars |

There is a **concentric-nesting function**, and it encodes the rule as *inner = outer − padding*:

```ts
nestedCorner(outer: CornerRole, padStep: number): CornerRole
// padStep = the Tailwind spacing step the outer container pads by (3 for `p-3`; steps are 4px).
// The result snaps DOWN to the nearest role on the ladder, so it is always a real house corner.
// nestedCorner('canvas', 3) === 'field'   // rounded-3xl outer + p-3 → rounded-xl inner
```

A guard (`radius-tokens.guard.test.ts`) fails CI on arbitrary-value radii; a genuine one-off needs a
same-line `ds-allow-radius`. **Adoption is staged** — existing `rounded-*` call sites are correct and
are not a bug to fix on sight, but a new surface should use `cornerClass(role)`.

Two known gaps we want you to rule on in §6: **(a)** the ladder has no step between 16px and 24px, and
**(b)** every value is a **circular arc** — nothing in this system produces Apple's continuous /
superelliptical corner.

### 2.5 Motion presets and the reduced-motion floor

`src/design-system/foundations/motion-framer.ts` (framer-motion 12.42.2).

| Preset | Duration | For |
|---|---|---|
| `framerTransition.stationCartonSwapMount` | **0.12s** | station-cadence card swap; its **exit is `duration: 0`** |
| `framerTransition.workbenchPaneSettle` | 0.30s | pointer-driven pane swaps (explicitly **wrong** for this surface) |
| `framerDuration.spineRowStagger` | **0.015s** (15ms/row) | list-row cascade |
| `framerPresence.collapseHeight` | — | `height: 0 → auto`; the **one** sanctioned height animation, low-frequency only |

**Reduced motion is an app-wide floor** (`<MotionConfig reducedMotion="user">`), and we
**Playwright-measured** what framer 12.42.2 actually does under it — this is not from the docs:

| Property | Under reduce | Measured |
|---|---|---|
| transforms (`x`/`y`/`scale`/`rotate`) | **snap** | 24 animated frames → **2** |
| `width` · `height` · `top` · `left` · `right` · `bottom` | **snap** | 30 → **2** |
| layout animations (`layout` / `layoutId`) | **disabled** | — |
| **`opacity`** | **animates normally** | 31 → **33** |

So for some operators, **every transform and every height change in your design is a hard cut**, and
only the crossfade survives. Whatever you propose must be correct as a hard cut.

### 2.6 What does not exist today (measured absences)

These are the load-bearing gaps. Do not assume any of them.

| Missing | Consequence |
|---|---|
| **Any duration formatter.** `src/utils/date.ts` exports 17 formatters — all of them format an *instant* or a *civil day*. The only elapsed helper is `formatLaneAgeCompact` (age *from now*). There is **no `formatDuration`.** | "3m 20s on this step" needs a new SoT function, not a call site |
| **Any per-step start timestamp.** The receipt read model (D6) returns `{ key, label, state, at, byStaffId, detail }` — `at` is a **completion** instant derived from `photos.created_at`, `serial_units`, and two new stamp columns. Nothing records when a step *began*. | Per-step duration is **not derivable** today except as the gap between consecutive completions — which is not the same number (§8.2) |
| **Any continuous-corner (squircle) primitive.** | §6 |
| **Any scroll-linked animation anywhere in the app.** | §5.4 |
| **Any depth/stacking primitive.** Elevation is `elevationClass('flat'\|'raised'\|'overlay')` — three shadow roles, no z-layered pile. | §4 |

---

## 3. The request, verbatim and decomposed

### 3.1 Verbatim (the operator, 2026-08-01)

> "…exactly like an Apple Watch, how it would display one row behind the other one, for what's
> upcoming, what's next in the steps, and what exact corner radius scrolling animation and mobile app
> like confirmation display and a per step breakdown time of each step, total time and more"

Plus, from the plan's own framing of the earlier request:

> "Any step can show **what comes next** and be waved past when the current one already looks fine —
> 'packing material's fine, move on' — without pretending the work happened."

### 3.2 Decomposed into six answerable questions

| # | Ask | Section |
|---|---|---|
| 1 | Rows layered **one behind another**, Apple-Watch-like, for what is upcoming | §4 |
| 2 | The stack must show **what's next** without hiding the shape of the work | §4.5 |
| 3 | An **exact corner radius**, not "rounded" | §6 |
| 4 | A **scrolling animation** for the stack | §5 |
| 5 | A **mobile-app-like confirmation display** at the end | §7 |
| 6 | **Per-step time breakdown + total time** | §8 |

### 3.3 The premise we want tested first

"Exactly like an Apple Watch" names a device with a **~1.9-inch display, viewed at ~12 inches, one
hand, one glance, crown-scrolled**. Our target is a **720px column on a 1080p monitor at 3 feet,
scanner-driven, standing**. Depth-layering exists on watchOS largely because there is **no room** —
the pile is a compression technique for a viewport that cannot show two things.

**Our column can show all nine steps at once with room to spare** (9 × 32px ≈ 288px of rows in a
720px-wide, full-height canvas).

So the first thing we want from you is not a design — it is a ruling: **is depth-stacking here a
solution to a problem we have, or is it borrowed ornament from a constraint we do not have?** If it
is ornament, say so plainly; the operator asked for a *feeling* ("like an Apple Watch") and we would
rather deliver the feeling by another means than ship a compression idiom into a surface with no
compression problem. If it is genuinely right, we need to know which watchOS idiom is actually being
invoked — see §4.1, because there are at least four and they behave very differently.

---

## 4. THE DEPTH PILE — the primary question

### 4.1 Which Apple idiom is actually meant? (please disambiguate before answering)

We count at least five distinct Apple patterns that a non-designer might describe as "one row behind
the other." They have different mechanics and very different suitability here. Identify which one(s)
the request plausibly means, and rule on each:

| Idiom | Where | Mechanic | Plausible here? |
|---|---|---|---|
| **Smart Stack** | watchOS 10+ home | a crown-scrolled deck of full-size widgets; the one behind peeks by a few px; **only one is readable at a time** | ? |
| **Scroll-edge scaling** | watchOS lists since Series 4 | rows scale down + fade as they approach the top/bottom edge of the display; order preserved, nothing overlaps | ? |
| **Wallet card stack** | iOS Wallet | cards overlap by ~15–20% of their height; the selected one lifts out and the rest compress to a header pile | ? |
| **Grouped notifications** | iOS lock screen | N notifications collapse into a 3-deep pile with 4–8px offsets; tapping fans them | ? |
| **Dynamic Island / activity** | iOS 16+ | a single morphing pill; not a pile at all, but often what people mean by "the Apple Watch thing" | ? |

For each you consider viable: give the **measured geometry** if it is documented or reasonably
observable — peek offset in px, scale ratio per layer, max visible layers, opacity falloff — and say
whether that geometry survives a 4× scale-up to a 720px column.

### 4.2 Which end of the list should be piled?

This is the decision that most directly re-runs failure #1. Three options:

- **(a) Completed steps pile** (the "done" work compresses behind itself; upcoming stays a flat list).
  Matches the operator's earlier "collapses that row upward" language. Costs nothing informationally —
  done work is reference, not plan.
- **(b) Upcoming steps pile** (the literal reading of "one row behind the other one, for what's
  upcoming"). This is **hiding pending steps**, which is verbatim failure #1's diagnosis. Argue very
  hard if you recommend it.
- **(c) Both ends pile, active card in the middle at full size** — a fisheye / focus+context list.

Which is correct for a procedural surface where the operator's stated need is *"show what comes
next"*? Cite fisheye / focus+context literature if it applies, and say whether it applies to a
9-item list (our honest guess: focus+context earns its complexity at 50+ items and is pure cost at 9).

### 4.3 The multi-qty complication

Three of the nine steps (`condition`, `item_photos`, `serial`) are **per-unit**. A carton with 6 units
does not have 9 steps; it has roughly `6 + 3×6 = 24`. That is the case where a compression idiom might
actually earn its keep — and it is also the case where a pile most badly obscures "how much is left."

**Does the right answer change with N?** If yes, give us the threshold at which a flat list should
become a pile, and say whether switching representations mid-carton (as units are added) is worse than
picking one and holding it.

### 4.4 The "n of N" loop, unsolved

A per-unit step is not one row — it is the same row visited 6 times. We have no ratified rendering for
this. Options we see: a nested sub-stack under the parent step; a counter badge on one row
(`Serial · 3 of 6`); six sibling rows; or a horizontally paged card. Rank them, with evidence from
products that loop a procedure over a set (kitting, batch QC, multi-item pick).

### 4.5 Non-negotiable: the shape of the work must stay visible

Failure #1's second diagnosis was *"you could not see the shape of the work before you were in it."*
Whatever geometry you recommend must let a standing operator answer, **in one glance without
scrolling**: *how many steps are left, and roughly what are they?*

If your recommendation cannot satisfy that at N=24, say what it degrades to.

### 4.6 Five candidate geometries — rank them

Engineering leans **B for the ledger + D for the anchoring**, i.e. a combination. We are not
confident. Rank all five and name a sixth if we have missed it.

**A — Wallet-style depth pile (the literal request).**
Completed steps overlap into a pile with a 4–6px peek and a per-layer scale/opacity falloff, capped at
~3 visible layers with an "+4 more" affordance. Active card full size. Pending as a flat list below.
- *For:* what was asked; strong "this is done and behind me" affordance; cheap vertical budget.
- *Against:* overlap = occlusion, and occlusion of *completed* rows also occludes their **timestamps**,
  which §8 wants readable. Every layer needs a shadow, and our elevation system has three roles, not a
  ramp. Under reduced motion the fan/collapse is a hard cut.

**B — Flat collapsed ledger rows (what FE-0 actually specifies today).**
Completed and skipped steps become one-line rows in vocabulary order — `✓ Label · detail · time` — no
overlap, no depth. Active is the one expanded card. Pending are one-line dimmed rows.
- *For:* zero occlusion; every timestamp legible; order preserved; the receipt (§7) is then literally
  the same rows with the active card removed, which is a strong continuity argument.
- *Against:* not "like an Apple Watch" in any visual sense. Nine flat rows may read as a form, not as
  progress.

**C — Scroll-edge scaling viewport (the watchOS list idiom).**
A fixed-height scrollport; rows scale (say 1.0 → 0.9) and fade toward the top and bottom edges. Order
preserved, nothing overlaps.
- *For:* this is the actual watchOS list behavior, so it delivers the requested *feeling* honestly;
  transform-only, so it is legal under our motion law; degrades to a plain list under reduced motion
  with no information loss.
- *Against:* a fixed-height scrollport in a canvas with vertical room to spare is an artificial
  constraint. Scroll-linked scaling at 3 ft may be invisible — or worse, may read as a rendering bug.

**D — Optically anchored active row (FLIP).**
The active card holds a **fixed Y position**; completed rows translate up and out from under it,
pending rows translate up into place from below. The operator's eye never re-acquires the card.
- *For:* directly addresses the measured cost we actually care about — eye re-acquisition after
  looking away at product. Compatible with A, B, or C as the row treatment.
- *Against:* means the stack scrolls under a fixed element, which at step 1 (nothing above) and step 9
  (nothing below) needs padding to hold the anchor — that padding is dead space.

**E — Progress spine + single card.**
A thin numbered rail (iOS-Setup-Assistant-like) down one side, plus only the active card. The full list
is a peek on demand.
- *For:* minimal; scales to N=24 without any compression idiom; the card gets the full 720px.
- *Against:* comes closest to "hides pending steps," the failure we are most afraid of. The rail must
  carry enough to answer §4.5's glance test.

---

## 5. MOTION — rule on the collision

### 5.1 The law, verbatim in effect

`.claude/rules/display/motion-crossfade.md`:

> **Animate `opacity` + a small `transform` only; never animate layout (`width` / `height` /
> `padding`).** For height, use `grid-template-rows`. If a transition touches `width`, `height`,
> `top`, `left`, or `padding`, it is wrong.

There is **one** sanctioned exception — a deliberate PUSH toggle — with three conditions, **all**
required:

1. **The operator asked for it** — an explicit toggle, once per request. *Not* on selection, keystroke,
   filter, or **scan cadence**. "A surface that reflows on its own is still the bug this law exists to
   prevent."
2. **Tween, never spring** (`motionBezier.layout`).
3. **Inner content is fixed-size and edge-anchored inside an `overflow-hidden` host.**

The plan's own FE-0 constraints, already written: *"Never animate the stack's height. Rows entering
push the card down through normal flow; do not reach for `layout` on the container."*

### 5.2 Where the request collides

- **Step advance fires at scan cadence**, not on an operator toggle. It fails condition (1) as
  literally written — the same collision the companion brief raises, so **your two answers must
  agree**.
- **A card collapsing to a row is a height change.** `collapseHeight` is sanctioned only for
  *low-frequency* expand/collapse; 9–24 times per carton, once every few seconds, is not low frequency.
- **A FLIP anchor (candidate D) is a layout animation** by construction.

### 5.3 The specific rulings we need

1. Is condition (1) too strict for a **procedural** surface, where the reflow *is the operator's own
   work advancing* rather than the app moving on its own? If you would carve an exception, state it in
   **the same three-condition form** as the existing one, so we can paste it into the rule file.
2. If the exception is refused: is there a transform-only spelling of "the card collapses to a row"?
   (Our guess: crossfade a pre-measured row over a pre-measured card at the same Y, both in flow, with
   the height change happening in one un-animated frame under the crossfade. Is that a known technique
   with a name? Does it read as a collapse, or as a swap?)
3. **Reduced motion turns all of it into a cut.** For a step advance, is a hard cut acceptable — or is
   it actually *better* at a bench, where motion is latency? We would genuinely like to be told the
   animation is worth less than we think.

### 5.4 Scroll animation specifically

The operator asked for a "scrolling animation." We have **zero scroll-linked animation in the app
today**.

- Is CSS **scroll-driven animation** (`animation-timeline: view()` / `scroll()`) the right tool here?
  Give current cross-browser support as of your knowledge cutoff, and say whether it honors
  `prefers-reduced-motion` automatically or needs a manual gate.
- If JS: framer's `useScroll` + `useTransform` runs on the main thread; at 24 rows on a warehouse-spec
  machine, is that a real cost or a theoretical one?
- **Does a scanner-driven operator ever scroll this list at all?** If the active step auto-advances and
  the stack auto-anchors, manual scrolling may be a rare corrective act — in which case a
  scroll-linked animation is decoration on a path nobody takes. Tell us if that is the case.

---

## 6. CORNER RADIUS — give us numbers

The operator asked for an "exact corner radius." Our system (§2.4) offers 0 / 4 / 6 / 8 / 12 / 16 /
24 / full, with `nestedCorner(outer, padStep)` enforcing *inner = outer − padding*.

Answer with specific values:

1. **The active step card.** Our default would be `cornerClass('card')` = **`rounded-2xl`, 16px**, to
   match every other card in the app. Is 16px right for a card that is ~688px wide (720 minus the
   frame) and ~120–200px tall? Is there a published relationship between a surface's **size** and its
   correct radius, or is radius purely a function of role and system consistency?
2. **The collapsed done row.** `row` (6px)? `control` (8px)? Or `flush` (0) with only a divider, which
   is what `ProcedureChecklist` does today?
3. **The concentric rule.** Our function snaps *down* to the nearest ladder role, so a 16px card with
   `p-3` (12px) yields a 4px inner chip rather than a true 4px arithmetic result — here they agree, but
   they will not always. **Is snapping down correct, or should a concentric inner corner be allowed to
   be an off-ladder exact value?** Cite the standard treatments (Apple HIG's nested-corner guidance,
   Material 3's shape scale, the widely-circulated `inner = outer − padding` rule and any critique of
   it).
4. **The 16 → 24 gap.** Nothing sits between `card` and `canvas`. If a step card wants 20px, do we add
   a ladder role or round to 16? What is the cost of a denser ladder to a design system?
5. **Continuous corners.** Apple's rounded rects are **superellipses**, not circular arcs. Does that
   difference read at 12–16px on a 1080p display at 3 ft — i.e. is it perceptible at all at our size
   and distance, or only at the ≥40px radii where it is usually demonstrated? If it *is* perceptible:
   what is the current state of CSS `corner-shape` (`squircle` / `superellipse`), its browser support,
   and is there a non-SVG, non-mask fallback that does not cost us a paint layer per card?
6. **Radius as a state signal.** Could radius itself encode step state — e.g. active = 16px card,
   done = 6px row, pending = 0 flush? Is "shape as state" a legible channel at a glance, or is it a
   channel operators do not read, and we should keep the whole burden on fill + ring (our current law:
   *selection is fill + inset ring, never a size shift*)?

---

## 7. THE CONFIRMATION RECEIPT — what does "mobile-app-like" mean concretely?

When the carton is closed, the whole surface becomes a **receipt**: what was done, when, by whom, with
a bottom bar of **"Reopen to edit"** per step (FE-4). It is served by a read model
(`GET /api/receiving/[id]/procedure-receipt`), never a table, and a failed fetch renders the stack
rather than a 500.

The operator's reference is "mobile app like confirmation display." We think the honest analogues are
**Apple Fitness's workout summary**, **Apple Wallet's transaction detail**, **Uber's trip receipt**,
**DoorDash's order summary**, and **Strava's activity splits**. Tell us if there are better ones.

Questions:

1. **What are the actual invariant components** of a best-in-class mobile confirmation screen? Our
   sketch: (a) a single dominant success affirmation, (b) the *thing* identified unambiguously, (c) a
   line-item breakdown, (d) a total, (e) exactly one primary next action, (f) a quiet escape to
   amend/dispute. Correct that list.
2. **Does the success affirmation animate?** Checkmark draw-ons are near-universal in consumer apps.
   On a bench where the receipt appears dozens of times a shift and reduced motion may cut it to
   nothing — is it earned, or is it consumer-app theater that becomes an irritant by carton 30?
3. **The receipt is not a phone.** Every named analogue is a ~390px portrait viewport; ours is a 720px
   column in a landscape canvas. What survives the transposition, and what has to change? Specifically:
   does a mobile receipt's characteristic **single-column, generously-spaced, large-type** rhythm still
   read as "confirmation" at 720px wide, or does it read as an under-filled page?
4. **Skipped steps on a receipt.** A skipped step is a **waiver** with a reason code — not a failure,
   not a completion (D10). No consumer receipt has this state. How should a receipt display *"this was
   deliberately not done, here is who decided and why"* without it reading as an error? Precedent from
   audit trails, inspection reports, or aviation/medical checklist records is more relevant here than
   consumer apps — go find it.
5. **"Reopen to edit" is destructive-ish** — it clears a stamp and reopens a closed record. Consumer
   receipts have no such affordance (they have "dispute" or "get help"). What is the right grammar and
   the right prominence for an *amend* action on a settled record?
6. **Two clocks.** Photo rows carry both a server `created_at` and a device `client_captured_at` which
   is **not attested** (a drifted tablet yields a wrong-but-plausible time). D6 says show the server
   time and offer the device clock only as a labelled secondary detail. Is there established practice
   for displaying an unattested timestamp beside an attested one without either being misread?

---

## 8. TIME — the section we are least sure of

### 8.1 What is actually derivable today

The receipt returns a **completion instant per step**. There is **no start instant** for any step, and
**no duration formatter anywhere in the codebase** (§2.6).

So "per-step time" can only be computed as:

```
duration(step N) ≈ completedAt(step N) − completedAt(step N−1)
```

**That number is not the time spent on the step.** It includes every interruption, every phone call,
every trip to the bathroom, every moment the operator spent working a different carton, and — for the
first step — an undefined start. Presenting it as "time on this step" would be a lie the UI tells with
a straight face, which is the exact class of bug the plan's D4 (*"nothing is ticked by hand, so nothing
can be ticked falsely"*) exists to prevent.

### 8.2 Rule on this

1. **Is the between-completions gap honest enough to display, with the right label?** If yes, what is
   the correct label — "elapsed," "since previous step," something else? If no, what would we have to
   record to make a real duration (a `step_started_at` written when the pointer lands on a step, and
   what does "started" even mean when the operator is holding a box, not looking at the screen)?
2. **What breaks the timer, and what should it do?** Idle timeouts, the operator switching cartons
   mid-flow, a browser tab going background, an overnight carton left open. Every timing system has an
   answer to these; give us the standard one.
3. **Total time.** Carton-open → received is a clean, honest, single number that needs no new columns.
   Is that the right thing for the empty `headerEnd` slot (§2.2)? Should the header show it **live and
   ticking** during the carton — and if so, does a running clock on a warehouse bench read as
   *information* or as *pressure*?

### 8.3 The hazard we will not design around silently

Per-step timing on a warehouse floor is **worker productivity measurement**, and it is regulated.
California **AB 701** (warehouse distribution centers) requires written disclosure of quotas and
prohibits quotas that interfere with breaks; several states have followed; EU works-council regimes
treat individual performance monitoring as co-determined. Our tenants are 1–15 people, so the operator
being timed is frequently the owner's colleague or the owner themself — but the software is
multi-tenant and will be sold to shops where that is not true.

We need a ruling, not a disclaimer:

4. **Should the per-step breakdown be visible to the operator performing the work, visible only to a
   manager, aggregated-only (no per-carton attribution), or off by default behind a tenant setting?**
   Give the reasoning and the precedent — how do Amazon FC stations, Zebra/Honeywell WMS clients,
   ShipStation, and Shopify's fulfillment app actually handle showing a worker their own cycle time?
5. **Does showing a live per-step timer change operator behavior in ways that damage the data?**
   Specifically: does it induce skipping (our `skip` is a *waiver*, D10 — a timed operator may waive
   steps to make the number look good, which corrupts the evidence trail the whole procedure exists to
   produce)? This is our single biggest fear about this feature and we want it addressed directly.
6. **What is the legitimate use we should design for instead?** Our honest read: the owner wants
   **cycle-time-per-carton for capacity planning**, not per-person timing — and that is fully served by
   the carton total plus an aggregate, with no per-step display at the bench at all. Confirm or refute.

---

## 9. Numbered questions — answer with named sources

**Stacks and depth**

1. Name every shipping product you can that renders a **procedure** as a depth-layered stack of steps
   (not a card carousel, not a notification pile). Describe what actually happens on screen. If the
   honest answer is that no procedural UI does this, **say so** — that is the most useful possible
   answer to §4.
2. What is the measured/observable geometry of the watchOS Smart Stack and iOS Wallet pile — peek
   offset, scale ratio, opacity falloff, max visible layers? Does that geometry survive a 4× scale to a
   720px column, or is it tuned to a viewport where a 6px peek is 3% of the screen?
3. Is there published evidence on **occlusion vs. compression** for reading a list of completed work?
   We care specifically about whether an overlapped row's right-aligned timestamp survives being
   partially covered — that is the concrete thing candidate A would break.

**Procedural UI generally**

4. In high-stakes procedural systems — aviation electronic checklists (Boeing ECL, Airbus ECAM), the
   WHO Surgical Safety Checklist, nuclear/industrial procedure systems — how much of the **remaining**
   procedure is shown while one step is active? Is there a documented norm (all of it / N-ahead /
   next-only), and what is the stated rationale?
5. Those systems have decades of human-factors literature on **place-keeping** — losing your position
   in a procedure is a named, studied failure mode. What are the established place-keeping affordances,
   and which of them apply to a step stack?
6. Is there precedent for a **deliberate skip that records a reason** inside a procedural UI, and how is
   a skipped step displayed afterward so it is never mistaken for a completed one? (Aviation's "items
   deferred," medical "not applicable," industrial "N/A with justification.")

**Motion**

7. In warehouse/pack/kitting software specifically, does the step list **move** when the operator
   advances, or does content swap in place? Name the products (ShipStation, ShipHero, Veeqo, Zebra
   WorkCloud, Honeywell, Amazon FC stations) and describe the observed behavior.
8. Is there evidence on **eye re-acquisition cost** for a standing operator whose gaze leaves the
   screen to handle product and returns? This is the measurement that would justify candidate D's
   optical anchor over everything else, and we cannot find it.
9. Is there an established name and a reference implementation for **"the focused row stays optically
   fixed while its neighbors move"**? FLIP is the technique; is there a named *pattern*?

**Receipt and time**

10. Ranked list of the components of a great mobile confirmation screen (see §7.1), each tied to a
    named product.
11. Do any operational (non-consumer) systems show a worker a **per-step time breakdown of their own
    just-completed work**? If yes, name them and describe the framing. If the practice is essentially
    confined to consumer self-quantification (Fitness, Strava), say so — it materially changes §8.
12. For "total time," what is the standard treatment of a **running** vs. **final** duration? Does a
    live-ticking timer appear anywhere in professional operations software, and what is the argument
    for it?

**Scope**

13. Given everything above: **which parts of this request should not be built?** We would rather ship
    three of the six asks well than six badly. Name the cuts.

---

## 10. Constraints that cannot move

A recommendation violating one of these is unimplementable here.

- **The scan bar keeps focus.** The stack takes no focus — no `autoFocus`, no focus trap, no `tabIndex`
  on the container. A step card that steals focus drops scans silently and tells no one.
- **Locked width.** `STATION_WORKBENCH_COLUMN` (`max-w-[720px]`), imported, never re-typed. The stack
  does not widen for any step.
- **Opacity + transform only**, unless you defeat §5 on the merits. Never animate the stack's height;
  no `layout` on the stack container.
- **Reduced motion must be correct as a hard cut.**
- **Tokens only** — color, spacing, type, z-index, elevation, focus, radius all from the design system.
  Motion through the named presets; a hand-written cubic-bezier fails review. A raw `z-[N]`, a
  page-local hex, a `max-w-[720px]`, or a `font-bold` (600 is the hard weight ceiling) fails a guard.
- **Selection is fill + inset ring, never a size or height shift** — a house law that candidate A and
  candidate C both press against.
- **Step order and state come from the declaration + its derivation.** A view never re-derives a gate
  and never hardcodes steps; that breaks unfound, local-pickup, return, and multi-qty variants.
- **One procedure surface per station.** The existing checklist display is deleted, not mirrored.
- **Nothing is ticked by hand.** A step is done when its **fact** exists. A skip is a recorded waiver
  with a reason code and never claims the work happened, and never opens a server-side gate.
- **Times render through `src/utils/date.ts`** honoring the staff `timeFormat` preference — never a bare
  `toLocaleTimeString`.
- **The presentational primitive stays dumb** — `ProcedureStack` takes props only: no fetch, no domain
  import, no photo-stage knowledge.

---

## 11. Deliverable format

1. **The depth ruling (§4)** — one geometry from §4.6 or a named sixth, in one paragraph, with the
   single strongest reason. Include your answer to §3.3: is the Apple-Watch idiom right here, or
   borrowed ornament?
2. **The motion ruling (§5)** — does the layout-animation ban hold at scan cadence? If you carve an
   exception, give it in the same three-condition form as ours, ready to paste into the rule file.
3. **Radius answers (§6)** — actual px values for the active card, the done row, and the concentric
   inner, plus a verdict on continuous corners at our size and distance.
4. **Receipt spec (§7)** — the component list, what transposes from mobile to a 720px column, and the
   skipped-step display.
5. **Time verdict (§8)** — whether per-step duration is honest enough to show, what to put in the empty
   `headerEnd` slot, and your ruling on §8.3 (who may see the breakdown). Treat §8.3 as a first-class
   design constraint, not a legal footnote.
6. **§9 answers** — numbered, each with at least one named product or source. **Explicitly flag any
   question where the honest answer is "no established practice exists"** — that answer is worth more
   to us than a plausible invention.
7. **Cuts (§9.13)** — what should not be built.
8. **Sequencing** — what lands in FE-0…FE-2 (the demo slice the plan gates everything else behind) vs.
   a later phase. Note that the plan already requires a dogfood demo of FE-0…FE-2 *before* FE-3–FE-7
   are built, precisely because this shape was rejected twice.
9. **What would change your mind** — the measurement or bench observation that would flip your verdict.
   We can run it on a live bench with a real operator.

---

## 12. In-repo reading list (for the engineer implementing your answer)

| Concern | File |
|---|---|
| The plan being reviewed | `docs/todo/unbox-guided-procedure-INDEX.md`, `…-FRONTEND-PLAN.md` |
| Sibling brief (document-in-step) | `docs/todo/step-document-reveal-GEMINI-RESEARCH-BRIEFING.md` |
| Existing checklist primitive | `src/design-system/components/procedure/ProcedureChecklist.tsx` |
| Stack primitive to be built | `src/design-system/components/procedure/ProcedureStack.tsx` (FE-0, does not exist) |
| Step declaration | `src/lib/stations/procedure.ts` |
| Step derivation | `src/components/receiving/workspace/derive-capture-step-states.ts` |
| Active-step pointer | `src/lib/receiving/procedure-pointer.ts` (D11, does not exist) |
| Locked column token | `src/components/station/workbench/workbench-layout.ts:9` |
| Radius SoT | `src/design-system/tokens/radius.ts` (+ `radius-tokens.guard.test.ts`) |
| Elevation SoT | `src/design-system/tokens/shadows.ts` (`elevationClass`) |
| Motion presets | `src/design-system/foundations/motion-framer.ts` |
| Motion law | `.claude/rules/display/motion-crossfade.md` |
| Station law (focus lock is §3) | `.claude/rules/display/station.md` |
| Station Workbench anatomy law | `.claude/rules/display/station-workbench.md` |
| Date/time SoT (note: no duration formatter) | `src/utils/date.ts` |
| Composer dock | `src/design-system/primitives/StationComposerDock.tsx` |
| E2E precedent | `tests/e2e/unbox-procedure-checklist.spec.ts` |
