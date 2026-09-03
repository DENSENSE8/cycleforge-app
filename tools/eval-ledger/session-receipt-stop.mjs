#!/usr/bin/env node
/**
 * Interactive-session receipt — the Claude Code / Cursor `Stop` hook half of
 * FABLE-5.1 §D3 ("every session leaves a log"). Best-effort, `run_id: null`,
 * keyed `claude-code:<session_id>` (the identity the claims hook mints) or
 * `cursor:<conversation_id>`.
 *
 *   echo '{"session_id":"…","transcript_path":"…"}' | node tools/eval-ledger/session-receipt-stop.mjs [--host claude-code|cursor]
 *
 * Reads only what the Host can observe without a model: the last user prompt
 * from the transcript (Claude Code JSONL) or `prompt` in the payload, the
 * dirty tree minus eval churn, the three session stamps (eval / design /
 * graph) as oracle evidence, and the last eval result. Routes the prompt with
 * `route.mjs`. Writes through Garisek `scripts/session-receipt.ts
 * --mirror-only` so the JSONL mirror and its hash chain are the same as a
 * goal-run hop. A session whose tree and stamps did not change since its
 * last receipt writes nothing (one Stop per turn would flood the mirror).
 *
 * Plain node, zero deps, never non-zero: a receipt that can block a stop is
 * worse than no receipt.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GARISEK = process.env.GARISEK_OS_ROOT || '/home/michaelgarisek/Projects/Garisek-OS'
const argv = process.argv.slice(2)
const hostFlag = argv.indexOf('--host')
const HOST = hostFlag >= 0 ? argv[hostFlag + 1] : 'claude-code'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function git(args) {
  const r = spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', timeout: 15_000 })
  return r.status === 0 ? r.stdout : ''
}

function isEvalChurn(p) {
  return p.startsWith('docs/eval/') || p.includes('/snapshots/') || p.startsWith('.cursor/')
}

/** Last user prompt from a Claude Code transcript JSONL (best effort). */
function lastUserPrompt(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return ''
  try {
    const lines = readFileSync(transcriptPath, 'utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line) continue
      let d
      try {
        d = JSON.parse(line)
      } catch {
        continue
      }
      if (d.type !== 'user') continue
      const content = d.message?.content
      if (typeof content === 'string' && content.trim() && !content.startsWith('<')) return content.slice(0, 2_000)
      if (Array.isArray(content)) {
        const text = content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n').trim()
        if (text && !text.startsWith('<')) return text.slice(0, 2_000)
      }
    }
  } catch {
    /* best effort */
  }
  return ''
}

function routePrompt(text) {
  if (!text) return { routes: [], unrouted: true }
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'tools/eval-ledger/route.mjs', '--json', text], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  })
  try {
    const j = JSON.parse(r.stdout)
    return {
      routes: (j.routes ?? []).map((x) => ({
        cohort: x.cohort,
        evalCommand: x.evalCommand,
        graphSymbols: x.graphSymbols ?? [],
        engineFiles: x.engineFiles ?? [],
        refuse: (x.refuse ?? []).map((y) => (typeof y === 'string' ? y : y.id)),
        mounts: x.mounts ?? [],
      })),
      unrouted: Boolean(j.unrouted),
    }
  } catch {
    return { routes: [], unrouted: true }
  }
}

const payload = (() => {
  try {
    return JSON.parse(readStdin() || '{}')
  } catch {
    return {}
  }
})()

const sid = String(payload.session_id ?? payload.conversation_id ?? process.env.CLAUDE_SESSION_ID ?? '').trim()
if (!sid) process.exit(0)
const sessionId = `${HOST}:${sid}`

const evalStamp = readJson(path.join(ROOT, '.cursor', 'eval-session.json'))
const designStamp = readJson(path.join(ROOT, '.cursor', 'design-mcp-session.json'))
const graphStamp = readJson(path.join(ROOT, '.cursor', 'code-graph-session.json'))

const filesTouched = git(['status', '--porcelain'])
  .split('\n')
  .map((l) => l.replace(/^\s*[ MADRCU?!]+/, '').trim())
  .map((l) => (l.includes(' -> ') ? l.split(' -> ').pop() : l))
  .filter((p) => p && !isEvalChurn(p))

