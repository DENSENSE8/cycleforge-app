# Unbox in-line display · moving outline · game-HUD stepper — phased PLAN

> **Scope.** The two-band flush dock (Macro / continuous flow) is **shipped**
> (`UnboxDockHost` · `UnboxDockScanEntry` · `UnboxProcedurePager`, guard
> `unbox-dock-one-shell.guard.test.ts`). This plan builds the **complementary
> in-line display (Micro / contextual validation)** and the **moving outline**
> that ties the two together — the "hybrid" the design calls for: the **dock is
> the command palette (input)**, the **in-line row is the state visualizer
> (output)**, one derivation drives both.
>
> **This is an SoT + guards + display-method upgrade**, not a page-local feature.
> Every phase names the SoT row(s), the guard(s), and the display-rule doc it
> moves. Nothing here forks a page-local twin.
>
> **It EVOLVES the live scan-cockpit (`display/scan-cockpit.md`), it does not
> compete with it.** The cockpit's DO/KNOW split already says: centre + dock =
> the one armed **DO** action for the beat; right Displays column = **KNOW**
> (step reference). This plan enriches the **DO plane** — the moving outline is
> the "hardware-agnostic cursor" that isolates, on the in-line row, exactly the
> target the dock is asking for. The KNOW cockpit rail is untouched.

---

## Ground truth (verified 2026-08-10, files read)

| Concern | Current module | Current behaviour |
|---|---|---|
| In-line row (Micro) | `line-edit/PoLineCaptureRow.tsx` | Invariant `h-11` joined bar: `[ ConditionPills barDistribute (flex-1) │ Serial seg (green w-11) │ Photos seg (blue w-11) ]`. Segments are **icon-only**, `data-capture-segment` + `data-capture-filled` already stamped; junction click **opens Displays** — nothing expands in place. |
| Row chrome SoT | `workspace/po-line-capture-chrome.ts` | `PO_LINE_CAPTURE_ROW_CLASS` / `captureSegmentClass` / `PO_LINE_CAPTURE_*`. Docblock law: **row is INVARIANT** (no segment hidden/disabled/reordered) and **edit lives in Displays** (no in-row expand). |
| Condition selector | `workspace/ConditionPills.tsx` + `lib/condition-tone.ts` (`conditionPillClass`, `conditionGradeTone`) | Per-grade hue map; Unbox uses `labelVariant="full" layout="barDistribute"` (always-expanded strip). **`collapsible` mode already exists** (collapses to a graded Tags square after pick) — Unbox just doesn't use it. |
| Step derivation (ONE) | `line-edit/useUnboxProcedureSteps.ts` → `activeKey` · `railLeaf` · `focusStep` · `prevStep` / `nextNeighbour` · `steps` · `flow` | Single derivation over carton facts + the carton-keyed focus store. `activeKey ∈ {classify · arrival_label_photo · … · serial · condition · label · stage · null}`. |
| Broadcast channel | `lib/receiving/procedure-focus-store.ts` (`useFocusedStep` / `setFocusedStep` / `clearFocusForOtherCarton`) | Module store, **carton-keyed, ephemeral** (never URL). Already the ONE pointer both centre + checklist read. |
| Keycap chrome | `lib/keyboard/nav-keys/nav-key-face.ts` (`NAV_KEY_HINT_CLASS`) + `useNavRegion` | Accent-tinted flush keycap, **reveal-on-arm only** (⌘; leader), never a permanent per-row chip; **letters, never bare digits** (wedge law). |
| Focus token | `design-system/tokens/focus-ring.ts` (`focusRing`, incl. `cell` = **inset** ring) | No `data-active-step` moving-outline mechanism exists yet — **genuinely new**. No `token-ring`/`ring-active`/hex anywhere. |
| Exception waist | `lib/receiving/state-machine.ts` (`transitionReceivingLine`) + `lib/receiving/exceptions.ts` (`recordReceivingException`) + `lib/receiving/exception-codes.ts` | Domain chokepoint already exists: sets `receiving.exception_code` **in the same write** as the status transition; **never a terminal `FAILED`**. Closed taxonomy; array-position = `sort_order`. No in-line UI entry today. |
| Redundant staging directive | centre `line-edit/UnboxPlacementSection.tsx` **and** dock `steps/dock/LocationScanDockControl.tsx` | Both prompt "scan a location barcode" — the design's "delete the center block, keep the dock input" target. |

---

## Reconciliations with house law (READ FIRST — these keep the guards green)

