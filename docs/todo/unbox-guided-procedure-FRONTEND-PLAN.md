# Unbox guided procedure — FRONTEND PLAN

**Date:** 2026-08-01 · **Lane:** WS-DOGFOOD (`main`)
**Shared decisions (D1–D9), vocabulary table, sequencing, rule amendments:**
[`unbox-guided-procedure-INDEX.md`](./unbox-guided-procedure-INDEX.md) — **read it first.**
**Depends on:** BE-4 merged and green. Do not start FE-2 before that.

This is the lane that reverses a twice-rejected placement, so it is also the lane that must delete
what it replaces. **The refactor is the deliverable, not a side effect** — if this lands and
`ActiveLineConditionSerial` still does three jobs, it did not land.

---

## The shape

```
┌─ StationContextBar ────────────────── (unchanged, absolute float) ──┐
└────────────────────────────────────────────────────────────────────┘
┌─ ProcedureStack ─ max-w-[720px] (STATION_WORKBENCH_COLUMN) ─────────┐
│  header:   10:42 AM                                                 │  ← time left; right slot
│                                                                     │    ships EMPTY (D12)
│  ─────────────────────────────────────────────────────────────────  │
│  ✓ Shipping label            2 photos              10:38            │  ← done rows,
│  ✓ The box                   3 photos              10:39            │    collapsed, ascending
│  ✓ Packing material          1 photo               10:41            │
│  ⤳ Packing material          skipped · no damage   10:41            │  ← skipped ≠ done
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ CONTENTS                      4 of 4    Looks good → Condition│  │  ← ONE active step card;
│  │ · Sony WH-1000XM4          SKU-4471                           │  │    skip names its
│  │ · Bose QC45                SKU-1180                           │  │    destination
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
┌─ StationComposerDock (floating, contextual) ────────────────────────┐
│  Notes for this carton…                                             │
│  [+]                                        [ ▾ | Confirm contents ]│  ← primary = THIS step
└─────────────────────────────────────────────────────────────────────┘
```

Locked width is the existing `STATION_WORKBENCH_COLUMN` (`mx-auto w-full min-w-0 max-w-[720px]`) —
**import it, never re-type `max-w-[720px]`** (`station-workbench.md` hard-never, guarded).

---

## FE-0 · The DS primitive

### 0a. Extract the shared types — `src/design-system/components/procedure/types.ts`

`ProcedureStepState` and `ProcedureChecklistStep` currently live inside `ProcedureChecklist.tsx`.
Move them out and re-export, so the stack composes the same vocabulary rather than declaring a
parallel one. Rename the row type `ProcedureStepRow` (it is no longer checklist-specific);
`ProcedureChecklistStep` stays as a deprecated alias for one release.

### 0b. `src/design-system/components/procedure/ProcedureStack.tsx` (new)

A **sibling** of `ProcedureChecklist`, not a replacement — the checklist renders a read-only list for
any station; the stack is the interactive, bottom-anchored work surface. Different job, shared
primitive underneath (`pattern-evolution.md`: a new job earns a sibling that composes the shared
type).

```tsx
export function ProcedureStack({
  steps,              // ReadonlyArray<ProcedureStepRow>   state: done | active | pending | skipped
  activeKey,          // string | null — from resolveActiveStep; null ⇒ every step settled
  nextStep,           // ProcedureStepRow | null — what the skip advances TO
  renderActive,       // (step) => ReactNode   the ONE expanded body
  renderDoneRow,      // (step) => ReactNode   optional override; default = label · detail · time
  onSkip,             // (key) => void | null  omit ⇒ this step declares skip: false
  onReopen,           // (key) => void         a done OR skipped row is clickable
  headerStart,        // ReactNode — the time
  headerEnd,          // ReactNode — ships EMPTY (see 0d); the total lives on the receipt
  className,
}: ProcedureStackProps)
```

### 0c. The next-step peek and the skip control (INDEX D10 / D11)

The active card's header carries, right-aligned: **`Looks good → {next label}`**. It names its
destination — a bare "Skip" makes the operator guess where they land, and the whole point of the peek
is that they can see the next step is the one they want.

