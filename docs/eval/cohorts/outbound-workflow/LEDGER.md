# Outbound workflow cohort — eval ledger

**SoT:** `src/lib/shipping/outbound-workflow-cohort.ts` — one pure,
versioned source verdict for the CLI guard, Design MCP, this cohort, and every
external agent harness.

Run: `pnpm run eval:cohort outbound-workflow`

Scope: mobile Orders state vocabulary and its no-execution boundary; exact SLA,
allocated storage path and pick-progress projections; physical dock staging;
and semantic-token integrity. Station and slot-table visuals keep their own
cohorts; this evaluator verifies their shared workflow law.

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
| Date | Gate | Result | Snapshot |
|------|------|--------|----------|
| 2026-09-19 | tripwire | pass | `docs/eval/cohorts/outbound-workflow/snapshots/2026-09-19-tripwire.log` |
| 2026-09-19 | outbound-workflow-guard | pass | `docs/eval/cohorts/outbound-workflow/snapshots/2026-09-19-verdict.json` |
| 2026-09-19 | verify:fast | pass | `docs/eval/cohorts/outbound-workflow/snapshots/2026-09-19-verify-fast.log` |
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
**pass** — snapshot `docs/eval/cohorts/outbound-workflow/snapshots/2026-09-19-tripwire.log`
<!-- /eval-ledger:auto:tripwire-result -->

## Versioned verdict

<!-- eval-ledger:auto:verdict -->
- schema: `44`
- analysis: `deterministic-source-contract`
- violations: **0**
- snapshot: `docs/eval/cohorts/outbound-workflow/snapshots/2026-09-19-verdict.json`
<!-- /eval-ledger:auto:verdict -->

<!-- eval-ledger:auto:last-run -->
_Updated 2026-09-19T02:17:13.847Z · cohort `outbound-workflow` · run id `2026-09-19T02-15-47-620Z` · law v44_
<!-- /eval-ledger:auto:last-run -->
