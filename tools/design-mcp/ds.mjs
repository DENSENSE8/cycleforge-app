#!/usr/bin/env node
/**
 * One-shot CLI for the CycleForge design-mcp server.
 *
 * Use when a harness has not surfaced `ds_*` as native MCP tools. Same handlers
 * as the MCP process.
 *
 *   node tools/design-mcp/ds.mjs contract "dumb station mouth"
 *   node tools/design-mcp/ds.mjs tokens station-skin --filter porcelain
 *   node tools/design-mcp/ds.mjs critique src/components/outbound/scan-out/ScanOutComposerDock.tsx
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
// The engine is the host's; the LAW is this repo's design-mcp.profile.json.
// This lane used to carry a 102 KB copy of the engine, which drifted until it
// and the host disagreed about this repo's own corner ladder. The launcher is
// resolved through GARISEK_OS_ROOT so a checkout that moves does not silently
// fall back to a stale local copy.
const GARISEK_OS = process.env.GARISEK_OS_ROOT || path.join(process.env.HOME ?? '', 'Projects/Garisek-OS')
const LAUNCHER = path.join(GARISEK_OS, 'tools/design-mcp/run-mcp.sh')

function usage(code = 1) {
  console.error(`usage:
  node tools/design-mcp/ds.mjs contract <intent> [--limit N]
  node tools/design-mcp/ds.mjs tokens <axis> [--filter substring]
  node tools/design-mcp/ds.mjs critique <repo-relative-file>
  node tools/design-mcp/ds.mjs critique-batch <file>… | -   # one engine, JSON line per file ('-' = files on stdin)
  node tools/design-mcp/ds.mjs boundary <repo-relative-file>
  node tools/design-mcp/ds.mjs nav-names
  node tools/design-mcp/ds.mjs card-views
  node tools/design-mcp/ds.mjs sku-identity
  node tools/design-mcp/ds.mjs ledger <repo-relative-file>
  node tools/design-mcp/ds.mjs display-method '<facts-json>'
  node tools/design-mcp/ds.mjs disclosure [<surface>] [id=16127 …] [--dark]
  node tools/design-mcp/ds.mjs route '<json>'          # {"path"|"file"|"intent": …}
  node tools/design-mcp/ds.mjs vocabulary [word]
  node tools/design-mcp/ds.mjs route-tree [lane]`)
  process.exit(code)
}

function rpcCall(name, args, timeoutMs = 30_000) {
  return rpcBatch([{ name, args }], timeoutMs).then((results) => results[0])
}

/**
 * One server, many tool calls (ids 2…N+1), results in call order. The spec sweep critiques
 * every feature UI file; one spawn per file cost ~0.8 s of engine start-up each.
 */
function rpcBatch(calls, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(LAUNCHER, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: REPO,
      // DESIGN_MCP_PROJECT names WHICH project; the engine resolves WHERE from
      // the cwd's git worktree, so every lane of this repo gets its own tree.
      env: { ...process.env, DESIGN_MCP_PROJECT: process.env.DESIGN_MCP_PROJECT || 'cycleforge-app' },
    })
    let out = ''
    let err = ''
    let settled = false
    const results = new Map()
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      fn(value)
    }
    child.stdout.on('data', (d) => {
      out += d
      const lines = out.split('\n')
      out = lines.pop() ?? ''
      for (const line of lines) {
        let msg = null
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (msg && typeof msg.id === 'number' && msg.id >= 2) results.set(msg.id, msg)
      }
      if (results.size === calls.length) finish(resolve, calls.map((_, i) => results.get(i + 2)))
    })
    child.stderr.on('data', (d) => {
      err += d
    })
    const send = (o) => child.stdin.write(`${JSON.stringify(o)}\n`)
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ds-cli', version: '1' },
      },
    })
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    calls.forEach(({ name, args }, i) => send({ jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name, arguments: args } }))
    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`design-mcp timeout after ${timeoutMs}ms (${results.size}/${calls.length} answered)\n${err}\nout=${out.slice(0, 400)}`),
      )
    }, timeoutMs)
    child.on('error', (e) => finish(reject, e))
  })
}

function extractText(res) {
  if (res.error) return JSON.stringify(res.error, null, 2)
  const content = res.result?.content
  if (Array.isArray(content) && content[0]?.text) return content[0].text
  return JSON.stringify(res.result ?? res, null, 2)
}

const argv = process.argv.slice(2)
const cmd = argv[0]
if (!cmd) usage()

if (cmd === 'contract') {
  const intent = argv[1]
  if (!intent) usage()
  let limit = 8
  const li = argv.indexOf('--limit')
  if (li >= 0) limit = Number(argv[li + 1]) || 8
  const res = await rpcCall('ds_contract', { intent, limit })
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  process.exit(0)
}

if (cmd === 'tokens') {
  const axis = argv[1]
  if (!axis) usage()
  const args = { axis }
  const fi = argv.indexOf('--filter')
  if (fi >= 0 && argv[fi + 1]) args.filter = argv[fi + 1]
  const res = await rpcCall('ds_tokens', args)
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  process.exit(0)
}

if (cmd === 'critique') {
  const file_path = argv[1]
  if (!file_path) usage()
  const res = await rpcCall('ds_critique', { file_path })
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  process.exit(0)
}

