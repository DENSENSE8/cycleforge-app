/**
 * Verify profile selection — shared by `scripts/verify.mjs`, the self-hosted
 * runner (`scripts/ci-runner.mjs`) and the tripwire `src/lib/ci/ci-core.test.ts`.
 *
 *   fast     lint + typecheck                                   (every commit)
 *   dogfood  same as fast (the route-auth / schema gates were removed 2026-08-20)
 *   full     + unit tests + the two display cohorts + critique ratchet + visual slot
 *   deep     full + advisory impeccable reviewer (nightly)
 *
 * ONE gate list. The pre-push hook (`verify.mjs`) and the runner read the same
 * array so the two can never drift — that is the whole point of this module
 * (plan §3.3 step 1: "reuse `gatesForProfile()`; do not fork the gate list").
 *
 * @typedef {'fast' | 'dogfood' | 'full' | 'deep'} VerifyProfile
 * @typedef {{
 *   name: string,
 *   cmd: string,
 *   args: string[],
 *   keyArgs?: string[],
 *   env?: Record<string, string>,
 *   advisory?: boolean,
 *   profiles: 'always' | 'dogfood' | 'full' | 'deep',
 *   inputs: readonly string[],
 * }} VerifyGate
 */

import path from 'node:path';

/**
 * Local package bin — never `npx tsc` / `npx eslint`.
 *
 * npm's npx, when it misses pnpm's layout, downloads the WRONG packages:
 * the npm name `tsc` (not TypeScript) and ESLint 10. That is this repo's
 * 2026-09-01 machine-eval red: `Cannot find module …/typescript/bin/tsc` and
 * `Cannot find package …/@typescript-eslint/parser/index.js` under ESLint 10.9.1.
 * `node_modules/.bin/*` is the install we already paid for.
 *
 * @param {string} root the checkout the gate runs in (the live tree for
 *   verify, a per-sha worktree for the runner)
 * @param {string} name
 */
function localBin(root, name) {
  const file = process.platform === 'win32' ? `${name}.CMD` : name;
  return path.join(root, 'node_modules', '.bin', file);
}

/**
 * @param {string[]} argv
 * @returns {VerifyProfile}
 */
export function resolveVerifyProfile(argv) {
  const fast = argv.includes('--fast');
  const dogfood = argv.includes('--dogfood');
  const deep = argv.includes('--deep');
  const n = [fast, dogfood, deep].filter(Boolean).length;
  if (n > 1) {
    const err = new Error('verify: use only one of --fast, --dogfood, or --deep');
    err.code = 'VERIFY_PROFILE_CONFLICT';
    throw err;
  }
  if (fast) return 'fast';
  if (dogfood) return 'dogfood';
  if (deep) return 'deep';
  return 'full';
}

/**
 * @param {VerifyGate} gate
 * @param {VerifyProfile} profile
 */
export function gateInProfile(gate, profile) {
  if (gate.profiles === 'always') return true;
  if (gate.profiles === 'dogfood') return profile === 'dogfood' || profile === 'full' || profile === 'deep';
  if (gate.profiles === 'full') return profile === 'full' || profile === 'deep';
  if (gate.profiles === 'deep') return profile === 'deep';
  return false;
}

/**
 * Inputs shared by every gate that compiles `src/`: the sources, the TS and
 * ESLint config, and — the one people forget — the LOCKFILE. A dependency bump
 * changes what `tsc` says about `src/` without touching `src/`, so a receipt
 * keyed on sources alone would serve a stale pass across it (plan §4.1).
 *
 * Pathspecs, not globs: `git ls-files -s -- src` is recursive on its own.
 */
const COMPILE_INPUTS = Object.freeze([
  'src',
  'tsconfig.json',
  'eslint.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
]);

