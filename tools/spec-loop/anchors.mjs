/**
 * CycleForge spec-pack anchors — the sensor half of the spec loop, ported from scripts/spec-sweep.mjs
 * onto the Garisek spec kernel's anchor protocol (AnchorSpec / AnchorContext / AnchorResult,
 * Garisek-OS src/lib/loops/spec/types.ts). No model is consulted anywhere: these anchors ARE the
 * loop definition.
 *
 * Status protocol: pass | fail | no_data (could not run — never rendered as zero) | skipped (this
 * host or this checkout cannot run it; e.g. a live anchor judging a sandbox copy).
 *
 * Paths: guard scripts run from the JUDGED checkout (`ctx.cwd`), because they judge the tree they
 * sit in; the loop's own library (live-contracts runner, verify profile) is read from `ctx.packRoot`.
 * No anchor reads a host-specific absolute path: Garisek resolves through GARISEK_OS_ROOT.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSurfaceLaw } from './surface.mjs';

const LANE = 'lane:cycleforge@avion';
const TIMEOUT_MS = 900_000;
const FORK_BASELINE = 'scripts/ds-forks.baseline.json';

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try {
      return JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
}

function noData(id, reason, ms = 0) {
  return { id, status: 'no_data', exit: null, ms, reason, findings: [] };
}

function skipped(id, reason) {
  return { id, status: 'skipped', exit: null, ms: 0, reason, findings: [] };
}

function lastLine(text) {
  return (text || '').trim().split('\n').pop() ?? '';
}

// ── Guard CLIs ───────────────────────────────────────────────────────────────
/** A guard CLI with `--json`. exit 0 → pass, 1 → fail, anything else → no_data. */
async function guardAnchor(ctx, id, script, pick) {
  if (!fs.existsSync(path.join(ctx.cwd, script))) return noData(id, `${script} missing`);
  const res = await ctx.exec(path.join(ctx.cwd, 'node_modules', '.bin', 'tsx'), [script, '--json'], { cwd: ctx.cwd, timeoutMs: TIMEOUT_MS });
  const body = parseJson(res.stdout);
  if (res.error || ![0, 1].includes(res.exit ?? -1) || !body) {
    return noData(id, res.error ?? `exit ${res.exit}: ${(res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ')}`, res.ms);
  }
  const findings = ctx.findings(id, pick(body));
  return { id, status: res.exit === 0 && !findings.some((f) => f.severity === 'error') ? 'pass' : 'fail', exit: res.exit, ms: res.ms, findings };
}

// ── verify:fast, gate by gate ────────────────────────────────────────────────
/** `src/x.ts(12,3): error TS2540: …` → one finding per error, with its file. */
function tsFindings(lines, severity) {
  return lines.map((l) => {
    const m = l.match(/^(.+?)\(\d+,\d+\): (error TS\d+: .*)$/);
    return { rule: 'tsc', severity, file: m?.[1]?.trim() ?? null, message: (m?.[2] ?? l).trim() };
  });
}

/** ESLint stylish output → one finding per `error` line (warnings are budgeted by --max-warnings, not findings). */
function eslintFindings(out, cwd, severity) {
  const findings = [];
  let file = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('/')) file = path.relative(cwd, line.trim());
    const m = line.match(/^\s+\d+:\d+\s+error\s+(.*?)\s{2,}(\S+)\s*$/);
    if (m && file) findings.push({ rule: m[2], severity, file, message: m[1] });
  }
  return findings;
}

