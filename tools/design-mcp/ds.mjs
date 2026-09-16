#!/usr/bin/env node
/**
 * One-shot CLI for the CycleForge design-mcp server.
 *
 * Use when Cursor has not surfaced `ds_*` as native MCP tools (known gap for
 * project `.cursor/mcp.json` stdio servers). Same handlers as the MCP process.
 *
 *   node tools/design-mcp/ds.mjs contract "dumb station mouth"
 *   node tools/design-mcp/ds.mjs tokens station-skin --filter porcelain
 *   node tools/design-mcp/ds.mjs critique src/components/outbound/scan-out/ScanOutComposerDock.tsx
 *   node tools/design-mcp/ds.mjs stamp   # refresh session receipt only
 *
 * Every successful call writes `.cursor/design-mcp-session.json` so hooks can
 * prove the agent consulted the design system before UI writes.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const STAMP = path.join(REPO, '.cursor', 'design-mcp-session.json')
const LAUNCHER = path.join(HERE, 'run-mcp.sh')

function usage(code = 1) {
  console.error(`usage:
  node tools/design-mcp/ds.mjs contract <intent> [--limit N]
  node tools/design-mcp/ds.mjs tokens <axis> [--filter substring]
  node tools/design-mcp/ds.mjs critique <repo-relative-file>
  node tools/design-mcp/ds.mjs boundary <repo-relative-file>
  node tools/design-mcp/ds.mjs nav-names
  node tools/design-mcp/ds.mjs mobile-first
  node tools/design-mcp/ds.mjs sku-identity
  node tools/design-mcp/ds.mjs mobile-ground
  node tools/design-mcp/ds.mjs identity-purity
  node tools/design-mcp/ds.mjs stamp`)
  process.exit(code)
}

function writeStamp(extra = {}) {
  mkdirSync(path.dirname(STAMP), { recursive: true })
  let prev = {}
  if (existsSync(STAMP)) {
    try {
      prev = JSON.parse(readFileSync(STAMP, 'utf8'))
    } catch {
      prev = {}
    }
  }
  const next = {
    ...prev,
    ...extra,
    repo: REPO,
    updatedAt: new Date().toISOString(),
    updatedMs: Date.now(),
  }
  writeFileSync(STAMP, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

function rpcCall(name, args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(LAUNCHER, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: REPO,
      env: process.env,
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

if (cmd === 'stamp') {
  const stamp = writeStamp({ source: 'stamp' })
  console.log(JSON.stringify(stamp, null, 2))
  process.exit(0)
}

if (cmd === 'contract') {
  const intent = argv[1]
  if (!intent) usage()
  let limit = 8
  const li = argv.indexOf('--limit')
  if (li >= 0) limit = Number(argv[li + 1]) || 8
  const res = await rpcCall('ds_contract', { intent, limit })
  const text = extractText(res)
  writeStamp({
    source: 'cli',
    lastTool: 'ds_contract',
    lastIntent: intent,
    lastTopId: (() => {
      try {
        return JSON.parse(text)?.matches?.[0]?.id ?? null
      } catch {
        return null
      }
    })(),
  })
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
  writeStamp({ source: 'cli', lastTool: 'ds_tokens', lastAxis: axis })
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
  writeStamp({ source: 'cli', lastTool: 'ds_critique', lastFile: file_path })
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
  writeStamp({ source: 'cli', lastTool: 'ds_boundary', lastFile: file_path })
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
  writeStamp({ source: 'cli', lastTool: 'ds_nav_names' })
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

if (cmd === 'mobile-first') {
  const res = await rpcCall('ds_mobile_first', {})
  const text = extractText(res)
  writeStamp({ source: 'cli', lastTool: 'ds_mobile_first' })
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

if (cmd === 'sku-identity') {
  const res = await rpcCall('ds_sku_identity', {})
  const text = extractText(res)
  writeStamp({ source: 'cli', lastTool: 'ds_sku_identity' })
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

if (cmd === 'mobile-ground') {
  const res = await rpcCall('ds_mobile_ground', {})
  const text = extractText(res)
  writeStamp({ source: 'cli', lastTool: 'ds_mobile_ground' })
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
if (cmd === 'identity-purity') {
  const res = await rpcCall('ds_identity_purity', {})
  const text = extractText(res)
  writeStamp({ source: 'cli', lastTool: 'ds_identity_purity' })
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
