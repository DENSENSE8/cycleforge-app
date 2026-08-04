# Research briefing — Procedure Focus Deck: Smart Stack layout motion + scan-station hero surface

**For:** Gemini Pro (deep research). Genuine open questions remain after the first implementation
landed — this brief asks you to **validate, tune, and extend** what shipped, not to greenfield a
design from zero.

**From:** Cycle Forge engineering  
**Date:** 2026-08-03  
**Branch context:** WS-DOGFOOD (`main`), uncommitted working tree may differ  
**Subject:** The **Procedure Focus Deck** as the **primary work surface** on derived-procedure scan
stations (Unbox golden): watchOS Smart Stack geometry, **slow layout feedback** on step pointer
advance, card-reads / dock-acts split, and the **mobile bottom-dock** extension (barcode + photo in
one flow).

**Supersedes in part:** [`unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md`](./unbox-procedure-stack-MOTION-GEMINI-RESEARCH-BRIEFING.md)
§4–§5 where they conflict — that brief assumed the stack was *not built* (2026-08-01). This brief
describes what **is built** (2026-08-03) and what still needs industry evidence.

**Companion (photo slice, dock layout):** [`scan-station-procedure/HANDOFF-step1-photo-capture.md`](./scan-station-procedure/HANDOFF-step1-photo-capture.md)

**Companion (host geometry — Items + Procedure sections above floating dock, NOT implemented):**
[`station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md`](./station-multi-section-scroll-host-GEMINI-RESEARCH-BRIEFING.md)
— multi-section floor ownership, nested scroll legality, dock clearance three-consumer SoT.
Supersedes any `StationSectionHost` implementation plan until that brief returns.

**Binding law (do not contradict without naming the amendment):**
- `.claude/rules/source-of-truth.md` → **Scan-station procedure focus deck**
- `.claude/rules/display/motion-crossfade.md` → sanctioned layout #2
- `.claude/rules/display/station-workbench.md` → Procedure Focus Deck
- `.claude/rules/display/station.md` → Procedure cockpit
- `.claude/rules/display/instrument-panel.md` → P2 Procedure is the product

---

## 0. How to use this brief

You do **not** have the codebase. Every constant below was measured from the repo on **2026-08-03**.
Where we say "shipped", an engineer can grep the cited path.

**Seven deliverables**, priority order:

1. **Validate the Smart Stack idiom choice** (§3) — is watchOS Smart Stack the right reference for a
   720px desktop column at 3 ft, or should we cite Wallet / iOS Setup Assistant / WMS directed-workflow
   instead?
2. **Rule on layout animation duration + curve** (§4) — is **0.36s** `motionBezier.layout` correct
   for mandatory step-advance feedback at scan cadence (9–24 advances/carton), or is it too slow /
   vestibular-heavy?
3. **Rule on dual-motion split** (§4) — layout tween (360ms) + content crossfade (120ms enter,
   instant exit) + crown scrub (transform-only until commit). Does this match best-in-class, or should
   one channel be dropped?
4. **Mobile extension** (§5) — bottom thumb-zone dock hosting scan + camera + step CTA in one flow;
   which products nail this, and what motion do they use for stack settle on phone?
5. **Prominence hierarchy** (§6) — deck as hero vs items reference vs checklist vs dock. Named product
   evidence for "one primary surface + secondary map."
6. **Reduced motion + accessibility** (§7) — layout snap + opacity crossfade under
   `prefers-reduced-motion`: is that the right degraded form for procedural feedback?
7. **Answer §9 numbered questions** with named product measurements — not "some apps do this."

Prefer a decision an engineer can **type into a constant or rule file** over a framework.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (B2B warehouse/fulfillment). UI identity **Kinetic
Ledger**: dense, scan-aware, quiet chrome. Dogfood tenant USAV; product framing is sellable SaaS.

**Region:** **Station** workbench — scanner-driven, act-and-clear, one carton at a time.

| Fact | Value |
|---|---|
| Display (desktop bench) | 1080p landscape, ~3 ft viewing distance |
| Posture | Standing; hands on product + keyboard-wedge scanner |
| Primary input | Barcode scanner (focus-locked wedge), not pointer |
| Eyes | On product most of the time; screen glanced between acts |
| Session | One carton, ~7–13 capture steps, minutes not hours |
| Mobile (extension) | Phone as camera peripheral + `/m/unbox` scan feed (not yet unified with procedure deck) |

---

## 2. What shipped (2026-08-03) — measured anatomy

### 2.1 Architecture — one procedure, two views

