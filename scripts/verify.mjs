#!/usr/bin/env node
/**
 * verify — THE gate. There is no remote CI behind it.
 *
 * `.github/workflows/` was deleted in 2f6dcd784; this script, run from the
 * pre-push hook, is the whole of CI until the self-hosted runner in
 * docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md §3 lands. (The header
 * used to call this "the local mirror of CI" — a mirror of something that no
 * longer exists is the kind of prose this repo keeps getting bitten by.)
 *
 * Runs every gate, in a fixed order, and reports EVERY failure (never
 * fail-fast) so a single run surfaces all problems at once — no more
 * push → red on lint → fix → push → red on typecheck → … loop.
 *
 *   "Green here ⇒ landable."  (full profile only)
 *
 * Wired into the pre-push hook (.githooks/pre-push) and named in the agent
 * rules so Cursor/Codex/etc.
 * self-check before finishing.
 *
 *   npm run verify              # full gate — CI mirror; required before done / main
 *   npm run verify:dogfood      # tenant click-through slice (pre-push on non-main)
 *   npm run verify:fast         # lint + typecheck only (inner loop)
 *
 * Exit 0 iff every HARD gate in the selected profile passed. Advisory gates
 * (marked below, mirroring ci.yml continue-on-error) are reported but never
 * fail the run.
 *
 * CONCURRENCY. Gates are independent — every one only READS the tree — so they
 * run concurrently and their output is buffered and printed per gate as each
 * finishes. Sequential execution left ~14 of 16 cores idle for minutes at a
 * time; the wall clock is now the slowest single gate rather than the sum.
 * Two things this deliberately preserves:
 *   - never fail-fast: every gate still runs, every failure still reports
 *   - the summary table stays in ALL_GATES (CI) order, not finish order
 * `--serial` restores one-at-a-time streaming output for debugging a gate;
 * `--jobs=N` overrides the pool size.
 *
 * The one ordering coupling is already handled upstream: run-unit-tests.mjs
 * excludes the jscpd integration driver (which writes probe files into src/ and
 * shells the real gate) precisely so it cannot race the Clone-baseline gate.
 * A gate that ever WRITES to the tree must be added to the serial set below.
 */
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { gatesForProfile, resolveVerifyProfile } from './verify-profile.mjs';

