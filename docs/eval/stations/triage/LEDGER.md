# Arrival / Triage floor station — eval ledger

**Route:** `/triage`

Run: `pnpm run eval:station triage` · Display SoT: `pnpm run eval:cohort slot-table`

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
- `src/components/receiving/triage/TriageLineWorkspace.tsx` — snapshot `docs/eval/stations/triage/snapshots/2026-09-01-critique-TriageLineWorkspace.txt`
```
{
  "file": "src/components/receiving/triage/TriageLineWorkspace.tsx",
  "summary": "No design-system problems found. That is not a claim the component is GOOD — only that it does not fork or drift.",
  "problems": [],
  "design_system_used": [
    "AppSurfaceFill"
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **TriageLineWorkspace** — 2 files, 2 symbols (`docs/eval/stations/triage/snapshots/2026-09-01-impact-TriageLineWorkspace.json`)
- **useOverlaySwapHardCut** — 10 files, 12 symbols (`docs/eval/stations/triage/snapshots/2026-09-01-impact-useOverlaySwapHardCut.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
- `src/lib/station/scan-station-overlay-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-01T08:13:26.744Z · station `triage`_
<!-- /eval-ledger:auto:last-run -->
