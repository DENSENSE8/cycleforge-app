#!/usr/bin/env node
/**
 * Cohort eval — sibling cohorts under one CLI:
 *
 *   node --import tsx tools/eval-ledger/run-cohort-eval.mjs slot-table [--skip-verify]
 *   node --import tsx tools/eval-ledger/run-cohort-eval.mjs shortcuts [--skip-verify]
 *
 * slot-table — DataTable engine + PRODUCT_TABLES peers (the only DISPLAY SoT)
 * shortcuts — staff `?` paints letters on the CTAs (not a sheet)
 *
 * Overlay is not a display cohort. Station mouth/domain: `eval:station <id>`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  SLOT_TABLE_COHORT_TRIPWIRE,
  SLOT_TABLE_COHORT_LEDGER,
  SLOT_TABLE_COHORT_SNAPSHOTS,
  SLOT_TABLE_ENGINE,
  SLOT_TABLE_ENGINE_CONTRACT,
  SLOT_TABLE_ENGINE_LAYOUT_HOOKS,
  SLOT_TABLE_PAINT_LAW,
  slotTableEngineContractSource,
  slotTableEvalManifest,
  slotTableEnginePeerIds,
  slotTablePeerIds,
} from '../../src/lib/tables/slot-table-cohort.ts'
import {
  discoverSlotTable,
  formatDiscoverMarkdown,
  nextDeleteGap,
} from '../../src/lib/tables/slot-table-discover.ts'
import {
  SHORTCUT_DISPLAY_COHORT_TRIPWIRE,
  SHORTCUT_DISPLAY_ENGINE,
  SHORTCUT_DISPLAY_ENGINE_CONTRACT,
  SHORTCUT_DISPLAY_FORBIDDEN,
  SHORTCUT_DISPLAY_PAINT_LAW,
  discoverShortcutDisplay,
  formatShortcutDiscoverMarkdown,
  nextShortcutDeleteGap,
  shortcutDisplayEvalManifest,
} from '../../src/lib/keyboard/shortcut-display-cohort.ts'
import {
  GARISEK_OS,
  REPO,
  evalStationPass,
  ensureLedgerSeed,
  patchLedger,
  run,
  runJson,
  stamp,
} from './eval-core.mjs'

function usage(code = 1) {
  console.error(
    `usage: node --import tsx tools/eval-ledger/run-cohort-eval.mjs <slot-table|shortcuts> [--skip-verify]`,
  )
  process.exit(code)
}

function slotTableLedgerSeed() {
  return `# Slot-table cohort — eval ledger

**SoT:** engine (\`CompoundItem\`, \`useSlotTableLayout\`, \`materializeTracks\`) + every peer in \`PRODUCT_TABLES\` — **not To-ship alone**.

Run: \`pnpm run eval:cohort slot-table\`

Pin: \`CompoundItem\` + \`DateRangePickerField\` in \`src/design-system/pinned.json\`

### Paint law

<!-- eval-ledger:auto:paint-law -->
- ${SLOT_TABLE_PAINT_LAW.title}
- ${SLOT_TABLE_PAINT_LAW.listingChip}
- ${SLOT_TABLE_PAINT_LAW.shipBy}
- ${SLOT_TABLE_PAINT_LAW.filter}
- ${SLOT_TABLE_PAINT_LAW.scope}
<!-- /eval-ledger:auto:paint-law -->

---

## Locked wins

- Title idle \`text-text-default\`; accent + underline on hover/focus
- Listing subtitle: ExternalLink glyph (never the word Listing / item # face); copy = item #
- Layout hooks wrap \`useSlotTableLayout\`
- Discover names DELETE vs KEEP (\`src/lib/tables/slot-table-discover.ts\`)
- Ship-by delay: \`DateRangePickerField variant="compact"\` (no X, no year, click commits; \`useOptimisticMutation\`)
- Tripwire: \`${SLOT_TABLE_COHORT_TRIPWIRE}\`

## Operator verdict

_Human edits after tunnel walks across desks. Agents do not invent this._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:**

## Open gaps

_Agents: do not invent gaps. Pick **one unblocked** row from Discover → DELETE (priority 1 first). After the kill, remove that id from \`SLOT_TABLE_KNOWN_DEBT\` (ratchet down). Never delete a KEEP row. Judgment stays human._

1. _(machine queue is Discover → next / DELETE below)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Not run yet._
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
_Not run yet._
<!-- /eval-ledger:auto:tripwire-result -->

## Peer matrix (PRODUCT_TABLES × engine opt-in)

<!-- eval-ledger:auto:peer-matrix -->
_Not run yet._
<!-- /eval-ledger:auto:peer-matrix -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
_Not run yet._
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_Not run yet._
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_Not run yet._
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
_Not run yet._
<!-- /eval-ledger:auto:discover-keep -->

## Discover — JUDGMENT (human)

<!-- eval-ledger:auto:discover-judgment -->
_Not run yet._
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
_Not run yet._
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
_Not run yet._
<!-- /eval-ledger:auto:design-critique -->

## Graph impact (shared symbols)

<!-- eval-ledger:auto:graph-impact -->
_Not run yet._
<!-- /eval-ledger:auto:graph-impact -->

## Regression tripwires

<!-- eval-ledger:auto:tripwires -->
_Not run yet._
<!-- /eval-ledger:auto:tripwires -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
_Not run yet._
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Seeded — run \`pnpm run eval:cohort slot-table\`._
<!-- /eval-ledger:auto:last-run -->
`
}

async function graphStatsBlock(snapshotsDir, day) {
  const cgCli = path.join(GARISEK_OS, 'tools/code-graph/cg.mjs')
  if (!existsSync(cgCli)) return '_code-graph CLI unavailable_'
  console.error(`[eval-cohort] graph_stats…`)
  const stats = await runJson(cgCli, 'stats', GARISEK_OS)
  const snap = path.join(snapshotsDir, `${day}-graph-stats.json`)
  writeFileSync(path.join(REPO, snap), stats.raw)
  const t = stats.data?.totals ?? {}
  return [
    `- project: \`${stats.data?.project ?? '?'}\``,
    `- status: \`${stats.data?.status ?? '?'}\``,
    `- last_built_at: \`${stats.data?.last_built_at ?? '?'}\``,
    `- nodes: ${t.nodes ?? '?'} · edges: ${t.edges ?? '?'} · embedded: ${t.embedded ?? '?'}`,
    `- snapshot: \`${snap}\``,
  ].join('\n')
}

async function runSlotTable(skipVerify) {
  const { day, ts } = stamp()
  const manifest = slotTableEvalManifest()
  ensureLedgerSeed(SLOT_TABLE_COHORT_LEDGER, slotTableLedgerSeed())
  mkdirSync(path.join(REPO, SLOT_TABLE_COHORT_SNAPSHOTS), { recursive: true })

  console.error(`[eval-cohort] tripwire ${manifest.tripwires.join(' ')}…`)
  const trip = await run(
    `node --import tsx --test ${manifest.tripwires.map((t) => JSON.stringify(t)).join(' ')}`,
  )
  const tripSnap = path.join(SLOT_TABLE_COHORT_SNAPSHOTS, `${day}-tripwire.log`)
  writeFileSync(path.join(REPO, tripSnap), trip.output)
  const tripOk = trip.exitCode === 0

  let verifyOk = null
  let verifySnapshot = null
  if (!skipVerify) {
    const evalCli = path.join(GARISEK_OS, 'tools/eval-engineering/cursor-eval.mjs')
    if (!existsSync(evalCli)) throw new Error(`missing ${evalCli}`)
    console.error(`[eval-cohort] verify:fast (once)…`)
    const res = await run(`node ${JSON.stringify(evalCli)} --root ${JSON.stringify(REPO)} --fast`)
    verifyOk = res.exitCode === 0
    verifySnapshot = path.join(SLOT_TABLE_COHORT_SNAPSHOTS, `${day}-verify-fast.log`)
    writeFileSync(path.join(REPO, verifySnapshot), res.output)
  }

  const result = await evalStationPass(
    {
      id: 'slot-table',
      label: manifest.label,
      route: '/(slot-table)',
      handoff: null,
      ledger: manifest.ledger,
      snapshotsDir: manifest.snapshotsDir,
      critiqueFiles: [...manifest.critiqueFiles],
      graphSymbols: [...manifest.graphSymbols],
      tripwires: [...manifest.tripwires],
      workspace: SLOT_TABLE_ENGINE.compoundCells,
      exportName: 'CompoundItem',
    },
    {
      skipVerify: true,
      day,
      sharedVerify: skipVerify ? undefined : { ok: verifyOk, snapshot: verifySnapshot },
    },
  )

  const enginePeers = new Set(slotTableEnginePeerIds())
  const peerMatrix = [
    `| tableId | on_engine | layout_hook |`,
    `|---|---|---|`,
    ...slotTablePeerIds().map((id) => {
      const hook = SLOT_TABLE_ENGINE_LAYOUT_HOOKS.find((h) => h.tableId === id)
      return `| ${id} | ${enginePeers.has(id) ? 'yes' : '—'} | ${hook ? `\`${hook.path}\`` : '—'} |`
    }),
  ].join('\n')

  const compoundSrc = readFileSync(path.join(REPO, SLOT_TABLE_ENGINE.compoundCells), 'utf8')
  const srcByPath = new Map([[SLOT_TABLE_ENGINE.compoundCells, compoundSrc]])
  const engineContract = [
    `| Predicate | File | Result |`,
    `|---|---|---|`,
    ...Object.entries(SLOT_TABLE_ENGINE_CONTRACT).map(([name, re]) => {
      const rel = slotTableEngineContractSource(name)
      let src = srcByPath.get(rel)
      if (src === undefined) {
        src = readFileSync(path.join(REPO, rel), 'utf8')
        srcByPath.set(rel, src)
      }
      return `| ${name} | \`${rel}\` | ${re.test(src) ? 'pass' : '**FAIL**'} |`
    }),
  ].join('\n')

  const paintLaw = [
    `- ${SLOT_TABLE_PAINT_LAW.title}`,
    `- ${SLOT_TABLE_PAINT_LAW.listingChip}`,
    `- ${SLOT_TABLE_PAINT_LAW.shipBy}`,
    `- ${SLOT_TABLE_PAINT_LAW.filter}`,
    `- ${SLOT_TABLE_PAINT_LAW.scope}`,
  ].join('\n')

  const graphMatrix = [
    `| Symbol | node_key | files_affected | snapshot |`,
    `|---|---|---|---|`,
    ...result.impacts.map((i) => {
      if (i.error) return `| ${i.symbol} | — | ${i.error} | \`${i.snapshot}\` |`
      return `| ${i.symbol} | \`${i.nodeKey}\` | ${i.filesAffected} | \`${i.snapshot}\` |`
    }),
  ].join('\n')

  const critiqueBlock = result.critiques
    .map((c) => {
      if (c.error) return `- \`${c.file}\` — **${c.error}**`
      const head = c.excerpt.split('\n').slice(0, 5).join('\n')
      return `- \`${c.file}\` — \`${c.snapshot}\`\n\`\`\`\n${head}\n\`\`\``
    })
    .join('\n')

  const statsBlock = await graphStatsBlock(SLOT_TABLE_COHORT_SNAPSHOTS, day)
  console.error(`[eval-cohort] discover slot-table…`)
  const discovered = discoverSlotTable(REPO)
  const discoverMd = formatDiscoverMarkdown(discovered)
  const discoverSnap = path.join(SLOT_TABLE_COHORT_SNAPSHOTS, `${day}-discover.json`)
  writeFileSync(
    path.join(REPO, discoverSnap),
    JSON.stringify(
      {
        next: discoverMd.next,
        delete: discovered.delete.map((f) => f.id),
        judgment: discovered.judgment.map((f) => f.id),
        unexpected: discovered.unexpected.map((f) => f.id),
        staleKnownDebt: discovered.staleKnownDebt,
      },
      null,
      2,
    ) + '\n',
  )
  const machineGates = skipVerify
    ? `_Skipped verify (--skip-verify)._`
    : `| Date | Gate | Result | Snapshot |\n|------|------|--------|----------|\n| ${day} | verify:fast | ${verifyOk ? 'pass' : '**FAIL**'} | \`${verifySnapshot}\` |`

  patchLedger(path.join(REPO, SLOT_TABLE_COHORT_LEDGER), {
    'last-run': `_Updated ${new Date().toISOString()} · cohort \`slot-table\` · run id \`${ts}\`_`,
    'machine-gates': machineGates,
    'tripwire-result': tripOk
      ? `**pass** — snapshot \`${tripSnap}\``
      : `**FAIL** — snapshot \`${tripSnap}\`\n\`\`\`\n${trip.output.slice(0, 1200)}\n\`\`\``,
    'peer-matrix': peerMatrix,
    'paint-law': paintLaw,
    'engine-contract': engineContract,
    'discover-next': `${discoverMd.next}\n\n_Snapshot:_ \`${discoverSnap}\``,
    'discover-delete': discoverMd.delete,
    'discover-keep': discoverMd.keep,
    'discover-judgment': discoverMd.judgment,
    'graph-matrix': graphMatrix,
    'design-critique': critiqueBlock || '_none_',
    'graph-stats': statsBlock,
  })

  const ok = tripOk && verifyOk !== false
  console.log(
    JSON.stringify(
      {
        ok,
        cohort: 'slot-table',
        tripwire: tripOk,
        verify: verifyOk,
        peers: slotTablePeerIds().length,
        enginePeers: slotTableEnginePeerIds().length,
        discoverDelete: discovered.delete.length,
        discoverNext: nextDeleteGap(discovered)?.id ?? null,
        ledger: SLOT_TABLE_COHORT_LEDGER,
        runId: ts,
      },
      null,
      2,
    ),
  )
  process.exit(ok ? 0 : 1)
}

function shortcutsLedgerSeed() {
  return `# Shortcuts cohort — eval ledger

**SoT:** \`SHORTCUT_DISPLAY_ENGINE\` in \`src/lib/keyboard/shortcut-display-cohort.ts\`
(staff \`?\` reveals letters **inline on the action buttons** — not a Dialog, not a popover on \`?\`).

Run: \`pnpm run eval:cohort shortcuts\`

Pin: \`KeyboardShortcutsCheatSheet\` + \`TableStatusBar\` in \`src/design-system/pinned.json\`

**Paint law:** ${SHORTCUT_DISPLAY_PAINT_LAW.overview}

**Refuse:** ${SHORTCUT_DISPLAY_PAINT_LAW.refuse}

---

## Locked wins

- Table-foot \`?\` toggles \`HotkeyGlyph\` inside each CTA (\`iconRight\`), gated by \`showHotkey\`
- No \`title\` / HoverTooltip on the question-mark itself
- \`?\` key yields to inline reveal while the CTA strip is mounted
- Bindings stay live via \`useSelectionActionHotkeys\` either way
- Tripwire: \`${SHORTCUT_DISPLAY_COHORT_TRIPWIRE}\`
- Exception: KeyboardShortcutsCheatSheet when no CTA strip; ⌘; \`NAV_KEY_HINT_CLASS\`

## Operator verdict

_Human edits after each usav-dev walk. Agents do not invent this._

- **Status:** initial scaffold — awaiting first operator walk
- **Approved:**
- **Changes:**
- **Do not regress:** standing keycaps; opening the cheat-sheet Dialog from the table-foot \`?\`; a tooltip/popover on \`?\`

## Open gaps

_Prioritized. Agent implements **one** per session._

1. _(none filed yet)_

---

## Machine gates

<!-- eval-ledger:auto:machine-gates -->
_Not run yet._
<!-- /eval-ledger:auto:machine-gates -->

## Tripwire result

<!-- eval-ledger:auto:tripwire-result -->
_Not run yet._
<!-- /eval-ledger:auto:tripwire-result -->

## Engine contract

<!-- eval-ledger:auto:engine-contract -->
_Not run yet._
<!-- /eval-ledger:auto:engine-contract -->

## Discover — next gap

<!-- eval-ledger:auto:discover-next -->
_Not run yet._
<!-- /eval-ledger:auto:discover-next -->

## Discover — DELETE (mechanical)

<!-- eval-ledger:auto:discover-delete -->
_Not run yet._
<!-- /eval-ledger:auto:discover-delete -->

## Discover — KEEP

<!-- eval-ledger:auto:discover-keep -->
_Not run yet._
<!-- /eval-ledger:auto:discover-keep -->

## Discover — JUDGMENT (human)

<!-- eval-ledger:auto:discover-judgment -->
_Not run yet._
<!-- /eval-ledger:auto:discover-judgment -->

## Graph impact matrix (engine symbols)

<!-- eval-ledger:auto:graph-matrix -->
_Not run yet._
<!-- /eval-ledger:auto:graph-matrix -->

## Design critique

<!-- eval-ledger:auto:design-critique -->
_Not run yet._
<!-- /eval-ledger:auto:design-critique -->

## graph_stats

<!-- eval-ledger:auto:graph-stats -->
_Not run yet._
<!-- /eval-ledger:auto:graph-stats -->

---

<!-- eval-ledger:auto:last-run -->
_Seeded — run \`pnpm run eval:cohort shortcuts\`._
<!-- /eval-ledger:auto:last-run -->
`
}

async function runShortcuts(skipVerify) {
  const { day, ts } = stamp()
  const manifest = shortcutDisplayEvalManifest()
  ensureLedgerSeed(manifest.ledger, shortcutsLedgerSeed())
  mkdirSync(path.join(REPO, manifest.snapshotsDir), { recursive: true })

  console.error(`[eval-cohort] tripwire ${manifest.tripwires.join(' ')}…`)
  const trip = await run(
    `node --import tsx --test ${manifest.tripwires.map((t) => JSON.stringify(t)).join(' ')}`,
  )
  const tripSnap = path.join(manifest.snapshotsDir, `${day}-tripwire.log`)
  writeFileSync(path.join(REPO, tripSnap), trip.output)
  const tripOk = trip.exitCode === 0

  let verifyOk = null
  let verifySnapshot = null
  if (!skipVerify) {
    const evalCli = path.join(GARISEK_OS, 'tools/eval-engineering/cursor-eval.mjs')
    if (!existsSync(evalCli)) throw new Error(`missing ${evalCli}`)
    console.error(`[eval-cohort] verify:fast (once)…`)
    const res = await run(`node ${JSON.stringify(evalCli)} --root ${JSON.stringify(REPO)} --fast`)
    verifyOk = res.exitCode === 0
    verifySnapshot = path.join(manifest.snapshotsDir, `${day}-verify-fast.log`)
    writeFileSync(path.join(REPO, verifySnapshot), res.output)
  }

  const result = await evalStationPass(
    {
      id: 'shortcuts',
      label: manifest.label,
      route: '/(shortcuts)',
      handoff: null,
      ledger: manifest.ledger,
      snapshotsDir: manifest.snapshotsDir,
      critiqueFiles: [...manifest.critiqueFiles],
      graphSymbols: [...manifest.graphSymbols],
      tripwires: [...manifest.tripwires],
      workspace: SHORTCUT_DISPLAY_ENGINE.cheatSheet,
      exportName: 'KeyboardShortcutsCheatSheet',
    },
    {
      skipVerify: true,
      day,
      sharedVerify: skipVerify ? undefined : { ok: verifyOk, snapshot: verifySnapshot },
    },
  )

  const cheatSrc = readFileSync(path.join(REPO, SHORTCUT_DISPLAY_ENGINE.cheatSheet), 'utf8')
  const barSrc = readFileSync(path.join(REPO, SHORTCUT_DISPLAY_ENGINE.statusBar), 'utf8')
  const hookSrc = readFileSync(path.join(REPO, SHORTCUT_DISPLAY_ENGINE.inlineHotkeys), 'utf8')
  const engineContract = [
    `| Predicate | Result |`,
    `|---|---|`,
    ...Object.entries(SHORTCUT_DISPLAY_ENGINE_CONTRACT).map(([name, re]) => {
      let src = barSrc
      if (name === 'cheatSheetYields') src = cheatSrc
      else if (name === 'hookToggle') src = hookSrc
      return `| ${name} | ${re.test(src) ? 'pass' : '**FAIL**'} |`
    }),
    ...Object.entries(SHORTCUT_DISPLAY_FORBIDDEN).map(([name, re]) => {
      return `| absent:${name} | ${!re.test(barSrc) ? 'pass' : '**FAIL**'} |`
    }),
  ].join('\n')

  const graphMatrix = [
    `| Symbol | node_key | files_affected | snapshot |`,
    `|---|---|---|---|`,
    ...result.impacts.map((i) => {
      if (i.error) return `| ${i.symbol} | — | ${i.error} | \`${i.snapshot}\` |`
      return `| ${i.symbol} | \`${i.nodeKey}\` | ${i.filesAffected} | \`${i.snapshot}\` |`
    }),
  ].join('\n')

  const critiqueBlock = result.critiques
    .map((c) => {
      if (c.error) return `- \`${c.file}\` — **${c.error}**`
      const head = c.excerpt.split('\n').slice(0, 5).join('\n')
      return `- \`${c.file}\` — \`${c.snapshot}\`\n\`\`\`\n${head}\n\`\`\``
    })
    .join('\n')

  const statsBlock = await graphStatsBlock(manifest.snapshotsDir, day)
  console.error(`[eval-cohort] discover shortcuts…`)
  const discovered = discoverShortcutDisplay(REPO)
  const discoverMd = formatShortcutDiscoverMarkdown(discovered)
  const discoverSnap = path.join(manifest.snapshotsDir, `${day}-discover.json`)
  writeFileSync(
    path.join(REPO, discoverSnap),
    JSON.stringify(
      {
        next: discoverMd.next,
        delete: discovered.delete.map((f) => f.id),
        judgment: discovered.judgment.map((f) => f.id),
        unexpected: discovered.unexpected.map((f) => f.id),
        staleKnownDebt: discovered.staleKnownDebt,
      },
      null,
      2,
    ) + '\n',
  )
  const machineGates = skipVerify
    ? `_Skipped verify (--skip-verify)._`
    : `| Date | Gate | Result | Snapshot |\n|------|------|--------|----------|\n| ${day} | verify:fast | ${verifyOk ? 'pass' : '**FAIL**'} | \`${verifySnapshot}\` |`

  patchLedger(path.join(REPO, manifest.ledger), {
    'last-run': `_Updated ${new Date().toISOString()} · cohort \`shortcuts\` · run id \`${ts}\`_`,
    'machine-gates': machineGates,
    'tripwire-result': tripOk
      ? `**pass** — snapshot \`${tripSnap}\``
      : `**FAIL** — snapshot \`${tripSnap}\`\n\`\`\`\n${trip.output.slice(0, 1200)}\n\`\`\``,
    'engine-contract': engineContract,
    'discover-next': `${discoverMd.next}\n\n_Snapshot:_ \`${discoverSnap}\``,
    'discover-delete': discoverMd.delete,
    'discover-keep': discoverMd.keep,
    'discover-judgment': discoverMd.judgment,
    'graph-matrix': graphMatrix,
    'design-critique': critiqueBlock || '_none_',
    'graph-stats': statsBlock,
  })

  const ok = tripOk && verifyOk !== false
  console.log(
    JSON.stringify(
      {
        ok,
        cohort: 'shortcuts',
        tripwire: tripOk,
        verify: verifyOk,
        discoverDelete: discovered.delete.length,
        discoverNext: nextShortcutDeleteGap(discovered)?.id ?? null,
        ledger: manifest.ledger,
        runId: ts,
      },
      null,
      2,
    ),
  )
  process.exit(ok ? 0 : 1)
}

async function main() {
  const argv = process.argv.slice(2)
  const name = argv[0]
  const skipVerify = argv.includes('--skip-verify')
  if (name === 'overlay') {
    console.error(
      'overlay is not a display cohort. Display SoT: eval:cohort slot-table. Station mouth/domain: eval:station <id>.',
    )
    usage()
  }
  if (name === 'slot-table') return runSlotTable(skipVerify)
  if (name === 'shortcuts') return runShortcuts(skipVerify)
  usage()
}

main().catch((e) => {
  console.error(e.stack ?? e.message ?? e)
  process.exit(1)
})
