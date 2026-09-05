# Overnight GOAL — G2b · render the Arrival Card (after the pure model landed)

**Why:** G2 landed only its pure half (`arrival-card.ts` + test) — the render never got written in a headless hop because the `.tsx` write hook needs a design-MCP stamp the coder was never told to earn. G2b says so in its first sentence.
**Host JSON:** `docs/eval/goals/scan-shell-mobile-card-arrival-render.goal.json`. **Plan:** [`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md).

## ALLOWED FILES

- `src/components/mobile/scan/ArrivalCard.tsx` (new) + `ArrivalCard.test.ts`
- `src/components/mobile/redesign/RedesignedMobileUniversalScan.tsx` (mount only)

## DONE WHEN

`ArrivalCard.test.ts` green · `verify:fast` green · composer router refuses hold · `ds_critique` on `ArrivalCard.tsx` reports no forks (verifier checks).

## STOP

Do not build QC, Pack, or the Stack.
