# Shipping scan station — eval ledger

**Route:** `/shipping`

Run: `pnpm run eval:station shipping` · Display SoT: `pnpm run eval:cohort slot-table`

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
_Skipped verify (--skip-verify). Run `pnpm run eval:station shipping` for full gate._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

<!-- eval-ledger:auto:design-critique -->
- `src/components/tech/TechRightPane.tsx` — snapshot `docs/eval/stations/shipping/snapshots/2026-09-11-critique-TechRightPane.txt`
```
{
  "file": "src/components/tech/TechRightPane.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "AppSurfaceFill"
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **TechRightPane** — 2 files, 2 symbols (`docs/eval/stations/shipping/snapshots/2026-09-11-impact-TechRightPane.json`)
- **useOverlaySwapHardCut** — 10 files, 12 symbols (`docs/eval/stations/shipping/snapshots/2026-09-11-impact-useOverlaySwapHardCut.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/station/scan-station-overlay-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-11T22:25:20.255Z · station `shipping`_
<!-- /eval-ledger:auto:last-run -->
