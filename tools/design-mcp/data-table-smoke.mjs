#!/usr/bin/env node
/**
 * End-to-end replay of the data-table lane's real jobs through the public
 * ds.mjs door: the live MCP engine, the profile's catalog walk, the pin merge
 * and the ranking must agree. It also exercises the `data-table-surface`
 * pre-write preflight and the `ds_ledger` gate.
 *
 *   node tools/design-mcp/data-table-smoke.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const CLI = path.join(HERE, 'ds.mjs')

// `top` = must appear within the first N results; order inside N is ranking noise.
const CASES = [
  {
    name: 'display-method decision',
    intent: 'choose between data table and card list for a new page',
    first: 'DataTable',
    top: 3,
    includes: ['TriageCardList'],
    // 'new page' is a placement trigger: placement still leads, beside the job's own ranking.
    placementLead: ['NavFilters', 'ContextualSidebar', 'ListPageRecipe'],
  },
  {
    name: 'port /unbox lines off the compound grid',
    intent: 'scan and act receiving lines list on desk replace compound grid',
    first: 'RecordCard',
    top: 1,
    includes: [],
  },
  {
    name: 'stock card slots',
    intent: 'card view for stock list with top-right count and space quick look',
    first: 'RecordCard',
    top: 2,
    includes: ['triage-view'],
  },
  {
    name: 'TaskTable select gutter',
    intent: 'row checkbox select column in a table',
    first: 'GridRowCheckbox',
    top: 1,
    includes: [],
  },
  {
    name: 'selection verbs',
    intent: 'bulk selection bar act on selected rows',
    first: 'TriageSelectBar',
    top: 2,
    includes: ['RecordActionStrip'],
  },
  {
    name: 'danger verb on a selection',
    intent: 'delete selected rows from the list',
    first: 'RecordActionStrip',
    top: 2,
    includes: [],
  },
  {
    name: 'keep-sheet wiring',
    intent: 'new keep-sheet spreadsheet page with binding',
    first: 'table-surface-binding',
    top: 2,
    includes: ['DataTable'],
  },
  {
    name: 'export',
    intent: 'export rows to csv',
    first: 'DataTableExportMenu',
    top: 1,
    includes: [],
  },
  {
    name: 'card list paging',
    intent: 'paginate rows per page load more',
    first: 'TriageListBody',
    top: 2,
    includes: ['TriageCardList'],
  },
  {
    name: 'list display switch',
    intent: 'switch the list between one-line rows and multi-row cards with one click',
    first: 'SegmentedGlyphSwitch',
    top: 2,
    includes: ['TriageRow', 'RecordCard'],
  },
  {
    name: 'empty list',
    intent: 'empty state for a list with no results',
    first: 'EmptyState',
    top: 2,
    includes: ['TriageListBody'],
  },
]

function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000 })
  assert.ok(result.status === 0 || result.status === 1, result.stderr || `ds.mjs exited ${result.status}`)
  return { status: result.status, payload: JSON.parse(result.stdout) }
}

let failed = false
const check = (name, fn) => {
  try {
    const line = fn()
    process.stdout.write(`PASS ${name}${line ? `: ${line}` : ''}\n`)
  } catch (error) {
    failed = true
    process.stderr.write(`FAIL ${name}: ${error instanceof Error ? error.message : error}\n`)
  }
}

for (const entry of CASES) {
  check(entry.name, () => {
    const payload = run(['contract', entry.intent, '--limit', '10']).payload
    const ids = payload.matches.map((match) => match.id)
    if (entry.placementLead) {
      const lead = (payload.placement?.lead ?? []).map((match) => match.id)
      assert.deepEqual(lead, entry.placementLead, `placement.lead was ${lead.join(', ') || 'missing'}`)
      assert.ok(typeof payload.placement?.briefBlock === 'string', 'placement.briefBlock missing')
    }
    const head = ids.slice(0, entry.top)
    assert.ok(head.includes(entry.first), `${entry.first} not in top ${entry.top}; received ${ids.join(', ')}`)
    for (const required of entry.includes) {
      assert.ok(ids.includes(required), `missing ${required}; received ${ids.join(', ')}`)
    }
    return ids.slice(0, 5).join(' -> ')
  })
}

check('ds_ledger verdicts', () => {
  const retired = run(['ledger', 'src/app/warehouse/rma/page.tsx'])
  assert.equal(retired.status, 1)
  assert.equal(retired.payload.verdict, 'violation')
  assert.equal(retired.payload.findings[0].kind, 'retired-path')

  const listed = run(['ledger', 'src/components/right-rail/InspectorFloorDelete.tsx'])
  assert.equal(listed.status, 0)
  const finding = listed.payload.findings.find((f) => f.entry === 'danger-confirm-state-machine')
  assert.ok(finding, 'InspectorFloorDelete should be told it is on the delete list')
  assert.equal(finding.kind, 'on-delete-list')
  assert.ok(finding.replacementPaths.includes('src/design-system/components/ArmedDangerButton.tsx'))

  const canonical = run(['ledger', 'src/components/outbound/orders/cards/OrderCardList.tsx'])
  assert.equal(canonical.payload.verdict, 'pass')
  return 'retired path -> violation, listed fork -> advisory with replacement, card list -> pass'
})

check('ds_display_method', () => {
  const desk = run(['display-method', JSON.stringify({ steadyRows: 40, comparedFacts: 6, verb: 'scan-and-act', surface: 'desk', shape: 'grouped' })])
  assert.equal(desk.payload.top.id ?? desk.payload.top, 'card-list')
  const sheet = run(['display-method', JSON.stringify({ steadyRows: 60, comparedFacts: 8, verb: 'edit-in-place', surface: 'desk', shape: 'entity-per-row', rowsPerScreen: 'many' })])
  assert.equal(sheet.payload.top.id ?? sheet.payload.top, 'data-table')
  const phone = run(['display-method', JSON.stringify({ steadyRows: 60, comparedFacts: 9, verb: 'edit-in-place', surface: 'phone' })])
  assert.notEqual(phone.payload.top.id ?? phone.payload.top, 'data-table')
  return `desk scan -> card-list (${desk.payload.decision}), keep-sheet -> data-table, phone never data-table`
})

check('ds_card_views', () => {
  const { status, payload } = run(['card-views'])
  assert.equal(status, 0, JSON.stringify(payload.views?.filter((v) => v.mismatches?.length)))
  assert.equal(payload.ok, true)
  for (const view of payload.views) assert.ok(view.slots, `${view.id} declares no slots`)
  return `${payload.views.length} views agree with their cards`
})

const profile = JSON.parse(readFileSync(path.join(HERE, 'design-mcp.profile.json'), 'utf8'))
const hostRoot = process.env.GARISEK_OS_ROOT || path.join(os.homedir(), 'Projects', 'Garisek-OS')
const preflight = await import(
  pathToFileURL(path.join(hostRoot, 'tools', 'agent-contract', 'design-contract-preflight.mjs')).href
)

check('pre-write routing', () => {
  const routed = {
    'src/components/tech/all/TechAllTriageTable.tsx': 'data-table-surface',
    'src/features/task-board/TaskTable.tsx': 'data-table-surface',
    'src/lib/triage/views/inventory-stock.ts': 'data-table-surface',
    'src/components/inventory/stock/StockLedger.tsx': 'data-table-surface',
  }
  for (const [file, id] of Object.entries(routed)) {
    assert.equal(preflight.matchingContractPreflight(file, profile)?.id, id, file)
  }
  // Domain rules (owned by other lanes; their ids may change) stay ahead of the generic table rule.
  const domainOwned = [
    'src/components/receiving/docked/DockedPackagesLedger.tsx',
    'src/components/mobile/v2/fulfillment/MobileV2FulfillmentOrders.tsx',
  ]
  for (const file of domainOwned) {
    const id = preflight.matchingContractPreflight(file, profile)?.id
    assert.ok(id && id !== 'data-table-surface', `${file} routed to ${id}`)
  }
  return `${Object.keys(routed).length} table paths routed; ${domainOwned.length} domain paths keep their own rule`
})

check('live pre-write ping', () => {
  const receiptDir = mkdtempSync(path.join(os.tmpdir(), 'data-table-contract-smoke-'))
  const event = {
    repo: REPO,
    file: 'src/components/tech/all/TechAllTriageTable.tsx',
    agent: 'data-table-smoke',
    sessionId: `smoke-${process.pid}`,
  }
  const first = preflight.enforceDesignContractPreflight(event, profile, { now: 1_000, receiptDir })
  assert.equal(first.decision, 'deny')
  assert.equal(first.ruleId, 'data-table-surface')
  for (const id of ['DataTable', 'RecordCard', 'triage-view']) assert.match(first.message, new RegExp(`- ${id} `))
  const retry = preflight.enforceDesignContractPreflight(event, profile, { now: 1_001, receiptDir })
  assert.equal(retry.decision, 'allow')
  return 'deny with DataTable + RecordCard + triage-view -> receipt retry'
})

if (failed) process.exit(1)
process.stdout.write('data-table MCP smoke: all good\n')
