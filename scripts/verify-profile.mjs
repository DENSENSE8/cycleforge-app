/**
 * Verify profile selection — shared by `scripts/verify.mjs` and its unit test.
 *
 *   fast     lint + typecheck
 *   dogfood  + route-auth source and manifest gates
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

import path from 'node:path';

/**
 * Local package bin — never `npx tsc` / `npx eslint`.
 *
 * npm's npx, when it misses pnpm's layout, downloads the WRONG packages:
 * the npm name `tsc` (not TypeScript) and ESLint 10. That is this repo's
 * 2026-09-01 machine-eval red: `Cannot find module …/typescript/bin/tsc` and
 * `Cannot find package …/@typescript-eslint/parser/index.js` under ESLint 10.9.1.
 * `node_modules/.bin/*` is the install we already paid for.
 */
function localBin(name) {
  const file = process.platform === 'win32' ? `${name}.CMD` : name;
  return path.join(process.cwd(), 'node_modules', '.bin', file);
}

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
 * The hygiene / drift gates (knip, jscpd, depcruise, tenancy,
 * schema drift + model parity, integration manifest, doc catalog) and their
 * ratchet baselines were DELETED on 2026-08-20 at the operator's instruction —
 * they were the bulk of the verify wall clock. Nothing enforces those
 * invariants automatically any more. Route-auth enforcement and manifest
 * drift were restored as focused dogfood/full gates after the route inventory
 * had silently fallen 60 handlers behind source.
 *
 * @type {VerifyGate[]}
 */
