# HANDOFF — Fold the Unbox procedure INTO the Checklist display

> Paste everything below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> Written 2026-08-01 · `main` · the prior session's context ran out mid-initiative.

---

# Cycle Forge — the procedure IS the checklist

You are Claude Code in the Cycle Forge monorepo. A previous session built a step-procedure
display and mounted it **wrong, twice**. Your job is the third placement, which the operator
has now specified exactly — plus deleting the second attempt.

## The operator's instruction, verbatim

> "It must be displayed within the right rail component, the same component that expands out
> the checklist, and it must be baked into the checklist itself, so the procedure is replacing
> the checklist."

## What that means concretely

The Unbox workspace already has a right-edge **Displays push column**
(`ReceivingDisplaysPushStack` / `UnboxPushColumn`) with eight tabs, one of which is
**Checklist** (`LineChecklistTab`). The step procedure must render **inside that Checklist
display**, replacing what is there now. Not beside it, not floating over it, not a second card.

There is to be **one** checklist in the product, and the procedure is it.

---

## History — read this so you do not repeat it

Placement attempt #1 (**rejected**): the procedure rendered as a bottom-anchored capture stack
**in the middle of the work surface**, above the PO accordion. Operator verdict: *"completely
terrible."* A read-only status display had taken the work surface's seat. **Already deleted.**

Placement attempt #2 (**rejected — this is what you are removing**): the procedure became a
floating card pinned to the top-right of the viewport via a new ambient region in
`RightRailHost`. Operator verdict: *"an absolutely terrible display."* It is a detached
overlay card that hangs next to the rail rather than living in it, and it duplicates the
checklist concept instead of replacing it.

**The lesson both attempts missed:** the procedure is not a new surface. It is what the
existing Checklist display should have been all along.

---

## STOP — one decision the operator must make before you write code

`LineChecklistTab` today is a **DB-backed, org-editable checklist**:

- Definition: GLOBAL scope of the polymorphic `checklist_templates` table via `useChecklist`;
  managers add / rename / remove steps inline through `PUT/POST/DELETE /api/checklists`, gated
  by the `sku_stock.manage` permission. First open offers a one-click seed from
  `GLOBAL_RECEIVING_CHECKLIST` (`src/lib/receiving/global-checklist.ts`).
- Fill state: per-line, in `localStorage` (`receiving-checklist:{lineId}`), no DB round-trip.

The derived procedure is a **different kind of thing**: computed from carton evidence
(photo stages, serials, condition, classification), not ticked by hand, not org-editable.

**Ask the operator which of these they mean by "replacing":**

- **(A) Total replacement.** The procedure is the whole Checklist tab. The hand-ticked org
  checklist, its API, its permission gate and its seed list are dead code to remove.
  *Cost: deletes a DB-backed feature with a live API and a permission. Confirm they want that
  before touching `/api/checklists`.*
- **(B) Procedure on top, org steps below.** The Checklist tab leads with the derived
  procedure (auto-ticked, read-only) and keeps the org's hand-ticked custom steps beneath it
  as a second section. Nothing is deleted.
- **(C) Procedure replaces the UI, data stays.** The tab renders only the procedure; the
  `checklist_templates` machinery is left in place, unmounted, for a later decision.

Do not guess. The wording "the procedure is replacing the checklist" points at (A), but (A)
destroys operator-authored data, so it must be confirmed explicitly.

---

## What already exists and is GOOD — compose it, do not rebuild it

These landed in commits `79b4895d5`, `6f9eb5804`, `0391dba1b` and are the parts worth keeping:

| Thing | Where | Status |
|---|---|---|
| **Step vocabulary SoT** | `src/components/receiving/workspace/derive-capture-step-states.ts` | Keep. `deriveProcedureSteps(input)` returns every step in order with `state` + `position` + `stage`. Composes the shared `deriveLinearStepStates` walk, as a sibling of the matched/unfound steppers. 18 unit tests pass. |
| **DS checklist component** | `src/design-system/components/procedure/ProcedureChecklist.tsx` | Keep. Dumb, station-agnostic, one row per step (marker → label → summary). Exported from `@/design-system/components`. |
| **Per-stage photo counts** | `src/hooks/useReceivingPhotoCount.ts` → `useReceivingPhotoStageCounts` | Keep. Buckets the SHARED carton-photos cache by evidence stage through `receivingStageFromPhotoType` — the same resolver the server receive gate uses. Carries a `settled` flag; gate on it (un-hydrated zeros read as "nothing shot" and paint the wrong active step). |
| **Vocabulary → props adapter** | `src/components/receiving/workspace/UnboxProcedureRail.tsx` | Salvage the body, delete the shell. Its `stepSummary` + memo wiring is what you want inside the Checklist tab; its `useRegisterRightRailProcedure` call is the part being removed. |
| **E2E** | `tests/e2e/unbox-procedure-rail.spec.ts` | Repoint, keep. 5 tests, green on `qa-desktop`. Selectors are `[data-procedure-step]` / `[data-procedure-state]`, emitted by `ProcedureChecklist` — so they survive the move if you keep that component. Rename the file to match wherever it lands. |