Three placement rules, each load-bearing:

- **The skip lives on the step card, not in the composer.** If it sat beside the dock's primary
  ("Confirm contents"), muscle memory would press it. On the card it is one click, visible, and
  physically separated from the commit.
- **`state: 'skipped'` renders differently from `done`** — a distinct glyph and the reason
  ("skipped · no damage to record"), never a check mark. The operator scanning the stack must be able
  to tell what happened from what was waved past. Same tone discipline as everywhere else: resolve
  from a registry, no page-local hue.
- **A skip that would leave receive blocked says so before it is taken.** The receipt route returns
  `blockedBy` (BE-4b); when the step being skipped is named there, the confirm shows it. Surprising
  the operator at Receive — after the carton is closed and the box is taped — is the failure mode.

`skip: 'waiver'` steps open a **reason picker** before advancing: compose `ReasonChipPicker` over the
`unbox_step_skip` vocabulary, exactly as QA-fail reasons do. **No free-text sibling** — that is the
`ReasonChipPicker` contract, and a prose reason is not queryable. `skip: 'pointer'` steps
(`arrival_check`) advance with no dialog, because there is nothing to waive.

**`serial`'s skip renders the existing `NoSerialControl`**, not the new picker. One waiver store, one
control (INDEX D10 rule 2).

### 0d. Geometry and motion are ruled — build the flat ledger (INDEX D12)

The stack is a **flat ledger of rows in vocabulary order**. Every step renders as a row —
`done`, `skipped`, `pending` collapsed to one line, `active` expanded to the one card. **No row
overlaps another**, nothing is layered, and no step is hidden. That is the whole geometry; the
Apple-Watch depth pile was evaluated and refused because it occludes the very timestamps the receipt
exposes and because piling upcoming steps is verbatim the first rejection's diagnosis.

Radius comes from the role layer, not a hand-picked class:

| Element | Call | Renders |
|---|---|---|
| Active step card | `cornerClass('card')` | `rounded-2xl` (16px) |
| Collapsed done / skipped / pending row | `cornerClass('row')` | `rounded-md` (6px) |
| Anything nested inside the card | `nestedCornerClass('card', <padStep>)` | snaps down the ladder |

No squircle, no `corner-shape`, no SVG mask — a superellipse is imperceptible at 16px on 1080p at
3 ft, and the paint cost is real. Physical width does **not** change the radius; role does.

Hard constraints, each one a law this repo already pays for:

- **Presentational only.** No fetch, no domain import, no `photoStage`. Everything arrives as props.
- **Motion is opacity only, and the layout snaps.** The active card crossfades its **contents** on
  `activeKey` with `framerPresence.stationCartonSwap` + `framerTransition.stationCartonSwapMount` —
  the **station** preset, not `workbenchPaneSettle`, because this swaps at scan cadence
  (`motion-crossfade.md` → the station-cadence sibling). Row positions and the card's height change
  in one un-animated frame under that crossfade.
- **No layout animation, and no exception was carved** (D12). Step advance fires at scan cadence
  9–24 times per carton — the "reflows on its own" case the law names. The hard cut that reduced
  motion already produces is the intended behaviour for **every** operator, not a degradation.
- **Never animate the stack's height.** Rows entering push the card down through normal flow; do not
  reach for `layout` on the container.
- **No scroll-linked animation.** Not `animation-timeline`, not `useScroll`. A scanner-driven
  operator does not scroll this list; the animation would decorate a path nobody takes.
- **The stack never takes focus.** No `autoFocus`, no focus trap, no `tabIndex` on the container.
  The wedge owns focus (`station.md` §3) and a step card that steals it drops scans silently.
- Selection/active state is **fill + inset ring**, never a size or height shift (`QUEUE_ROW`).

**`headerEnd` ships empty.** The slot stays in the API — it is the frame's declared right anchor —
but nothing occupies it in FE-0. The only honest time this surface has is carton-open → received, and
that number is not final until the carton closes, at which point the **receipt** owns it (FE-4). A
live clock in the stack header was refused (D12): on a bench it reads as pressure, not information.
Do not fill this slot with an elapsed timer, a step counter that duplicates the visible rows, or a
progress percentage derived from step count — a per-unit carton makes that denominator move.