| Where | Component | Question it answers | Prominence |
|---|---|---|---|
| **Centre** | `ProcedureDeck` → `UnboxProcedureDeck` | *What do I do right now?* | **Primary hero** |
| Right edge | `ProcedureChecklist` (Displays body) | *Where am I in the whole job?* | Secondary map |
| Pane top-right | `ScanStationProgressRing` | Opens checklist | Entry only |
| Bottom dock | `UnboxStepDock` + terminal | Step action + Print · Receive | Hand zone |

**One derivation:** `useUnboxProcedureSteps` — deck and checklist cannot disagree.

**Card reads; dock acts:** Step bodies show evidence (galleries, previews). Buttons live in the dock
only. Terminal (Print · Receive) never re-labels per step.

### 2.2 Layout geometry (Smart Stack)

Pure function: `layoutProcedureStack` in `procedure-stack-layout.ts`.

| Constant | Value |
|---|---|
| Face height | **4.5 rem** (~72px) — `PROCEDURE_STACK_FACE_REM` |
| Peek visible sliver | **0.875 rem** (~14px) — `PROCEDURE_STACK_PEEK_REM` |
| Gap between full faces | **0.75 rem** — `PROCEDURE_STACK_GAP_REM` |

**Modes per step (vocabulary order preserved, never filtered):**
- `full` — legible face row
- `peek` — one history + one queued sliver (negative `margin-top` pull-up)
- `covered` — mounted, zero flow (`h-0 invisible`), pointer-dead
- `focus` — active step: eyebrow title **outside** card + evidence **inside** raised card

Focus is **bottom-anchored** (`sticky bottom-0`) against the composer dock.

### 2.3 Ascii — current bench shape

```
┌─ StationContextBar (carton identity) ──────────────────── float ─┐
├─ UnboxItemsPanel (static line reference) ─────── pinned top ────┤
│                                                                  │
│  [history full faces ↑ scroll]                                   │
│  [history peek ~14px]                                             │
│  ┌─ eyebrow: Shipping label ───────────────── summary · mark ─┐ │
│  │ ┌ evidence card (photos / preview) ──────────────────────┐ │ │  ← FOCUS (hero)
│  │ └────────────────────────────────────────────────────────┘ │ │
│  [queued peek ~14px]                                             │
│  (covered steps: mounted, zero flow)                             │
╞═ floating dock ══════════════════════════════════════════════════╡
│  [< PREV]  [Link a photo · camera]  [NEXT >]  [Print · Receive]│
└──────────────────────────────────────────────────────────────────┘
```

### 2.4 Procedure steps (Unbox capture slice)

Declared in `src/lib/stations/procedure.ts` — 13 steps, centre renders **capture** phase only:

`arrival_check` → `shipping_label_photo` → `box_photo` → `packing_material` → `contents` →
`condition` → `item_photos` → `serial` → `label` → (commit: print, receive)

Completion is **derived from facts** (photos, timestamps) — never hand-ticked.

---

## 3. Which Apple / industry idiom is this?

We explicitly model **watchOS 10+ Smart Stack**, not Wallet card stack:

| Idiom | Mechanism | Our usage |
|---|---|---|
| **Smart Stack** | Full-size widgets; one behind peeks; crown scrubs; one readable at a time | `layoutProcedureStack` + crown wheel scrub |
| Wallet pile | ~15–20% overlap, selected card lifts | **Not used** |
| Scroll-edge scaling | Rows scale/fade at viewport edges | **Refused** (artificial viewport) |
| WMS directed workflow | Fixed steps, scan-gated advance, bottom action | Dock + derived pointer |

**Open question:** At 720px width showing 2–4 faces + focus + peek, is Smart Stack the honest
reference, or are we borrowing watch compression for a column that has room for a flat ledger?

---

## 4. Motion — what shipped (exact formulas)

### 4.1 Sanctioned layout animation (#2 in house law)

**Role:** `motionRole.procedure.advance`  
**Preset:** `framerTransition.procedureStackLayout`  
**Duration:** **0.36s** (`framerDuration.procedureStackLayout`)  
**Curve:** `motionBezier.layout` = **`cubic-bezier(0.25, 0.1, 0.25, 1)`**

**Implementation (`ProcedureDeck.tsx`):**
- `LayoutGroup` + `motion.li layout transition={layoutTransition}` on every step row
- CSS `PROCEDURE_STACK_LAYOUT_MOTION` on rows: transitions `margin-top`, `height`, `max-height`,
  `padding-block`, `border-width`, `opacity` @ 360ms layout curve
- Active focus shell: `initial={{ opacity: 0.92 }}` → `animate={{ opacity: 1 }}` on same 360ms tween
- Inline `marginTop: ${slot.marginTopRem}rem` for all indices > 0 (pull-up + gap — single animated channel)

**Trigger:** Step pointer advance only (fact satisfied, pager, crown notch commit, checklist focus).
**Not** on: filter keystrokes, carton swap (`swap.scan` owns that).

