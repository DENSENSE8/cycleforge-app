# Research briefing — unifying hover/open behaviour on the carton context header

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-16
**Subject:** One 40px chrome row (`CartonContextCard`) currently runs **four independent
hover/open engines** with three different close delays. Consolidate to one hook.
**Status:** Problem is live and reproducing (continuous flashing on three of the cells). One
ad-hoc fix has been attempted three times in this component and has not held. No consolidation
code written yet — this brief exists to decide the *shape* of the fix before a fourth attempt.

**Scope discipline:** this brief is deliberately narrow. It covers **only** the carton context
header (`src/components/station/entity-context/CartonContextCard.tsx` and the faces it mounts).
It does **not** cover the rail hover preview, the LedgerGrid cell menus, or the app-wide tooltip
population except where those share an engine with this row. Do not widen it.

**Deliverable:** (a) industry benchmark for hover-intent state machines in dense operator UI;
(b) a defended verdict on the six decisions in §5; (c) answers to §6 with sources; (d) a concrete
API for the single hook, at the level of a signature an engineer can implement directly.

---

## 0. How to use this brief

You do not have the codebase. Every number below was read out of source today — line counts,
delay constants, consumer counts from `grep -rl`. Nothing is estimated. Where something is
inferred it is labelled **(inferred — verify)**.