The design's raw prose collides with three hard laws. Each is resolved below;
the phases implement the **resolved** form, not the raw prose.

1. **Colour — NOT "Electric Yellow".** `AGENTS.md`: *colour comes from tokens,
   no page-local hex.* The moving outline reuses the **operator-accent** tokens
   the armed-cursor already uses (`accent-bg` / `--ds-color-accent-*`,
   staff-themeable via `useStaffAccent`) — same family as
   `ARMED_CURSOR_TRACK_CLASS`. New export `ACTIVE_STEP_RING_CLASS`, `2px` **inset**
   (`outline-offset:-2px`, the `focusRing('cell')` precedent) so it keeps the
   flush zero-padding geometry.
2. **Keybinding hints — reveal-on-arm, LETTERS, not permanent digits.**
   `source-of-truth.md` → Nav keys: *`⌘;` arms a region; a stable single LETTER
   commits an actionable target; **never a bare digit** (wedge law — a scanner
   emits digits); a display metric / ring is **not** a jump target.* So the
   design's permanent `[1][2][3]` becomes **reveal-on-arm letter caps** via
   `useNavRegion` (middle region), reusing `NAV_KEY_HINT_CLASS`. The
   procedure-% ring stays a read-only control (no key). This is Phase 4 and is
   **opt-in** — it does not block Phases 1–3.
3. **"Expand in-row" vs "edit in Displays".** The current invariant
   (`po-line-capture-chrome.ts`) is deliberately the opposite of the design's
   "single click expands the row into a macro-view." **Recommended resolution
   (Decision Gate A):** keep **Displays** as the deep-edit home (one right-edge
   grammar) and express the design's collapsed↔expanded model on the row itself
   via the **moving outline driving `ConditionPills` collapse** — the active
   step's array auto-expands (high-contrast target); settled steps collapse to a
   dense token; the "rich fallback" is the already-mounted under-row
   `PoLineUnitCaptureList` + the Displays junctions. **No new in-row expando, no
   third right-edge surface.** The full-in-row-expand alternative is documented
   and **deferred** (see Decision Gate A).

---

## Decision gates (Phase 0 — confirm before building; recommended default in bold)

| # | Decision | Recommended default | Alternative (cost) |
|---|---|---|---|
| **A** | Deep-edit home for the "expanded fallback" | **Keep Displays + the under-row capture list; the moving outline drives `ConditionPills` collapse for the happy-path density.** Preserves the `po-line-capture-chrome` invariant and "one right-edge grammar." | Full in-row expando that pushes rows down — rewrites the capture-row invariant, adds a second deep-edit surface beside Displays, and fights spatial-predictability. Bigger SoT change; only take it with explicit sign-off. |
| **B** | Moving-outline motion | **Instant CSS snap** (data-attribute toggle, GPU-only `outline`, no layout; reduced-motion is a no-op). Matches the armed-cursor "instant hard-cut" grammar and bench speed. | ≤100ms micro-transition via a `feedback.hitMarker`-style ease. Adds eye-tracking help at the cost of one frame; wire only if the bench asks. |
| **C** | Condition grade hotkeys | **Letter caps, reveal-on-arm** (`⌘; → m → <letter>`), via `useNavRegion`. | Grade-code via the dock's existing grade CTA only (no per-array caps). Digits are **banned** either way (wedge law). |
| **D** | Ring colour source | **`accent-bg` operator-accent tokens** (staff-themeable), reusing the armed-cursor family. | A dedicated new semantic token — only if the accent proves too subtle in dogfood; still no page-local hex. |

Phase 0 is a ratification/RFC step: land the SoT-row wording (below) and the
Decision Gate answers before writing code. No code in Phase 0.

---

## Phase 1 — Moving outline foundation (the shared cursor)

**Goal.** A single `2px` inset accent outline that snaps around the exact in-line
target the dock is currently asking for, driven by `activeKey` — no React
state-drilling, pure data-attribute + CSS.

**Deliverables**
- New token `ACTIVE_STEP_RING_CLASS` (+ optional `activeStepRingFor(step)`) in a
  new `line-edit/active-step-ring.ts` (or fold into `po-line-capture-chrome.ts`):
  `outline-2 outline-accent-bg -outline-offset-2` via `cornerClass('flush')`
  geometry; reduced-motion-safe (no transition by default — Gate B).
- `PoLineCaptureRow` stamps `data-active-step={activeKey ?? undefined}` on its
  `data-capture-row` wrapper **only when this row is the controller-active line**
  (reuse the existing `isActiveLine` / dock-active wiring; a settled sibling row
  never lights).
