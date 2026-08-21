/**
 * Verify profile selection — shared by `scripts/verify.mjs` and its unit test.
 *
 *   fast     lint + typecheck
 *   dogfood  same as fast (the route-auth / schema gates were removed 2026-08-20)
 *   full     + unit tests
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
 *   dogfood → dogfood + full
 *   full    → full only
 *
 * The hygiene / drift gates (knip, jscpd, depcruise, route-auth, tenancy,
 * schema drift + model parity, integration manifest, doc catalog) and their
 * ratchet baselines were DELETED on 2026-08-20 at the operator's instruction —
 * they were the bulk of the verify wall clock. Nothing enforces those
 * invariants automatically any more; the rules in AGENTS.md that named them are
 * now review-only.
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
    name: 'Unit tests',
    cmd: 'node',
    args: ['scripts/run-unit-tests.mjs'],
    // NODE_COMPILE_CACHE (Node 22+): persist V8 bytecode for every module the
    // runner loads. `node --test` spawns one child per test file and each child
    // re-boots tsx + esbuild from scratch, so the compile cache is paid once and
    // reused ~770 times. Inherited by the children through the environment.
    env: { NODE_COMPILE_CACHE: 'node_modules/.cache/node-compile' },
    profiles: 'full',
  },
];

/** @param {VerifyProfile} profile */
export function gatesForProfile(profile) {
  return ALL_GATES.filter((g) => gateInProfile(g, profile));
}