// Dedup + throttle. A Stop fires every turn, and in a shared checkout the
// dirty tree changes every turn even when THIS session did nothing — so the
// fingerprint is the session's measurable events only (the eval / design /
// graph stamps), never the file list, and a session writes at most one
// receipt per THROTTLE_MS unless a new eval result arrived. A hook that
// floods the mirror is a hook that gets deleted.
const THROTTLE_MS = Number(process.env.CYCLEFORGE_SESSION_RECEIPT_THROTTLE_MS || 15 * 60_000)
const fingerprint = createHash('sha256')
  .update(JSON.stringify({ e: evalStamp?.updatedMs ?? null, d: designStamp?.lastTool ?? null, g: graphStamp?.lastTool ?? null }))
  .digest('hex')
const markerDir = path.join(ROOT, '.cursor', 'session-receipts')
mkdirSync(markerDir, { recursive: true })
const marker = path.join(markerDir, `${HOST}-${sid}.last`)
let last = { fingerprint: '', at: 0, eval: null }
try {
  last = JSON.parse(readFileSync(marker, 'utf8'))
} catch {
  /* first receipt for this session */
}
const evalChanged = (evalStamp?.updatedMs ?? null) !== (last.eval ?? null)
if (last.fingerprint === fingerprint) process.exit(0)
if (!evalChanged && Date.now() - (last.at || 0) < THROTTLE_MS) process.exit(0)

const prompt = String(payload.prompt ?? '') || lastUserPrompt(payload.transcript_path)
const expanded = routePrompt(prompt)
const now = new Date().toISOString()
const oracles = []
const ORACLE_TOOLS = new Set(['ds_contract', 'ds_tokens', 'ds_critique', 'find_symbol', 'impact_analysis', 'search_code'])
for (const [stamp] of [[designStamp], [graphStamp]]) {
  const tool = String(stamp?.lastTool ?? '')
  if (!ORACLE_TOOLS.has(tool)) continue
  oracles.push({
    tool,
    args_digest: createHash('sha256').update(String(stamp.lastFile ?? stamp.lastAxis ?? stamp.lastIntent ?? '')).digest('hex').slice(0, 16),
    top_id: null,
    snapshot: null,
    at: stamp.updatedAt ?? now,
  })
}
const evalRuns = evalStamp?.lastCommand && evalStamp.lastCommand !== 'stamp-only'
  ? [{ command: String(evalStamp.lastCommand), exitCode: evalStamp.exitCode ?? null, durationMs: Number(evalStamp.durationMs) || 0, snapshots: [], ok: evalStamp.ok ?? null }]
  : []
const outcome = evalRuns.length === 0 ? 'unmeasured' : evalRuns[0].ok === true ? 'pass' : evalRuns[0].ok === false ? 'repair' : 'unmeasured'
const cohort = expanded.routes[0]?.cohort ?? 'unrouted'
const first = evalRuns[0]
const sentence = `${HOST} did ${cohort} for goal none because ${prompt ? prompt.slice(0, 80).replace(/\s+/g, ' ') : 'no prompt recorded'}; ${first ? `${first.command} exit ${first.exitCode ?? 'none'}` : 'eval not run'}; ${outcome}`

const receipt = {
  v: 'cf-session:v1',
  session_id: sessionId,
  run_id: null,
  goal_id: null,
  host: HOST,
  started_at: evalStamp?.updatedAt ?? now,
  finished_at: now,
  prompt_raw: prompt,
  prompt_expanded: expanded,
  oracles_called: oracles,
  files_touched: filesTouched,
  files_refused: [],
  eval_runs: evalRuns,
  outcome,
  outcome_sentence: sentence,
  system_upgrade: [],
  law_hash: '',
  prev_hash: null,
  entry_hash: null,
}

// Keyed by host too: when Cursor hosts a Claude Code session both stop hooks
// fire for the same sid, and a shared tmp file let one writer read the other's receipt.
const tmp = path.join(markerDir, `${HOST}-${sid}.receipt.json`)
writeFileSync(tmp, JSON.stringify(receipt))
const writer = path.join(GARISEK, 'scripts', 'session-receipt.ts')
if (existsSync(writer)) {
  const r = spawnSync('npx', ['tsx', writer, '--receipt', `@${tmp}`, '--session-id', sessionId, '--repo', ROOT, '--mirror-only'], {
    cwd: GARISEK,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, NODE_NO_WARNINGS: '1', PATH: [path.join(process.env.HOME || '', '.npm-global/bin'), path.join(process.env.HOME || '', '.local/share/mise/shims'), process.env.PATH || ''].join(path.delimiter) },
  })
  if (r.status === 0) writeFileSync(marker, JSON.stringify({ fingerprint, at: Date.now(), eval: evalStamp?.updatedMs ?? null }))
  else process.stderr.write(`session-receipt-stop: writer exit ${r.status} ${(r.stderr || '').slice(0, 200)}\n`)
}
process.exit(0)