Be skeptical of the framing. The engineer writing this brief also wrote the failing fix, three
times, without ever seeing the bug in a browser (the dev session could not be authenticated from
the agent's browser surface). The diagnoses in §3 are therefore *hypotheses ranked by
plausibility*, not confirmed root causes. Say so if you think the ranking is wrong.

---

## 1. Product context (condensed — enough to judge fit)

**Cycle Forge** is multi-tenant reseller-operations SaaS. The surface in question is a **scan
station**: a warehouse operator stands at a bench with a barcode scanner (a keyboard-wedge — it
types into whatever holds focus and presses Enter). The house visual identity is "Kinetic
Ledger": dense, state-coloured, flush-square, explicitly *not* document-calm.

Three constraints that make generic web-app hover guidance a poor fit:

1. **The wedge owns keyboard focus.** Any surface that steals focus drops scans, and the failure
   is silent. A hover-opened menu that traps focus is a data-loss bug, not a polish issue.
2. **The row is 28px tall (`h-7`) and flush** — cells abut with `gap-0` and no dividers, so a
   cell has no edges of its own at rest. Hover is the only thing that delineates them.
3. **Motion is near-zero by ruling.** The app's navigator (MasterNav spine) imports no motion
   library at all; the rail hover preview was just stripped of its spring. "Any duration at all
   is time inserted between the reach and the target" is an existing, ratified position here.

---

## 2. The measured problem — four engines, one row

`CartonContextCard.tsx` is **879 lines** and renders one row of ~12 cells. Those cells open
hover surfaces through four different mechanisms:

| # | Engine | LOC | Consumers (files) | Opens | Closes | Portal? |
|---|---|---|---|---|---|---|
| A | `HoverTooltip` | 232 | **375** | `mouseenter`, `openDelayMs = 0` | `mouseleave` → `hide()` | `createPortal` |
| B | `CopyChipHoverMenu` | 328 | 7 | `onMouseEnter={open}` | `CLOSE_DELAY_MS = 120` | `createPortal` |
| C | `useRailHoverPreview` | 123 | 7 | `openDelay = 0` | `closeDelay = 150` | caller portals |
| D | Radix `DropdownMenu` + ad-hoc timers inside `InlinePillPicker` (606 LOC) | — | 3 cells | `mouseenter` | `pointerover` hit-test, 150ms | Radix portal |

**Three different close delays on one row: 0, 120, 150.** None of them is a token; each is a
literal in its own file. Engine D did not exist a day ago — it was added to make the three
classify pills (Priority · Platform · Type) open on hover "like the others", which is how the
count went from three to four.

### 2.1 Which cell uses which engine

Left to right on the row:

| Cell | Engine | Notes |
|---|---|---|
| Back-to-list (exit) | A | tooltip only; no menu |
| Lifecycle status dot | A | read-only fact |
| Order # chip | B | copy + Open/Edit verbs |
| Tracking chip | B | `TrackingNumberMenuChip` |
| Qty fraction | A | read-only fact |
| **Priority pill** | **D** | **flashing** |
| **Platform pill** | **D** | **flashing** |
| **Type pill** | **D** | **flashing** |
| Price face | A | read-only fact |
| Listing link | A | tooltip + external open |
| Claim / Ticket chip | A (claim) / B (linked ticket) | presence-exclusive |
| Photos | A | tooltip + count |
| Overflow `⋯` | Radix, **click-only** | not hover |

Note the row contains a cell (overflow) that is deliberately click-only, and read-only cells
that must *not* offer a hover affordance at all — a hover box on a fact advertises a click that
does nothing. Any unified hook has to express "tooltip", "menu", and "nothing" without three
implementations.

### 2.2 The specific live defect

The three engine-D pills **flash continuously while the pointer is stationary on the pill** —
open→close→open, repeating, without pointer movement. Three fixes have been applied and the
symptom persists:

1. `modal={false}` on the Radix `Root` — its default puts `pointer-events: none` on `<body>`,
   which alone guarantees the loop. Necessary, insufficient.
2. Removed `HoverTooltip` from the dropdown trigger — engines A and D were both binding the same
   gesture on the same element, and A portals a layer under the cursor. Necessary, insufficient.
3. Replaced element `mouseleave` with a document-level `pointerover` hit-test ("is the pointer
   inside the trigger or the panel *now*"), so a spurious boundary event answers "still inside".
   **Not yet verified in a browser.**

---

## 3. Ranked hypotheses for the residual flashing (unconfirmed)

State which you find most likely and why, and name the cheapest decisive test for each.

- **H1 — Two engines on one element.** The pill trigger had both a tooltip (A) and a menu (D).
  A portals a tooltip under the cursor; that generates leave/enter on the element below it.
  *Partly addressed; may not be fully, because sibling cells still mount A and the tooltip
  layer can sit over a neighbouring pill.*
- **H2 — Reflow feedback loop.** `useCartonContextBarLayout` runs a `ResizeObserver` on the bar
  and computes `classifyCompact`, which changes the pills' visible label (short vs full) and
  therefore their width. If opening the menu changes measured layout, the pill can move out from
  under a stationary pointer → close → move back → open. **This is the hypothesis the author now
  ranks highest and has not tested.**
- **H3 — Portal-induced scrollbar.** The Radix panel mounts with `avoidCollisions={false}`; if
  it overflows the viewport it can add a document scrollbar, shrinking viewport width by ~15px,
  reflowing the flush row, and moving the pill. Same loop as H2 by a different trigger.
- **H4 — Parent-controlled `open` fighting Radix's internal state.** The picker's open state is
  lifted (`open={openPicker === 'platform'}` + `onOpenChange`) so the parent can enforce
  one-menu-at-a-time. Radix also derives its own open state from trigger events. Two writers.
- **H5 — Unstable handler identity.** `onOpenChange` is an inline arrow recreated every render,
  so the hover callbacks change identity every render. Should be benign for event handlers;
  included for completeness.

---

## 4. What we want (the ask, stated as an outcome not a design)

One hook — call it `useHoverSurface` — that every cell on this row uses, such that:

- **Behaviour is identical** across tooltip cells, menu cells, and the pills. One open rule, one
  close rule, one delay pair, expressed once.
- **At most one hover surface is open** on the row at a time (today the parent hand-rolls this
  for the pills only, via `openPicker`).
- **Read-only cells declare themselves** and get no hover affordance beyond a tooltip.
- **It never takes keyboard focus.**
- **It is immune to spurious boundary events** — the class of bug in §3, not just the instance.
- Hover is an *addition*: click/keyboard must still open and close every menu.

---

## 5. Decisions — take a side on each

**D1 — One hook, or one hook per *kind* (tooltip vs menu)?**
The row needs a text tooltip on some cells and a full interactive panel on others. Is the right
consolidation one primitive with a `content` slot, or two primitives sharing one *timing* hook?
Argue from real systems, not taste. Note that `HoverTooltip` has **375 consumers** — any change
to it is app-wide, whereas `CopyChipHoverMenu` (7) and `useRailHoverPreview` (7) are local.

**D2 — Should the pills keep Radix `DropdownMenu` at all?**
Radix is built for click/keyboard menus; hover-open is not a supported mode (there is no
`openOnHover`, and the fix required `modal={false}` plus a document listener to work around its
assumptions). The alternative is to render the pills through `CopyChipHoverMenu`, which is
already hover-native and already on this row for the order/tracking chips. Trade-off: Radix gives
typeahead, roving focus, and `aria` menu semantics for free; the in-house one does not.
**State plainly which loses more.**

**D3 — `mouseleave` vs a document-level pointer hit-test.**
The current fix abandons element `mouseleave` for a `pointerover` hit-test on `document`. Is
that a legitimate industry pattern for portal-based hover surfaces, or an over-correction with
its own costs (a listener per open surface, `pointerover` fires on every element transition)?
What do mature libraries actually do — and specifically, what does the "safe triangle"/hover-path
approach used by some menu libraries buy that a hit-test does not?

**D4 — Should hover-open exist on this row at all?**
The operator's hands are on a scanner. Hover-opening a menu means the menu opens when the pointer
merely *crosses* a cell on its way somewhere else. The alternative is click-to-open everywhere,
consistently, with hover reserved for tooltips. This is the option the team has not seriously
considered and it may be the correct one. Argue it properly, including against the fact that two
cells on this row (order/tracking chips) have shipped hover-open for months without complaint.

**D5 — The delay pair.**
Three values exist (0/120/150ms). Recommend one open and one close delay, with evidence.
Consider asymmetry explicitly: open is currently instant and close is debounced, which is what
lets an operator cross the gap onto the panel. Does the literature support instant-open at this
density, or is a small open delay (hover intent) required to stop menus firing on transit?

**D6 — Where does the "one at a time" rule live?**
Today the parent owns it for pills (`openPicker` state), the rail engine owns it globally via a
module-scope singleton, and tooltips have no such rule (two tooltips cannot both be open, but
only accidentally). Should the unified hook own a registry, or should the row own it?

---

## 6. Open questions — answer with sources

1. **What is the 2026 state of the art for hover-intent in dense operator/industrial UI?** Not
   consumer web. Warehouse WMS, trading terminals, DAWs, CAD — surfaces where the pointer is
   frequently *in transit* across dense chrome. Name systems and their measured delays.
2. **Is there a canonical state machine for this?** (idle → pending-open → open → pending-close).
   Point at a real implementation — XState's hover examples, Floating UI's `useHover` with
   `safePolygon`, Radix's internal `Menu` timing, Ariakit, Base UI. Which of these would solve
   §3's whole *class* of bug rather than the instance?
3. **Does `pointerover` hit-testing on `document` have a name and a known failure mode?** In
   particular: touch, pen, and the case where the pointer leaves the window entirely.
4. **How do design systems reconcile "tooltip" and "menu" hover?** Are they one primitive with
   two contents, or two primitives over one timing hook, in systems you can name?
5. **Accessibility:** WCAG 1.4.13 (Content on Hover or Focus) requires hoverable, dismissible,
   persistent content. Does a hover-opened *menu* (as opposed to tooltip) satisfy it, and what
   does it oblige us to add? Does the answer change because a keyboard-wedge, not a person, owns
   focus?
6. **Is there prior art for a flush, dividerless chrome row that reveals cell boundaries only on
   hover?** We adopted an inset ring (`ring-inset`, so nothing shifts) after a `border` would
   have moved the row 1px. Is ring-on-hover the standard answer, or is there a better one?

---

## 7. Constraints any recommendation must respect

These are ratified house law; a recommendation that violates one will be rejected outright.

- **No new motion.** This row animates nothing today and must continue to. Opening is instant.
- **Never steal focus.** The wedge owns it.
- **No layout shift on hover.** Borders are out; inset rings are the current answer.
- **Flush-square chrome.** No soft radius, no pill bands, `gap-0` between cells.
- **One SoT per job.** The output must *delete* engines, not add a fifth. A recommendation that
  leaves all four in place and adds a coordinator is a failure.
- **Guard-testable.** House practice is that a retirement is not done until the old path is
  deleted or a shrink-only guard test names the exact surviving call sites. Your recommendation
  should say what the guard asserts.

---

## 8. What "done" looks like

A single hook with a stated signature, adopted by every cell on this row, with:
- engines B, C, and D reduced to one (A may survive app-wide if D1 says so),
- one open delay and one close delay as named constants,
- the one-at-a-time rule in exactly one place,
- a named guard test that fails if a fifth engine appears on this row.

Anything less and the next agent adds engine five.
