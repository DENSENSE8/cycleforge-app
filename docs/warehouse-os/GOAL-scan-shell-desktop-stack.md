# Overnight GOAL — G4 · the Stack replaces the desk's page tree

**Host:** Garisek goal-run. **Human:** every former sidebar leaf reachable from Find in ≤ 2 keystrokes.
**Plan:** [`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md). **Host JSON:** `docs/eval/goals/scan-shell-desktop-stack.goal.json`.
**Do not expand this goal.** One column. Stop when the gate is green.

## OMP

```text
/goal On desk routes the left column becomes the Stack: Now (the armed block), Earlier today (blocks, resumable in place), Queues (Tasks, Work orders, Picker queue, To-ship as the existing tables), Find (the launch index). The sidebar page tree (SidebarNavColumn leaves: Shipping, Packing, Unbox, Stations, Arrival, Desks, Inbound, Products, Inventory, Sourcing and the rest) is removed from the rail; every leaf stays in launch-index.ts so ⌘K and Find reach it. Pins and recents keep their positions. A pure stackModel is shared with the phone. Done when src/lib/nav/stack-model.test.ts and verify:fast are green and slot-table KEEP ids are untouched.
```

## GOAL

The desk's left rail stops being a sitemap. It is the Stack: Now · Earlier today · Queues · Find, over the existing pins and recents.

## HOW IT MUST FUNCTION

- `src/lib/nav/stack-model.ts` re-exports or shares the phone's model when G3 has landed; otherwise it is the first home and G3 imports it. Pure, tested.
- The page tree leaves are deleted from the rail render, **not** from `launch-index.ts`. Find and ⌘K must list every one.
- Pins (top) and recents (bottom) keep their anchors; the Stack bands sit between them.
- Collapsed rail is icons only; the click path never depends on hover (tablets report no hover).
- Graph: `impact_analysis` on `SidebarNavColumn` and `RailSessions` before edits.
- `ds_contract` "left rail stack bands", `ds_tokens` (spacing, typography), `ds_critique` on every edited `.tsx`.

## HOW IT MUST NOT FUNCTION

- Do **not** delete any route or page. Only the rail's tree render goes.
- Do **not** remove an entry from `launch-index.ts`.
- Do **not** touch the right rail, the composer, or the beam.
- Do **not** add standing keycaps or a cheat sheet.
- Do **not** touch slot-table engine files or `CompoundItem`.

## ALLOWED FILES

- `src/lib/nav/stack-model.ts` (+ `.test.ts`)
- `src/components/layout/SidebarNavColumn.tsx`
- `src/components/rail/RailSessions.tsx` (or its current path)
- `src/components/rail/RailStackBands.tsx` (new)
- This GOAL file

## DONE WHEN

1. `npx tsx --test src/lib/nav/stack-model.test.ts` green.
2. `verify:fast` green.
3. Every leaf id previously rendered by `SidebarNavColumn` is present in `searchNav` results (assert in the test by importing both).

## STOP

Do not dock the Field. Hand back for G5.
