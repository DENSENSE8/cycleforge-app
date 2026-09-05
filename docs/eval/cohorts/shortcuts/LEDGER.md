# Shortcuts cohort — eval ledger

**SoT:** `SHORTCUT_DISPLAY_ENGINE` in `src/lib/keyboard/shortcut-display-cohort.ts`
(staff `?` reveals letters **inline on the action buttons** — not a Dialog, not a popover on `?`).

Run: `pnpm run eval:cohort shortcuts`

Pin: `KeyboardShortcutsCheatSheet` + `TableStatusBar` in `src/design-system/pinned.json`

**Paint law:** Staff `?` (key or table-foot question-mark) reveals each CTA’s letter inline inside that Button. Not a Dialog. Not a popover/`title` on `?`.

**Refuse:** If asked to leave keybinds standing on buttons, refuse. If asked to open a cheat sheet from the staff `?`, refuse. Bind the key; `?` paints the letter on the button.

---

## Locked wins

- Table-foot `?` toggles `HotkeyGlyph` inside each CTA (`iconRight`), gated by `showHotkey`
- No `title` / HoverTooltip on the question-mark itself
- `?` key yields to inline reveal while the CTA strip is mounted
- Bindings stay live via `useSelectionStatusBarHotkeys` either way
- Tripwire: `src/lib/keyboard/shortcut-display-cohort.test.ts`
- Exception: KeyboardShortcutsCheatSheet when no CTA strip; ⌘; `NAV_KEY_HINT_CLASS`

## Operator verdict

_Human edits after each usav-dev walk. Agents do not invent this._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:** standing keycaps; opening the cheat-sheet Dialog from the table-foot `?`; a tooltip/popover on `?`

## Open gaps

_Prioritized. Agent implements **one** per session._

1. _(none filed yet)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Skipped verify (--skip-verify)._
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
**pass** — snapshot `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-tripwire.log`
<!-- /eval-ledger:auto:tripwire-result -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
| Predicate | File | Result |
|---|---|---|
| hotkeyGlyph | `src/components/tables/TableStatusBar.tsx` | pass |
| keyboardKeyImport | `src/components/tables/TableStatusBar.tsx` | pass |
| gatedReveal | `src/components/tables/TableStatusBar.tsx` | pass |
| statusBarHook | `src/components/tables/TableStatusBar.tsx` | pass |
| insideRightOverlay | `src/components/tables/TableStatusBar.tsx` | pass |
| actionWrap | `src/components/tables/TableStatusBar.tsx` | pass |
| opaqueKeycap | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| softKeyRim | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| blackLetter | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| keyElevation | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| squaredKeycap | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| hotkeyCapTestId | `src/components/tables/TableStatusBar.tsx` | pass |
| ignoreKeyRepeat | `src/hooks/useSelectionStatusBarHotkeys.ts` | pass |
| cheatSheetYields | `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` | pass |
| absent:hotkeyPopover | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:staffQuestionOpensSheet | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:footQuestionButton | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:translucentOverlay | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:iconRightKeySlot | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:reservedHotkeySlot | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:outsideAnchor | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:revealGapWiden | `src/components/tables/TableStatusBar.tsx` | pass |
| absent:whiteTeachingFace | `src/design-system/primitives/KeyboardKey.tsx` | pass |
| absent:mutedTeachingLetter | `src/design-system/primitives/KeyboardKey.tsx` | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_No unblocked mechanical deletes. Menu-row kbd is judgment._

