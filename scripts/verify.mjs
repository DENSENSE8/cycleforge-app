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
          name: 'Unit tests + structural guards',
          cmd: 'node',
          args: ['scripts/run-unit-tests.mjs'],
        },
        { name: 'Dead-code (knip)', cmd: 'node', args: ['scripts/knip-gate.mjs'] },
        { name: 'Route-permission drift', cmd: 'npx', args: ['tsx', 'scripts/audit-route-auth.ts', '--check'] },
        { name: 'Route-auth enforce', cmd: 'npx', args: ['tsx', 'scripts/audit-route-auth.ts', '--enforce'] },
        // Marketing site reads docs/integrations/integration-manifest.json for
        // its per-connector pages. Stale manifest = published copy describing
        // connectors the product no longer has. Fix is one command:
        // `npm run integrations:manifest -- --emit`.
        {
          name: 'Integration manifest drift',
          cmd: 'npx',
          args: ['tsx', 'scripts/export-integration-manifest.ts', '--check'],
        },
        {
          name: 'Tenancy isolation (static)',
          cmd: 'npx',
          args: ['tsx', 'scripts/tenancy-guard.ts', '--check', '--static-only'],
          advisory: true, // ci.yml runs this continue-on-error
        },
        { name: 'Schema drift', cmd: 'node', args: ['scripts/schema-drift-guard.mjs', '--check'] },
        // Model↔DB parity. The static guard above only catches app code still
        // naming a DROPPED column; it cannot see a column that was never
        // CREATED. Added 2026-08-02 after notification_outbox.payload — declared
        // by its migration and by schema.ts, absent from the database — made
        // every ops_events INSERT throw for four days while verify stayed green.
        // Skips itself (exit 0) when DATABASE_URL is unset, so DB-less runs and
        // fork PRs are unaffected.
        {
          name: 'Schema model parity (live)',
          cmd: 'node',
          args: ['scripts/schema-model-parity-guard.mjs', '--check'],
        },
        // Shrink-only clone baseline (DS fork-consolidation 1b). New same-usecase
        // clones fail; parked by-design siblings live in .jscpd.json ignore.
        { name: 'Clone baseline (jscpd)', cmd: 'node', args: ['scripts/jscpd-gate.mjs'] },
        // Assembly import boundaries — feature routes compose the host, not its
        // internals (DashboardScrollShell, ScanStationUtilityRail, StationAmbientWash).
        { name: 'Assembly boundaries (depcruise)', cmd: 'node', args: ['scripts/depcruise-gate.mjs'] },
        // Doc catalog drift. Fix is one command: `pnpm portfolio:sot`.
        // Added 2026-08-01 — the check existed but was gated by nothing, and
        // DOC-CATALOG.md had drifted 71 files behind before anyone noticed.
        { name: 'Doc catalog drift', cmd: 'node', args: ['scripts/portfolio-sot-sync.mjs', '--check'] },
      ]),
];

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
      'Compose named SoTs from AGENTS.md / sot-lookup; never raise a ratchet\n' +
      'baseline to pass a gate.\n\n',
  );
  process.exit(1);
}
process.stdout.write('\n' + c('32', 'verify PASSED') + ' — matches CI; safe to push.\n');

// The ledger rides on the PASS line deliberately. Every gate here is
// shrink-only, so a green run means "no NEW debt" — never "no debt". Printing
// what the baselines are still forgiving is what keeps PASS from reading as
// clean. Best-effort: a broken ledger must never fail a verify that passed.
try {
  spawnSync('node', ['scripts/debt-ledger.mjs', '--summary'], { stdio: 'inherit' });
} catch {
  /* ledger is informational only */
}
process.stdout.write('\n');
