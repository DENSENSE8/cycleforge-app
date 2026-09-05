# Overnight GOAL — G3 · the Stack on the phone

**Host:** Garisek goal-run. **Human:** find yesterday's work order in two presses.
**Plan:** [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md). **Host JSON:** `docs/eval/goals/scan-shell-mobile-stack.goal.json`.
**Depends on:** G2 landed.
**Do not expand this goal.** One sheet. Stop when the gate is green.

## OMP

```text
/goal On every /m/* route the top-left back control opens the Stack, a sheet with four bands: Now (the armed block: title, state, elapsed), Earlier today (blocks in reverse order, each resumable in place), Queues (Tasks, Work orders, Picker queue, To-ship, each opening as the existing table), Find (the launch index search). Long-press on back jumps to any block. A pure stackModel({ sessions, intervals, now }) builds the bands. Done when src/lib/scan/stack-model.test.ts and verify:fast are green.
```

## GOAL

The Stack replaces the mobile drawer as the only thing behind top-left. `src/lib/scan/stack-model.ts` is pure and tested; the sheet renders it.

## HOW IT MUST FUNCTION

- Bands and order are fixed: Now · Earlier today · Queues · Find.
- Elapsed is the sum of intervals, never wall time (the desk's ⌘N block math).
- Resume in place: tapping an earlier block re-arms it; the current one parks losslessly.
- Queues open the existing product tables (`tasks`, `my-day`, `orders`) and the picker queue page; no new table.
- Find = `searchNav` over `launch-index.ts`.
- `ds_contract` "mobile sheet from the top-left back control", `ds_tokens` (radius, elevation), `ds_critique` before any `.tsx`.

## HOW IT MUST NOT FUNCTION

- Do **not** keep the drawer's page tree. The Receiving group and its leaves leave the drawer; they stay reachable from Find and by scanning.
- Do **not** add a fifth band, a settings row, or a sign-out row (sign-out stays in the account control).
- Do **not** fetch inside the model; inputs are passed in.
- Do **not** touch the desk rails.

## ALLOWED FILES

- `src/lib/scan/stack-model.ts` (+ `.test.ts`)
- `src/components/mobile/redesign/MobileStackSheet.tsx` (new)
- `src/components/mobile/redesign/MobileSidebarDrawer.tsx` (replace body with the sheet)
- `src/components/mobile/redesign/MobileTopBar.tsx` (back control opens the sheet)
- This GOAL file

## DONE WHEN

1. `npx tsx --test src/lib/scan/stack-model.test.ts` green: band order, reverse chronology, summed intervals, resume-in-place parks the current block.
2. `verify:fast` green.
3. `ds_critique` clean on the two `.tsx` files.

## STOP

Do not touch the desktop. Hand back.
