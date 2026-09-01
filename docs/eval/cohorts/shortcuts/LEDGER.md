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
**pass** — snapshot `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-tripwire.log`
<!-- /eval-ledger:auto:tripwire-result -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
| Predicate | Result |
|---|---|
| hotkeyGlyph | pass |
| gatedReveal | pass |
| statusBarToggle | pass |
| statusBarHook | pass |
| iconRightGlyph | pass |
| cheatSheetYields | pass |
| hookToggle | pass |
| absent:hotkeyPopover | pass |
| absent:staffQuestionOpensSheet | pass |
| absent:hintsButtonTitle | pass |
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_No unblocked mechanical deletes. Menu-row kbd is judgment._

_Snapshot:_ `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-discover.json`
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_No mechanical deletes. Staff `?` reveals inline; no sheet/popover from the question-mark._
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
| id | path | keep because |
|---|---|---|
| `engine:HotkeyGlyph` | `src/components/tables/TableStatusBar.tsx` | Reveal-only letter inside the CTA after `?`. Gated by showHotkey — not standing chrome. |
| `engine:useSelectionStatusBarHotkeys` | `src/hooks/useSelectionStatusBarHotkeys.ts` | ONE hook: bind letters + `?` reveal store. TableStatusBar and the cheat sheet both read it. |
| `engine:useSelectionActionHotkeys` | `src/hooks/useSelectionActionHotkeys.ts` | Re-export seam onto useSelectionStatusBarHotkeys — keep until stale importers die. |
| `engine:KeyboardShortcutsCheatSheet` | `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` | `?` key when no CTA strip is mounted (station teaching). Must yield to inline reveal while the strip exists. |
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
| KeyboardShortcutsCheatSheet | `component:src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx:KeyboardShortcutsCheatSheet` | 3 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-impact-KeyboardShortcutsCheatSheet.json` |
| useSelectionStatusBarHotkeys | — | no match | `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-find-useSelectionStatusBarHotkeys.json` |
| TableStatusBar | `component:src/components/tables/TableStatusBar.tsx:TableStatusBar` | 22 | `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-impact-TableStatusBar.json` |
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
- `src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-critique-KeyboardShortcutsCheatSheet.txt`
```
{
  "file": "src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
```
- `src/components/tables/TableStatusBar.tsx` — `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-critique-TableStatusBar.txt`
```
{
  "file": "src/components/tables/TableStatusBar.tsx",
  "summary": "1 problem, worst first: 429 lines — past the point reviewers read",
  "problems": [
    {
```
<!-- /eval-ledger:auto:design-critique -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
- project: `cycleforge-app`
- status: `ready`
- last_built_at: `2026-08-31T22:47:46.121Z`
- nodes: 36519 · edges: 169929 · embedded: 36519
- snapshot: `docs/eval/cohorts/shortcuts/snapshots/2026-09-01-graph-stats.json`
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-01T07:21:32.329Z · cohort `shortcuts` · run id `2026-09-01T07-21-16-509Z`_
<!-- /eval-ledger:auto:last-run -->


<!-- eval-ledger:auto:graph-impact -->
- **KeyboardShortcutsCheatSheet** — 3 files, 3 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-01-impact-KeyboardShortcutsCheatSheet.json`)
- **useSelectionStatusBarHotkeys** — no match (`docs/eval/cohorts/shortcuts/snapshots/2026-09-01-find-useSelectionStatusBarHotkeys.json`)
- **TableStatusBar** — 22 files, 22 symbols (`docs/eval/cohorts/shortcuts/snapshots/2026-09-01-impact-TableStatusBar.json`)
<!-- /eval-ledger:auto:graph-impact -->


<!-- eval-ledger:auto:tripwires -->
- `src/lib/keyboard/shortcut-display-cohort.test.ts`
- `src/hooks/useSelectionStatusBarHotkeys.test.ts`
<!-- /eval-ledger:auto:tripwires -->
