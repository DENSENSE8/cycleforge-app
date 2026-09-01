#!/usr/bin/env node
/**
 * Load scan-station overlay cohort eval manifests from TypeScript SoT
 * (no hand-maintained JSON registry).
 *
 *   node --import tsx tools/eval-ledger/load-cohort.mjs
 *   node --import tsx tools/eval-ledger/load-cohort.mjs --json
 */
import {
  SCAN_STATION_OVERLAY_COHORT,
  SCAN_STATION_OVERLAY_CONTRACT,
  SCAN_STATION_OVERLAY_COHORT_TRIPWIRE,
  OVERLAY_COHORT_LEDGER,
  OVERLAY_COHORT_SNAPSHOTS,
  allStationEvalManifests,
  stationEvalManifest,
  overlayCohortWorkspacePaths,
} from '../../src/lib/station/scan-station-overlay-cohort.ts'

export {
  SCAN_STATION_OVERLAY_COHORT,
  SCAN_STATION_OVERLAY_CONTRACT,
  SCAN_STATION_OVERLAY_COHORT_TRIPWIRE,
  OVERLAY_COHORT_LEDGER,
  OVERLAY_COHORT_SNAPSHOTS,
  allStationEvalManifests,
  stationEvalManifest,
  overlayCohortWorkspacePaths,
}

const asJson = process.argv.includes('--json')
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('load-cohort.mjs')) {
  const payload = {
    cohortTripwire: SCAN_STATION_OVERLAY_COHORT_TRIPWIRE,
    cohortLedger: OVERLAY_COHORT_LEDGER,
    cohortSnapshots: OVERLAY_COHORT_SNAPSHOTS,
    workspaces: overlayCohortWorkspacePaths(),
    contractKeys: Object.keys(SCAN_STATION_OVERLAY_CONTRACT),
    stations: allStationEvalManifests(),
  }
  if (asJson || process.argv.includes('--json')) {
    console.log(JSON.stringify(payload, null, 2))
  }
}
