# Overnight GOAL — G2a · the Arrival model (pure), split out of G2

**Why:** G2 (`scan-shell-mobile-card-arrival`) produced no diff in its first coder hop, the same shape as G4. Pure modules land (G1 in two hops); UI in one headless hop does not. The mobile chain is re-cut pure-first: G2a the model, G2b the Card render (authored after, with explicit `ds_*` instructions for the write hook), then G3.
**Host JSON:** `docs/eval/goals/scan-shell-mobile-arrival-model.goal.json`. **Plan:** [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md).

## GOAL

`src/lib/scan/arrival-card.ts` — pure. `arrivalRecommendation` (unbox_now / rack with a reason and the secondary), `arrivalTitle` ("Arrival · UPS 4471"), `arrivalFacts` (≤ 3 strings). `arrival-card.test.ts` with node:test.

## ALLOWED FILES

- `src/lib/scan/arrival-card.ts` (+ `.test.ts`)

## DONE WHEN

`npx tsx --test src/lib/scan/arrival-card.test.ts` green · `verify:fast` green.

## STOP

Hand back for G2b (the Card render consumes this model).
