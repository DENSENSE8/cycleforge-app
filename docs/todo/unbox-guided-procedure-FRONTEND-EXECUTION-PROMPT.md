# EXECUTION PROMPT — Unbox guided procedure · FRONTEND lane

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`unbox-guided-procedure-FRONTEND-PLAN.md`](./unbox-guided-procedure-FRONTEND-PLAN.md)
> **Shared decisions:** [`unbox-guided-procedure-INDEX.md`](./unbox-guided-procedure-INDEX.md)
> **Blocked on:** the backend lane through **BE-4** (the receipt route). Confirm
> `GET /api/receiving/[id]/procedure-receipt` responds before starting FE-2.

---

# Cycle Forge — Unbox guided procedure, frontend

You are Claude Code in the Cycle Forge monorepo, on `main`.

The Unbox work surface becomes a **guided step stack**: one active step card directly above the
notes composer, completed steps collapsing upward, ending in a closed-carton receipt. Read
`docs/todo/unbox-guided-procedure-INDEX.md` first — it holds the step vocabulary and nine decisions
(D1–D9) this prompt does not repeat.

## Read this before you write anything

**This surface was rejected twice.** `UnboxCaptureStack` was deleted at `33a3eb609` (*"completely
terrible"*) and the ambient right-rail card the day after (*"an absolutely terrible display"*). The
operator has asked for it a third time with a different shape, and that instruction is the decision —
but it means three house rules currently **forbid** what you are about to build. Amend them in the
same commit as FE-2 (list in the INDEX). A rule that forbids the code in the tree is worse than no
rule, because the next agent will "fix" the violation.

What is new in this version, and therefore what must actually be true: **row-focused, locked width,
anchored to the composer, terminating in a receipt.** If you find yourself building a free-floating
mid-canvas card, you have rebuilt the rejected one.

## The phases

**FE-0 — the primitive.** Extract `ProcedureStepState` / the row type out of
`ProcedureChecklist.tsx` into `procedure/types.ts` (state becomes
`done | active | pending | skipped`), then add `ProcedureStack.tsx` as a **sibling** (different job —
interactive and bottom-anchored — sharing the same row vocabulary). Presentational only: no fetch, no
domain import, **no focus of any kind**. Locked width comes from `STATION_WORKBENCH_COLUMN`; never
re-type `max-w-[720px]`. Active-card swap uses `framerPresence.stationCartonSwap` (the
station-cadence preset, not `workbenchPaneSettle`). Never animate the stack's height.

**Geometry and motion are already ruled — read INDEX D12 before you open an editor.** The stack is a
**flat ledger**: every step is a row in vocabulary order, nothing overlaps, nothing is hidden. Radius
via `cornerClass('card')` (active card) and `cornerClass('row')` (collapsed rows) — never a
hand-picked `rounded-*`. The crossfade animates **opacity only**; row positions and the card's height
snap in one un-animated frame. `headerEnd` ships **empty**. An Apple-Watch depth pile, a scroll-linked
animation, and per-step durations were each evaluated and **refused** — they are not missing work, and
quietly re-adding one reverts a decision.

**The next-step peek + skip control ships here.** The active card's header carries, right-aligned,
`Looks good → {next label}` — it **names its destination**, because a bare "Skip" makes the operator
guess where they land and seeing the next step is the whole point. Three rules:
- **It lives on the step card, never beside the dock's primary.** Adjacent to "Confirm contents" it
  gets pressed by muscle memory.
- **`skipped` renders differently from `done`** — its own glyph plus the reason, never a check mark.
  Someone reading the stack must be able to tell work from a decision to move on.
- **Warn before, not after.** When the step being skipped appears in the receipt route's `blockedBy`,
  the confirm says receive will still be refused. Surprising the operator at Receive — carton closed,
  box taped — is the failure mode.

`skip: 'waiver'` steps open a `ReasonChipPicker` over the `unbox_step_skip` vocabulary (**no
free-text sibling** — that is the picker's contract). `skip: 'pointer'` advances with no dialog.
**`serial`'s skip renders the existing `NoSerialControl`** and writes `serial_absent` — one waiver
store, one control.

**FE-1 — the step-body registry.** `line-edit/steps/` — one component per step, `UNBOX_STEP_BODIES`
record, plus `procedure-step-body.guard.test.ts` asserting every declared `capture` step has a body.
`CartonPhotoStepBody` serves all three carton-photo steps parameterised by aspect; three
near-identical files would be the fork. A body takes a narrow props bag — **never the whole
`UnboxLineController`**.

**FE-2 — mount it, and delete what it replaces.** This is the point of no return.
- `buildUnboxOverview` returns `<UnboxProcedureStack/>`. It resolves the pointer through
  `resolveActiveStep` from `src/lib/receiving/procedure-pointer.ts` — **never a local "first pending"
  scan**. A pointer computed twice is how the stack and the receipt start telling the operator
  different things about the same box.
- **Split `PoLinesAccordion`**: it keeps ONE job (the row-focused line list = the `contents` step);
  `activeRowSlot` is deleted. `ActiveLineConditionSerial` is **decomposed** into `ConditionStepBody`
  · `SerialStepBody` · `ItemPhotoStepBody` and the file removed. Keep the `data-unbox-item-photos`
  attribute — a spec pins it. Do both the matched and the unfound/return lane
  (`UnmatchedAccordionSurface` mounts the same bodies) or neither.
- Delete `UnboxProcedureChecklist.tsx` and the `checklist` side tab. **Keep the DS
  `ProcedureChecklist`** — other stations will want it. Two procedure surfaces in one station is the
  collision the last change closed (D9).
- Retarget `unbox-procedure-checklist.spec.ts` → `unbox-procedure-stack.spec.ts`; all five of its
  assertions are true of the stack. Do not delete it.
- Amend the three rules.

**FE-3 — the contextual composer.** Flip `STATION_TERMINAL_REGISTRY.unbox` to resolve its VM from
the active step key. **One dock, one shell** (`StationComposerDock` + `slicedActionDockWrapperClass`,
CTA in `trailingAction`). The note still writes `receiving_line.notes` and only that — the composer
is contextual in its chrome, not its target. Record in the docblock why this reverses the
carton-terminal decision: the objection was cross-region action-at-a-distance, and the step is now
directly above the dock.

**FE-4 — the receipt.** `UnboxProcedureReceipt.tsx`, covering the whole surface when the carton is
closed. Times through `src/utils/date.ts` honouring the staff `timeFormat` preference — never a bare
`toLocaleTimeString`. The device shutter clock appears only as a labelled secondary detail. **A
skipped step is never drawn as a completed one** — this is the document someone reads back during a
claim, and "we photographed the packing material" vs "we decided not to" is exactly what matters
there. Bottom bar = **Reopen to edit** per step (clears the stamp, or `DELETE …/skip` for a waived
one — cleared, never overwritten). A failed receipt fetch renders the stack, never a 500.
**Shape (D12):** two columns, not a centred phone-shaped stack — 720px landscape makes that read as an
under-filled page. **No animated checkmark** (irritant by carton 30, and reduced motion cuts it
anyway). One carton total, static; a completion **instant** per step and **no per-step duration**.

**FE-5 — condition.** Grow `ConditionPills` (already a horizontal chip row with
`useHorizontalWheelScroll`) with a full-width step density; same component on mobile at
`IconButton size="touch"`. Scan-to-set only via context-aware resolution when the active step is
`condition` — **do not add an ambiguous global branch** to `detectStationScanType`, it would regress
every other station.

**FE-6 — item photo aspects.** One sub-row per aspect; required set from the Settings Registry
(`receiving.requiredItemPhotoAspects`). Every mount threads `photoStage` + `receivingLineId` +
`photoAspect` explicitly, and you extend `item-photo-wiring.guard.test.ts` so an aspect-less item
mount fails like a line-id-less one does today. `MobileReceivingPhotoStudio` takes an aspect prompt +
stepper so the phone walks the same shots in the same order.

**FE-7 — serial OCR.** `useLiveSerialScan` as a sibling of `useLiveLabelScan`, sharing the loop
(on-device gate → LAN box → consensus lock, one request in flight, latest wins). Different remote
path, different consensus predicate. If the two end up >60% identical, extract `useVisionScanLoop`
and compose it from both. **OCR pre-fills the field; it never writes a serial.** Reuse the existing
Ably `receiving_photo_request` bridge — no new channel.

**FE-8 — Playwright**, QA org, `--project=qa-desktop`. Rows listed in the plan. Three load-bearing:
- **focus stays on the scan bar / serial field as steps advance** (`data-station-scan-input`,
  `.claude/rules/display/station.md` §3). A step stack that eats the wedge's focus drops scans and
  tells no one.
- **a skip renders as skipped and not done, survives a reload, and is reversible.**
- **a skip does not clear `blockedBy`** — the carton is still refused at Receive.

## Do NOT

- Build a free-floating mid-canvas step card — that is the rejected surface.
- Keep the checklist display "for reference" (D9).
- Let `ProcedureStack` or any step body take focus.
- Animate the stack's height, or put `layout` on its container.
- Import the whole controller into a step body.
- Add a step-scoped note store — the note/label grain is a hard SoT.
- Draw a skipped step as done, offer a free-text skip reason, or build a second serial waiver
  control.
- **Build a depth pile / overlapping rows / any layered stack** (D12) — it hides the pending steps
  whose absence killed the first attempt, and occludes the timestamps the receipt exists to show.
- **Add a scroll-linked animation** — `animation-timeline`, `useScroll` (D12).
- **Show a per-step duration anywhere**, or a live-ticking clock in the header (D12). There is no
  `step_started_at`; the gap between completions is not time-on-step, and timing an operator who can
  *waive* steps corrupts the evidence trail.
- Go looking for `CockpitReceiptEntry` / an `origin: 'durable' | 'session'` field. **It does not
  exist** — the research reply fabricated it. Skipped rows render from `state: 'skipped'` + the
  reason code.
- Compute the active step locally instead of through `resolveActiveStep`.
- Hand-roll a card shell, a `max-w-[720px]`, a `focus:ring-*`, a raw `z-[N]`, or a `font-bold`.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.
- Raise a ratchet baseline, or `test.skip` around missing data — seed the QA fixtures.

## Demo before you finish the tail

Land **FE-0 … FE-2** and show it on the dogfood tenant before building FE-3–FE-7. The shape is what
was rejected twice; validate the shape while it is still cheap to change.

## Done when

`npm run verify` green with no baseline raised; the new + retargeted specs pass on `qa-desktop`; the
existing unbox specs (`unbox-scan-focus`, `unbox-item-photo-capture`, `unbox-displays-column`,
`unbox-tool-push`) still pass; the three rule files describe the surface that now exists.

## Report back

1. A screenshot of the stack mid-carton and of the closed receipt.
2. What `PoLinesAccordion` and `ActiveLineConditionSerial` look like after the split — specifically,
   what each file's ONE job now is.
3. The three rule amendments, quoted.
4. Anything above you believe is wrong.

Commit only when asked. Stage only files you changed.