/** The `fast` verify profile (scripts/verify-profile.mjs), one result per gate, four at a time (scripts/verify.mjs width). */
async function verifyGates(ctx) {
  const profileFile = path.join(ctx.packRoot, 'scripts', 'verify-profile.mjs');
  if (!fs.existsSync(profileFile)) return noData('verify-fast', 'scripts/verify-profile.mjs missing');
  const { gatesForProfile } = await import(pathToFileURL(profileFile).href);
  const gates = gatesForProfile('fast');
  const results = new Array(gates.length);
  let next = 0;
  const worker = async () => {
    while (next < gates.length) {
      const i = next++;
      const g = gates[i];
      const id = `gate:${g.name}`;
      const res = await ctx.exec(g.cmd, g.args, { env: g.env, cwd: ctx.cwd, timeoutMs: TIMEOUT_MS });
      if (res.error && res.exit === null) {
        results[i] = noData(id, res.error, res.ms);
        continue;
      }
      const out = res.stdout + res.stderr;
      const typecheck = g.name === 'Typecheck';
      const tsLines = typecheck ? out.split('\n').filter((l) => /error TS\d+/.test(l)) : [];
      const severity = g.advisory ? 'advisory' : 'error';
      const parsed = res.exit === 0 ? [] : tsLines.length ? tsFindings(tsLines, severity) : eslintFindings(out, ctx.cwd, severity);
      const raw =
        res.exit === 0 || parsed.length
          ? parsed
          : [{ rule: 'gate', severity, fingerprint: 'gate-failed', message: out.trim().split('\n').slice(-4).join(' ⏎ ') }];
      results[i] = {
        id,
        status: res.exit === 0 || g.advisory ? 'pass' : 'fail',
        exit: res.exit,
        ms: res.ms,
        findings: ctx.findings(id, raw),
        ...(typecheck ? { meta: { tsErrors: tsLines.length } } : {}),
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, gates.length) }, worker));
  return results;
}

// ── ds_critique over every feature UI file ───────────────────────────────────
/** A ds critique problem → a raw critique finding (one rule vocabulary for the anchor and the baseline fold). */
function critiqueRaw(problem, file, surface) {
  return {
    rule: problem.severity === 'forks-the-system' ? 'fork' : (problem.rule ?? problem.severity),
    severity: 'advisory',
    file,
    message: `L${problem.line ?? '?'} ${problem.what ?? ''}`,
    ...(problem.fix ? { hint: problem.fix } : {}),
    surface,
  };
}

/** Shrink-only: existing entries only go down; a new file enters only on the first seed. */
function writeForkBaseline(file, baseline, counts) {
  const next = {};
  for (const [f, n] of Object.entries(counts).sort()) {
    if (n === 0) continue;
    if (!baseline) next[f] = n;
    else if (baseline[f] !== undefined) next[f] = Math.min(baseline[f], n);
  }
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        note: 'FROZEN BASELINE — design-system forks (ds_critique `forks-the-system`) per feature UI file. SHRINK-ONLY: a file above its count fails the spec sweep (`fork-grew`); `pnpm spec:loop --debt critique` burns it down. Rewrite with `SPEC_WRITE_FORK_BASELINE=1 pnpm spec:sweep --only critique --no-keep` (never grows an entry).',
        files: next,
      },
      null,
      2,
    ) + '\n',
  );
}

/**
 * ds_critique over EVERY feature UI file, tagged mobile | desktop by the Boundary gate's own law
 * (surface.mjs). Forks are ratcheted per file by scripts/ds-forks.baseline.json (shrink-only): a
 * file with more forks than its baseline is an error (`fork-grew`); forks within the baseline are
 * tracked debt (advisory `fork`) for `--debt critique`.
 */
