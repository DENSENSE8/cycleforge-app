# Unbox floor station — eval ledger

**Route:** `/unbox`

Run: `pnpm run eval:station unbox` · Display SoT: `pnpm run eval:cohort slot-table`

---

## Locked wins

_Promote to `src/design-system/pinned.json` when stable._

- Idle↔overlay shell is a **cohort SoT** (`SCAN_STATION_OVERLAY_COHORT`) — peer parity, not Pack/Unbox-as-golden
- Tripwire: `src/lib/station/scan-station-overlay-cohort.test.ts`

## Operator verdict

_Human edits after each usav-dev walk. Agents do not invent this section._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:**

## Open gaps

_Prioritized. Agent implements **one** per session._

1. _(none filed yet)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Skipped verify (--skip-verify). Cohort run `2026-09-01T08-12-54-023Z`._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

<!-- eval-ledger:auto:design-critique -->
- `src/components/receiving/unbox/UnboxLineWorkspace.tsx` — snapshot `docs/eval/stations/unbox/snapshots/2026-09-01-critique-UnboxLineWorkspace.txt`
```
{
  "file": "src/components/receiving/unbox/UnboxLineWorkspace.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "AppSurfaceFill",
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **UnboxLineWorkspace** — 1 files, 2 symbols (`docs/eval/stations/unbox/snapshots/2026-09-01-impact-UnboxLineWorkspace.json`)
- **useOverlaySwapHardCut** — 10 files, 12 symbols (`docs/eval/stations/unbox/snapshots/2026-09-01-impact-useOverlaySwapHardCut.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/station/scan-station-overlay-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-01T08:13:12.641Z · station `unbox`_
<!-- /eval-ledger:auto:last-run -->