- CSS in the row chrome (not a page-local sheet) targeting the segment/condition
  for the active step:
  - `[data-active-step="serial"] [data-capture-segment="serial"]`
  - `[data-active-step="photos"|"item_photos"] [data-capture-segment="photos"]`
  - `[data-active-step="condition"] [data-capture-condition]` (add a
    `data-capture-condition` marker to `PO_LINE_CAPTURE_CONDITION_CLASS`'s host).
- Source of `activeKey`: `useUnboxProcedureSteps(row).activeKey` — already the
  ONE derivation over `procedure-focus-store`. **No new store.**

**SoT deltas**
- `source-of-truth.md` → **Unbox centre (main)** / new row *Active-step outline*:
  "the in-line capture face lights a `2px` inset **accent** outline
  (`ACTIVE_STEP_RING_CLASS`) around the segment the dock's `activeKey` names;
  driven by `data-active-step`, never page-local hex, never a glow."
- `display/unbox-station.md` → per-step table: add a **KNOW-on-the-DO-plane**
  note that the segment for each capture step is the outline target.

**Guards**
- New `active-step-ring.guard.test.ts`: the token is accent-tokened (no hex, no
  `bg-amber-*`/`ring-*` glow), inset offset present, and `PoLineCaptureRow`
  stamps `data-active-step` from `activeKey` (not a local `useState`).
- Extend `po-line-flat-chrome.guard.test.ts`: outline is `outline`, never
  `shadow`/`blur`/`ring` glow; radius stays flush.

**Acceptance**
- Advancing the dock through serial → condition → photos snaps the outline
  across the active line's segments with zero layout shift; a new carton clears
  it (carton-keyed focus store); reduced-motion shows no animation.

---

## Phase 2 — In-line game-HUD stepper (Prev · Current · Next readout)

**Goal.** The in-line row reads like a rigid quest tracker for **this line's**
capture beat — Previous (muted token) → Current (high-contrast, outlined) → Next
(ghosted wireframe) — using the existing derivation, no new step list.

**Deliverables**
- New `line-edit/PoLineCaptureStepper.tsx`: a compact, flush, zero-radius strip
  rendered inside/adjacent to `PoLineCaptureRow`, fed by
  `useUnboxProcedureSteps(row)` (`prevStep` · `activeKey`/current · `nextNeighbour`).
  - **Previous** = `text-text-faint` dense token, no border.
  - **Current** = accent, `2px` inset outline (shares `ACTIVE_STEP_RING_CLASS`).
  - **Next** = `opacity-40` `border-dashed` wireframe; **space is reserved**
    (spatial predictability — DOM never jumps).
- Positional (`prevStep`/`nextNeighbour`) not skip-target (`nextStep`) — the
  hook already separates these and the docblock is explicit about why.
- **Read-only.** Clicking Current is a no-op; clicking Previous calls
  `focusStep(prevKey)` (the existing reopen affordance) — the SAME store the dock
  pager uses, so dock and stepper cannot disagree.

**SoT deltas**
- `source-of-truth.md` → **Unbox centre (main)**: name `PoLineCaptureStepper` as
  the per-line beat readout; "positional neighbours only; never `nextStep`;
  Next is a reserved ghost, never progressive-hidden."
- `display/instrument-panel.md` (P2 *procedure is the product*): note the in-line
  micro-stepper as the DO-plane per-line telemetry (distinct from the KNOW rail).

**Guards**
- New `po-line-capture-stepper.guard.test.ts`: reads `prevStep`/`nextNeighbour`
  (never `nextStep`); Next reserves geometry (no unmount); reopen routes through
  `focusStep` (no local pointer).

**Acceptance**
- On a fresh line the stepper shows the trio with Serial current; capturing a
  serial advances Current→Condition with the ghost Next already sized for Photos;
  clicking a Previous token reopens it in the dock (one pointer).

---

## Phase 3 — Standardize condition active states + happy-path collapse

**Goal.** Kill the "too much cognitive load" the design flags on the grading
array: **one muted inactive tone, one high-contrast predictable active state**,
and collapse the array in the happy path — auto-expanding only when it is the
active step (driven by the Phase 1 outline).

**Deliverables**
- `lib/condition-tone.ts`: introduce a **unified inactive class** (single muted
  tone for every un-selected grade) + a **single high-contrast active class**;
  keep per-grade hue **only** on the selected/active face. `conditionPillClass`
  gains an explicit "inactive is uniform" path (SoT change — this is the
  standardize-active-states critique).
- Unbox capture row switches `ConditionPills` from always-`barDistribute` to
  **`collapsible`** (the mode already exists): collapsed = the graded Tags square
  (dense happy path); expanded = the full array. The **moving outline drives it**
  — when `data-active-step="condition"`, force `expanded` (via the existing
  controlled `expanded`/`onExpandedChange` props); otherwise collapse once graded.
- Keep `labelVariant="full"` for the expanded array; the `[&>*+*]:-ml-px` flush
  seam and grade hues on the **selected** face stay.

**SoT deltas**
- `ui-design-system.md` → chips / condition tone: "inactive grades render one
  muted tone; the selected/active grade carries its hue + high-contrast fill —
  no outlined-vs-filled mix across inactive pills."
- `source-of-truth.md` → Condition grade → color: note the uniform-inactive rule.

**Guards**
- Extend the condition-tone guard (or add `condition-active-state.guard.test.ts`):
  inactive pills resolve to ONE class; exactly one active treatment; no per-grade
  outline on inactive.
- `po-line-capture-entry.guard.test.ts`: capture row uses `collapsible`
  `ConditionPills` and binds `expanded` to `activeKey==='condition'`.

**Acceptance**
- A graded line shows a compact condition token in the happy path; stepping the
  dock to Condition auto-expands the high-contrast array; inactive grades are
  visually uniform; re-grading collapses it again.

---

## Phase 4 — Reveal-on-arm keybinding indicators (letters, opt-in)

**Goal.** Embed the design's shortcut hints **the house way**: `⌘;`-armed
reveal, single **letters**, over actionable targets only — never permanent, never
digits, never on the ring/metric.

**Deliverables**
- Register the capture row's actionable targets (Serial seg, Photos seg, each
  condition grade when the array is the active step) as **middle-region** targets
  via `useNavRegion({ id: 'm', targets, onCommit })`.
