#!/usr/bin/env node
/**
 * verify — the local mirror of CI (.github/workflows/ci.yml → `ci` job).
 *
 * Runs the SAME gates CI runs, in the same order, and reports EVERY failure
 * (never fail-fast) so a single run surfaces all problems at once — no more
 * push → red on lint → fix → push → red on typecheck → … loop.
 *
 *   "Green here ⇒ green in CI."  (full profile only)
 *
 * Wired into the pre-push hook (.githooks/pre-push) and named in the agent
 * rules (.cursor/rules/verify-before-done.mdc + AGENTS.md) so Cursor/Codex/etc.
 * self-check before finishing.
 *
 *   npm run verify              # full gate — CI mirror; required before done / main
 *   npm run verify:dogfood      # tenant click-through slice (pre-push on non-main)
 *   npm run verify:fast         # lint + typecheck only (inner loop)
 *
 * Exit 0 iff every HARD gate in the selected profile passed. Advisory gates
 * (marked below, mirroring ci.yml continue-on-error) are reported but never
 * fail the run.
 */
import { spawnSync } from 'node:child_process';
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

process.stdout.write(c('1', `▶ verify profile: ${PROFILE}`) + '\n');

const results = [];
for (const gate of GATES) {
  process.stdout.write('\n' + c('1', `▶ ${gate.name}`) + '\n');
  const res = spawnSync(gate.cmd, gate.args, {
    stdio: 'inherit',
    env: { ...process.env, ...(gate.env ?? {}) },
    // Windows: `npx` is npx.CMD — spawning it with shell:false is ENOENT/EINVAL,
    // which made every npx gate report ✗ no matter what the gate actually did.
    shell: process.platform === 'win32',
  });
  results.push({ name: gate.name, ok: res.status === 0, advisory: !!gate.advisory });
}

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
      'Compose named SoTs from AGENTS.md / sot-lookup; never raise a ratchet\n' +
      'baseline to pass a gate.\n\n',
  );
  process.exit(1);
}

const passLine = {
  fast: 'verify PASSED (fast) — inner loop only; not CI.',
  dogfood:
    'verify PASSED (dogfood) — tenant click-through slice; full verify still required before done / main.',
  full: 'verify PASSED — matches CI; safe to push.',
};
process.stdout.write('\n' + c('32', passLine[PROFILE]) + '\n');

// The ledger rides on the PASS line deliberately. Every gate here is
// shrink-only, so a green run means "no NEW debt" — never "no debt". Printing
// what the baselines are still forgiving is what keeps PASS from reading as
// clean. Best-effort: a broken ledger must never fail a verify that passed.
// Fast/dogfood skip it — those profiles are not the ratchet conversation.
if (PROFILE === 'full') {
  try {
    spawnSync('node', ['scripts/debt-ledger.mjs', '--summary'], { stdio: 'inherit' });
  } catch {
    /* ledger is informational only */
  }
}
process.stdout.write('\n');
