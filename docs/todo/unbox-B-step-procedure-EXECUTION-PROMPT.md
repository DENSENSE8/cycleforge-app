# EXECUTION PROMPT — Lane B · the two slices that survived

> ## COMPLETE — 2026-08-01
>
> Both slices landed. **Slice 1:** the desktop item pill mounts on the active PO line's work body
> (`ActiveLineConditionSerial` `itemPhotoSlot`) in **both** lanes — matched
> ([`LinePoItemsSection`](../../src/components/receiving/workspace/line-edit/LinePoItemsSection.tsx))
> and unfound/return
> ([`UnmatchedAccordionSurface`](../../src/components/receiving/workspace/unmatched-items/UnmatchedAccordionSurface.tsx)) —
> with `photoStage="unbox_item"` + `receivingLineId` threaded explicitly and pinned by
> [`item-photo-wiring.guard.test.ts`](../../src/components/receiving/workspace/line-edit/item-photo-wiring.guard.test.ts).
> **Slice 2:** [`unbox-item-photo-capture.spec.ts`](../../tests/e2e/unbox-item-photo-capture.spec.ts)
> (2) + [`unbox-scan-focus.spec.ts`](../../tests/e2e/unbox-scan-focus.spec.ts) (2), all green on
> `qa-desktop` alongside the 5 existing `unbox-procedure-checklist.spec.ts` rows.
> `station.md` needed no amendment, as predicted below. Lane B is closed.

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-B-step-procedure-PLAN.md`](./unbox-B-step-procedure-PLAN.md) — **superseded in part**, see below.
> **Rewritten 2026-08-01.** The original prompt asked for a surface the operator rejected twice.

---

## Why this prompt is a third of its former self

Lane B was written as *the restructure lane*: a bottom-anchored capture stack in the Unbox work
surface, one expanded step card above the scan input, completed steps collapsing and pushing up,
a horizontal pager for back/forward.

**That surface is dead, on the operator's verdict, not on a technicality.**

- Placement #1 — capture stack mid-canvas above the PO accordion: *"completely terrible."*
  `UnboxCaptureStack` deleted (`33a3eb609`).
- Placement #2 — procedure as a floating card on an ambient `RightRailHost` region: *"an absolutely
  terrible display."* Region retired the same day; `.claude/rules/source-of-truth.md` now closes the
  door on a third right-edge grammar.
- Placement #3 — **shipped**: the procedure IS the Checklist display in the Displays push column
  ([`UnboxProcedureChecklist`](../../src/components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx)),
  and the org-editable `checklist_templates` UI + `/api/checklists` were deleted with it.

So the **vocabulary half of Plan B shipped** — data-driven steps
([`derive-capture-step-states.ts`](../../src/components/receiving/workspace/derive-capture-step-states.ts)),
B2's `unbox_carton` fold, the ungated condition step, and 5 of the 8 required Playwright rows
([`unbox-procedure-checklist.spec.ts`](../../tests/e2e/unbox-procedure-checklist.spec.ts)).

**Three of Plan B's coverage rows are permanently out of scope**, because the behavior they assert
does not exist and is not coming back: back/forward navigation, the multi-qty `n of N` *loop*
(`n of N` survives as a row summary, not an iterating step), and "current step one row above the
input at 50 rows". Do not stub them. A passing test for behavior that does not exist is worse
than none.

**Two slices remain.** They are independent; do them in order.

---

# Cycle Forge — Lane B, remaining work

You are Claude Code in the Cycle Forge monorepo. Two slices, both small, both real.

## Slice 1 — the desktop has no item-photo surface (blocker B1)

`LineEditPanel` said it in the code and it is still true: **item evidence (`RECEIVING_LINE` +
`receiving_item`) has no desktop capture surface.** The phone can shoot item photos
(`/m/receiving/po/{ref}/item/{line}/photos`); the desktop cannot even upload one.

The mechanism already exists and is unused:
[`ReceivingPhotoButton`](../../src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx)
documents an item mode — `photoStage="unbox_item"` + `receivingLineId` — that resolves a
line-scoped upload target, count, gallery and phone route. **No Unbox call site passes
`receivingLineId`**; `CartonContextCard` passes carton scope only.

**Operator resolution (2026-08-01): no desktop camera.** The phone stays the capture device. The
desktop gets **upload-from-computer scoped to the line** — the pill's existing hover strip, not a
viewfinder.

**Placement — this is the one judgement call, so make it deliberately.** The original resolution
said "the desktop *step card* gets a `+`". Step cards died with the capture stack. Their successor
is *not* the Checklist row: that display is derived, read-only, and has now been rejected twice for
taking work's seat. Mount it where the item's other two capture steps already live — the **active PO
line's work body** ([`ActiveLineConditionSerial`](../../src/components/receiving/workspace/line-edit/ActiveLineConditionSerial.tsx)),
beside condition and serial. Item photos → condition → serial are consecutive steps in the
vocabulary; two of the three are already on that card.

Requirements:

- Thread the stage **explicitly** at the call site. `.claude/rules/backend-patterns.md` — a safety
  classification is a required parameter, never a defaulted one. This is the exact axis that let
  bench photos become arrival evidence once already.
- `poRouteRef` is what enables the phone leg (`/api/receiving/po/{ref}` must resolve it). Without
  it the pill stays hoverable for device upload and the phone leg is click-inert — never `disabled`,
  which would swallow the hover the upload strip needs.
- The unfound / return lanes mount the same body
  (`UnmatchedLineRow`, `UnmatchedAccordionSurface`). Decide explicitly whether they get the pill and
  say which, rather than letting a shared component decide for you.
- **Add a wiring guard** that walks the call sites and fails when one mounts item scope without a
  line id, or stamps `arrival_package` from the bench. Plan B asked for this; the sibling to copy is
  `lookup-scan-wiring.guard.test.ts`.

## Slice 2 — three Playwright rows the shipped surface can honestly carry

Against the **QA org** (`.claude/rules/verify.md`): `pnpm provision:qa-org` →
`npx playwright test <spec> --project=qa-desktop`. **Extend** the existing receiving/unbox specs;
never orphan them.

| Row | Asserts | Note |
|---|---|---|
| Item-stage integrity | A desktop item capture writes `unbox_item` (line-scoped) and **never** `arrival_package` | The last uncovered cell of Plan B's photo-stage matrix — the carton leg is already pinned |
| Wedge focus | Focus returns to the serial field after every Enter, so serial-after-serial needs no click | Pins behavior `SerialCard.submit()` already implements |
| Focus hotkey | It returns the operator to the Unbox scan bar from anywhere on the bench | `ReceivingUnboxScanBar` → `useRegisterScanTarget`. **Read the key from `DEFAULT_FOCUS_SCAN_HOTKEY`** — the rules said "F2" for months and the code has always defaulted to `Insert` |

Assert on **invariants, not samples**.

## Do NOT

- Rebuild the capture stack, a step pager, or any bottom-anchored step card. Three placements,
  two rejections, one shipped answer — the question is closed.
- Add a capture control to `ProcedureChecklist`. It is dumb by construction and learns no domain.
- Touch labels / per-item notes (**lane C, shipped**) or the identity header (**lane A**).
- Raise a ratchet baseline, or `test.skip` around missing data — seed the QA fixtures.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.

## Done when

`npm run verify` green; the new specs pass on `qa-desktop`; the existing unbox specs still pass.

`station.md` needs **no** amendment — its §2 (scan bar pinned top) and §5 (card replaces, never
accumulates) contracts were only threatened by the capture stack, which never landed.

## Report back

1. Where you mounted the item pill, and which lanes got it.
2. Specs added vs extended, with the run output.
3. Anything above you believe is wrong.

Commit only when asked. Stage only files you changed.
