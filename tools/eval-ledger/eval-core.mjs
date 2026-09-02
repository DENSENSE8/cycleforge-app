/**
 * Shared helpers for station + cohort eval runners.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(HERE, '..', '..')
export const GARISEK_OS = process.env.GARISEK_OS_ROOT ?? '/home/michaelgarisek/Projects/Garisek-OS'

/**
 * Index freshness as a Host step (FABLE-5.1 D7 item 10). An empty `find` is
 * not a missing symbol until the index has been rebuilt once — the timer runs
 * at 03:40 / 15:40 and a symbol added this morning is invisible until then.
 * One rebuild per process, then re-find. `decideFind` also refuses a hit whose
 * `location` is not the expected engine file: `matches[0]` for a common name
 * can be the wrong node, and a wrong node's impact is not a measurement.
 */
/**
 * `latest.json` per cohort / station (FABLE-5.1 D7 item 16): overwritten on
 * every run, gitignored, so the Host reads one file instead of guessing the
 * day suffix of the newest dated snapshot. Dated snapshots stay for humans.
 */
export function writeLatest(snapshotsDirRel, payload) {
  try {
    const dir = path.join(REPO, snapshotsDirRel)
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'latest.json')
    writeFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...payload }, null, 2)}\n`)
    return path.join(snapshotsDirRel, 'latest.json')
  } catch (err) {
    console.error(`[eval-ledger] latest.json not written: ${err?.message ?? err}`)
    return null
  }
}

let graphRebuiltOnce = false
export function rebuildGraphIndexOnce(project = 'cycleforge-app') {
  if (graphRebuiltOnce) return { ran: false, code: null }
  graphRebuiltOnce = true
  console.error(`[eval-ledger] graph find empty → one rebuild (${project})…`)
  const r = spawnSync('npx', ['tsx', 'scripts/code-graph-rebuild.ts', '--name', project, '--max-age-hours', '0'], {
    cwd: GARISEK_OS,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
  return { ran: true, code: r.status ?? (r.error ? 1 : 0) }
}

/** `find` → (rebuild once on empty → re-find) → location check. Returns `{ find, decision, match }`. */
export async function graphFindFresh(cgCli, symbol, expectedFile) {
  const { decideFind, pickFindMatch } = await import('../../src/lib/eval/find-freshness.ts')
  let find = await runJson(cgCli, `find ${JSON.stringify(symbol)} --limit 3`, GARISEK_OS)
  let decision = decideFind(find.data?.matches ?? [], expectedFile ?? '')
  if ('rebuild' in decision && decision.rebuild) {
    const rebuilt = rebuildGraphIndexOnce()
    if (rebuilt.ran) {
      find = await runJson(cgCli, `find ${JSON.stringify(symbol)} --limit 3`, GARISEK_OS)
      decision = decideFind(find.data?.matches ?? [], expectedFile ?? '')
    }
  }
  return {
    find,
    decision,
    match: pickFindMatch(find.data?.matches ?? [], expectedFile ?? ''),
  }
}

export function run(command, cwd = REPO) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env })
    let output = ''
    child.stdout?.on('data', (d) => {
      output += d
    })
    child.stderr?.on('data', (d) => {
      output += d
    })
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output }))
    child.on('error', (e) => resolve({ exitCode: 1, output: `${output}\n${e.message}` }))
  })
}

export function runJson(nodeScript, args, cwd) {
  return run(`node ${JSON.stringify(nodeScript)} ${args}`, cwd).then(({ exitCode, output }) => {
    try {
      return { exitCode, data: JSON.parse(output), raw: output }
    } catch {
      return { exitCode, data: null, raw: output }
    }
  })
}

export function stamp() {
  const d = new Date()
  return {
    day: d.toISOString().slice(0, 10),
    ts: d.toISOString().replace(/[:.]/g, '-'),
  }
}

export function patchLedger(ledgerPath, replacements) {
  let text = readFileSync(ledgerPath, 'utf8')
  for (const [key, body] of Object.entries(replacements)) {
    const start = `<!-- eval-ledger:auto:${key} -->`
    const end = `<!-- /eval-ledger:auto:${key} -->`
    const re = new RegExp(`${start}[\\s\\S]*?${end}`)
    const block = `${start}\n${body.trim()}\n${end}`
    if (re.test(text)) text = text.replace(re, block)
    else text += `\n\n${block}\n`
  }
  writeFileSync(ledgerPath, text.endsWith('\n') ? text : `${text}\n`)
}

export function ensureLedgerSeed(ledgerRel, seedBody) {
  const abs = path.join(REPO, ledgerRel)
  mkdirSync(path.dirname(abs), { recursive: true })
  if (!existsSync(abs)) writeFileSync(abs, seedBody)
}

export function stationLedgerSeed(manifest) {
  const handoff = manifest.handoff
    ? ` · **Handoff:** [${path.basename(manifest.handoff)}](${relativeHandoff(manifest.handoff, manifest.id)})`
    : ''
  return `# ${manifest.label} — eval ledger

