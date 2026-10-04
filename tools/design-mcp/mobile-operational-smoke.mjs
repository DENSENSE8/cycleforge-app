#!/usr/bin/env node
/**
 * End-to-end replay of the mobile operational prompts that established V2.
 *
 * This intentionally calls the public ds.mjs door for every case. It proves
 * the live MCP engine, project profile, catalog walk and curated pins agree;
 * reading pinned.json directly would only prove that prose exists on disk.
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

const CASES = [
  {
    name: 'whole mobile application root',
    intent: 'build the same mobile ecommerce operations application again from the exact same prompt using the upgraded V2 display UX and UI methodology: mobile-first roots, Fitts Law, progressive disclosure, compact fulfillment allocate, warehouse stock, scan history, receiving LPN quality control, documents and multiple photo capture',
    first: 'MobileV2Shell',
    includes: [
      'MobileV2AppSwitcher',
      'MobileV2FulfillmentOrders',
      'MobileV2StockLocations',
      'MobileV2ScanStation',
      'MobileV2ReceivingCartonRecord',
      'MobileNativePhotoCapture',
      'MobileV2OrderPaperworkSheet',
    ],
  },
  {
    name: 'compact allocate queue',
    intent: 'build a compact high-volume mobile allocate fulfillment list with inline status filters, platform identity, SLA urgency, product image, quantity condition price and one next action; tap opens details with bottom actions',
    first: 'MobileV2FulfillmentOrders',
    includes: ['mobile-v2-allocate-layout', 'MobileV2ActionSheet', 'DetailDock'],
  },
  {
    name: 'location-first stock operations',
    intent: 'build mobile warehouse stock management: scan or manually enter a location, edit count with reason, pair bin or tote, move stock, add and review multiple photos',
    first: 'MobileV2LocationRecord',
    includes: ['MobileV2StockLocations', 'MobileNativePhotoCapture', 'MobileV2ScanCta'],
  },
  {
    name: 'hierarchical mobile navigation',
    intent: 'build mobile navigation with large reachable destinations for allocate, pick, stock, receiving, print and settings without duplicating desktop routing',
    first: 'MobileV2AppSwitcher',
    includes: ['MobileV2ScanCta', 'MobileV2StockLocations'],
  },
  {
    name: 'continuous evidence capture',
    intent: 'build an iOS-like mobile photo capture flow that takes multiple photos before Done, supports gallery, camera, review, remove and retry',
    first: 'MobileNativePhotoCapture',
    includes: ['MobileContinuousPhotoCamera', 'MobileSwipePhotoViewer'],
  },
  {
    name: 'receiving LPN and quality control',
    intent: 'build a mobile scanned LPN receiving quality-control record with ticket, items, failed reason, claim, print QC label, photos, and bottom operational actions',
    first: 'MobileV2ReceivingCartonRecord',
    includes: ['MobileV2ScanStation', 'MobileV2DetailTopBar', 'DetailDock'],
  },
  {
    name: 'order paperwork disclosure',
    intent: 'build a mobile record detail where tap reveals progressive details and documents such as packing slip manual and shipping label without a full page form',
    first: 'MobileV2OrderPaperworkSheet',
    includes: ['MobileV2FulfillmentOrders', 'DetailHubScreen'],
  },
  {
    name: 'scan history and bottom capture',
    intent: 'build a recent-scans mobile station with newest history visible above bottom camera capture and manual fallback',
    first: 'MobileV2ScanStation',
    includes: ['MobileV2ScanRecentList', 'MobileCaptureWindow'],
  },
  {
    name: 'Fitts law mobile hierarchy',
    intent: 'mobile data display should be compact but still easy to tap; apply Fitts Law Fits Law hierarchy progressive disclosure thumb reach and one primary action',
    first: 'DetailDock',
    includes: ['IconButton', 'MobileV2ActionSheet'],
  },
  {
    name: 'record display and multi-step import',
    intent: 'mobile import purchase orders step progress grouped order cards no truncation',
    leading: ['MobileStepProgress', 'MobileRecordCard'],
    includes: [],
  },
]

function contract(intent) {
  const result = spawnSync(process.execPath, [CLI, 'contract', intent, '--limit', '15'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, result.stderr || `ds_contract exited ${result.status}`)
  return JSON.parse(result.stdout)
}

let failed = false
for (const entry of CASES) {
  try {
    const payload = contract(entry.intent)
    const ids = payload.matches.map((match) => match.id)
    if (entry.first) assert.equal(ids[0], entry.first, `first match was ${ids[0] ?? 'none'}`)
    if (entry.leading) {
      const head = ids.slice(0, entry.leading.length)
      assert.deepEqual([...head].sort(), [...entry.leading].sort(), `leading matches were ${head.join(', ')}`)
    }
    for (const required of entry.includes) {
      assert.ok(ids.includes(required), `missing ${required}; received ${ids.join(', ')}`)
    }
    process.stdout.write(`PASS ${entry.name}: ${ids.slice(0, 5).join(' -> ')}\n`)
  } catch (error) {
    failed = true
    process.stderr.write(`FAIL ${entry.name}: ${error instanceof Error ? error.message : error}\n`)
  }
}

try {
  const profile = JSON.parse(readFileSync(path.join(HERE, 'design-mcp.profile.json'), 'utf8'))
  const rules = profile.contractPreflight?.rules ?? []
  const ids = new Set(rules.map((rule) => rule.id))
  for (const id of [
    'mobile-v2-navigation',
    'mobile-v2-fulfillment',
    'mobile-v2-stock',
    'mobile-v2-scan',
    'mobile-v2-photo',
    'mobile-v2-receiving',
    'mobile-v2-paperwork',
    'mobile-v2-inbound',
  ]) assert.ok(ids.has(id), `missing preflight ${id}`)
  const law = rules.filter((rule) => rule.id.startsWith('mobile')).map((rule) => rule.intent).join(' ')
  assert.match(law, /Fitts's Law/)
  assert.match(law, /Fits Law/)
  assert.ok(Number(profile.contractPreflight.receiptTtlMs) <= 30 * 60 * 1000, 'mobile guidance receipt exceeds 30 minutes')
  process.stdout.write('PASS pre-write routing: V2 domain preflights + Fitts/Fits law + 30-minute refresh\n')

  const hostRoot = process.env.GARISEK_OS_ROOT || path.join(os.homedir(), 'Projects', 'Garisek-OS')
  const preflightModule = await import(pathToFileURL(path.join(hostRoot, 'tools', 'agent-contract', 'design-contract-preflight.mjs')).href)
  const receiptDir = mkdtempSync(path.join(os.tmpdir(), 'mobile-v2-contract-smoke-'))
  const event = {
    repo: REPO,
    file: 'src/components/mobile/v2/fulfillment/__contract-probe.tsx',
    agent: 'mobile-operational-smoke',
    sessionId: `smoke-${process.pid}`,
  }
  const first = preflightModule.enforceDesignContractPreflight(event, profile, { now: 1_000, receiptDir })
  assert.equal(first.decision, 'deny')
  assert.equal(first.ruleId, 'mobile-v2-fulfillment')
  assert.match(first.message, /MobileV2FulfillmentOrders/)
  const retry = preflightModule.enforceDesignContractPreflight(event, profile, { now: 1_001, receiptDir })
  assert.equal(retry.decision, 'allow')
  const refreshed = preflightModule.enforceDesignContractPreflight(event, profile, {
    now: 1_000 + Number(profile.contractPreflight.receiptTtlMs) + 1,
    receiptDir,
  })
  assert.equal(refreshed.decision, 'deny')
  assert.match(refreshed.message, /MobileV2FulfillmentOrders/)
  process.stdout.write('PASS live pre-write ping: deny with V2 contract -> receipt retry -> expiry re-ping\n')

  const inbound = preflightModule.enforceDesignContractPreflight(
    { ...event, file: 'src/components/mobile/v2/inbound/__contract-probe.tsx' },
    profile,
    { now: 1_000, receiptDir },
  )
  assert.equal(inbound.decision, 'deny')
  assert.equal(inbound.ruleId, 'mobile-v2-inbound')
  assert.match(inbound.message, /MobileRecordCard/)
  assert.match(inbound.message, /MobileStepProgress/)
  process.stdout.write('PASS inbound pre-write ping: record display law names MobileRecordCard + MobileStepProgress\n')
} catch (error) {
  failed = true
  process.stderr.write(`FAIL pre-write routing: ${error instanceof Error ? error.message : error}\n`)
}

if (failed) process.exit(1)
process.stdout.write('mobile operational MCP smoke: all good\n')
