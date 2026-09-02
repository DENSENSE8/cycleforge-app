#!/usr/bin/env node
/**
 * Station eval ledger — loads manifest from SCAN_STATION_OVERLAY_COHORT (TS SoT).
 *
 *   node --import tsx tools/eval-ledger/run-station-eval.mjs scan-out
 *   node --import tsx tools/eval-ledger/run-station-eval.mjs scan-out --skip-verify
 */
import { allStationEvalManifests } from '../../src/lib/station/scan-station-overlay-cohort.ts'
import { evalStationPass, stamp, stationEvalOk } from './eval-core.mjs'

function usage(code = 1) {
  const ids = allStationEvalManifests()
    .map((m) => m.id)
    .join('|')
  console.error(`usage: node --import tsx tools/eval-ledger/run-station-eval.mjs <${ids}> [--skip-verify]`)
  process.exit(code)
}

async function main() {
  const argv = process.argv.slice(2)
  const stationId = argv[0]
  if (!stationId || stationId.startsWith('-')) usage()
  const skipVerify = argv.includes('--skip-verify')
  const manifest = allStationEvalManifests().find((m) => m.id === stationId)
  if (!manifest) usage()

  const { day, ts } = stamp()
  const result = await evalStationPass(manifest, { skipVerify, day })
  const ok = stationEvalOk({
    tripOk: result.tripOk,
    verifyOk: result.verifyOk,
    critiqueOk: result.critiqueOk,
    graphOk: result.graphOk,
  })
  console.log(
    JSON.stringify(
      {
        ok,
        station: stationId,
        ledger: manifest.ledger,
        runId: ts,
        tripwire: result.tripOk,
        verify: result.verifyOk,
        critique: result.critiqueOk,
        graph: result.graphOk,
        critiques: result.critiques.length,
        impacts: result.impacts.length,
      },
      null,
      2,
    ),
  )
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