**Route:** \`${manifest.route}\`${handoff}

Run: \`pnpm run eval:station ${manifest.id}\` · Display SoT: \`pnpm run eval:cohort slot-table\`

---

## Locked wins

_Promote to \`src/design-system/pinned.json\` when stable._

- Idle↔overlay shell is a **cohort SoT** (\`SCAN_STATION_OVERLAY_COHORT\`) — peer parity, not Pack/Unbox-as-golden
- Tripwire: \`src/lib/station/scan-station-overlay-cohort.test.ts\`

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
_Not run yet._
<!-- /eval-ledger:auto:machine-gates -->

## Design critique (latest)

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

---

<!-- eval-ledger:auto:last-run -->
_Seeded — run \`pnpm run eval:station ${manifest.id}\`._
<!-- /eval-ledger:auto:last-run -->
`
}

function relativeHandoff(handoff, stationId) {
  // docs/eval/stations/<id>/ → docs/todo/...
  return `../../../${handoff.replace(/^docs\//, '')}`
}

export function critiquePass(critiques) {
  return (critiques ?? []).every((c) => !c.error && c.ok !== false)
}

export function graphPass(impacts, expectedCount) {
  if (!expectedCount) return true
  return impacts.length === expectedCount && impacts.every((i) => !i.error)
}

export function stationEvalOk({ tripOk, verifyOk, critiqueOk, graphOk }) {
  return Boolean(tripOk) && verifyOk !== false && Boolean(critiqueOk) && Boolean(graphOk)
}

