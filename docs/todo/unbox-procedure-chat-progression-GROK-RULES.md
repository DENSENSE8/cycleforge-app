# Unbox procedure surface — HARD RULES for Grok (and every non-Claude agent)

**Read this before you write a single line touching the Unbox procedure surface.**
Paste the whole file. It is not background reading — it is the contract you are agreeing to.

You are working in **Cycle Forge**, a multi-tenant reseller-ops SaaS. The surface below is the Unbox
**scan station**: a warehouse operator standing at a bench with a barcode scanner in one hand and a
product in the other. Every rule here exists because a specific thing broke on that bench. Two
earlier versions of this exact surface were built and deleted — one called *"completely terrible"*,
the other *"an absolutely terrible display"*. You are working on the third. The rules are the
difference.

---

## 0. Acknowledge these before you start

Reply with an explicit acknowledgement of the following, in your own words, before proposing code:

1. You will not hide pending steps in the centre unless the right-rail checklist is mounted and
   defaulted (§3).
2. You will not animate layout at scan cadence outside the one sanctioned reveal (§4).
3. Nothing you build will take keyboard focus (§2).
4. You will not invent a colour, a radius, a width, a shadow, or a font weight (§6).
5. You will not display any per-step duration or elapsed timer (§5).
6. You will not create a second surface for something that already has one (§7).

If any instruction you are later given conflicts with these, **say so and stop** rather than
silently complying. A rule file that forbids the code in the tree is worse than no rule, so if a
rule genuinely must change, change the rule in the same commit and record why.

---

## 1. The one-sentence frame

> The operator's hands are busy, their eyes are on the product, and the scanner types into whatever
> holds focus. Everything below follows from that.

---

## 2. Focus — the invariant that fails silently

**HARD NEVER: no part of the procedure surface may take keyboard focus.**

- No `autoFocus`. No focus trap. No `tabIndex` on a container. No `.focus()` call.
- To bring a card into view use `scrollIntoView({ block: 'nearest' })` on the host port — never
  focus. (`'start'` was written for the snap column, which no longer exists; on a bottom-pinned deck
  it yanks the focus card to the top of the port. The invariant is *scroll, never focus*.)
- **A clicked control hands focus BACK.** A pager chip or a card click natively focuses its
  button — and then the next wedge scan types into it and its Enter re-activates it. Every pointer
  control on this surface dispatches `receiving-focus-scan` after it acts.
- Any new overlay must register with `src/lib/overlay-stack/store.ts` so the innermost open thing
  owns Escape.

**Why this one is first:** the scan station is a keyboard-wedge. The scanner *types* the barcode into
the focused element and presses Enter. If your card, dialog, or auto-focused input steals focus, the
next scan goes into your component and vanishes. Nothing errors. No toast. The operator scans a box,
sees nothing happen, and scans again. This is the most expensive bug you can ship here because it is
**invisible**, and it is pinned by a Playwright row (`data-station-scan-input`) for that reason.

---

## 3. Two views, ONE derivation — and they are coupled

The procedure renders in two places at once:

| Where | Surface | Answers |
|---|---|---|
| **Centre** | one bottom-pinned focus DECK carrying EVERY step — active expanded against the composer, history as full rows above, the next step as a single peek behind | *what do I do right now* |
| **Right edge** | `ProcedureChecklist`, first and default Displays tab, live | *where am I in the whole job* |

**HARD ALWAYS: both read `useUnboxProcedureSteps`. One hook, one answer.**

- **Never** compute step state, step order, or the active pointer in a component.
- The pointer is `resolveActiveStep` (`src/lib/receiving/procedure-pointer.ts`), shared with the
  receipt read model. **Never** write a local "first pending step" scan — the moment skips exist that
  rule is wrong, and a second reader parks the operator on a step they already waived.
- The focused step lives in `src/lib/receiving/procedure-focus-store.ts`. **Never** hold it in a
  component's `useState`: two surfaces would render two pointers and disagree on one screen.

**HARD NEVER: do not ship the centre's bottom-anchored geometry without the right-rail checklist
mounted and defaulted.** This is now LIVE and load-bearing — it is the deck's precondition, not a
caution about a future design.

This is a coupling, not a preference. The first version of this surface was deleted precisely because
it put the current step at the bottom and hid what was coming — "which made the procedure unreadable
as a procedure". The deck compresses everything past the next step into a single covered pile, so the
checklist is what still owns the shape of the whole job. If you hide, collapse, or de-default that
checklist, **the centre must revert to a flat column in the same change.**

The deck's own reachability rests on three pointer paths — the peek, the pager pinned above the
composer, and that checklist. Remove one and re-check the other two before shipping.