/**
 * Build the gate list for a checkout root.
 *
 * `profiles`: which verify profiles include this gate.
 *   always  → fast + dogfood + full + deep
 *   dogfood → dogfood + full + deep
 *   full    → full + deep
 *   deep    → deep only
 *
 * `inputs`: the tracked paths whose blob ids key the runner's cache for this
 * gate (plus toolchain + the gate's own definition — see `ci-core.mjs`). A
 * gate with no inputs runs every time; the tripwire refuses to let one land
 * undeclared. `keyArgs` names the args that carry meaning for the RESULT when
 * `args` also carries one the runner varies (the ESLint cache dir).
 *
 * The hygiene / drift gates (knip, jscpd, depcruise, route-auth, schema drift +
 * model parity, integration manifest, doc catalog) and their ratchet baselines
 * were DELETED on 2026-08-20 at the operator's instruction — they were the bulk
 * of the verify wall clock. Two SECURITY gates were re-armed on 2026-09-06
 * (pen-test handoff §3.7, Wave-2 item 17): the tenancy isolation guard and the
 * route-permission drift audit. They are `always` because the invariants they
 * hold — no raw-pool route touching a FORCEd table, no role granting a
 * permission the registry does not define — are what every cross-tenant fix in
 * that handoff depends on, and a fast-profile push is exactly where they
 * regress. Both read `DATABASE_URL` (the permission audit hard-requires it, the
 * tenancy guard only for invariant B) and both fail CLOSED without it.
 *
 * @param {string} [root]
 * @param {{ eslintCacheDir?: string }} [options]
 * @returns {VerifyGate[]}
 */
