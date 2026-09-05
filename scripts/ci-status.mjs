#!/usr/bin/env node
/**
 * ci-status — read the receipts instead of re-running the gates.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §3.3 step 7,
 * §3.4. The agent rule is "read the receipt, do not run the gate": run
 * `verify:fast` on the files you just touched, and ask this for everything
 * else.
 *
 *   node scripts/ci-status.mjs               # HEAD + the last 10 receipts + hit ratio
 *   node scripts/ci-status.mjs --last 25
 *   node scripts/ci-status.mjs --sha <sha>   # one receipt in full
 *   node scripts/ci-status.mjs --json
 *
 * Exit code: 0 when HEAD has a green receipt, 1 when HEAD's receipt is red,
 * 2 when HEAD has no receipt yet (queued, running, or never enqueued).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CI_PATHS, attributeFailures, formatDuration, hitRatio, parseQueue, summarizeGates } from './ci/ci-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const abs = (rel) => path.join(ROOT, rel);

function parseArgs(argv) {
  const out = { last: 10, sha: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--last') out.last = Math.max(1, Number(argv[++i]) || 10);
    else if (a === '--sha') out.sha = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write('usage: ci-status.mjs [--last N] [--sha <sha>] [--json]\n');
      process.exit(0);
    }
  }
  return out;
}

function readReceipts() {
  const dir = abs(CI_PATHS.receipts);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt));
}

function readQueue() {
  const file = abs(CI_PATHS.queue);
  return existsSync(file) ? parseQueue(readFileSync(file, 'utf8')) : [];
}

function readFlaky() {
  const file = abs(CI_PATHS.flaky);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : (data.entries ?? []);
  } catch {
    return [];
  }
}

function resolveSha(ref) {
  const res = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

const args = parseArgs(process.argv.slice(2));
const receipts = readReceipts();
const queue = readQueue();
const flaky = readFlaky();
const running = existsSync(abs(CI_PATHS.lock));
const head = resolveSha('HEAD');
const target = args.sha ? resolveSha(args.sha) ?? args.sha : head;
const targetReceipt = receipts.find((r) => r.sha === target || r.sha.startsWith(target ?? '')) ?? null;
const shown = receipts.slice(0, args.last);
const ratioShown = hitRatio(shown);
const ratioAll = hitRatio(receipts);

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        head,
        target,
        receipt: targetReceipt,
        recent: shown,
        hitRatio: { shown: ratioShown, all: ratioAll },
        queue,
        running,
        flaky,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(targetReceipt ? (targetReceipt.ok ? 0 : 1) : 2);
}

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const out = [];

if (args.sha && targetReceipt) {
  out.push(JSON.stringify(targetReceipt, null, 2));
} else {
  out.push(
    c('1', `CI receipts (${CI_PATHS.receipts})`) +
      ` — showing ${shown.length} of ${receipts.length} · cache hit ratio ${ratioShown.ratio.toFixed(2)} (${ratioShown.hits} hit / ${ratioShown.ran} ran)` +
      (receipts.length > shown.length ? ` · all-time ${ratioAll.ratio.toFixed(2)}` : ''),
  );
  out.push('');
  out.push(`${'sha'.padEnd(8)} ${'branch'.padEnd(12)} ${'profile'.padEnd(7)} ${'ok'.padEnd(3)} ${'dur'.padEnd(7)} gates`);
  for (const r of shown) {
    const mark = r.ok ? c('32', '✓') : c('31', '✗');
    const warn = r.warnings?.length ? c('33', ` ⚠ ${r.warnings.length}`) : '';
    out.push(
      `${r.sha.slice(0, 7).padEnd(8)} ${String(r.branch ?? 'detached').slice(0, 12).padEnd(12)} ${r.profile.padEnd(7)} ${mark}   ${formatDuration(r.durationMs).padEnd(7)} ${summarizeGates(r.gates)}${warn}`,
    );
  }
  if (shown.length === 0) out.push('  (no receipts yet — commit something, or run `node scripts/ci-runner.mjs --sha HEAD`)');
  out.push('');
}

// HEAD line — the answer the agent is after.
if (targetReceipt) {
  const failing = targetReceipt.gates.filter((g) => g.status === 'fail').map((g) => g.gate);
  const quarantined = targetReceipt.quarantined?.length
    ? ` · quarantined: ${targetReceipt.quarantined.map((q) => q.test ?? q).join(', ')}`
    : '';
  out.push(
    `${args.sha ? 'target' : 'HEAD'} ${target.slice(0, 7)}: ` +
      (targetReceipt.ok
        ? c('32', 'receipt present · all gates green')
        : c('31', `receipt present · RED (${failing.join(', ') || 'runner error'})`)) +
      quarantined +
      (targetReceipt.selection ? ` · unit selection: ${targetReceipt.selection}` : ''),
  );
  for (const w of targetReceipt.warnings ?? []) out.push(c('33', `  ⚠ ${w}`));
  // Culprit finding: the parent's receipt already says whether this commit
  // broke the gate or walked into an existing red.
  const parentSha = resolveSha(`${target}^`);
  const parentReceipt = parentSha ? (receipts.find((r) => r.sha === parentSha) ?? null) : null;
  const blame = new Map(attributeFailures(targetReceipt, parentReceipt).map((a) => [a.gate, a]));
  for (const g of targetReceipt.gates.filter((g) => g.status !== 'pass')) {
    const a = blame.get(g.gate);
    const verdict =
      a?.verdict === 'inherited'
        ? c('33', ` (inherited from ${a.parentSha.slice(0, 7)} — not this commit)`)
        : a?.verdict === 'introduced'
          ? c('31', ` (INTRODUCED here — green at ${a.parentSha.slice(0, 7)})`)
          : a
            ? c('2', ' (parent not measured)')
            : '';
    out.push(`  ${g.status === 'fail' ? c('31', '✗') : c('33', '!')} ${g.gate}${verdict} — ${g.logPath || 'no log'}`);
  }
} else {
  const queued = queue.find((q) => target?.startsWith(q.sha) || q.sha.startsWith(target ?? '—'));
  out.push(
    `${args.sha ? 'target' : 'HEAD'} ${(target ?? '?').slice(0, 7)}: ` +
      c('33', queued ? 'no receipt yet — queued' : running ? 'no receipt yet — a runner is active' : 'no receipt — not enqueued (post-commit hook missing, or run `node scripts/ci-runner.mjs --sha HEAD`)'),
  );
}
out.push(
  `queue: ${queue.length ? queue.map((q) => `${q.sha.slice(0, 7)} ${q.branch ?? 'detached'}`).join(', ') : 'empty'}` +
    (running ? ' · runner active' : ''),
);
out.push(`quarantine (${CI_PATHS.flaky}): ${flaky.length ? flaky.map((f) => f.test ?? JSON.stringify(f)).join(', ') : 'none'}`);
process.stdout.write(`${out.join('\n')}\n`);
process.exit(targetReceipt ? (targetReceipt.ok ? 0 : 1) : 2);