- Reveal `NAV_KEY_HINT_CLASS` caps only while the middle region is armed;
  commit is **sync** (`commitArmed`) → fires the same handler as a click.
- Register declared keys in `nav-key-uniqueness.guard.test.ts` (per-region
  uniqueness). Condition grade letters are stable + declared (Gate C).
- The procedure-% ring and the stepper's read-only tokens carry **no** key.

**SoT deltas**
- `source-of-truth.md` → Nav keys: add the Unbox capture-row middle-region
  targets to the consumer list ("Serial · Photos · condition grades").

**Guards**
- `nav-key-uniqueness.guard.test.ts` (extend): capture-row keys unique in region
  `m`; no bare digit; ring/stepper excluded.
- `band3-find-only.guard.test.ts` stays green (no page-local `⌘F` / bare `/`).

**Acceptance**
- With no carton armed, no caps show; `⌘; → m` reveals letter caps on Serial /
  Photos / grades; pressing a letter commits exactly as a click; a wedge scan of
  digits never fires a grade.

---

## Phase 5 — Contextual exception pathway (row + dock)

**Goal.** The design's "flag an anomaly → route through `transitionReceivingLine()`,
append root cause to the exception registry, clear the item, never hit `FAILED`."
The domain waist already exists; this is the UI entry + guard.

**Deliverables**
- A quiet exception affordance on the in-line row (overflow / long-press on the
  segment, or a dock overflow entry) opening a `ReasonChipPicker` bound to the
  **narrowed** OS&D vocabulary from `exception-codes.ts` (never free text).
- Commit calls the existing waist: `transitionReceivingLine()` **+**
  `recordReceivingException()` in the **same write** (status computed by the
  transition; `exception_code` set alongside — `COALESCE` semantics). The line
  advances to its real next stage, **never a terminal `FAILED`**.
- Optimistic clear of the active line + moving outline advances to the next line,
  matching the "smoothly clear the item" behaviour.

**SoT deltas**
- `source-of-truth.md` → (existing) Note vs label grain / exception codes: add
  the Unbox in-line **entry point** (UI) to the exception writer list; reaffirm
  "never a fifth exception writer" — this composes the existing one.
- `backend-patterns.md` → receiving exceptions: note the in-line UI entry.

**Guards**
- New `unbox-inline-exception.guard.test.ts`: the entry composes
  `transitionReceivingLine` + `recordReceivingException` (no raw
  `UPDATE … workflow_status`, no `FAILED` terminal, no free-text reason); code is
  from the narrowed OS&D set.

