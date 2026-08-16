# Unbox dock procedure floor — parked off main

**Date:** 2026-08-11 · **Main checkout:** bubble notes + Print·Receive restored  
**Park worktree:** `/Users/icecube/repos/cycleforge-unbox` · branch `unbox-work`

## What main mounts now

Unbox bottom dock = raised `WorkspaceNotesCard` → `OmnichannelComposerDock`
(`chrome="raised"`) with trailing divided Print·Receive
(`StationTerminalDock` `embedded` + `embeddedChrome="pill"`). Ghost label-note
autocomplete lives on the bubble via `useLabelNoteGhostAutocomplete` +
`label-note-phrases`.

Receive path is unchanged: `handlePrintAndReceive` / `handleReceive` /
`runPrintLabel` / terminal VM.

## What was unmounted from main Unbox dock

- `data-unbox-dogfood-print` + `UnboxDockNotesEntry` flush strip
- `UnboxDockHost` Band 1 Active Step Studio (`buildUnboxStepDock` / `UnboxStepDock`)
- Band 2 `UnboxProcedurePager` + floor `UnboxScanProgressControl`
- Flush float (inset-x-0, no gutters)

**Not torn down on main:** centre/Displays procedure derivation
(`useUnboxProcedureSteps`, PO capture, checklist Displays), Arrival’s
`UnboxDockHost` in `TriagePanel`, and the dock procedure *modules* still in
tree for Arrival / later remount.

## Where the flush procedure floor lives

On `unbox-work`:

| Asset | Path |
|---|---|
| Host / notes / wedge / step dock / pager / % | `src/components/receiving/workspace/line-edit/UnboxDock*.tsx`, `UnboxStepDock.tsx`, `UnboxProcedurePager.tsx`, `UnboxScanProgressControl.tsx` |
| Step dock registry | `…/line-edit/steps/dock/` |
| Pre-restore `LineEditPanel` mount snapshot | `docs/todo/LineEditPanel-flush-dock-SNAPSHOT.tsx` |
| Flush-floor guard (as of park copy) | `…/unbox-dock-one-shell.guard.test.ts` |

## Later task

Re-mount the flush two-band procedure floor from the snapshot + `steps/dock`
registry on `unbox-work` (or merge that branch). Do **not** re-introduce Band 1
step studio on main until that lane ships — main’s golden is the bubble composer.
