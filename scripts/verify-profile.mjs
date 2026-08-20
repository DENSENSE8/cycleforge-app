/**
 * Verify profile selection — shared by `scripts/verify.mjs` and its unit test.
 *
 *   fast     lint + typecheck
 *   dogfood  + route-auth enforce + schema drift + live model parity
 *   full     CI mirror (every gate)
 *
 * @typedef {'fast' | 'dogfood' | 'full'} VerifyProfile
 * @typedef {{
 *   name: string,
 *   cmd: string,
 *   args: string[],
 *   env?: Record<string, string>,
 *   advisory?: boolean,
 *   profiles: 'always' | 'dogfood' | 'full',
 * }} VerifyGate
 */

/**
 * @param {string[]} argv
 * @returns {VerifyProfile}
 */
export function resolveVerifyProfile(argv) {
  const fast = argv.includes('--fast');
  const dogfood = argv.includes('--dogfood');
  if (fast && dogfood) {
    const err = new Error('verify: use only one of --fast or --dogfood');
    err.code = 'VERIFY_PROFILE_CONFLICT';
    throw err;
  }
  if (fast) return 'fast';
  if (dogfood) return 'dogfood';
  return 'full';
}

/**
 * @param {VerifyGate} gate
 * @param {VerifyProfile} profile
 */
export function gateInProfile(gate, profile) {
  if (gate.profiles === 'always') return true;
  if (gate.profiles === 'dogfood') return profile === 'dogfood' || profile === 'full';
  return profile === 'full';
}

/**
 * Each gate mirrors one step in ci.yml's `ci` job. Keep this list in sync with
 * that workflow — the whole point is that the two never drift.
 *
 * `profiles`: which verify profiles include this gate.
 *   always  → fast + dogfood + full
 *   dogfood → dogfood + full  (runtime-safety: ungated routes, schema 500s)
 *   full    → full only       (hygiene ratchets: knip / jscpd / depcruise / …)
 *
 * @type {VerifyGate[]}
 */
export const ALL_GATES = [
  {
    name: 'Lint',
    cmd: 'npx',
    // --cache: eslint re-lints only files whose content or resolved config changed
    // (the per-file cache entry carries a config hash, so a flat-config edit
    // invalidates on its own). Cache lives under node_modules/.cache so it is
    // wiped by `npm ci` in CI — same cold-run semantics there as before.
    args: [
      'eslint',
      'src',
      '--max-warnings=10000',
      '--cache',
      '--cache-location',
      'node_modules/.cache/eslint/',
    ],
    profiles: 'always',
  },
  {
    name: 'Typecheck',
    cmd: 'npx',
    args: ['tsc', '--noEmit', '-p', 'tsconfig.json'],
    env: { NODE_OPTIONS: '--max-old-space-size=6144' },
    profiles: 'always',
  },
  {
    name: 'Unit tests + structural guards',
    cmd: 'node',
    args: ['scripts/run-unit-tests.mjs'],
    // NODE_COMPILE_CACHE (Node 22+): persist V8 bytecode for every module the
    // runner loads. `node --test` spawns one child per test file and each child
    // re-boots tsx + esbuild from scratch, so the compile cache is paid once and
    // reused ~770 times. Inherited by the children through the environment.
    env: { NODE_COMPILE_CACHE: 'node_modules/.cache/node-compile' },
    profiles: 'full',
  },
  { name: 'Dead-code (knip)', cmd: 'node', args: ['scripts/knip-gate.mjs'], profiles: 'full' },
  {
    name: 'Route-permission drift',
    cmd: 'npx',
    args: ['tsx', 'scripts/audit-route-auth.ts', '--check'],
    profiles: 'full',
  },
  {
    name: 'Route-auth enforce',
    cmd: 'npx',
    args: ['tsx', 'scripts/audit-route-auth.ts', '--enforce'],
    profiles: 'dogfood',
  },
  {
    name: 'Integration manifest drift',
    cmd: 'npx',
    args: ['tsx', 'scripts/export-integration-manifest.ts', '--check'],
    profiles: 'full',
  },
  {
    name: 'Tenancy isolation (static)',
    cmd: 'npx',
    args: ['tsx', 'scripts/tenancy-guard.ts', '--check', '--static-only'],
    advisory: true,
    profiles: 'full',
  },
  {
    name: 'Schema drift',
    cmd: 'node',
    args: ['scripts/schema-drift-guard.mjs', '--check'],
    profiles: 'dogfood',
  },
  {
    name: 'Schema model parity (live)',
    cmd: 'node',
    args: ['scripts/schema-model-parity-guard.mjs', '--check'],
    profiles: 'dogfood',
  },
  { name: 'Clone baseline (jscpd)', cmd: 'node', args: ['scripts/jscpd-gate.mjs'], profiles: 'full' },
  {
    name: 'Assembly boundaries (depcruise)',
    cmd: 'node',
    args: ['scripts/depcruise-gate.mjs'],
    profiles: 'full',
  },
  {
    name: 'Doc catalog drift',
    cmd: 'node',
    args: ['scripts/portfolio-sot-sync.mjs', '--check'],
    profiles: 'full',
  },
];

/** @param {VerifyProfile} profile */
export function gatesForProfile(profile) {
  return ALL_GATES.filter((g) => gateInProfile(g, profile));
}