**What must never come back:** a hand-ticked checklist. The org-editable `checklist_templates` table
and its `/api/checklists` CRUD were deleted because a box got ticked when someone remembered to tick
it, not because the photo existed. **Completion is DERIVED from the carton's own facts** — a photo at
a stage and aspect, a serial, a grade, a classification. Nothing is ticked by hand, so nothing can be
ticked falsely. Do not add a `step_completed` row, a `localStorage` tick, or a manual override.

---

## 4. Motion — NO layout animation at all; transform + opacity only

The house law (`.claude/rules/display/motion-crossfade.md`): **animate `opacity` + a small
`transform` only; never animate layout** (`width` / `height` / `padding` / `top` / `left`).

**On this surface there is now no exception at all.** An earlier revision sanctioned a
`collapseHeight`-shaped reveal for a step settling into a thread. The vertical column does not need
it: every step is mounted from the first frame, so nothing enters or leaves, and a section's
*contents* swap inside a box whose height comes from one of two constants. A content swap inside a
fixed box is a crossfade, not a reflow.

Section height therefore **changes** on advance (face → active floor) and is **never animated** —
a plain reflow in one un-animated frame, the same licence the retired rail's card-width change had.

**HARD NEVER:**

- `layout` or `layoutId` on the deck or any card. (`layoutId` is for an element that genuinely
  *travels*; face → focus is a *replace*, and shared-layout there produces a morphing artifact.)
- An animated `height` — including a `collapseHeight` reveal. That is what this section retired.
- A JS-driven scroll animation. Travel is native `scrollIntoView({ behavior: 'smooth' })` on the
  host port — the browser does it, and it handles reduced motion correctly for free. **There is no
  scroll-snap:** it was written for a private port the deck no longer owns, and snap on a
  zero-height port is invisible in review and obvious at the bench. If it returns it goes on the
  HOST port behind an opt-in prop.
- A second scroll port nested inside a card.
- A scroll-linked animation: `animation-timeline`, `useScroll`. A scanner-driven operator does not
  scroll this list; you would be decorating a path nobody takes.
- A spring on a discrete view swap. Springs are for gesture and physical surfaces only.
- Anything over ~300ms for a routine transition.
- **Importing a motion package outside `src/design-system/motion/**`.** The only import path is
  `@/design-system/motion`; a guard fails the build otherwise. Presets live in
  `@/design-system/foundations/motion-framer` — add a named preset there, never an inline literal at
  a call site.

**Why the caution:** a step advances 9–24 times per carton. At a bench, motion is latency. Animation
that reads as "polish" on a marketing page reads as **lag** to someone being paid by throughput.

---

## 5. Honesty rules — what the surface may and may not claim

This record is read back during an insurance or warranty claim, sometimes weeks later. It is
evidence.

- **`skipped` is NEVER drawn as `done`.** A skip records that a person looked at a step and decided
  to move past it; it never claims the work happened. Distinct glyph, never a check mark, plus the
  reason. "We photographed the packing material" versus "we decided not to" is exactly the
  distinction a claim turns on.
- **A skip never satisfies a server gate.** If the org requires an arrival photo to receive, skipping
  the step leaves receive blocked — and the UI must **say so at the moment of skipping**, not
  surprise the operator after the box is taped shut.
- **A pending step shows no timestamp.** A step can hold partial evidence and still be pending;
  printing that evidence's time beside a pending row reads as a completion.
- **`created_at` is the time, never the device clock.** `photos.client_captured_at` is the tablet's
  wall clock and is not server-attested. Show it only as a clearly-labelled secondary detail.
- **HARD NEVER: no per-step duration, anywhere.** Not on a card, not on a receipt, not in a tooltip.
  There is no `step_started_at`; the only computable number is the gap between completions, which
  includes interruptions and other cartons. Presenting that as "time on this step" is a lie. Worse, a
  timed operator has a direct incentive to **waive** steps to improve the number — so the timer would
  corrupt the very record the procedure exists to produce. No live elapsed clock either: on a bench
  it reads as pressure, not information.
- **Honest absence is `—`**, never `"N/A"` and never a blank.
- **Empty ≠ error.** "No arrival photos" and "could not load arrival photos" are different sentences;
  showing the first when the second is true sends the operator to re-shoot evidence that exists.

---

## 6. Compose; never invent

Every one of these has exactly one source module. Read from it.