**Acceptance**
- Flagging "shattered / unreadable barcode" writes an `exception_code`, moves the
  line to a real non-terminal stage, and clears it from the active beat; the
  Unfound/exception filter sees it; no `FAILED` anywhere.

---

## Phase 6 — High-density refactor + delete the redundant staging directive

**Goal.** The design's "high-density utilitarianism" + friction deletions,
honoring existing tokens (no page-local px, no new radius).

**Deliverables**
- **Delete the centre LOCATION STAGING directive** in `UnboxPlacementSection`
  that duplicates the dock's `LocationScanDockControl` prompt — collapse the
  instruction into the single dock input (the design's explicit delete). Keep the
  Placement **confirmation** (post-scan readout); remove only the duplicate
  "scan a location…" copy.
- Tighten `PoLineRow` thumbnail + meta vertical padding to the density scale
  (`inset-*` intents / `--cf-density`) — the design's "lock images to a strict
  compact aspect, tighten line height." **No arbitrary px** (spacing guard).
- Confirm the whole in-line stack is `cornerClass('flush')` (it already is);
  remove any stray soft radius surfaced by the audit.

**SoT deltas**
- `source-of-truth.md` → Unbox dock flush floor / Unbox centre: "location prompt
  lives ONLY on the dock `stage` control; the centre Placement section is a
  post-scan confirmation, never a second scan directive."
- `display/unbox-station.md` → `stage` step row: reaffirm single prompt home.

**Guards**
- New / extend `unbox-placement-single-prompt.guard.test.ts`: the "scan a
  location" copy exists in exactly one place (the dock control), not the centre.
- `spacing-tokens.guard.test.ts` stays green (no arbitrary px introduced).

**Acceptance**
- The `stage` beat shows one high-contrast dock input and a centre confirmation
  only — no duplicated orange/centre instruction; PO lines are visibly denser
  with no layout regressions; all density/spacing/radius guards green.

---

## Phase 7 — Verify · dogfood · document

**Deliverables**
- `npm run verify` green **on the files this plan touches** (report any pre-existing
  red from concurrent lanes separately — do not fix or inherit it).
- Targeted unit runs for each new guard (the `npx tsx --test <guard>` inner loop).
- Dogfood on the running `:3050` server (attach, never start): walk a Found
  carton serial→condition→photos→label→stage; confirm outline tracking, HUD
  advance, condition collapse/expand, letter caps on arm, an exception flag, and
  the single staging prompt.
- Update this doc's status; add a short **general** rule to the right
  `.claude/rules/*` if a repeated miss surfaces (paired do/don't).

**Acceptance**
- All new guards pass; dogfood screenshot of an in-procedure carton (outline on
  the active segment) and a settled carton (Print · Receive on the dogfood strip).

---

## Dependency order & parallelism

```
Phase 0 (gates/SoT ratify)
   └─ Phase 1 (moving outline)  ──┬─ Phase 2 (HUD stepper)
                                  ├─ Phase 3 (condition active states + collapse)
                                  └─ Phase 4 (keybinding caps, opt-in)
Phase 5 (exception pathway)  ── independent of 1–4; can run in parallel after 0
Phase 6 (density + delete)   ── independent; can run in parallel after 0
Phase 7 (verify/dogfood)     ── last
```

- Phases **1 → {2,3,4}** are sequential on the outline token; 2/3/4 are then
  parallelizable.
- Phases **5** and **6** depend only on Phase 0 and can land any time.
- Nothing here touches the **shipped dock** internals or the concurrent
  Displays/inspector WIP.

## Explicitly out of scope / deferred

- Full **in-row expand** macro-view (Decision Gate A alternative) — deferred;
  conflicts with the capture-row invariant and one-right-edge-grammar.
- Any change to the **KNOW cockpit rail** (`railLeaf`) or Displays leaves.
- Porting this display method to sibling stations (Testing / Arrival) — a
  separate port per `display/station-port-from-unbox.md`, one at a time, only
  after Unbox dogfood is signed off.
- Re-timing / re-theming the shipped two-band dock.

---

## Compound opportunities

- **Do now (in scope):** `ACTIVE_STEP_RING_CLASS` is reusable by any station's
  capture row — author it station-neutral so the Testing/Arrival ports inherit it.
- **Promote to DS next (2+ consumers):** the game-HUD stepper, once dogfooded, is
  a candidate `@/design-system/components/procedure` primitive (`ProcedureBeatStrip`).
- **Deferred (ask first):** carrying the moving outline into the KNOW rail so the
  cockpit leaf and the in-line segment light together.
