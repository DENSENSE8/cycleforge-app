# Overnight GOAL — G4b · render the Stack bands in the desk rail (after G4a)

**Why:** G4 (whole rail rewrite in one hop) stopped with no diff. G4a (pure model) landed in one hop. G4b adds the bands *beside* the existing nav — removing the page tree is a later, separate goal once the bands are on screen.
**Host JSON:** `docs/eval/goals/scan-shell-desktop-stack-render.goal.json`. **Plan:** [`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md).

## ALLOWED FILES

- `src/components/sidebar/RailStackBands.tsx` (new) + `RailStackBands.test.ts`
- `src/components/sidebar/SidebarNavColumn.tsx` (mount only; no leaf removed)

## DONE WHEN

`RailStackBands.test.ts` and `stack-model.test.ts` green · `verify:fast` green · KEEP and router hold · `ds_critique` on the new file reports no forks (verifier checks).

## STOP

Do not remove nav leaves, do not touch the right rail or the composer. Hand back for G4c (page tree removal) and G5.
