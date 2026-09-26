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
  node tools/design-mcp/ds.mjs boundary <repo-relative-file>
  node tools/design-mcp/ds.mjs nav-names
  node tools/design-mcp/ds.mjs sku-identity`)
  process.exit(code)
}

function rpcCall(name, args, timeoutMs = 30_000) {
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
      const msgs = out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .filter(Boolean)
      const res = msgs.find((m) => m && m.id === 2)
      if (res) finish(resolve, res)
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
    send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    })
    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`design-mcp timeout after ${timeoutMs}ms\n${err}\nout=${out.slice(0, 400)}`),
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


usage()