export function buildGates(root = process.cwd(), options = {}) {
  // --cache: eslint re-lints only files whose content or resolved config changed
  // (the per-file cache entry carries a config hash, so a flat-config edit
  // invalidates on its own). Cache lives under node_modules/.cache so it is
  // wiped by a fresh install — same cold-run semantics as a clean checkout.
  // The runner points it at a per-sha directory it deletes afterwards.
  const eslintCacheDir = options.eslintCacheDir ?? 'node_modules/.cache/eslint/';
  return [
    {
      name: 'Lint',
      cmd: localBin(root, 'eslint'),
      args: ['src', '--max-warnings=10000', '--cache', '--cache-location', eslintCacheDir],
      keyArgs: ['src', '--max-warnings=10000'],
      profiles: 'always',
      inputs: COMPILE_INPUTS,
    },
    {
      name: 'Typecheck',
      cmd: localBin(root, 'tsc'),
      // 4096, not 6144: this gate runs from the pre-push hook too, so several
      // agent sessions typecheck the shared tree at once — four concurrent runs
      // were measured on 2026-09-05. The ceiling is what each of those may take,
      // not what one needs. A full run peaks around 2.5G, so this still leaves
      // headroom; 4 × 6G was enough overcommit to push the box into zram thrash
      // and tip the Cursor tsserver into V8's ineffective-mark-compact abort.
      args: ['--noEmit', '-p', 'tsconfig.json'],
      env: { NODE_OPTIONS: '--max-old-space-size=4096' },
      profiles: 'always',
      inputs: COMPILE_INPUTS,
    },
    {
      // Handoff §3.7 / Wave-2 item 17. Invariant (A) is static: every route the
      // audit puts on the raw owner pool (risk != 'low') that touches a FORCEd
      // table must be GUC-wrapped, carry a `route::table` exemption, or sit in
      // the ratchet baseline (known debt that may only shrink). Invariant (B)
      // needs a DSN and self-skips without one. Same flags as the
      // `tenancy:guard:check` script so there is one way to run it.
      name: 'Tenancy guard',
      cmd: localBin(root, 'tsx'),
      args: ['scripts/tenancy-guard.ts', '--check'],
      profiles: 'always',
      inputs: [
        'src',
        'package.json',
        'pnpm-lock.yaml',
        'scripts/tenancy-guard.ts',
        'scripts/tenancy-guard-exemptions.ts',
        'scripts/tenancy-guard-baseline.json',
        'docs/tenancy/coverage.generated.json',
        'docs/tenancy/route-audit.generated.json',
      ],
    },
    {
      // Handoff §3.7 / Wave-2 item 17, second half: the permission registry is
      // the only thing standing between `withAuth({ permission })` and a role
      // that grants a string nobody defines. Hard-fails on unknown permissions
      // in DB roles or staff overrides; needs DATABASE_URL and exits 1 without
      // it, which is the fail-closed behaviour we want from a gate.
      name: 'Route permissions',
      cmd: localBin(root, 'tsx'),
      args: ['scripts/audit-permissions.ts'],
      profiles: 'always',
      inputs: [
        'src',
        'package.json',
        'pnpm-lock.yaml',
        'scripts/audit-permissions.ts',
        'docs/security/route-permissions.json',
      ],
    },
    {
      name: 'Unit tests',
      cmd: 'node',
      args: ['scripts/run-unit-tests.mjs'],
      // NODE_COMPILE_CACHE (Node 22+): persist V8 bytecode for every module the
      // runner loads. `node --test` spawns one child per test file and each child
      // re-boots tsx + esbuild from scratch, so the compile cache is paid once and
      // reused ~770 times. Inherited by the children through the environment.
      env: { NODE_COMPILE_CACHE: 'node_modules/.cache/node-compile' },
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'scripts/run-unit-tests.mjs', 'scripts/register-server-only-shim.cjs', 'scripts/ci'],
    },
    // The display cohorts (plan §3.2 full tier). `--skip-verify`: lint and
    // typecheck are already gates here, so the cohort must not run them a
    // second time inside itself. Inputs are declared coarse on purpose — any
    // engine, catalog or runner change re-runs the cohort; a docs-only commit
    // hits. Both write their auto-blocks under docs/eval/** (never read by
    // another gate).
    {
      name: 'Cohort: slot-table',
      cmd: 'node',
      args: ['--import', 'tsx', 'tools/eval-ledger/run-cohort-eval.mjs', 'slot-table', '--skip-verify'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'tools/eval-ledger', 'tools/design-mcp'],
    },
    {
      name: 'Cohort: shortcuts',
      cmd: 'node',
      args: ['--import', 'tsx', 'tools/eval-ledger/run-cohort-eval.mjs', 'shortcuts', '--skip-verify'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'tools/eval-ledger', 'tools/design-mcp'],
    },
    {
      // AI-first session surface: the artifact contract is the SoT (data-only,
      // read-only view plane, verbs are registered tools, keyboard-reachable).
      // Runs the tripwire directly — no ledger/snapshot machinery yet.
      name: 'Cohort: session',
      cmd: 'node',
      args: ['--import', 'tsx', '--test', 'src/lib/assistant/session-surface-cohort.test.ts'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'src/components/session'],
    },
    {
      // Session MEMORY: lifecycle + the pin that binds a thread to a place.
      // Reversible delete, tombstone-not-drop, legible titles, and a pin that
      // keeps its session through an undo. Same cheap rung as the surface
      // cohort — the tripwire IS the gate, no snapshot machinery.
      name: 'Cohort: session-memory',
      cmd: 'node',
      args: ['--import', 'tsx', '--test', 'src/lib/assistant/session-memory-cohort.test.ts'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'src/lib/quick-access', 'src/components/sidebar/master-nav'],
    },
    {
      name: 'Design critique',
      cmd: 'node',
      args: ['scripts/ds-critique-gate.mjs'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'tools/design-mcp', 'scripts/ds-critique-gate.mjs', 'scripts/ci/critique-literals.json'],
    },
    {
      name: 'Visual peers',
      cmd: 'node',
      args: ['scripts/visual-peers-gate.mjs'],
      profiles: 'full',
      inputs: [...COMPILE_INPUTS, 'tests/e2e', 'playwright.config.ts', 'scripts/visual-peers-gate.mjs'],
    },
    {
      name: 'Design review',
      cmd: 'node',
      args: ['scripts/impeccable-review-gate.mjs'],
      profiles: 'deep',
      advisory: true,
      inputs: [...COMPILE_INPUTS, 'tests/e2e', 'scripts/impeccable-review-gate.mjs', '.impeccable'],
    },
  ];
}

/**
 * The gate list for the LIVE tree — what `verify.mjs` runs. Each gate mirrors
 * one step of the receipt the runner writes for a commit.
 * @type {VerifyGate[]}
 */
export const ALL_GATES = buildGates();

/**
 * @param {VerifyProfile} profile
 * @param {VerifyGate[]} [gates] a `buildGates()` list for another root
 */
export function gatesForProfile(profile, gates = ALL_GATES) {
  return gates.filter((g) => gateInProfile(g, profile));
}