if (cmd === 'critique-batch') {
  let files = argv.slice(1)
  if (files.length === 1 && files[0] === '-') {
    let input = ''
    for await (const chunk of process.stdin) input += chunk
    files = input.split('\n').map((l) => l.trim()).filter(Boolean)
  }
  if (!files.length) usage()
  // Chunks keep one stuck file from timing out the whole set.
  const CHUNK = 50
  for (let i = 0; i < files.length; i += CHUNK) {
    const slice = files.slice(i, i + CHUNK)
    let results
    try {
      results = await rpcBatch(slice.map((file_path) => ({ name: 'ds_critique', args: { file_path } })), 30_000 + slice.length * 2_000)
    } catch (e) {
      for (const file of slice) console.log(JSON.stringify({ file, ok: false, error: String(e?.message ?? e).split('\n')[0] }))
      continue
    }
    slice.forEach((file, j) => {
      const res = results[j]
      const text = res ? extractText(res) : 'no answer'
      if (!res || res.result?.isError) console.log(JSON.stringify({ file, ok: false, error: text.slice(0, 300) }))
      else {
        let body = null
        try {
          body = JSON.parse(text)
        } catch {
          /* non-JSON answer */
        }
        console.log(JSON.stringify(body ? { file, ok: true, critique: body } : { file, ok: false, error: text.slice(0, 300) }))
      }
    })
  }
  process.exit(0)
}

if (cmd === 'boundary') {
  const file_path = argv[1]
  if (!file_path) usage()
  const res = await rpcCall('ds_boundary', { file_path })
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  process.exit(0)
}

if (cmd === 'nav-names') {
  const res = await rpcCall('ds_nav_names', {})
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  // A collision is a VERDICT, not a tool error — exit non-zero so a shell gate
  // or a hook can act on it without parsing.
  let ok = true
  try {
    ok = JSON.parse(text)?.ok !== false
  } catch {
    ok = true
  }
  process.exit(ok ? 0 : 1)
}

if (cmd === 'card-views') {
  const res = await rpcCall('ds_card_views', {})
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  // A card that disagrees with its view is a VERDICT, not a tool error.
  let ok = true
  try {
    ok = JSON.parse(text)?.ok !== false
  } catch {
    ok = true
  }
  process.exit(ok ? 0 : 1)
}

if (cmd === 'sku-identity') {
  const res = await rpcCall('ds_sku_identity', {})
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  let ok = true
  try {
    ok = JSON.parse(text)?.ok !== false
  } catch {
    ok = true
  }
  process.exit(ok ? 0 : 1)
}

if (cmd === 'ledger') {
  const file_path = argv[1]
  if (!file_path) usage()
  const res = await rpcCall('ds_ledger', { file_path })
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  let verdict = 'pass'
  try {
    verdict = JSON.parse(text)?.verdict ?? 'pass'
  } catch {
    verdict = 'pass'
  }
  process.exit(verdict === 'violation' ? 1 : 0)
}

if (cmd === 'display-method') {
  const raw = argv[1]
  if (!raw) usage()
  let facts
  try {
    facts = JSON.parse(raw)
  } catch (e) {
    console.error(`display-method: facts must be JSON — ${e.message}`)
    process.exit(2)
  }
  const res = await rpcCall('ds_display_method', facts)
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  // The decision (implement / implement-name-runner-up / ask) is data, not a verdict.
  process.exit(0)
}

if (cmd === 'disclosure') {
  // No surface: every declared first screen, statically. A surface: measured live at :3050.
  const surface = argv[1] && !argv[1].includes('=') && !argv[1].startsWith('--') ? argv[1] : undefined
  const params = Object.fromEntries(
    argv.slice(1).filter((a) => a.includes('=')).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]),
  )
  const args = surface ? { surface, params, theme: argv.includes('--dark') ? 'dark' : 'light' } : {}
  const res = await rpcCall('ds_disclosure', args, 180_000)
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  let ok = true
  try {
    ok = JSON.parse(text)?.ok !== false
  } catch {
    ok = true
  }
  process.exit(ok ? 0 : 1)
}

if (cmd === 'route' || cmd === 'vocabulary' || cmd === 'route-tree') {
  // The route tree answers (route / ask-operator, found / not found) are data,
  // not verdicts: exit 0 whenever the tool answered.
  let args = {}
  if (cmd === 'route') {
    const raw = argv[1]
    if (!raw) usage()
    try {
      args = JSON.parse(raw)
    } catch (e) {
      console.error(`route: input must be JSON like '{"intent":"print a bay sticker"}' — ${e.message}`)
      process.exit(2)
    }
  } else if (argv[1]) {
    args = cmd === 'vocabulary' ? { word: argv.slice(1).join(' ') } : { lane: argv[1] }
  }
  const tool = { route: 'ds_route', vocabulary: 'ds_vocabulary', 'route-tree': 'ds_route_tree' }[cmd]
  const res = await rpcCall(tool, args)
  const text = extractText(res)
  if (res.result?.isError) {
    console.error(text)
    process.exit(2)
  }
  console.log(text)
  process.exit(0)
}


usage()