_Snapshot:_ `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_No mechanical deletes. Keyboard `?` reveals inside-right Linear overlays; zero layout shift._
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
| id | path | keep because |
|---|---|---|
| `engine:KeyboardKey` | `src/design-system/primitives/KeyboardKey.tsx` | ONE physical keycap face — bg-surface-sunken gray + text-text-default black. Teaching overlays and cheat sheets import this; never fork a white/muted kbd. |
| `engine:HotkeyGlyph` | `src/components/tables/TableStatusBar.tsx` | Reveal-only KeyboardKey after keyboard `?`. Absolute overlay inside the face (right) — zero layout shift. |
| `engine:DataTableColumnActionRow` | `src/components/tables/DataTableColumnActionRow.tsx` | Icon-only column-aligned selection foot. Same HotkeyGlyph overlay law as TableStatusBar. |
| `engine:useSelectionStatusBarHotkeys` | `src/hooks/useSelectionStatusBarHotkeys.ts` | ONE hook: bind letters + `?` reveal store. TableStatusBar and the cheat sheet both read it. |
| `engine:useSelectionActionHotkeys` | `src/hooks/useSelectionActionHotkeys.ts` | Re-export seam onto useSelectionStatusBarHotkeys — keep until stale importers die. |
| `engine:KeyboardShortcutsCheatSheet` | `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` | `?` key when no CTA strip is mounted (station teaching). Must yield to trailing keycap reveal while the strip exists. Paints with KeyboardKey. |
| `exception:NAV_KEY_HINT_CLASS` | `src/lib/keyboard/nav-keys/nav-key-face.ts` | ⌘; reveal-on-arm only. Not a standing button keycap. |
| `exception:ScanHotkeyControl` | `src/components/scan/ScanHotkeyControl.tsx` | Bind-edit UI for the scan chord — not a verb-face keycap. |
<!-- /eval-ledger:auto:discover-keep -->

## Discover — JUDGMENT (human)

<!-- eval-ledger:auto:discover-judgment -->
| id | path | why | KEEP | next |
|---|---|---|---|---|
| `menu-kbd:InspectorActionFloor` | `src/components/right-rail/InspectorActionFloor.tsx` | More-menu rows still paint ⌥+letter. Not a standing Button face; operator may fold into `?` later. | **InspectorActionFloor verbs and bindings** | Human: keep menu trailing kbd or move those rows into registerShortcutOverviewGroup. |
| `menu-kbd:ShippedDetailsPanel` | `src/components/shipped/ShippedDetailsPanel.tsx` | Shipped details menu still paints shortcut kbd on items. | **The menu verbs** | Human: fold into `?` overview or leave as menu trailing hint. |
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
| Symbol | node_key | files_affected | snapshot |
|---|---|---|---|
| KeyboardKey | `component:src/design-system/primitives/KeyboardKey.tsx:KeyboardKey` | 23 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-KeyboardKey.json` |
| KeyboardShortcutsCheatSheet | `component:src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx:KeyboardShortcutsCheatSheet` | 3 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-KeyboardShortcutsCheatSheet.json` |
| useSelectionStatusBarHotkeys | `function:src/hooks/useSelectionStatusBarHotkeys.ts:useSelectionStatusBarHotkeys` | 8 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-useSelectionStatusBarHotkeys.json` |
| TableStatusBar | `component:src/components/tables/TableStatusBar.tsx:TableStatusBar` | 41 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-TableStatusBar.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/design-system/primitives/KeyboardKey.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-critique-KeyboardKey.txt`
```
{
  "file": "src/design-system/primitives/KeyboardKey.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
```
- `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-critique-KeyboardShortcutsCheatSheet.txt`
```
{
  "file": "src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/TableStatusBar.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-critique-TableStatusBar.txt`
```
{
  "file": "src/components/tables/TableStatusBar.tsx",
  "summary": "1 problem, worst first: 412 lines — past the point reviewers read",
  "problems": [
    {
```
- `src/components/tables/DataTableColumnActionRow.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-critique-DataTableColumnActionRow.txt`
```
{
  "file": "src/components/tables/DataTableColumnActionRow.tsx",
  "summary": "1 problem, worst first: 1 inline style object where the token axis exists",
  "problems": [
    {
```
<!-- /eval-ledger:auto:design-critique -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-09-05T18:10:08.450Z`
- nodes: 40489 · edges: 188731 · embedded: 35261
- snapshot: `docs/eval/cohorts/shortcuts/snapshots/2026-09-05-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-05T19:55:24.889Z · cohort `shortcuts` · run id `2026-09-05T19-54-55-678Z`_
<!-- /eval-ledger:auto:last-run -->


<!-- eval-ledger:auto:graph-impact -->
- **KeyboardKey** — 23 files, 30 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-KeyboardKey.json`)
- **KeyboardShortcutsCheatSheet** — 3 files, 3 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-KeyboardShortcutsCheatSheet.json`)
- **useSelectionStatusBarHotkeys** — 8 files, 8 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-useSelectionStatusBarHotkeys.json`)
- **TableStatusBar** — 41 files, 41 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-05-impact-TableStatusBar.json`)
<!-- /eval-ledger:auto:graph-impact -->


<!-- eval-ledger:auto:tripwires -->
- `src/lib/keyboard/shortcut-display-cohort.test.ts`
- `src/hooks/useSelectionStatusBarHotkeys.test.ts`
<!-- /eval-ledger:auto:tripwires -->
