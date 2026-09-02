#!/usr/bin/env node
/**
 * Host helpers for CycleForgeGoal — parse, classify, hop-0 branch, KEEP check.
 *
 *   node --import tsx tools/eval-ledger/goal-cli.mjs parse < file.json
 *   node --import tsx tools/eval-ledger/goal-cli.mjs classify --head @- --worktree @-
 *   node --import tsx tools/eval-ledger/goal-cli.mjs hop0 '<json>'
 *   node --import tsx tools/eval-ledger/goal-cli.mjs keep id1 id2
 *   node --import tsx tools/eval-ledger/goal-cli.mjs resolve-eval 'eval:cohort slot-table'
 *   node --import tsx tools/eval-ledger/goal-cli.mjs next-hop < '{"hop":1,"measure":…}'
 *   node --import tsx tools/eval-ledger/goal-cli.mjs classify-output < '<eval stdout+stderr>'
 */
import { readFileSync } from 'node:fs'
import {
  checkKeepIds,
  classifyGoalFile,
  hop0Decision,
  detectHopAsks,
  isRunnerInfraFailure,
  nextHopDecision,
  parseCycleForgeGoal,
  readPackageScripts,
  resolveEvalCommand,
} from '../../src/lib/eval/goal.ts'

const cmd = process.argv[2]
if (!cmd || cmd === '-h' || cmd === '--help') {
  console.error('usage: goal-cli.mjs parse | classify | hop0 | keep …')
  process.exit(cmd ? 0 : 2)
}

function readStdin() {
  return readFileSync(0, 'utf8')
}

if (cmd === 'parse') {
  const raw = JSON.parse(readStdin())
  const goal = parseCycleForgeGoal(raw, { scripts: readPackageScripts(process.cwd()) })
  console.log(JSON.stringify(goal))
  process.exit(0)
}

if (cmd === 'classify') {
  const payload = JSON.parse(readStdin())
  const r = classifyGoalFile({
    headText: payload.headText ?? null,
    worktreeText: payload.worktreeText ?? null,
  })
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 2)
}

if (cmd === 'hop0') {
  const payload = JSON.parse(process.argv[3] || readStdin())
  console.log(JSON.stringify(hop0Decision(payload)))
  process.exit(0)
}

if (cmd === 'decide-find') {
  const { decideFind } = await import('../../src/lib/eval/find-freshness.ts')
  const payload = JSON.parse(readStdin())
  console.log(JSON.stringify(decideFind(payload.matches, payload.expectedFile)))
  process.exit(0)
}

if (cmd === 'resolve-eval') {
  const command = process.argv.slice(3).join(' ').trim() || readStdin().trim()
  console.log(JSON.stringify(resolveEvalCommand(command, readPackageScripts(process.cwd()))))
  process.exit(0)
}

if (cmd === 'next-hop') {
  const payload = JSON.parse(readStdin())
  console.log(JSON.stringify(nextHopDecision(payload)))
  process.exit(0)
}

if (cmd === 'detect-hop-asks') {
  const payload = JSON.parse(readStdin())
  console.log(JSON.stringify(detectHopAsks(String(payload.diff ?? ''), payload.filesTouched ?? [])))
  process.exit(0)
}

if (cmd === 'classify-output') {
  const text = readStdin()
  console.log(JSON.stringify({ infra: isRunnerInfraFailure(text) }))
  process.exit(0)
}

if (cmd === 'keep') {
  const ids = process.argv.slice(3)
  const r = checkKeepIds(ids, process.cwd())
  console.log(JSON.stringify(r))
  process.exit(r.ok ? 0 : 1)
}

console.error(`unknown command ${cmd}`)
process.exit(2)
