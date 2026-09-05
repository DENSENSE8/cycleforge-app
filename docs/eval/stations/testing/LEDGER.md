# Testing floor station — eval ledger

**Route:** `/test`

Run: `pnpm run eval:station testing` · Display SoT: `pnpm run eval:cohort slot-table`

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
_Skipped verify (--skip-verify). Run `pnpm run eval:station testing` for full gate._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

<!-- eval-ledger:auto:design-critique -->
- `src/components/tech/TestingLineWorkspace.tsx` — snapshot `docs/eval/stations/testing/snapshots/2026-09-05-critique-TestingLineWorkspace.txt`
```
{
  "file": "src/components/tech/TestingLineWorkspace.tsx",
  "summary": "1 problem, worst first: Renders components but imports none from the design system",
  "problems": [
    {
      "severity": "no-system-usage",
```
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
- **TestingLineWorkspace** — 2 files, 2 symbols (`docs/eval/stations/testing/snapshots/2026-09-05-impact-TestingLineWorkspace.json`)
- **idleBrowseLayerProps** — 12 files, 14 symbols (`docs/eval/stations/testing/snapshots/2026-09-05-impact-idleBrowseLayerProps.json`)
- **overlayPaneStyle** — 12 files, 14 symbols (`docs/eval/stations/testing/snapshots/2026-09-05-impact-overlayPaneStyle.json`)
- **ItemRecordQtyBadge** — 17 files, 20 symbols (`docs/eval/stations/testing/snapshots/2026-09-05-impact-ItemRecordQtyBadge.json`)
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
**pass** — snapshot `docs/eval/stations/testing/snapshots/2026-09-05-tripwire.log`
- `src/lib/station/scan-station-overlay-cohort.test.ts`
<!-- /eval-ledger:auto:tripwires -->

---

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-05T17:56:32.766Z · station `testing`_
<!-- /eval-ledger:auto:last-run -->
