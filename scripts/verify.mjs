#!/usr/bin/env node
/**
 * verify — the local mirror of CI (.github/workflows/ci.yml → `ci` job).
 *
 * Runs the SAME gates CI runs, in the same order, and reports EVERY failure
 * (never fail-fast) so a single run surfaces all problems at once — no more
 * push → red on lint → fix → push → red on typecheck → … loop.
 *
 *   "Green here ⇒ green in CI."
 *
 * Wired into the pre-push hook (.githooks/pre-push) and named in the agent
 * rules (.cursor/rules/verify-before-done.mdc + AGENTS.md) so Cursor/Codex/etc.
 * self-check before finishing.
 *
 *   npm run verify            # full gate — exactly what the pre-push hook runs
 *   npm run verify -- --fast  # lint + typecheck only (quick inner-loop check)
 *
 * Exit 0 iff every HARD gate passed. Advisory gates (marked below, mirroring
 * ci.yml continue-on-error) are reported but never fail the run.
 */
import { spawnSync } from 'node:child_process';

const FAST = process.argv.includes('--fast');
const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

// Each gate mirrors one step in ci.yml's `ci` job. Keep this list in sync with
// that workflow — the whole point is that the two never drift.
const GATES = [
  { name: 'Lint', cmd: 'npx', args: ['eslint', 'src', '--max-warnings=10000'] },
  {
    name: 'Typecheck',
    cmd: 'npx',
    args: ['tsc', '--noEmit', '-p', 'tsconfig.json'],
    env: { NODE_OPTIONS: '--max-old-space-size=6144' },
  },
  ...(FAST
    ? []
    : [
        {
          name: 'Unit tests + DS guards',
          cmd: 'node',
          args: ['--test', '--import', 'tsx', '--test-reporter', 'spec', 'src/**/*.test.ts'],
        },
        { name: 'Dead-code (knip)', cmd: 'node', args: ['scripts/knip-gate.mjs'] },
        { name: 'Route-permission drift', cmd: 'npx', args: ['tsx', 'scripts/audit-route-auth.ts', '--check'] },
        { name: 'Route-auth enforce', cmd: 'npx', args: ['tsx', 'scripts/audit-route-auth.ts', '--enforce'] },
        {
          name: 'Tenancy isolation (static)',
          cmd: 'npx',
          args: ['tsx', 'scripts/tenancy-guard.ts', '--check', '--static-only'],
          advisory: true, // ci.yml runs this continue-on-error
        },
        { name: 'Schema drift', cmd: 'node', args: ['scripts/schema-drift-guard.mjs', '--check'] },
      ]),
];

const results = [];
for (const gate of GATES) {
  process.stdout.write('\n' + c('1', `▶ ${gate.name}`) + '\n');
  const res = spawnSync(gate.cmd, gate.args, {
    stdio: 'inherit',
    env: { ...process.env, ...(gate.env ?? {}) },
    shell: false,
  });
  results.push({ name: gate.name, ok: res.status === 0, advisory: !!gate.advisory });
}

process.stdout.write('\n' + '─'.repeat(52) + '\n  verify — local CI mirror\n' + '─'.repeat(52) + '\n');
let hardFail = false;
for (const r of results) {
  const mark = r.ok ? c('32', '✓') : r.advisory ? c('33', '!') : c('31', '✗');
  if (!r.ok && !r.advisory) hardFail = true;
  process.stdout.write(`  ${mark} ${r.name}${!r.ok && r.advisory ? c('33', ' (advisory — not blocking)') : ''}\n`);
}
process.stdout.write('─'.repeat(52) + '\n');

if (hardFail) {
  process.stdout.write(
    '\n' +
      c('31', 'verify FAILED') +
      ' — fix the ✗ gates above before pushing.\n' +
      'DS-ratchet gates ratchet DOWN: migrate to the DS primitive or add the\n' +
      'documented ds-* escape for a genuine one-off. Never raise a baseline to pass.\n\n',
  );
  process.exit(1);
}
process.stdout.write('\n' + c('32', 'verify PASSED') + ' — matches CI; safe to push.\n\n');