async function critique(ctx) {
  const id = 'critique';
  const cli = path.join(ctx.cwd, 'tools', 'design-mcp', 'ds.mjs');
  if (!fs.existsSync(cli)) return noData(id, 'tools/design-mcp/ds.mjs missing');
  const surfaceOf = loadSurfaceLaw(ctx.cwd);
  const listed = await ctx.exec('git', ['ls-files', '-co', '--exclude-standard', '--', 'src'], { cwd: ctx.cwd });
  if (listed.exit !== 0) return noData(id, `git ls-files failed: ${listed.error ?? lastLine(listed.stderr)}`, listed.ms);
  const files = listed.stdout
    .split('\n')
    .filter((f) => f.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(f) && ['mobile', 'desktop'].includes(surfaceOf(f)) && fs.existsSync(path.join(ctx.cwd, f)));
  if (!files.length) return noData(id, 'no feature UI files found');
  // DESIGN_MCP_REPO: judge THIS checkout (a sandbox copy has its own git, not a lane worktree).
  const res = await ctx.exec('node', [cli, 'critique-batch', ...files], { cwd: ctx.cwd, timeoutMs: TIMEOUT_MS, env: { DESIGN_MCP_REPO: ctx.cwd } });
  const rows = res.stdout.split('\n').filter((l) => l.startsWith('{')).map(parseJson).filter(Boolean);
  if (!rows.some((r) => r.ok)) return noData(id, `ds critique-batch answered nothing (exit ${res.exit}): ${lastLine(res.stderr)}`, res.ms);
  const baselinePath = path.join(ctx.cwd, FORK_BASELINE);
  const baseline = fs.existsSync(baselinePath) ? (parseJson(fs.readFileSync(baselinePath, 'utf8'))?.files ?? {}) : null;
  const raw = [];
  const forkCounts = {};
  const surfaces = { mobile: { files: 0, forks: 0, drift: 0 }, desktop: { files: 0, forks: 0, drift: 0 } };
  for (const row of rows) {
    const surface = surfaceOf(row.file);
    if (!row.ok) {
      raw.push({ rule: 'critique-error', severity: 'advisory', file: row.file, message: `ds critique could not run: ${row.error}`, surface });
      continue;
    }
    surfaces[surface].files++;
    const problems = row.critique.problems ?? [];
    const forks = problems.filter((p) => p.severity === 'forks-the-system');
    forkCounts[row.file] = forks.length;
    surfaces[surface].forks += forks.length;
    surfaces[surface].drift += problems.length - forks.length;
    for (const p of problems) raw.push(critiqueRaw(p, row.file, surface));
    const allowed = baseline ? (baseline[row.file] ?? 0) : forks.length;
    if (forks.length > allowed) {
      raw.push({
        rule: 'fork-grew',
        severity: 'error',
        file: row.file,
        message: `${forks.length} design-system fork(s), baseline ${allowed} (${surface}): ${forks.map((p) => p.what).join('; ')}`,
        fingerprint: 'fork-grew',
        ...(forks[0]?.fix ? { hint: forks[0].fix } : {}),
        surface,
      });
    }
  }
  if (process.env.SPEC_WRITE_FORK_BASELINE === '1') writeForkBaseline(baselinePath, baseline, forkCounts);
  else if (!baseline) raw.push({ rule: 'fork-baseline-missing', severity: 'advisory', message: `${FORK_BASELINE} missing — every fork is unratcheted (seed with SPEC_WRITE_FORK_BASELINE=1)` });
  const findings = ctx.findings(id, raw);
  return { id, status: findings.some((f) => f.severity === 'error') ? 'fail' : 'pass', exit: 0, ms: res.ms, findings, meta: { files: rows.length, surfaces } };
}

/**
 * The critique only judged what it saw. Before a change is judged, critique the PRE-change content
 * of every file it touched, so a worker is never blamed for (or rewarded for hiding) old debt.
 * Files are swapped one at a time inside the sandbox and restored.
 */
export async function preexistingCritique({ sandbox, files, ref, findings, exec }) {
  const surfaceOf = loadSurfaceLaw(sandbox);
  const raw = [];
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue;
    const old = await exec('git', ['show', `${ref}:${file}`], { cwd: sandbox });
    if (old.exit !== 0) continue; // new file: no baseline
    const abs = path.join(sandbox, file);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    fs.writeFileSync(abs, old.stdout);
    const res = await exec('node', [path.join(sandbox, 'tools/design-mcp/ds.mjs'), 'critique', file], { cwd: sandbox, env: { DESIGN_MCP_REPO: sandbox } });
    if (current) fs.writeFileSync(abs, current);
    else fs.rmSync(abs);
    for (const p of parseJson(res.stdout)?.problems ?? []) raw.push(critiqueRaw(p, file, surfaceOf(file)));
  }
  return findings('critique', raw);
}

