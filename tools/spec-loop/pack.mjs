/**
 * CycleForge spec pack — everything repo-specific the Garisek spec kernel needs to run the
 * continuous-improvement loop on this repo (SpecPackV1, Garisek-OS src/lib/loops/spec/types.ts,
 * docs/loops/SPEC-KERNEL.md). The kernel owns sweep → receipt → classify → sandboxed fix loop →
 * refute-only verifier; this file owns the law: anchors, operator rules + mutants, the evaluator's
 * files, what a worker may touch, the prompt's law lines, the role table and the money caps.
 *
 *   pnpm spec:sweep [--placement static|live|full] [--only a,b] …   (scripts/spec.mjs → kernel CLI)
 *   pnpm spec:loop (--plant | --debt <selector> | --goal <file.md>) …
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHORS, preexistingCritique } from './anchors.mjs';
import { CONTRACTS } from './contracts.mjs';
import { MUTANTS } from './mutants.mjs';
import { portContract, portFindings } from './port.mjs';
import { loadSurfaceLaw } from './surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const surfaceOf = loadSurfaceLaw(ROOT);

/** The evaluator: hashed into every receipt; a change is `anchor-changed`, never auto-kept. */
const EVALUATOR_FILES = [
  'scripts/spec.mjs',
  'tools/spec-loop/pack.mjs',
  'tools/spec-loop/anchors.mjs',
  'tools/spec-loop/contracts.mjs',
  'tools/spec-loop/live-contracts.mjs',
  'tools/spec-loop/port.mjs',
  'tools/spec-loop/surface.mjs',
  'scripts/verify-profile.mjs',
  'scripts/route-tree-guard.ts',
  'scripts/route-tree-literals.baseline.json',
  'scripts/nav-name-guard.ts',
  'scripts/disclosure-audit.ts',
  'src/lib/nav/route-tree-law.ts',
  'src/lib/nav/nav-name-collisions.ts',
  'src/lib/disclosure/surfaces.ts',
  'tools/design-mcp/route-tree-smoke.mjs',
  'tools/design-mcp/ds.mjs',
  'scripts/ds-forks.baseline.json',
  '.omp/rules/sidebar-owns-table-controls.md',
  'scripts/sidebar-controls.baseline.json',
  '.omp/rules/identifier-last8.md',
  'scripts/identifier-last8.baseline.json',
  'tests/auth-preflight.mjs',
];

/** The worker may not touch these: the evaluator, its library, baselines, exemptions and operator rulings. */
const FORBIDDEN = [
  /^scripts\/spec-/,
  /^scripts\/spec\.mjs$/,
  /^scripts\/.*-guard\.(ts|mjs)$/,
  /^scripts\/.*\.baseline\.json$/,
  /^scripts\/.*-(exemptions\.ts|allowlist\.json)$/,
  /^scripts\/verify(-profile)?\.mjs$/,
  /^scripts\/disclosure-audit\.ts$/,
  /^tools\/(design-mcp|spec-loop)\//,
  /^tests\/auth-preflight\.mjs$/,
  /^\.omp\//,
  /^src\/lib\/views\/layer-law\.ts$/,
  /^src\/lib\/nav\/context\/parity\.ts$/,
  /^src\/lib\/nav\/route-tree(-law)?\.ts$/,
  /^src\/lib\/nav\/nav-name-collisions\.ts$/,
  /^src\/lib\/disclosure\//,
  /^\.dependency-cruiser\.cjs$/,
  /^eslint\.config\./,
  /^package\.json$/,
  /\.test\.(ts|tsx|mjs)$/,
  /^AGENTS\.md$/,
];

/** ds_contract primitives for the surfaces a unit's critique / port findings paint (advisory). */
function contractHints(unit) {
  const ported = unit.targets.filter((f) => f.anchor === 'critique' || f.anchor === 'port');
  const surfaces = [...new Set(ported.map((f) => f.surface ?? surfaceOf(f.file ?? '')))].filter((s) => s === 'mobile' || s === 'desktop');
  const what = [...new Set(unit.targets.filter((f) => f.anchor === 'critique').map((f) => f.message.replace(/^L\S+\s*/, '')))].slice(0, 3).join('; ');
  const lines = [];
  for (const surface of surfaces) {
    const res = spawnSync('node', ['tools/design-mcp/ds.mjs', 'contract', `${surface} ${what || 'button action'}`, '--limit', '4'], { cwd: ROOT, encoding: 'utf8' });
    try {
      for (const m of JSON.parse(res.stdout).matches) lines.push(`- (${surface}) ${m.id} — import \`${m.import}\` — use when: ${m.useWhen?.slice(0, 200)} — do not: ${m.doNot?.slice(0, 240)}`);
    } catch {
      /* contract lookup is advisory */
    }
  }
  return lines;
}