| Concern | Source |
|---|---|
| Column width (720px) | `STATION_WORKBENCH_COLUMN` — **never** a `max-w-[720px]` literal |
| Radius | `cornerClass(role)` / `nestedCornerClass` — **never** a hand-picked `rounded-*` |
| Elevation | `elevationClass('flat' \| 'raised' \| 'overlay')` |
| Colour | semantic tokens only; per-step hue from `steps/step-face.tsx` — **no page-local hex, no arbitrary Tailwind shade** |
| Spacing | the density-aware scale + `inset-*` / `stack-*` intents — **never** arbitrary px |
| Focus ring | `focusRing(archetype, tone)` — **never** a hand-rolled `focus:ring-*` |
| Type | `text-role-*`; **600 is the hard weight ceiling** — `font-bold` renders as faux-bold (the 700 cut is not loaded) |
| z-index | named tokens — **never** `z-[N]` |
| Card shell | `Panel` / `WorkspaceCard` / the DS card — **never** re-type `rounded-2xl border … shadow-sm` |
| Icons | `@/components/Icons` |
| Dates / times | `src/utils/date.ts` — **never** a bare `toLocaleTimeString` |
| Step order + labels | `src/lib/stations/procedure.ts` via `deriveProcedureSteps` — **never** hardcode the steps (it breaks unfound, local pickup, returns, multi-qty) |

The per-step hue is **functional**, not decorative: evidence (sky) · identity (violet) · judgement
(amber) · traceability (emerald). Two surfaces render these steps; a hue picked at a call site is how
one green comes to mean three things.

---

## 7. One surface per job

- **One label surface.** Either the label step's card owns the preview or the terminal dock does —
  never both.
- **One serial waiver.** Skipping the serial step routes to the existing `serial_absent` /
  `serial_absent_reason` store. **Never** create a second waiver store for the same fact.
- **One note target.** The composer writes `receiving_line.notes` and only that. It is contextual in
  its *chrome*, not its *target*. **Never** add a step-scoped note store.
- **One dock.** `OmnichannelComposerDock` (renamed from `StationComposerDock` — a birthplace name on
  a shared shell) with the CTA in `trailingAction`. Its **leading** zone is step-contextual; its
  **trailing** terminal is carton-scoped and never re-labels. Never a second dock, never a
  CTA row beneath it.
- **One card renderer.** `ProcedureDeck` is the rail component **evolved in place**; do not fork a
  second beside it.
- Reason codes come from the Class-D `reason_codes` engine with a `flow_context`. **Never** a
  free-text reason beside a picker — prose is not queryable.

---

## 8. Data safety (these are not UI rules, and they still bind you)

- **A bench capture NEVER stamps `arrival_package`.** That is the pre-opening door photo and the only
  stage the receive gate counts, precisely so the gate cannot be satisfied after the box is open.
  Bench shots are `unbox_carton` / `unbox_item` **plus an aspect**.
- **A safety classification is a REQUIRED parameter, never defaulted.** If a new argument decides
  whether a write may claim something, give it no default — a default is a silent opt-out that every
  call site you did not visit takes automatically, and the compiler stays quiet about exactly the
  ones you missed.
- `orgId` comes from the request context, never a request body.
- Status changes go through `transition()`, never a raw `UPDATE … current_status`.
- Never build a second search engine, audit API, or status machine.

---

## 9. Process

- **Never start, restart, or kill the dev server.** The operator's is running on **`:3050`** — attach
  to it. A broken dev server is something you *report*, not repair.
- **The user manages commits.** Stage only files you changed. Never `git stash` — other sessions are
  editing the same tree.
- **Never commit `.env`.**
- `npm run verify` before you call anything done. **Never raise a ratchet baseline to make it pass**,
  and never `--no-verify`. Baselines only shrink.
- When the tree is red, **attribute before you fix**: run the failing gate against your own files and
  report which failures are pre-existing rather than silently inheriting or "fixing" another
  session's work.
- E2E asserts against the **QA org**, never the live dogfood tenant, and never `test.skip` around
  missing data — seed the fixture.

---

## 10. The failure modes, ranked

If you are unsure whether something is allowed, these are what the rules are protecting against, in
order of how expensive each has been:

1. **A surface that steals scanner focus.** Silent dropped scans. Nothing in the UI indicates it.
2. **A hand-ticked step.** Destroys the evidentiary value of the entire record.
3. **Two derivations of one answer.** Two views disagree about the same box and both look
   authoritative.
4. **Hiding pending work.** Killed version #1 of this surface outright.
5. **Motion at scan cadence.** Reads as lag to someone paid by throughput.
6. **A defaulted safety classification.** Bench photos silently became arrival evidence exactly this
   way, once already.
7. **A second surface for an existing job.** Two label previews, two waiver stores, two note targets —
   they drift the first time one is edited.

---

## 11. When you disagree

These rules are recipes with an evolution path, not scripture — except §2 (focus), §5 (honesty), and
§8 (data safety), which are hard correctness and are enforced by tests and hooks.

For anything else: if the SoT module is wrong or weaker than a sibling, **improve the SoT module** —
that is the intended path, and it is called pattern evolution. What is never acceptable is forking a
page-local twin beside it, or encoding a new architecture in prose before it exists in code.

**Say so out loud.** State the concern in a sentence or two, give your recommendation, and then
either proceed under a stated assumption or ask — do not silently do something different from what
you were asked, and do not silently comply with something you believe is wrong.