let PROFILE;
try {
  PROFILE = resolveVerifyProfile(process.argv);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : err}\n`);
  process.exit(2);
}

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

const GATES = gatesForProfile(PROFILE);

const BANNER = {
  fast: 'verify — inner loop (lint + typecheck)',
  dogfood: 'verify — dogfood (tenant click-through)',
  full: 'verify — local CI mirror',
};

const SERIAL = process.argv.includes('--serial');
const jobsArg = process.argv.find((a) => a.startsWith('--jobs='));
// Each gate is itself multi-process (eslint, tsc, and `node --test`'s own
// per-file children), so a pool the width of the machine would oversubscribe and
// slow every member down. Four keeps the long gates overlapping without that.
const JOBS = SERIAL
  ? 1
  : Math.max(1, Number(jobsArg?.slice('--jobs='.length)) || Math.min(4, availableParallelism()));

process.stdout.write(
  c('1', `▶ verify profile: ${PROFILE}`) +
    (JOBS > 1 ? c('2', ` · ${GATES.length} gates, ${JOBS} at a time`) : '') +
    '\n',
);

/** Windows: `eslint.CMD` / `tsc.CMD` — spawning `.CMD` with shell:false is
 *  ENOENT/EINVAL, which made every local-bin gate report ✗ no matter what
 *  the gate actually did. */
const SPAWN_SHELL = process.platform === 'win32';

/** @param {import('./verify-profile.mjs').VerifyGate} gate */
function runGateSerial(gate) {
  process.stdout.write('\n' + c('1', `▶ ${gate.name}`) + '\n');
  const res = spawnSync(gate.cmd, gate.args, {
    stdio: 'inherit',
    env: { ...process.env, ...(gate.env ?? {}) },
    shell: SPAWN_SHELL,
  });
  return { name: gate.name, ok: res.status === 0, advisory: !!gate.advisory };
}

/**
 * Run a gate with its output buffered, then flush the whole block at once so
 * concurrent gates never interleave mid-line.
 * @param {import('./verify-profile.mjs').VerifyGate} gate
 */
function runGateBuffered(gate) {
  return new Promise((resolve) => {
    const child = spawn(gate.cmd, gate.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(gate.env ?? {}) },
      shell: SPAWN_SHELL,
    });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    const finish = (ok) => {
      const body = Buffer.concat(chunks).toString();
      process.stdout.write(
        '\n' +
          c('1', `▶ ${gate.name}`) +
          (ok ? '' : c('31', ' ✗')) +
          '\n' +
          (body.endsWith('\n') || body === '' ? body : body + '\n'),
      );
      resolve({ name: gate.name, ok, advisory: !!gate.advisory });
    };
    // A spawn error (missing binary) is a gate failure, not a crash of verify.
    child.on('error', (err) => {
      chunks.push(Buffer.from(`verify: could not run ${gate.cmd}: ${err.message}\n`));
      finish(false);
    });
    child.on('close', (code) => finish(code === 0));
  });
}

/** Fixed-width pool; results land at their ALL_GATES index so the summary keeps CI order. */
async function runPool(gates, width) {
  const out = new Array(gates.length);
  let next = 0;
  const worker = async () => {
    while (next < gates.length) {
      const i = next++;
      out[i] = await runGateBuffered(gates[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, gates.length) }, worker));
  return out;
}

const results = SERIAL ? GATES.map(runGateSerial) : await runPool(GATES, JOBS);

process.stdout.write('\n' + '─'.repeat(52) + '\n  ' + BANNER[PROFILE] + '\n' + '─'.repeat(52) + '\n');
let hardFail = false;
for (const r of results) {
  const mark = r.ok ? c('32', '✓') : r.advisory ? c('33', '!') : c('31', '✗');
  if (!r.ok && !r.advisory) hardFail = true;
  process.stdout.write(`  ${mark} ${r.name}${!r.ok && r.advisory ? c('33', ' (advisory — not blocking)') : ''}\n`);
}
process.stdout.write('─'.repeat(52) + '\n');

if (hardFail) {
  const hint =
    PROFILE === 'full'
      ? ' — fix the ✗ gates above before pushing.\n'
      : PROFILE === 'dogfood'
        ? ' — fix the ✗ gates before dogfooding or pushing.\n  Full `npm run verify` is still required before done / main.\n'
        : ' — fix lint/typecheck, then re-run. This is not CI.\n';
  process.stdout.write(
    '\n' +
      c('31', 'verify FAILED') +
      hint +
      '\n',
  );
  process.exit(1);
}

const passLine = {
  fast: 'verify PASSED (fast) — inner loop only; not CI.',
  dogfood:
    'verify PASSED (dogfood) — tenant click-through slice; full verify still required before done / main.',
  full: 'verify PASSED — matches CI; safe to push.',
  deep: 'verify PASSED (deep) — full + advisory design review; nightly profile.',
};
process.stdout.write('\n' + c('32', passLine[PROFILE]) + '\n');

// The ledger rides on the PASS line deliberately. Every gate here is
// shrink-only, so a green run means "no NEW debt" — never "no debt". Printing
// what the baselines are still forgiving is what keeps PASS from reading as
// clean. Best-effort: a broken ledger must never fail a verify that passed.
// Fast/dogfood skip it — those profiles are not the ratchet conversation.
if (PROFILE === 'full' || PROFILE === 'deep') {
  try {
    spawnSync('node', ['scripts/debt-ledger.mjs', '--summary'], { stdio: 'inherit' });
  } catch {
    /* ledger is informational only */
  }
}
process.stdout.write('\n');
