#!/usr/bin/env node
/**
 * Slot-table discover — print delete vs keep for the local agent.
 *
 *   node --import tsx tools/eval-ledger/run-slot-table-discover.mjs
 *   node --import tsx tools/eval-ledger/run-slot-table-discover.mjs --json
 *
 * Authority: src/lib/tables/slot-table-discover.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  assertKnownDebtRatchet,
  discoverSlotTable,
  formatDiscoverMarkdown,
  nextDeleteGap,
} from '../../src/lib/tables/slot-table-discover.ts'
import { REPO, stamp, writeLatest } from './eval-core.mjs'

const json = process.argv.includes('--json')
const report = discoverSlotTable(REPO)
const md = formatDiscoverMarkdown(report)
const ratchet = assertKnownDebtRatchet(report)
const next = nextDeleteGap(report)

const payload = {
  ok: ratchet.ok,
  extra: ratchet.extra,
  stale: ratchet.stale,
  next: next
    ? { id: next.id, path: next.path, keep: next.keep, next: next.next, blockedBy: next.blockedBy }
    : null,
  delete: report.delete.map((f) => f.id),
  judgment: report.judgment.map((f) => f.id),
  keep: report.keep.map((k) => k.id),
}

if (json) {
  console.log(JSON.stringify({ ...payload, report, markdown: md }, null, 2))
} else {
  console.log('# Slot-table discover\n')
  console.log(md.next)
  console.log('\n## DELETE (mechanical)\n')
  console.log(md.delete)
  console.log('\n## KEEP\n')
  console.log(md.keep)
  console.log('\n## JUDGMENT (human)\n')
  console.log(md.judgment)
  if (!ratchet.ok) {
    console.error('\nRATCHET FAIL extra=', ratchet.extra, 'stale=', ratchet.stale)
  }
}

const { day } = stamp()
const snapDir = path.join(REPO, 'docs/eval/cohorts/slot-table/snapshots')
mkdirSync(snapDir, { recursive: true })
writeFileSync(
  path.join(snapDir, `${day}-discover.json`),
  JSON.stringify(payload, null, 2) + '\n',
)
writeLatest('docs/eval/cohorts/slot-table/snapshots', { kind: 'discover', ...payload })

process.exit(ratchet.ok ? 0 : 1)