// ── Operator contracts (tools/spec-loop/contracts.mjs) ───────────────────────
/**
 * Runs the contract probes through tools/spec-loop/live-contracts.mjs (the pack's copy, judging
 * `ctx.cwd`). `live` probes drive the lane, which serves the live tree only — never a sandbox copy.
 */
async function contracts(ctx, id, mode) {
  if (mode === 'live' && !ctx.live) return skipped(id, 'the lane serves the live tree, not this checkout');
  const runner = path.join(ctx.packRoot, 'tools', 'spec-loop', 'live-contracts.mjs');
  const res = await ctx.exec(path.join(ctx.cwd, 'node_modules', '.bin', 'tsx'), [runner, '--repo', ctx.cwd, ...(mode === 'live' ? ['--live'] : [])], {
    cwd: ctx.cwd,
    timeoutMs: TIMEOUT_MS,
  });
  const body = parseJson(res.stdout);
  if (!Array.isArray(body?.contracts)) return noData(id, res.error ?? `exit ${res.exit}: ${lastLine(res.stderr)}`, res.ms);
  const probes = body.contracts.filter((c) => c.mode === mode);
  if (!probes.some((c) => c.status !== 'no_data')) return noData(id, `every ${mode} contract probe returned no_data`, res.ms);
  const raw = [];
  for (const c of probes) {
    if (c.status === 'no_data') {
      raw.push({ rule: 'probe-no-data', severity: 'advisory', file: c.id, message: `[${c.mode}] ${c.id}: ${c.error}`, fingerprint: `${c.mode}:no-data` });
    }
    for (const v of c.violations) {
      raw.push({ rule: c.id, severity: 'error', file: v.file ?? null, message: `[${c.mode}] ${v.message}`, ...(v.fingerprint ? { fingerprint: `${c.mode}:${v.fingerprint}` } : {}) });
    }
  }
  const findings = ctx.findings(id, raw);
  return {
    id,
    status: findings.some((f) => f.severity === 'error') ? 'fail' : 'pass',
    exit: res.exit,
    ms: res.ms,
    findings,
    meta: { probes: probes.map(({ id: probe, status, ms }) => ({ id: probe, status, ms })) },
  };
}

// ── Live route-tree smoke ────────────────────────────────────────────────────
/** The live route-tree smoke at the lane's origin. Exit 2 is the smoke's own no_data. */
async function smoke(ctx) {
  const id = 'smoke';
  if (!ctx.live) return skipped(id, 'the lane serves the live tree, not this checkout');
  const res = await ctx.exec(path.join(ctx.cwd, 'node_modules', '.bin', 'tsx'), ['tools/design-mcp/route-tree-smoke.mjs', '--json'], { cwd: ctx.cwd, timeoutMs: TIMEOUT_MS });
  const body = parseJson(res.stdout);
  if (!body || res.exit === 2 || res.exit === null) return noData(id, body?.error ?? res.error ?? `exit ${res.exit}`, res.ms);
  const nodes = body.nodes ?? [];
  const findings = ctx.findings(
    id,
    nodes.flatMap((n) => n.findings.map((f) => ({ ...f, file: n.id }))),
  );
  return {
    id,
    status: res.exit === 0 ? 'pass' : 'fail',
    exit: res.exit,
    ms: res.ms,
    findings,
    meta: { nodeNoData: nodes.filter((n) => n.status === 'no_data').map((n) => n.id), samples: body.samples },
  };
}

// ── Gaps: design-mcp questions the route tree could not answer ───────────────
/**
 * ds_route / ds_vocabulary answers that came back ask-operator / not-found since the previous
 * receipt (kept or not), so each ask surfaces once. The log lives in the Garisek checkout of the
 * host that runs the design-mcp server; a host without it lacks `design-guard-log`.
 */