/** Seconds since the prod lane (systemd user unit) last became active; null where this host has no lane. */
async function laneUptimeSec() {
  const res = spawnSync('systemctl', ['--user', 'show', 'cycleforge-lane@prod', '-p', 'ActiveEnterTimestampMonotonic', '--value'], { encoding: 'utf8' });
  const enteredUs = Number(res.stdout?.trim());
  if (res.status !== 0 || !Number.isFinite(enteredUs) || enteredUs <= 0 || !fs.existsSync('/proc/uptime')) return null;
  const hostUp = Number(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
  return Number.isFinite(hostUp) ? Math.max(0, Math.round(hostUp - enteredUs / 1e6)) : null;
}

export default {
  v: 1,
  id: 'cycleforge-app',
  anchors: ANCHORS,
  rules: CONTRACTS,
  mutants: MUTANTS,
  evaluatorFiles: EVALUATOR_FILES,
  baselineGlobs: ['scripts/*.baseline.json'],
  forbidden: FORBIDDEN.map((re) => re.source),
  silencers: /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/.source,
  workerScope: /^src\//.source,
  ignoredRules: ['critique-cap', 'critique-error', 'drill-budget', 'no-sample', 'probe-no-data', 'fork-baseline-missing'],
  surfaceOf,
  prompt: {
    product: 'CycleForge',
    readFirst: ['AGENTS.md'],
    law: [
      'Every Warehouse URL comes from `@/lib/nav/route-tree`; a page the route tree does not own is removed, not registered.',
      'Mobile code stays in src/components/mobile/** or src/app/m/**; desktop code never imports it (Component split).',
    ],
    hardRules: [
      'Never edit: scripts/spec-*, scripts/*-guard.*, *.baseline.json, exemption/allowlist files, scripts/verify*.mjs, tools/design-mcp/**, tools/spec-loop/**, src/lib/nav/route-tree*.ts, src/lib/disclosure/**, eslint config, package.json, *.test.*, AGENTS.md, .omp/**. No eslint-disable / @ts-ignore / @ts-expect-error.',
      'Keep every job the code did: port a hand-rolled control onto the primitive and keep its verb; never delete a feature to make a finding go away unless the law above says it must go.',
      'Smallest change that satisfies the law. Do not refactor unrelated code.',
      'Never edit a quotation of an operator / owner ruling (quoted, attributed, usually dated words) — rulings are verbatim history.',
    ],
  },
  hints: contractHints,
  unitChecks: [
    {
      // Deleting a forked control turns every anchor green and loses its job: each raw-button verb must survive, ported.
      id: 'port',
      applies: (unit) => unit.port === true,
      build: (sandbox, unit) => portContract(sandbox, unit.targets.map((f) => f.file).filter(Boolean)),
      findings: (sandbox, contract) => portFindings(sandbox, contract).map(({ rule, severity, file, message }) => ({ rule, severity, file, message })),
    },
  ],
  autofix: { anchors: ['gate:Lint'], cmd: 'node_modules/.bin/eslint', args: ['--fix'] },
  preexisting: preexistingCritique,
  guardsDir: '.omp/rules',
  roles: {
    writer: { model: 'xai-oauth/grok-4.7', family: 'xai', harness: 'omp-headless', thinking: 'medium' },
    verifier: {
      model: 'google-antigravity/gemini-3.8-flash',
      family: 'google',
      harness: 'omp-headless',
      thinking: 'low',
      // 8 labelled cases × 2 (tools/spec-loop/verifier-cases.json), 0 false confirms, median 6 s.
      evalReceipt: {
        at: '2026-10-04T09:05:49.216Z',
        model: 'google-antigravity/gemini-3.8-flash',
        harness: 'omp-headless',
        score: '16/16',
        ref: '.garisek/spec-verifier-eval/2026-10-04T09-04-51-279Z/receipt.json',
      },
    },
  },
  budgets: { perUnitUsd: 3, perRunUsd: 10, perDayUsd: 25 },
  lanes: [{ id: 'cycleforge@avion', origin: 'http://localhost:3050', uptimeSec: laneUptimeSec }],
  stateDir: '.garisek/spec',
  sandbox: { kind: 'rsync-copy', linkDirs: ['node_modules'] },
  verifierCases: 'tools/spec-loop/verifier-cases.json',
};
