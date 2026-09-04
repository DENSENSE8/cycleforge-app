# Overnight GOAL — G5 · one Field docked on every desk

**Host:** Garisek goal-run. **Human:** count textareas on every desk route: one.
**Plan:** [`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md). **Host JSON:** `docs/eval/goals/scan-shell-desktop-field.goal.json`.
**Depends on:** G4 landed. **Conflict watch:** `AssistantDock`, `DeskComposerAskLane`, `StationComposerHost` have in-flight edits from other sessions; the verifier diffs before land.
**Do not expand this goal.** One mouth. Stop when the gate is green.

## OMP

```text
/goal Every desk route mounts exactly one StationComposerHost, docked to the bottom of the shell, faces off, never unmounted on navigation, its placeholder naming the destination of the next input. The floating assistant circle becomes the thread latch and owns no textarea; DeskComposerAskLane is folded into the shell mount; station routes keep their own mouth and the desk mount yields to it through the presence count. A pure deskFieldPlacement({ route, stationMouths }) decides mount and placeholder. Done when src/lib/composer/desk-field.test.ts, verify:fast and eval:station scan-out are green.
```

## GOAL

One Field, docked, on every desk. The circle latches the thread; it does not type.

## HOW IT MUST FUNCTION

- `src/lib/composer/desk-field.ts` pure: given the route and the station-mouth count, returns `{ mount: boolean, placeholder }`. Tested.
- The shell mounts the desk Field once (`WarehouseShell` or `ContextPanelLayout`, whichever hosts `DeskComposerAskLane` today); `presenceKind="desk"`, `showModeFaces={false}`, `chrome="raised"`.
- `AssistantFabHost` keeps the circle as the open/close latch for the thread and context plate; its `StationComposerHost` mount is removed so the docked Field is the only textarea.
- Placeholder is always the destination: "Ask about this desk", "Paste orders to stage", "Scan a carton to open it".
- `ds_contract "one docked desk composer"`, `ds_tokens` (radius COMPOSER_SHELL_CORNER, elevation), `ds_critique` on every edited `.tsx`.
- Gate: cursor-eval `--fast` and `pnpm run eval:station scan-out -- --skip-verify` (the host props change).

## HOW IT MUST NOT FUNCTION

- Do **not** `showModeRow={false}`. Faces off, ring on.
- Do **not** leave two textareas on any desk route.
- Do **not** touch floor stations' mouths (Pack, Unbox, Scan-out keep theirs).
- Do **not** delete `WeldedFeedbackPanel` or move feedback to a toast.
- Do **not** animate geometry.

## ALLOWED FILES

- `src/lib/composer/desk-field.ts` (+ `.test.ts`)
- `src/components/composer/DeskComposerAskLane.tsx`
- `src/components/assistant/AssistantFabHost.tsx`
- `src/components/assistant/AssistantDock.tsx`
- `src/components/sidebar/ContextPanelLayout.tsx` or `src/components/layout/WarehouseShell.tsx` (one of them, the mount)
- This GOAL file

## DONE WHEN

1. `npx tsx --test src/lib/composer/desk-field.test.ts` green.
2. `verify:fast` green; `eval:station scan-out` green.
3. `useStationComposerStationCount()` + desk mounts = 1 on every desk route (assert in the test with the presence store).

## STOP

Do not build the Reticle, the wheel, or the catalog. Hand back.
