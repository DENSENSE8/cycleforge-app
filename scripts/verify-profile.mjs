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
    name: 'Mobile-first',
    // A lane the phone cannot run gets no door anywhere in the front end
    // (operator 2026-09-14). Same reasoning for `always`: a registry read, and
    // adding a nav row to an unported surface is a `verify:fast` increment.
    // Rule module src/lib/nav/lanes.ts (LANE_MOBILE_FIRST) — also the
    // Unit-tests gate and the ds_mobile_first MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/mobile-first-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Action bar',
    // The slot-table action strip may not expand or collapse in height from a
    // press (operator 2026-09-15). `always` for the same reason as the two
    // gates above: a source read (<1s), and the increments that break it —
    // adding a control to the strip, reaching for TextField, rendering a field
    // conditionally — are exactly the ones that run `verify:fast`. Same rule
    // module as the Unit-tests gate (src/lib/tables/slot-table-action-bar-law.ts);
    // its runtime half is the useFixedBandHeight ResizeObserver.
    cmd: localBin('tsx'),
    args: ['scripts/action-bar-height-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Data table industrial',
    // The canonical table is judged by owned seams, never by source length.
    // Same pure rule module feeds this always-on gate, the unit tripwire,
    // ds_data_table and the slot-table eval cohort.
    cmd: localBin('tsx'),
    args: ['scripts/data-table-industrial-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Industrial translation',
    // External design briefs enter through this complete intent matrix, never
    // as a second palette, component family or set of call-site physics.
    // The same deterministic verdict feeds the unit tripwire, JSON CLI,
    // ds_industrial_translation and its eval cohort.
    cmd: localBin('tsx'),
    args: ['scripts/industrial-translation-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Outbound workflow',
    // One deterministic source verdict protects the mobile-first Orders
    // contract across CI, CLI, MCP and the eventual cohort runner.
    cmd: localBin('tsx'),
    args: ['scripts/outbound-workflow-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Id header',
    // Column one says `Id` on every peer that has an identity track (operator
    // 2026-09-15). `always` for the same reason as the gates above: a source
    // read (<1s), and the increment that breaks it — re-adding `label:
    // identity.label` to a column module — is exactly a `verify:fast`
    // increment. Same rule module as the Unit-tests gate
    // (src/lib/tables/slot-table-id-header-law.ts) and the ds_id_header MCP
    // face; ESLint catches the same line at write time.
    cmd: localBin('tsx'),
    args: ['scripts/id-header-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Identity purity',
    // The ID column is strictly for machine identifiers (operator 2026-09-15).
    // Staff names and person attributions belong exclusively in dedicated
    // status/person columns. `always` gate: source read (<1s). Same rule module
    // as the Unit-tests gate (src/lib/tables/slot-table-identity-purity-law.ts)
    // and the ds_identity_purity MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/identity-purity-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Ground',
    // A phone screen is ONE white sheet (operator 2026-09-15) — and the white
    // is pinned at each altitude of the chain, not just asserted at the leaf.
    // `always` for the same reason as the three gates above: a source read
    // (<2s), and the increments that break it — painting a page background on
    // /m, retouching the phone ground token, editing light.ts — are exactly the
    // ones that run `verify:fast`. Same rule module as the Unit-tests gate
    // (src/lib/mobile/mobile-ground.ts) and the ds_mobile_ground MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/mobile-ground-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Sku identity',
    // One SKU, one title, one photo — the Zoho item governs (operator
    // 2026-09-15). `always` for the same reason as the four gates above: a
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
    name: 'Detail hub',
    // Every scanned entity's phone record is ONE grammar — the repair hub
    // exoskeleton (operator 2026-09-24): DetailHubScreen, a DetailSummaryCard
    // mapper, detailDoor doors, a ≤3-verb DetailDock, /info as the only edit.
    // `always` for the same reason as Ground / Sku identity: a source read
    // (<1s), and the increments that break it — an Edit button on a hub, a
    // fourth dock verb, a hand-rolled record screen — are `verify:fast`
    // increments. Same rule module as the Unit-tests gate
    // (src/lib/mobile/detail-hub-law.ts) and the ds_detail_hub MCP face.
    cmd: localBin('tsx'),
    args: ['scripts/detail-hub-guard.ts'],
    profiles: 'always',
  },
  {
    name: 'Desk surface',
    // Which surface a desktop job may use (operator 2026-09-25): a picked row's
    // record opens as a DeskStageOverlay in place of the fixed-width list,
    // never in the right rail; search never remounts a desk table; no new
    // `inspector` table bindings. Every rail is classified in
    // src/lib/design/desk-surface-ledger.ts and the debt baselines only shrink.
    // `always`: a source read (<1s), and the increments that break it — a new
    // DetailStackRailRegistrar, a hand-rolled evidence aside, a DataTable
    // under /search — are `verify:fast` increments. Rules live in
    // src/lib/design/desk-surface-law.ts (add a rule there to extend the base).
    cmd: localBin('tsx'),
    args: ['scripts/desk-surface-guard.ts'],
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