### 4.2 Content crossfade (inside focus card)

**Role:** `motionRole.swap.scan`  
**Enter:** 120ms `easeOut` `[0.22, 1, 0.36, 1]`  
**Exit:** **0ms** (instant — avoids double-image at scan cadence)

### 4.3 Crown scrub (between notches — continuous)

Transform + opacity **only**, never scale:

| Constant | Value |
|---|---|
| Wheel notch threshold | **48px** accumulated delta |
| Focus translateY | **±8px** × t |
| Focus opacity delta | **0.12** × t |
| Peek translateY | **10px** × t |
| Peek opacity | **0.8 → 1.0** |

Scrub kills CSS transitions (`transition: none` on all `[data-procedure-step]`). Layout tween runs
**on notch commit** when `activeKey` changes.

### 4.4 Settle after scrub (transform only)

`PROCEDURE_STACK_SETTLE_MOTION`: 300ms `cubic-bezier(0.22, 1, 0.36, 1)` on opacity + transform.

### 4.5 Reduced motion

- Framer `MotionConfig reducedMotion="user"`: positional keys (including `height`, `layout`) **snap**
- Opacity may still animate
- Crown scrub paint skipped entirely

---

## 5. Mobile extension (NOT shipped — research target)

**Goal:** Same procedure vocabulary on phone with:
- **Bottom dock** = thumb zone: scan input + step CTA + camera + terminal
- **CaptureStack-style** bottom-expanded active card OR port of `ProcedureDeck` with pan-not-wheel
- Barcode resolves against **active step** (serial on serial step, condition code on condition step)
- Phone camera via existing Ably bridge or inline capture

**Existing primitives:**
- `/m/unbox` → scan feed (`RedesignedMobileReceive`) — **not** procedure deck yet
- `CaptureStack` — bottom-anchored ledger, spring mount (`damping: 28, stiffness: 340`)
- `ReceivingPhotoRequestCamera` — desktop scan triggers phone camera

**Research ask:** Which products combine **directed workflow + bottom dock + stack motion** on mobile
(Shopify POS, Square, Toast, Zebra RF, Fishbowl mobile, Cin7, etc.)? What duration/easing do they
use for step advance — spring vs tween? Map scrub to **vertical pan** on touch?

---

## 6. Prominence hierarchy (product law — needs validation)

| Priority | Region | Must not outrank deck |
|---|---|---|
| 1 | Procedure Focus Deck | — |
| 2 | Items reference panel | Competing centre surface |
| 3 | Checklist (Displays) | Always-on procedure column (retired 2026-08-01) |
| 4 | Dock | Animating dock more prominently than deck on advance |

**Rejected twice before (do not recommend reverting without addressing):**
1. `UnboxCaptureStack` — hid pending steps, re-sorted completed (`33a3eb609`) — *"completely terrible"*
2. Ambient right-edge procedure region — *"absolutely terrible display"*

---

## 7. Prior research brief conflicts — read before answering

| Old brief (2026-08-01) | Current state (2026-08-03) |
|---|---|
| "Layout animation banned on step advance" | **Sanctioned #2** — mandatory 360ms layout tween |
| "Plan not started" | **Shipped** in `ProcedureDeck.tsx` + guards |
| "Flat ledger vs depth pile" open | **Smart Stack pile shipped** with peek + covered |
| D12 flat horizontal rail | **Superseded by focus deck** (2026-08-02 amendments) |

Your job is to say whether the **shipped** choices are tuned correctly, not to re-open settled
structural bans (HIDING, RE-SORTING, checklist coupling).

---

## 8. Non-negotiable invariants (Never)

- Every step mounted, vocabulary order, never filtered/sorted
- One derivation hook for all procedure views
- Scan wedge owns focus — deck never `autoFocus` / `.focus()`
- Bench photos ≠ arrival photos (stage/aspect separation)
- Skip/waiver designed but **not built** — do not assume `skipped` writer exists
- Per-step timing UI **refused** (surveillance + underivable without `step_started_at`)

---

## 9. Numbered questions — answer with named product evidence

1. **Duration:** Is **360ms** layout settle per step advance within Nielsen/NNG + Material/HIG
   guidance for *procedural* feedback (operator-initiated advance), or should we target 250ms /
   450ms? Cite products that animate step transitions in directed workflows.

2. **Dual channel:** We run **360ms layout** + **120ms content crossfade** simultaneously. Does
   research support layered motion here, or should content wait until layout completes (sequential)?

3. **Opacity entrance:** Active shell fades **0.92 → 1.0** on every step focus. Necessary or redundant
   with layout tween?

4. **Smart Stack at 720px:** Measure watchOS Smart Stack peek ratio (px peek / widget height). Does
   that ratio **scale linearly** to our 14px/72px peek, or was it tuned for a 1.9" viewport only?