export async function evalStationPass(manifest, { skipVerify, day, sharedVerify, skipTripwire }) {
  const snapshotsDir = path.join(REPO, manifest.snapshotsDir)
  mkdirSync(snapshotsDir, { recursive: true })

  let tripOk = true
  let tripSnapshot = null
  let tripOutput = ''
  if (!skipTripwire && (manifest.tripwires ?? []).length) {
    const files = manifest.tripwires.map((t) => JSON.stringify(t)).join(' ')
    console.error(`[eval-ledger] tripwire ${manifest.tripwires.join(' ')}…`)
    const trip = await run(`node --import tsx --test ${files}`)
    tripOk = trip.exitCode === 0
    tripOutput = trip.output
    tripSnapshot = path.join(manifest.snapshotsDir, `${day}-tripwire.log`)
    writeFileSync(path.join(REPO, tripSnapshot), trip.output)
  }

  let verifyOk = sharedVerify?.ok ?? null
  let verifySnapshot = sharedVerify?.snapshot ?? null

  if (!skipVerify && sharedVerify == null) {
    const evalCli = path.join(GARISEK_OS, 'tools/eval-engineering/cursor-eval.mjs')
    if (!existsSync(evalCli)) throw new Error(`missing ${evalCli}`)
    console.error(`[eval-ledger] verify:fast (${manifest.id})…`)
    const res = await run(`node ${JSON.stringify(evalCli)} --root ${JSON.stringify(REPO)} --fast`)
    verifyOk = res.exitCode === 0
    verifySnapshot = path.join(manifest.snapshotsDir, `${day}-verify-fast.log`)
    writeFileSync(path.join(REPO, verifySnapshot), res.output)
  }

  const critiques = []
  const dsCli = path.join(REPO, 'tools/design-mcp/ds.mjs')
  for (const file of manifest.critiqueFiles ?? []) {
    if (!existsSync(path.join(REPO, file))) {
      critiques.push({ file, error: 'missing' })
      continue
    }
    console.error(`[eval-ledger] ds_critique ${file}…`)
    const res = await run(`node ${JSON.stringify(dsCli)} critique ${JSON.stringify(file)}`)
    const snapName = `${day}-critique-${path.basename(file, path.extname(file))}.txt`
    writeFileSync(path.join(snapshotsDir, snapName), res.output)
    critiques.push({
      file,
      ok: res.exitCode === 0,
      snapshot: path.join(manifest.snapshotsDir, snapName),
      excerpt: res.output.slice(0, 800),
    })
  }

  const impacts = []
  const cgCli = path.join(GARISEK_OS, 'tools/code-graph/cg.mjs')
  if (existsSync(cgCli)) {
    for (const symbol of manifest.graphSymbols ?? []) {
      // Location is judged only where the cohort places the symbol
      // (`graphExpectedFiles`) or for the station export in its workspace; a
      // symbol the cohort does not place (e.g. useOverlaySwapHardCut on every
      // station) is found, never location-judged.
      const expectedFile =
        manifest.graphExpectedFiles?.[symbol] ?? (symbol === manifest.exportName ? manifest.workspace : '')
      console.error(`[eval-ledger] graph find ${symbol}…`)
      const { find, decision, match } = await graphFindFresh(cgCli, symbol, expectedFile)
      const snapFind = path.join(manifest.snapshotsDir, `${day}-find-${symbol}.json`)
      writeFileSync(path.join(REPO, snapFind), find.raw)
      const nodeKey = match?.node_key ?? find.data?.matches?.[0]?.node_key
      if (!nodeKey) {
        impacts.push({ symbol, error: 'no match (after one rebuild)', snapshot: snapFind })
        continue
      }
      if ('ok' in decision && decision.ok === false) {
        impacts.push({ symbol, nodeKey, error: `location: not under ${expectedFile}`, snapshot: snapFind })
        continue
      }
      console.error(`[eval-ledger] graph impact ${nodeKey}…`)
      const impact = await runJson(cgCli, `impact ${JSON.stringify(nodeKey)} --depth 2`, GARISEK_OS)
      const snapImpact = path.join(manifest.snapshotsDir, `${day}-impact-${symbol}.json`)
      writeFileSync(path.join(REPO, snapImpact), impact.raw)
      impacts.push({
        symbol,
        nodeKey,
        filesAffected: impact.data?.files_affected,
        totalSymbols: impact.data?.total_symbols,
        snapshot: snapImpact,
      })
    }
  }

  ensureLedgerSeed(manifest.ledger, stationLedgerSeed(manifest))
  const ledgerPath = path.join(REPO, manifest.ledger)

  const machineGates =
    verifyOk === null
      ? `_Skipped verify (--skip-verify). Run \`pnpm run eval:station ${manifest.id}\` for full gate._`
      : `| Date | Gate | Result | Snapshot |\n|------|------|--------|----------|\n| ${day} | verify:fast | ${verifyOk ? 'pass' : '**FAIL**'} | \`${verifySnapshot}\` |`

  const critiqueBlock = critiques
    .map((c) => {
      if (c.error) return `- \`${c.file}\` — **${c.error}**`
      const head = c.excerpt.split('\n').slice(0, 6).join('\n')
      return `- \`${c.file}\` — snapshot \`${c.snapshot}\`\n\`\`\`\n${head}\n\`\`\``
    })
    .join('\n')

  const impactBlock = impacts
    .map((i) => {
      if (i.error) return `- **${i.symbol}** — ${i.error} (\`${i.snapshot}\`)`
      return `- **${i.symbol}** — ${i.filesAffected} files, ${i.totalSymbols} symbols (\`${i.snapshot}\`)`
    })
    .join('\n')

  const fileList = (manifest.tripwires ?? []).map((t) => `- \`${t}\``).join('\n')
  let tripwireBlock = fileList || '_None configured._'
  if (!skipTripwire && (manifest.tripwires ?? []).length) {
    tripwireBlock = tripOk
      ? `**pass** — snapshot \`${tripSnapshot}\`\n${fileList}`
      : `**FAIL** — snapshot \`${tripSnapshot}\`\n${fileList}\n\n\`\`\`\n${tripOutput.slice(0, 2000)}\n\`\`\``
  }

  patchLedger(ledgerPath, {
    'last-run': `_Updated ${new Date().toISOString()} · station \`${manifest.id}\`_`,
    'machine-gates': machineGates,
    'design-critique': critiqueBlock || '_No critique files configured._',
    'graph-impact': impactBlock || '_No graph symbols configured or code-graph CLI unavailable._',
    tripwires: tripwireBlock,
  })

  const critiqueOk = critiquePass(critiques)
  const graphOk = graphPass(impacts, (manifest.graphSymbols ?? []).length)
  writeLatest(manifest.snapshotsDir, {
    kind: 'station',
    id: manifest.id,
    ok: stationEvalOk({ tripOk, verifyOk, critiqueOk, graphOk }),
    tripOk,
    verifyOk,
    critiqueOk,
    graphOk,
    tripSnapshot,
    verifySnapshot,
    critiques: critiques.map((c) => ({ file: c.file, ok: c.ok, snapshot: c.snapshot })),
    impacts,
  })
  return {
    verifyOk,
    critiques,
    impacts,
    tripOk,
    tripSnapshot,
    critiqueOk,
    graphOk,
    exportImpact: impacts.find((i) => i.symbol === manifest.exportName),
  }
}