export const ALL_GATES = [
  {
    name: 'Lint',
    cmd: localBin('eslint'),
    // --cache: eslint re-lints only files whose content or resolved config changed
    // (the per-file cache entry carries a config hash, so a flat-config edit
    // invalidates on its own). Cache lives under node_modules/.cache so it is
    // wiped by `npm ci` in CI — same cold-run semantics there as before.
    args: [
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
    // `next typegen` → stable `.next/types`, then tsc. Never typecheck against
    // `.next/dev/types` while Turbopack is rewriting routes.d.ts mid-flight
    // (TS1005 / unterminated template → false machine-eval red).
    cmd: 'node',
    args: ['scripts/typecheck.mjs'],
    env: { NODE_OPTIONS: '--max-old-space-size=6144' },
    profiles: 'always',
  },
  {
    name: 'Route-auth enforce',
    cmd: localBin('tsx'),
    args: ['scripts/audit-route-auth.ts', '--enforce'],
    profiles: 'dogfood',
  },
  {
    name: 'Route-permission drift',
    cmd: localBin('tsx'),
    args: ['scripts/audit-route-auth.ts', '--check'],
    profiles: 'dogfood',
  },
  {
    name: 'Cron contract',
    cmd: 'node',
    args: ['scripts/cron-contract-guard.mjs'],
    profiles: 'always',
  },
  {
    name: 'Tenancy isolation',
    cmd: localBin('tsx'),
    args: ['scripts/tenancy-guard.ts', '--check', '--static-only'],
    profiles: 'always',
  },
  {
    name: 'Schema drift',
    cmd: 'node',
    args: ['scripts/schema-drift-guard.mjs', '--check'],
    profiles: 'always',
  },
  {
    name: 'Boundary',
    // Re-added 2026-09-14 (operator directive, C2) after the 2026-08-20 drift-gate
    // deletion: THIS one law (mobile↔desktop component split, ARCHITECTURE.md) is
    // binding again, single gate, ~15s. The other deleted drift gates stay deleted.
    cmd: localBin('tsx'),
    args: ['scripts/boundary-guard.ts', '--enforce'],
    profiles: 'always',
  },
  {
    name: 'Nav names',
    // A parent and a child must never wear the same name (operator 2026-09-14).
    // `always`, not `full`: it is a registry read (<1s), and the increments that
    // would break it — renaming a lane, row or tab — are exactly the ones that
    // run `verify:fast`. Same rule module as the Unit-tests gate
    // (src/lib/nav/nav-name-collisions.ts) and as the ds_nav_names MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/nav-name-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Routes',
    // Every Warehouse URL, nav name and domain word comes from the route tree
    // (owner 2026-10-03, src/lib/nav/route-tree.ts). `always`: a registry and
    // source read (~1s), and the increments that break it — a new /m page, a
    // menu row, a label, a hand-written `/m/stock…` literal — run `verify:fast`.
    // Same rule module (src/lib/nav/route-tree-law.ts) as the ds_route /
    // ds_vocabulary / ds_route_tree MCP faces. Literal-path baseline is
    // shrink-only: scripts/route-tree-literals.baseline.json.
    cmd: localBin('tsx'),
    args: ['scripts/route-tree-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Sku identity',
    // One SKU, one title, one photo — the Zoho item governs (operator
    // 2026-09-15). `always`: a
    // source read (<1s), and the increment that breaks it — hand-writing a
    // sku_catalog join on a new surface, or re-adding the deleted
    // similarity(product_title) guard — is exactly a `verify:fast` increment.
    // Same rule module as the Unit-tests gate (src/lib/sku/sku-identity-law.ts)
    // and the ds_sku_identity MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/sku-identity-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Layer laws',
    // Laws 3 · 4 · 5 of the screen layer order (HANDOFF-view-spec-layers.md §2):
    // shared parts never branch on the page, jobs never hide through paint, one
    // reader per fact. `always`: a source read (<1s). The allowlist in
    // src/lib/views/layer-law.ts is the census burn-down — it only shrinks.
    cmd: localBin('tsx'),
    args: ['scripts/layer-law-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Design tokens',
    // The committed platform artifacts (desktop tokens.css, iOS
    // DesignTokens.swift, design-mcp tokens.json) must be exactly what
    // packages/design-tokens/src renders. `always`: an in-memory render (<1s),
    // and the increment that breaks it — retouching a colour in the package
    // without `pnpm tokens:build` — is exactly a `verify:fast` increment.
    cmd: localBin('tsx'),
    args: ['packages/design-tokens/scripts/generate.ts', '--check'],
    profiles: 'always',
  },
  {
    name: 'Design consolidation',
    // The living delete/simplification ledger: retired component forks stay
    // deleted, active entries keep concrete sources and replacement paths.
    cmd: 'node',
    args: ['scripts/design-consolidation-guard.mjs'],
    profiles: 'always',
  },
  {
    name: 'Ring state',
    // A list item's selected / open / active / current state is geometry (an
    // overlay STATE_OUTLINE_CLASS span), never a `ring-*` box-shadow a scroll
    // container clips. `always`: a line-based source read (<1s), and the
    // increment that breaks it — a new card painting its selection with a
    // ring — is exactly a `verify:fast` increment. Rule module:
    // src/lib/design/ring-state-law.ts. Shrink-only baseline:
    // scripts/ring-state.baseline.json. Escape: `ds-allow-ring: <reason>`.
    cmd: localBin('tsx'),
    args: ['scripts/ring-state-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Disclosure',
    // The screen budget (owner 2026-10-03, just-in-time progressive disclosure):
    // every DECLARED first screen (src/lib/disclosure/surfaces.ts) obeys the law —
    // title … ✕ chrome row, one control per fact, doors open from L1, one primary.
    // `always`: an in-memory check (<1s). The LIVE measure of a rendered screen
    // needs the lane, so it is the ds_disclosure tool / declutter skill, not a gate.
    cmd: localBin('tsx'),
    args: ['scripts/disclosure-audit.ts'],
    profiles: 'always',
  },
  {
    name: 'V1 OpenAPI',
    // docs/openapi/cycleforge-v1.json must be exactly what the Zod-backed
    // builders render (label ingestions + outbound work). `always`: an
    // in-memory render (<1s), and the increment that breaks it — a field added
    // to a contract schema without regenerating — is a `verify:fast` increment.
    // Regenerate: pnpm exec tsx scripts/generate-v1-openapi.ts
    cmd: localBin('tsx'),
    args: ['scripts/verify-v1-openapi.ts'],
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
