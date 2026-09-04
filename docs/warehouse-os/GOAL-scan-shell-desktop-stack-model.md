# Overnight GOAL — G4a · the Stack model (pure), split out of G4

**Why this exists:** G4 (`scan-shell-desktop-stack`) burned two coder hops with no diff — the rail render is too wide for one headless hop. G1 (pure module + test) landed in two hops. So the desktop chain is re-cut pure-first: G4a the model, G4b the rail render (next), then G5.
**Host JSON:** `docs/eval/goals/scan-shell-desktop-stack-model.goal.json`. **Plan:** [`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md).

## GOAL

`src/lib/nav/stack-model.ts` — pure, no React, no DOM, no fetch. `stackModel(input)` returns the four bands in fixed order (now · earlier · queues · find); block elapsed = sum of interval lengths; earlier newest-first; `resumeBlock(model, id)` returns `{ arm, park }`. `stack-model.test.ts` with node:test.

## HOW IT MUST NOT FUNCTION

- No other file. No component. No store. No import outside `src/lib/nav/`.

## ALLOWED FILES

- `src/lib/nav/stack-model.ts` (+ `.test.ts`)

## DONE WHEN

`npx tsx --test src/lib/nav/stack-model.test.ts` green · `verify:fast` green.

## STOP

Hand back for G4b (the rail render consumes this model).