**Deferred — do not build in FE-0:** holding the active card at a fixed Y while rows translate under
it. The pattern's names, for whoever re-opens this: **"sticky focus"** / **"focus-centered
scrolling"** in list virtualization; FLIP is the technique. It is the one refused idea with a real
problem behind it — saccade cost when the operator looks back from the product — but it is a layout
animation, and the supporting warehouse-bench measurement is proprietary and unpublished. Re-open it
only with a bench measurement (D12).

---

## FE-1 · The step-body registry

`src/components/receiving/workspace/line-edit/steps/` (new directory), one file per step:

| File | Renders | Composes (does **not** fork) |
|---|---|---|
| `ClassifyStepBody.tsx` | the classify pills | existing `TriageClassifySection` |
| `ArrivalCheckStepBody.tsx` | the door's shots, read-only | `PhotoGallery` (viewer SoT) |
| `CartonPhotoStepBody.tsx` | one aspect's capture pill + thumbnails | `ReceivingPhotoButton` with `photoAspect` |
| `ContentsStepBody.tsx` | title + SKU rows for the carton | `PoLinesAccordion` (see FE-2b) |
| `ConditionStepBody.tsx` | the chip slider | `ConditionPills` |
| `ItemPhotoStepBody.tsx` | the six-aspect sub-checklist | `ReceivingPhotoButton` per aspect |
| `SerialStepBody.tsx` | the serial field + OCR assist | `SerialCard` |
| `index.ts` | `UNBOX_STEP_BODIES: Record<string, StepBodyComponent>` | — |

`CartonPhotoStepBody` serves `shipping_label_photo`, `box_photo` **and** `packing_material` — three
declared steps, one component parameterised by aspect. Three near-identical files would be the fork.

**Guard:** `procedure-step-body.guard.test.ts` — every step `resolveProcedureSteps(unbox, …,
'capture')` can yield has a key in `UNBOX_STEP_BODIES`. Sibling of `procedure-divergence.guard.test.ts`;
a declared step with no body must fail CI, not render a blank card at the bench.

Each body takes one narrow props bag and **no controller**: `{ row, receivingId, staffId, onDone }`
plus what it specifically needs. Passing the whole `UnboxLineController` into every body re-creates
the god component this phase exists to dismantle.

---

## FE-2 · Mount it, and delete what it replaces

### 2a. `buildUnboxOverview` becomes the stack

`src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` — the overview returns
`<UnboxProcedureStack …/>` (the adapter, `line-edit/UnboxProcedureStack.tsx`) instead of
`POUnboxingSection` + `UnboxLabelPreview`. The label preview becomes the `print` step's body.

`UnboxProcedureStack` is the **only** module that knows both the domain and the primitive: it calls
`deriveProcedureSteps` + the aspect-count hooks + the waiver list, resolves the pointer through
`resolveActiveStep` (**never a local "first pending" scan** — that is the second reader D11 exists to
prevent), maps to `ProcedureStepRow[]`, and picks the body from the registry. It re-derives nothing.

### 2b. Separate and simplify the PO accordion

Today `PoLinesAccordion` renders the line list **and** hosts `ActiveLineConditionSerial` in
`activeRowSlot`, which itself branches into condition + serial + item photos. That is one component
doing four jobs and is why the flow cannot be stepped.

**Split it:**

- `PoLinesAccordion` keeps **one job** — the row-focused, locked-width list of lines with title, SKU,
  qty, and per-line state. It is the `contents` step body. `activeRowSlot` is **deleted**.
- `ActiveLineConditionSerial` is **decomposed** into `ConditionStepBody` · `SerialStepBody` ·
  `ItemPhotoStepBody`. The file is deleted; its `itemPhotoSlot` prop and the
  `data-unbox-item-photos` hook move to `ItemPhotoStepBody` (keep the attribute — a spec pins it).