5. **Crown → touch:** For mobile, map scrub to **pan gesture** with same `t = delta / 48px` — any
   precedent? HIG on interruptible gestures for warehouse gloves?

6. **Layout vs spring:** We banned spring on procedure advance (rubber-band on shared layout target).
   Does **CaptureStack's spring** on mobile contradict that, or is phone a separate job?

7. **Prominence:** In best-in-class warehouse UIs, what % of viewport does the *current task card*
   occupy vs queue/history? Should our focus card grow taller than evidence requires for hero emphasis?

8. **Reduced motion:** Is instant layout snap + opacity crossfade the correct WCAG 2.3.3 degraded form,
   or should procedural advance use **no motion at all** (hard cut)?

9. **Bottom dock scan field:** For mobile procedure, should scan input be **always-visible** in dock
   (Zebra-style) or **contextual per step** (camera on photo steps, scan field on serial step only)?

10. **Failure mode:** If layout animation drops frames on warehouse-spec hardware, is it better to
    **shorten duration** or **drop to transform-only** while keeping slow *perceived* motion via
    opacity ladder?

---

## 10. Files to cite if you get repo access later

| Concern | Path |
|---|---|
| DS deck + motion | `src/design-system/components/procedure/ProcedureDeck.tsx` |
| Layout math | `src/design-system/components/procedure/procedure-stack-layout.ts` |
| Motion role | `src/design-system/motion/roles.ts` → `procedure.advance` |
| Preset | `src/design-system/foundations/motion-framer.ts` → `procedureStackLayout` |
| Unbox adapter | `src/components/receiving/workspace/line-edit/UnboxProcedureDeck.tsx` |
| Dock wiring | `src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` |
| Step vocabulary | `src/lib/stations/procedure.ts` |
| Guards | `procedure-deck-order.guard.test.ts` |
| SoT law | `.claude/rules/source-of-truth.md` → Scan-station procedure focus deck |

---

## 11. Paste-ready prompt (for Gemini Deep Research)

Copy everything below this line into Gemini:

---

You are researching **directed-workflow UI motion** for a B2B warehouse scan station.

**Product:** Cycle Forge — Kinetic Ledger design system. Operator stands at a 1080p bench, scans
barcodes with a wedge scanner, photographs cartons through a guided **Unbox procedure** (~9 capture
steps per carton).

**The UI pattern (SHIPPED 2026-08-03):**
- **Centre hero:** "Procedure Focus Deck" — watchOS Smart Stack-like pile: one expanded focus card
  (evidence inside), history faces above, one ~14px peek of the next step below, covered steps
  mounted but zero-flow.
- **Bottom dock:** step actions (camera, acknowledge) + carton terminal (Print / Receive) — hand zone,
  not the visual hero.
- **Right checklist:** secondary map of all steps (operator-picked display).

**Motion (SHIPPED — validate and tune):**
- On step pointer advance: **360ms** layout tween (`cubic-bezier(0.25, 0.1, 0.25, 1)`) on margin-top
  pull-up, face height, covered collapse; Framer `layout` on stack rows; active shell opacity 0.92→1.
- Step content inside focus card: **120ms** crossfade enter, **0ms** exit.
- Crown-analogue wheel scrub between steps: transform+opacity only (8–10px translate, no scale) until
  notch commit at 48px delta.
- Reduced motion: layout snaps, opacity may still fade.

**Extension (NOT shipped):** Mobile `/m/unbox` with same procedure + bottom dock (scan + camera + step
CTA in thumb zone).

**Your deliverables:**
1. Is watchOS Smart Stack the right reference for a 720px desktop column at 3 ft, or name a better one?
2. Is 360ms layout feedback per step advance correct for 9–24 advances/carton at scan cadence, or too
   slow? Give named product comparables with measured durations.
3. Should layout and content crossfade run in parallel or sequence?
4. Best-in-class mobile directed workflows with bottom dock + stack/card motion — names, patterns,
   durations.
5. Reduced-motion degraded form: snap layout + opacity fade vs hard cut — which is correct for WCAG
   2.3.3 procedural surfaces?
6. Answer the 10 numbered questions in the full briefing at
   `docs/todo/procedure-focus-deck-smart-stack-GEMINI-RESEARCH-BRIEFING.md` §9 with **named product
   evidence** (watchOS 10 Smart Stack, iOS Wallet, Shopify POS, etc.) — not generic advice.

**Constraints (do not recommend violating):**
- Never hide or re-sort procedure steps in the deck.
- Scan input must not steal wedge focus from the scan bar (desktop).
- No per-step timing UI (surveillance).
- Spring overshoot banned on desktop pile layout (shared reflow target).

Prefer **typed constants** (ms, bezier, px peek offset) over frameworks.

---