async function gaps(ctx) {
  const id = 'gaps';
  const garisek = process.env.GARISEK_OS_ROOT || path.join(os.homedir(), 'Projects/Garisek-OS');
  const log = process.env.SPEC_GAP_LOG ?? path.join(garisek, '.garisek_os_ops/logs/design-guard.jsonl');
  if (!fs.existsSync(log)) return noData(id, `${log} missing`);
  const since = ctx.previous?.at ?? '1970-01-01T00:00:00.000Z';
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  let routed = 0;
  let verdicted = 0;
  const raw = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parseJson(lines[i]);
    if (!e || e.at <= since) break;
    if (e.tool !== 'ds_route' && e.tool !== 'ds_vocabulary') continue;
    routed++;
    if (e.verdict === undefined) continue;
    verdicted++;
    if (e.verdict === 'ask-operator' || e.verdict === 'not-found') {
      raw.push({ rule: e.tool, severity: 'advisory', file: e.file ?? null, message: `${e.verdict}: ${e.ask ?? ''}` });
    }
  }
  if (routed > 0 && verdicted === 0) return noData(id, `${routed} ds_route/ds_vocabulary call(s) since ${since} logged without a verdict field`);
  const unique = [...new Map(ctx.findings(id, raw).map((f) => [f.key, f])).values()];
  return { id, status: 'pass', exit: 0, ms: 0, findings: unique, meta: { calls: routed } };
}

// ── The anchor list (order = run order; the kernel schedules) ────────────────
/** AnchorSpec[] (Garisek-OS src/lib/loops/spec/types.ts). */
export const ANCHORS = [
  {
    id: 'routes',
    placement: 'static',
    shrinkRules: ['literal-path'],
    timeoutMs: TIMEOUT_MS,
    run: (ctx) => guardAnchor(ctx, 'routes', 'scripts/route-tree-guard.ts', (b) => b.findings ?? []),
  },
  {
    id: 'nav-names',
    placement: 'static',
    timeoutMs: TIMEOUT_MS,
    run: (ctx) =>
      guardAnchor(ctx, 'nav-names', 'scripts/nav-name-guard.ts', (b) =>
        (b.collisions ?? []).map((c) => ({ rule: 'name-clash', severity: 'error', message: typeof c === 'string' ? c : JSON.stringify(c) })),
      ),
  },
  {
    id: 'disclosure',
    placement: 'static',
    timeoutMs: TIMEOUT_MS,
    run: (ctx) =>
      guardAnchor(ctx, 'disclosure', 'scripts/disclosure-audit.ts', (b) =>
        (b.findings ?? []).map((f) => ({ ...f, severity: f.severity ?? 'error', message: f.message ?? JSON.stringify(f) })),
      ),
  },
  { id: 'critique', placement: 'static', timeoutMs: TIMEOUT_MS, run: critique },
  { id: 'verify-fast', placement: 'static', emits: ['gate:'], timeoutMs: 2 * TIMEOUT_MS, run: verifyGates },
  { id: 'contracts', placement: 'static', timeoutMs: TIMEOUT_MS, run: (ctx) => contracts(ctx, 'contracts', 'static') },
  // Live anchors share the lane with nothing else: one Chromium at a time, after the CPU-heavy gates.
  {
    id: 'smoke',
    placement: 'live',
    needs: [LANE],
    retry: { attempts: 1, onlyRules: ['page-error'], warmupSec: 300 },
    timeoutMs: TIMEOUT_MS,
    run: smoke,
  },
  { id: 'contracts-live', placement: 'live', needs: [LANE], timeoutMs: TIMEOUT_MS, run: (ctx) => contracts(ctx, 'contracts-live', 'live') },
  { id: 'gaps', placement: 'static', needs: ['design-guard-log'], gap: true, run: gaps },
];
