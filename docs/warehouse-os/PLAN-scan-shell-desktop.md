# PLAN — Scan Shell · DESKTOP

**Status: PLAN → GOALS (overnight, Host-run). Written 2026-09-04.**
Umbrella: [`PLAN-scan-shell.md`](PLAN-scan-shell.md). Mobile twin:
[`PLAN-scan-shell-mobile.md`](PLAN-scan-shell-mobile.md).
Goal objects: `GOAL-scan-shell-desktop-stack.md`, `GOAL-scan-shell-desktop-field.md`
(this folder) → Host JSON under `docs/eval/goals/` once promoted.

## The desk in one screen

```
┌────────────┬──────────────────────────────────────────┐
│ ◀ STACK    │  CARD                    │ CARD LIST     │
│ Now        │  one object · state ·    │ (only when    │
│ Earlier    │  one next action         │  asked)       │
│ Queues     │                          │               │
│ Find       │                          │               │
├────────────┴──────────────────────────┴───────────────┤
│ ⌕ scan · type · say → lands in {destination}          │   the Field
└───────────────────────────────────────────────────────┘
```

Same three primitives as the phone. The desk gets a wider Card and may
show a Card list (the slot-table engine) beside it when asked. The left
rail's page tree and the right rail's tool bands are gone; the Stack is the
left column; tools are verbs on the Card or in the Field.

## What already exists on the desk (reuse, do not fork)

| Need | Exists |
|---|---|
| Left rail with pins · sessions · recents | `RailSessions` (recents filtered on the armed block), `usePublishCollapsePins`, `SidebarNavColumn` (the page tree to remove) |
| Launcher, one index | `launch-index.ts` + ⌘K |
| Session blocks with intervals | `useShell.cutSession` / `SessionBlock.intervals` (⌘N cuts, parks losslessly) |
| The one composer | `StationComposerHost`; desk fallback `DeskComposerAskLane` (mounted in `ContextPanelLayout`); floating `AssistantFabHost` |
| Queues as tables | `PRODUCT_TABLES` and the slot-table engine (header sort law, filter menu) |
| Paste / drop intake on To-ship | `OrderPasteIntake` + `useOrderPasteIntake` (built 2026-09-04) |
| Agent loop + UI tools | `agent-loop.ts`, `navigate` / `highlight`; page context store with `selection` |

## Goals

| # | Goal id | One verb | Done when |
|---|---|---|---|
| G4 | `scan-shell-desktop-stack` | The desk's left column becomes the Stack: Now · Earlier today · Queues (Tasks · Work orders · Picker queue · To-ship as Card lists) · Find. The page tree (`SidebarNavColumn` leaves) is removed from the rail; every leaf stays reachable from Find (the launch index). | `src/lib/nav/stack-model.test.ts` green · `verify:fast` green · slot-table KEEP untouched · shortcut router refuses hold |
| G5 | `scan-shell-desktop-field` | One Field docked at the bottom of every desk: the desk mouth mounts once in the shell, never per page; the floating circle becomes the thread latch and owns no second textarea; mode faces off; the placeholder names the destination. | `src/lib/composer/desk-field.test.ts` green · `verify:fast` green · `eval:station scan-out` green · composer router refuses hold |

Order: G4 → G5. G5 touches files two other sessions have in flight
(`AssistantDock`, `DeskComposerAskLane`, `StationComposerHost`); the Host
worktree starts from HEAD, so the verifier must diff the landed G5 against
those in-flight edits before approving `land.apply`.

## Gates the operator checks by hand

1. Every former sidebar leaf reachable from Find in ≤ 2 keystrokes + Enter.
2. Any work order from the shift reachable from the Stack in two presses.
3. Exactly one textarea on every desk route (`useStationComposerStationCount` + desk mouths = 1); the dock's `y` unchanged after expanding every collapsible.
4. ⌘K still opens Find; ⌘N still cuts a block.

## Deferred (after G5 lands)

The Reticle and the wheel (v1 §7), the viewport catalog for "show me X"
(P1 in the umbrella), removal of the right rail's tool bands (they become
Card verbs once the catalog exists), `emit_table`.