- The line the steps operate on stays the accordion's selected row, still URL-addressable.

This is the "grand SoT refactor" — **one module per concern**, applied to the busiest component in
the station.

### 2c. Delete the checklist display (D9)

- Delete `UnboxProcedureChecklist.tsx` and the `checklist` entry in `buildUnboxSideTabs`.
- Remove `checklist` from `resolveUnboxSideTab` and from the strip order in
  `source-of-truth.md` / `station-workbench.md`.
- Keep the DS `ProcedureChecklist` primitive — other stations will want it.
- `unbox-procedure-checklist.spec.ts` is **retargeted, not deleted**: its five assertions (order, one
  active step, arrival-vs-bench, condition, return ordering) are all true of the stack. Rename it
  `unbox-procedure-stack.spec.ts` and repoint the selectors.

### 2d. Amend the three rules (INDEX → "This reverses a twice-rejected placement")

Do this **in the same commit as 2a**. A rule file that forbids the surface in the tree is worse than
no rule, because the next agent will "fix" the violation.

---

## FE-3 · The contextual composer

`src/components/receiving/workspace/line-edit/terminal/unbox-terminal.tsx` — flip
`STATION_TERMINAL_REGISTRY.unbox` to `hasSectionTabs: true` and resolve the VM from the **active step
key** instead of `mode-default`.