## What to DELETE — attempt #2's scaffolding

```
src/lib/right-rail/procedure-store.ts
src/components/right-rail/RightRailProcedureRegion.tsx
src/components/right-rail/useRegisterRightRailProcedure.ts
src/components/receiving/workspace/UnboxProcedureRail.tsx   (after salvaging its body)
```

Plus revert these edits in `src/components/right-rail/RightRailHost.tsx`:
`RightRailProcedureRegion` import + render, the `procedureHeight` state, `onProcedureHeight`,
`PROCEDURE_GAP_PX`, the `DETAIL_STACK_LAYOUT` import, and the `top:` override in the occupant
style block. The host must go back to rendering exactly its top occupant, restoring the
one-owner contract in `.claude/rules/source-of-truth.md` → Right-rail modality.

Also remove the `<UnboxProcedureRail row={row} />` mount from
`src/components/receiving/workspace/LineEditPanel.tsx`.

**Net effect: `RightRailHost` and its store end up byte-identical to `main` before this
initiative.** Confirm with `git diff` that nothing of attempt #2 survives.

---

## Where it goes

`src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx` →
`buildUnboxSideTabs` → the tab with `id: 'checklist'` (currently
`<WorkspaceCard variant="glass" …><LineChecklistTab lineId={row.id} sku={row.sku} /></WorkspaceCard>`).

The tab id / label / icon / order live in `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts`
(`UnboxSideTab`, `UNBOX_SIDE_TAB_ORDER`) with a test at `unbox-side-tabs.test.ts` — if you
rename the tab from "Checklist" to "Procedure", update both, and keep the id stable unless
you also migrate any persisted `?sideTab=` value.

**Note:** another session refactored this file concurrently into `buildUnboxOverview` +
`buildUnboxSideTabs`. Re-read it before editing; its doc comment already anticipates this work.

---

## Build rules

- **One checklist.** After this lands there must be exactly one checklist surface in Unbox.
  If both the derived procedure and the hand-ticked list survive (option B), they are one
  component with two sections — never two tabs, never two cards.
- **Compose the SoT.** Step order/state comes from `deriveProcedureSteps` only. Do not
  re-derive gates in the view; do not hardcode the five steps (it breaks unfound, local
  pickup, returns, multi-qty).
- **Photo stages are load-bearing.** `po_photos → arrival_package`, `packing_material →
  unbox_carton` (folded, no new stage), `item_photos → unbox_item`. **The bench never writes
  `arrival_package`** — `require_one` counts only that stage (`photo-policy.ts:149`), so a
  bench capture stamping it voids the receive gate. Step 1 is read-and-verify on this surface.
- **Condition is not a gate** — it carries a default grade, renders satisfied, pointer skips it.
- **Gate on `settled`** from `useReceivingPhotoStageCounts` before showing a state, or the
  active step flickers to the wrong row and jumps.
- **No setState during render.** Attempt #2's flakiness was a child reporting measured height
  to its parent mid-render. If you measure anything, do it in an effect.
- **Motion + tokens from the SoT.** `useMotionPresence` / `useMotionTransition`; no GSAP, no
  `motion/react` (`motion-major.guard.test.ts` fails CI). No raw neutrals — that ratchet is
  currently over budget from other work, so do not add to it.
- **Never raise a ratchet baseline.** If knip flags a type export nothing imports, un-export it.

## Still not built (do not stub)

- **"Current step follows the next scan."** Today the pointer is derived from evidence state,
  so it advances when work lands — it does not respond to a scan directly. The operator has
  asked for this; it is the phase after this one.
- Back/forward between steps, the multi-qty `n of N` loop, the anchored input.

## Known open bug

`tests/e2e/unbox-procedure-rail.spec.ts` passes 5/5 but **9/10 across `--repeat-each=2`**. The
suspected cause is that the vocabulary shape depends on row fields (`zoho_purchaseorder_id`,
intake kind) that hydrate asynchronously, so the list can briefly render the 5-step matched
shape before settling to the 6-step unfound one. Diagnose it rather than widening the poll.

## Done when

- `npm run verify` green, no baseline raised.
- One checklist surface in Unbox, inside the Displays push column.
- `RightRailHost` + `src/lib/right-rail/**` show no trace of the procedure region.
- E2E green on `qa-desktop`; the repeat-run flake diagnosed or explained.
- Verified in the running app on **`:3050`** — attach, never start/restart/kill it.

## Report back

1. Which replacement option the operator chose, and what you deleted because of it.
2. Anything in this handoff you found to be wrong.

Commit only when asked. Other sessions share this tree — stage only your own files.
