# Scan-out — eval ledger

**Route:** `/shipping/scan-out` · **Handoff:** [scan-out-mobile-composer-HANDOFF.md](../../../todo/scan-out-mobile-composer-HANDOFF.md)

Run: `pnpm run eval:station scan-out`

---

## Locked wins

_Promote to `src/design-system/pinned.json` when stable._

- `StationComposerHost` with `showModeFaces={false}` — dumb station, context ring on
- One mouth only — no dual composer + scan bar
- White `bg-surface-card` floor — no gray canvas fork
- Idle↔overlay shell is a **cohort SoT** (`SCAN_STATION_OVERLAY_COHORT`) — every
  floor scan station (not Pack/Unbox alone) must keep visibility-hide +
  `zIndex.panel` + inert; tripwire:
  `src/lib/station/scan-station-overlay-cohort.test.ts`

## Operator verdict

_Human edits after each usav-dev walk. Agents do not invent this section._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:** last-good carton visible during pending confirm

## Open gaps

_Prioritized. Agent implements **one** per session._

1. _(none filed yet)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Skipped verify (--skip-verify). Run `pnpm run eval:station scan-out` for full gate._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

<!-- eval-ledger:auto:design-critique -->
- `src/components/outbound/workspaces/ScanOutWorkspace.tsx` — snapshot `docs/eval/stations/scan-out/snapshots/2026-09-11-critique-ScanOutWorkspace.txt`
```
{
  "file": "src/components/outbound/workspaces/ScanOutWorkspace.tsx",
  "summary": "1 problem, worst first: Renders components but imports none from the design system",
  "problems": [
    {
      "severity": "no-system-usage",
```
- `src/components/outbound/scan-out/ScanOutComposerDock.tsx` — snapshot `docs/eval/stations/scan-out/snapshots/2026-09-11-critique-ScanOutComposerDock.txt`
```
{
  "file": "src/components/outbound/scan-out/ScanOutComposerDock.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "CopyChip"
```
- `src/components/composer/ComposerModeRow.tsx` — snapshot `docs/eval/stations/scan-out/snapshots/2026-09-11-critique-ComposerModeRow.txt`
```
{
  "file": "src/components/composer/ComposerModeRow.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [],
  "metrics": {
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **ScanOutWorkspace** — 1 files, 1 symbols (`docs/eval/stations/scan-out/snapshots/2026-09-11-impact-ScanOutWorkspace.json`)
- **StationComposerHost** — 18 files, 18 symbols (`docs/eval/stations/scan-out/snapshots/2026-09-11-impact-StationComposerHost.json`)
- **ComposerModeRow** — 11 files, 11 symbols (`docs/eval/stations/scan-out/snapshots/2026-09-11-impact-ComposerModeRow.json`)
- **ScanStationProgressRing** — 1 files, 2 symbols (`docs/eval/stations/scan-out/snapshots/2026-09-11-impact-ScanStationProgressRing.json`)
- **useOverlaySwapHardCut** — 10 files, 12 symbols (`docs/eval/stations/scan-out/snapshots/2026-09-11-impact-useOverlaySwapHardCut.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/station/scan-station-overlay-cohort.test.ts`
- `src/components/outbound/scan-out/scan-out-commit.test.ts`
- `src/components/composer/composer-mode-row.test.tsx`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-11T03:31:56.454Z · station `scan-out`_
<!-- /eval-ledger:auto:last-run -->