| Active step | Composer placeholder | Primary |
|---|---|---|
| `shipping_label_photo` · `box_photo` · `packing_material` | "Note about this photo…" | **Done** (advances when the aspect has ≥1 shot) |
| `contents` | "Note about the contents…" | **Confirm contents** |
| `condition` | "Why this grade…" | **Set condition** |
| `item_photos` | "Note about this item…" | **Done** |
| `serial` | "Note about this unit…" | **Add serial** |
| all done | "Notes for this carton…" | **Print · Receive** (today's carton-terminal VM, unchanged) |

- **One dock, one shell.** `StationComposerDock` + `slicedActionDockWrapperClass({ docked: false })`
  with the CTA in `trailingAction` and Send suppressed. Do not mount a second dock, and do not put a
  CTA row beneath it.
- **The note still writes `receiving_line.notes` and only that.** The composer is contextual in its
  *chrome*, not its *target* — a step-scoped note store would be a third note grain, and the label
  vs note grain split is a hard SoT.
- `disabledReason` renders as the host's line above the composer (embedded mode), unchanged.

This reverses the "the Unbox dock is carton-terminal" decision. Record why in the terminal module's
docblock: the objection was **cross-region action-at-a-distance** (a click on the right re-labelling
a button at the bottom). The step is now directly above the dock, so the primary is describing the
thing the operator is looking at.

---

## FE-4 · The closed-carton receipt

**Gated on the FE-0…FE-2 demo — do not build this in the first slice (D12).** The receipt is a
complex end-state for a shape that has been rejected twice. Prove the interactive flat list in the
centre canvas escapes the "status display" verdict of attempt #1 *first*; a receipt built before that
is work thrown away if the shape moves. Until it exists, a closed carton keeps rendering the settled
stack.

`src/components/receiving/workspace/line-edit/UnboxProcedureReceipt.tsx` (new)

- Renders when `GET /api/receiving/[id]/procedure-receipt` returns `closedAt != null`. It **covers
  the whole work surface** — it is not a banner above the stack.
- One row per step: label · what was completed **or what was waived and why** · **when** · who. A
  skipped step is never drawn as a completed one — the receipt is the document someone reads back
  during a claim, and "we photographed the packing material" vs "we decided not to" is exactly the
  distinction that matters there. Time via `src/utils/date.ts`
  (`formatTime12hPST` / `formatDateTimePST`), honouring the staff `timeFormat` preference. Never a
  bare `toLocaleTimeString`.
- The device shutter clock appears only as a secondary detail where it differs from `created_at`, and
  is labelled as device-reported (BE D6). Do not present it as the attested time.
- Bottom bar: **"Reopen to edit"** per step — calls the step's reopen writer (BE-3a) for a done step,
  or `DELETE …/skip` for a skipped one. Either way the waiver/stamp is **cleared, not overwritten**,
  and the stack returns to that step. Skipped rows in the live stack are clickable for the same
  reason.
- Empty/error follow the four settled states: a failed receipt fetch renders the stack, **not** a
  500 — degrade-not-fail.

**Shape, ruled in D12.** "Mobile-app-like" is the operator's reference, not the layout. Every named
analogue (Wallet, Uber, Strava, Fitness) is a ~390px portrait viewport; transposed literally to a
720px landscape column, that single centred rhythm reads as an under-filled page. So:

- **Four components, and only these four.** (a) the carton identified **unambiguously** — PO / tracking
  plus title + SKU, resolved through the existing chip SoTs, never a bare id; (b) the line-item step
  ledger; (c) the carton total; (d) one quiet **Reopen to edit**. A receipt that does not say *which
  box this was* is unreadable in the claim six weeks later, which is the only reason it exists.
- **Two columns, not one centred stack** — (a) + (c) beside the (b) ledger. Compose `Panel`; do not
  hand-roll a card shell.
- **No animated checkmark.** Consumer confirmation theatre becomes an irritant by the thirtieth
  carton of a shift, and reduced motion cuts it to nothing anyway.
- **Skipped rows are muted and retained**, with the reason inline — the aviation "item deferred, with
  justification" / "N/A with justification" treatment: the row stays in the list, visually
  de-emphasised, never an error tone and never an omission. Muted is `text-text-soft`, **not** italic
  and not a page-local gray — the research reply said "gray italic", which is not a channel this type
  system carries. Render from `state: 'skipped'` + the reason code. (**There is no
  `CockpitReceiptEntry.origin` type** — the reply invented it; see D12's caution.)
- **One total, static.** Carton-open → received, rendered once on the closed receipt. No live clock,
  and **no per-step durations** — D12 refuses them as underivable and evidence-corrupting.

---

## FE-5 · Condition as a real step

- **Desktop:** `ConditionPills` is already a horizontal chip row with `useHorizontalWheelScroll` —
  grow it, do not build a `ChipSlider`. Add a `density="step"` variant that renders the full row
  un-collapsed (the step card has the width; the meta row does not).
- **Mobile:** the same component in the QA action sheet / carton sheet at touch sizing
  (`IconButton size="touch"` floor, 44px).
- **Scan:** condition codes route through the existing classifier. Add a `CONDITION` branch to
  `detectStationScanType` (`src/lib/station-scan-routing.ts`) **only if** the codes are
  unambiguous against serial/SKU shapes; if not, gate it on the active step being `condition`
  (context-aware resolution, exactly as `resolveScanType` already does for serial-vs-tracking).
  Do not add an ambiguous global branch — that regresses every other station's scan.
- On commit: `POST /api/receiving/lines/[id]/condition` (now stamping `condition_graded_at`).
  Optimistic with rollback; the chip is pre-selected at the current grade so the act is one tap.

---

## FE-6 · Item photos as an aspect checklist

`ItemPhotoStepBody` renders one sub-row per aspect from `ASPECTS_BY_STAGE['unbox_item']`, with
required aspects (Settings Registry, default `included` + `serial`) marked and optional ones
available but not blocking.

Each sub-row mounts `ReceivingPhotoButton` with `photoStage="unbox_item"` + `receivingLineId` +
`photoAspect`. **All three threaded explicitly at the call site** — extend
`item-photo-wiring.guard.test.ts` so an aspect-less item mount fails the guard, the same way a
line-id-less one does today.

**Mobile studio:** `MobileReceivingPhotoStudio` takes an `aspect` prompt and an aspect stepper, so
the phone walks the same six shots in the same order. The desktop request already routes to
`/m/receiving/po/{ref}/item/{line}/photos`; add `&aspect=` and have the studio start there.

---

## FE-7 · Serial OCR pairing

`src/components/receiving/label-identify/useLiveSerialScan.ts` (new) — a **sibling** of
`useLiveLabelScan` sharing its loop shape:

| Shared verbatim | Differs |
|---|---|
| `gateFrame` on-device gate, `SCAN_INTERVAL_MS`, backpressure (one in flight, latest wins, stale aborted) | remote path → the box's serial read |
| consensus lock (N of M) | predicate = serial **shape**, not model string |
| freeze-frame + confirm | confirm **pre-fills the serial field**; it never writes |

If the two hooks end up >60% identical, extract the loop into `useVisionScanLoop` and let both
compose it — that is growth, not a fork.

Desktop ⇄ phone pairing reuses the existing Ably `receiving_photo_request` bridge: the phone's item
capture at aspect `serial` publishes its read back on the same channel the desktop already listens
on (`useReceivingPhotosRealtimeRefresh`). **No new realtime channel.**

---

## FE-8 · Playwright (QA org, `qa-desktop`)

| Spec | Asserts |
|---|---|
| `unbox-procedure-stack.spec.ts` (retargeted) | order · exactly one active step · arrival-vs-bench · condition · return ordering |
| + new row | completing a step collapses it upward and the next becomes active **without the composer losing the wedge** |
| + new row | `data-station-scan-input` still holds focus after the step advances (`station.md` §3 — the invariant the stack most threatens) |
| `unbox-procedure-receipt.spec.ts` | a fully received carton renders the receipt covering the surface, with a completion **instant** per step (never a duration — D12) and one carton total; **Reopen** returns the stack to that step |
| `unbox-procedure-skip.spec.ts` | skipping a step with a reason advances the pointer, renders the row as **skipped and not done**, survives a reload, and is reversible; a skip **does not** clear `blockedBy` — the carton is still refused at Receive |
| + row | `serial`'s skip renders `NoSerialControl` and writes `serial_absent`, **not** `receiving_step_waivers` |
| `unbox-item-photo-aspects.spec.ts` | a `serial`-aspect shot satisfies the serial sub-row and **not** the `front` sub-row |
| extend `unbox-scan-focus.spec.ts` | unchanged behaviour survives the restructure |

Assert on invariants, not samples. Seed via the QA fixtures; never `test.skip` around missing data.

---

## What must NOT happen

- A second procedure surface. The checklist display is deleted, not mirrored (D9).
- A step body that imports the whole `UnboxLineController`.
- A page-local `max-w-[720px]`, a hand-rolled card shell, a raw `focus:ring-*`, or a `font-bold`.
- Animating the stack's height, or `layout` on the stack container.
- A step card that takes focus from the scan bar.
- A step-scoped note store (the note grain is settled).
- **Drawing a skipped step as done**, or computing the pointer locally instead of through
  `resolveActiveStep`.
- A free-text skip reason, or a second serial waiver control.
- **A depth pile / overlapping rows / any layered stack** — refused in D12, and it hides the pending
  steps whose absence killed the first attempt.
- **A scroll-linked animation** (`animation-timeline`, `useScroll`) — refused in D12.
- **A per-step duration, anywhere** — on the stack, on the receipt, or in a tooltip. There is no
  `step_started_at`; the gap between completions is not the time spent on a step, and a timed
  operator has an incentive to waive steps to improve it (D12).
- **A live-ticking clock in the stack header.** `headerEnd` ships empty.
- A hand-picked `rounded-*` on the card or rows — use `cornerClass` / `nestedCornerClass`.
- Raising a ratchet baseline.

## Risks

| Risk | Mitigation |
|---|---|
| **Third rejection.** The operator has rejected two versions of this surface | Land FE-0…FE-2 behind the existing carton-open path and demo on the dogfood tenant **before** FE-3–FE-7. The row-focused, locked-width, receipt-terminated shape is what is new — validate that shape early and cheaply |
| The wedge loses focus as steps advance | An explicit Playwright row (FE-8); `ProcedureStack` takes no focus by construction |
| `PoLinesAccordion` split breaks the unfound/return lane, which shares it | `UnmatchedAccordionSurface` mounts the same bodies; decompose both lanes in FE-2b or neither |
| Gating condition stalls the floor | Pre-selected chip, one tap; measure before widening required item aspects |
