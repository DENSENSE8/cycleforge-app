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
_Skipped verify (--skip-verify). Run `pnpm run eval:station triage` for full gate._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

<!-- eval-ledger:auto:design-critique -->
- `src/components/receiving/triage/TriageLineWorkspace.tsx` — snapshot `docs/eval/stations/triage/snapshots/2026-09-05-critique-TriageLineWorkspace.txt`
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
- **TriageLineWorkspace** — 2 files, 2 symbols (`docs/eval/stations/triage/snapshots/2026-09-05-impact-TriageLineWorkspace.json`)
- **idleBrowseLayerProps** — 12 files, 14 symbols (`docs/eval/stations/triage/snapshots/2026-09-05-impact-idleBrowseLayerProps.json`)
- **overlayPaneStyle** — 12 files, 14 symbols (`docs/eval/stations/triage/snapshots/2026-09-05-impact-overlayPaneStyle.json`)
- **ItemRecordQtyBadge** — 17 files, 20 symbols (`docs/eval/stations/triage/snapshots/2026-09-05-impact-ItemRecordQtyBadge.json`)
- **useOverlaySwapHardCut** — 10 files, 12 symbols (`docs/eval/stations/triage/snapshots/2026-09-05-impact-useOverlaySwapHardCut.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
**pass** — snapshot `docs/eval/stations/triage/snapshots/2026-09-05-tripwire.log`
- `src/lib/station/scan-station-overlay-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-05T17:50:23.280Z · station `triage`_
<!-- /eval-ledger:auto:last-run -->
