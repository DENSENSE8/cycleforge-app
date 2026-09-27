#!/usr/bin/env node
/**
 * PostToolUse nudge — when an agent CREATES a new component file, show it the
 * three closest things that already exist, once, and let it carry on.
 *
 * Progressive disclosure for the agent (DESIGN_SYSTEM.md "Disclosure ladder"):
 * zero context on ordinary edits; a one-line-per-match glance at the moment a
 * duplicate is likeliest; the full law is one command away (`ds.mjs contract`).
 * Never blocks — new components are welcome while the codebase is young
 * (AGENTS.md §3: build fast, prove it, pin it).
 *
 * Wired in .claude/settings.json (PostToolUse, matcher Write). Reads the Claude
 * hook payload on stdin; prints `hookSpecificOutput.additionalContext` or
 * nothing. Fails open: any error is silence, never a broken write.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const GARISEK_OS = process.env.GARISEK_OS_ROOT || path.join(process.env.HOME ?? '', 'Projects/Garisek-OS')
const CODE_GRAPH = path.join(GARISEK_OS, 'tools/code-graph/cg.mjs')
const PER_SOURCE = 3
const TIMEOUT_MS = 12_000

/** A new file under the UI homes that renders — same test as the door's no-new-component. */
const UI_FILE = /^src\/(components|app|design-system|features)\/.*\.tsx$/
const EXPORTED_COMPONENT = /export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)/
const RENDERS = /<[A-Za-z][\w.]*[\s/>]/

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** `TrackingListPopover` → `tracking list popover`. */
function words(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.]/g, ' ').toLowerCase()
}

function inHead(rel) {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd: REPO, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Once per session per file: a second Write of the same new file is not news. */
function firstTime(sessionId, rel) {
  const stamp = path.join(os.tmpdir(), `ds-nudge-${String(sessionId || 'nosession').replace(/\W/g, '')}.json`)
  let seen = []
  try {
    if (existsSync(stamp)) seen = JSON.parse(readFileSync(stamp, 'utf8'))
  } catch {
    seen = []
  }
  if (seen.includes(rel)) return false
  try {
    writeFileSync(stamp, JSON.stringify([...seen, rel]))
  } catch {
    // A stamp we cannot write only means a possible repeat nudge.
  }
  return true
}

function runJson(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(out.slice(out.indexOf('{'))))
      } catch {
        resolve(null)
      }
    })
  })
}

/** First sentence, capped — a glance, not the law. */
function gist(text) {
  const s = String(text ?? '').split(/(?<=[.!?])\s/)[0]
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

async function main() {
  const payload = JSON.parse(readStdin() || '{}')
  if (payload.tool_name !== 'Write') return
  const abs = payload.tool_input?.file_path
  const content = payload.tool_input?.content
  if (!abs || typeof content !== 'string') return
  const rel = path.relative(REPO, abs).split(path.sep).join('/')
  if (!UI_FILE.test(rel) || rel.endsWith('.test.tsx')) return
  const exported = content.match(EXPORTED_COMPONENT)
  if (!exported || !RENDERS.test(content)) return
  if (inHead(rel) || !firstTime(payload.session_id, rel)) return

  const name = exported[1]
  const query = `${words(name)} ${words(path.basename(path.dirname(rel)))}`.trim()
  const [contract, graph] = await Promise.all([
    runJson([path.join(HERE, 'ds.mjs'), 'contract', query]),
    existsSync(CODE_GRAPH)
      ? runJson([CODE_GRAPH, 'search', query, '--project', 'cycleforge-app', '--limit', String(PER_SOURCE + 2)])
      : Promise.resolve(null),
  ])

  const lines = []
  for (const m of (contract?.matches ?? []).slice(0, PER_SOURCE)) {
    const why = gist(m.doNot || m.useWhen)
    lines.push(`• ${m.id} (${m.import ?? m.file})${why ? ` — ${why}` : ''}`)
  }
  const pinned = new Set((contract?.matches ?? []).map((m) => m.file))
  const graphHits = (graph?.results ?? [])
    .map((r) => String(r.location ?? '').replace(/:\d+$/, ''))
    .filter((file, i, all) => UI_FILE.test(file) && file !== rel && !pinned.has(file) && all.indexOf(file) === i)
    .slice(0, PER_SOURCE)
  for (const file of graphHits) lines.push(`• ${file} (unpinned, found by code-graph)`)
  if (lines.length === 0) return

  const additionalContext = [
    `You created ${name} (${rel}). Things that already exist for "${query}":`,
    ...lines,
    'If one fits, compose it instead. If none does, keep going — and pin it in src/design-system/pinned.json once a second place uses it.',
    `Full law: node tools/design-mcp/ds.mjs contract "<the job>"`,
  ].join('\n')
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }) + '\n',
  )
}

main().catch(() => {}).finally(() => process.exit(0))
