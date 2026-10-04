#!/usr/bin/env node
/**
 * Spec sweep — the deterministic sensor of the route-tree spec loop
 * (docs/handoff/PROMPT-route-tree-continuous-improvement-loop-2026-10-03.md §1–§4 L1).
 *
 * Runs every anchor, writes one receipt, diffs it against the last KEPT
 * receipt and prints the classification. No model is consulted anywhere:
 * the anchors below ARE the loop definition, and pass/fail, dedupe and
 * classification are code.
 *
 *   node scripts/spec-sweep.mjs                    full sweep of this checkout
 *   node scripts/spec-sweep.mjs --skip smoke,verify
 *   node scripts/spec-sweep.mjs --cwd <worktree> --out <dir> --baseline <receipt> --no-keep
 *   node scripts/spec-sweep.mjs --json             receipt on stdout instead of the summary
 *
 * Anchor status: pass | fail | no_data (could not run — never rendered as zero) | skipped.
 * Classes: seed · regression · anchor-changed · no_data · gap · shrink · improvement · steady.
 * Keep rule: a run with no regression, no no_data and no unaccepted anchor change becomes
 * last-kept.json. An anchor change (the evaluator's own files) is never auto-kept: a weakened
 * gate would otherwise ratchet itself green. The operator accepts it with --accept-anchors.
 * Exit: 1 on a regression, else 0. no_data / anchor-changed are carried by the receipt.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const CWD = path.resolve(opt('cwd') ?? process.cwd());
const OUT = path.resolve(opt('out') ?? path.join(CWD, '.garisek', 'spec-sweep'));
const BASELINE = opt('baseline') ? path.resolve(opt('baseline')) : path.join(OUT, 'last-kept.json');
const ALL_ANCHORS = ['routes', 'nav-names', 'disclosure', 'critique', 'verify', 'contracts', 'smoke', 'gaps'];
const SKIP = new Set(
  opt('only') ? ALL_ANCHORS.filter((a) => !opt('only').split(',').includes(a)) : (opt('skip') ?? '').split(',').filter(Boolean),
);
const KEEP = !argv.includes('--no-keep');
const JSON_OUT = argv.includes('--json');
const GAP_LOG = process.env.SPEC_SWEEP_GAP_LOG ?? path.join(os.homedir(), 'Projects/Garisek-OS/.garisek_os_ops/logs/design-guard.jsonl');
const ACCEPT_ANCHORS = argv.includes('--accept-anchors');
const TSX = path.join(CWD, 'node_modules', '.bin', 'tsx');
/** The evaluator's own library: always THIS file's checkout, never the judged `--cwd` (a sandbox copy). */
const LOOP_LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'spec-loop');

/** Files a worker must never touch: the evaluator itself. Hashed into every receipt. */
const ANCHOR_FILES = [
  'scripts/spec-sweep.mjs',
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
  'tools/spec-loop/contracts.mjs',
  'tools/spec-loop/live-contracts.mjs',
  'tools/spec-loop/surface.mjs',
  'scripts/ds-forks.baseline.json',
  'tests/auth-preflight.mjs',
];

// ── Process helpers ──────────────────────────────────────────────────────────
/** @returns {Promise<{ exit: number | null, stdout: string, stderr: string, ms: number, error?: string }>} */
function run(cmd, args, { env, timeoutMs = 900_000 } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: CWD, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exit: null, stdout, stderr, ms: Date.now() - started, error: err.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ exit: code, stdout, stderr, ms: Date.now() - started, error: signal ? `killed by ${signal}` : undefined });
    });
  });
}

function git(...args) {
  const res = spawnSync('git', args, { cwd: CWD, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return res.status === 0 ? res.stdout : '';
}

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

/** Stable finding identity: digits stripped so counts do not mint new keys. */
function keyOf(anchor, f) {
  const msg = String(f.message ?? '').replace(/\d+/g, '#').slice(0, 160);
  return [anchor, f.rule ?? '', f.file ?? f.nodeId ?? f.node ?? '', msg].join('|');
}

/** @param {string} anchor @param {{severity:string, rule?:string, message:string, file?:string, nodeId?:string}[]} list */
function findingsOf(anchor, list) {
  return list.map((f) => ({
    key: keyOf(anchor, f),
    severity: f.severity === 'error' ? 'error' : 'advisory',
    rule: f.rule ?? null,
    file: f.file ?? null,
    message: String(f.message).slice(0, 400),
    ...(f.hint ? { hint: String(f.hint).slice(0, 400) } : {}),
  }));
}

function noData(id, reason, ms = 0) {
  return { id, status: 'no_data', exit: null, ms, reason, findings: [] };
}

// ── Anchors (the loop definition) ────────────────────────────────────────────
/** A guard CLI with `--json`. exit 0 → pass, 1 → fail, anything else → no_data. */
async function guardAnchor(id, script, pick) {
  if (!fs.existsSync(path.join(CWD, script))) return noData(id, `${script} missing`);
  const res = await run(TSX, [script, '--json']);
  const body = parseJson(res.stdout);
  if (res.error || ![0, 1].includes(res.exit ?? -1) || !body) {
    return noData(id, res.error ?? `exit ${res.exit}: ${(res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ')}`, res.ms);
  }
  const findings = findingsOf(id, pick(body));
  return { id, status: res.exit === 0 && !findings.some((f) => f.severity === 'error') ? 'pass' : 'fail', exit: res.exit, ms: res.ms, findings };
}

const routesAnchor = () => guardAnchor('routes', 'scripts/route-tree-guard.ts', (b) => b.findings ?? []);
const navNamesAnchor = () =>
  guardAnchor('nav-names', 'scripts/nav-name-guard.ts', (b) =>
    (b.collisions ?? []).map((c) => ({ rule: 'name-clash', severity: 'error', message: typeof c === 'string' ? c : JSON.stringify(c) })),
  );
const disclosureAnchor = () =>
  guardAnchor('disclosure', 'scripts/disclosure-audit.ts', (b) =>
    (b.findings ?? []).map((f) => ({ ...f, severity: f.severity ?? 'error', message: f.message ?? JSON.stringify(f) })),
  );

/** `src/x.ts(12,3): error TS2540: …` → one finding per error, with its file. */
function tsFindings(lines, severity) {
  return lines.map((l) => {
    const m = l.match(/^(.+?)\(\d+,\d+\): (error TS\d+: .*)$/);
    return { rule: 'tsc', severity, file: m?.[1]?.trim() ?? null, message: (m?.[2] ?? l).trim() };
  });
}

/** ESLint stylish output → one finding per `error` line (warnings are budgeted by --max-warnings, not findings). */
function eslintFindings(out, severity) {
  const findings = [];
  let file = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('/')) file = path.relative(CWD, line.trim());
    const m = line.match(/^\s+\d+:\d+\s+error\s+(.*?)\s{2,}(\S+)\s*$/);
    if (m && file) findings.push({ rule: m[2], severity, file, message: m[1] });
  }
  return findings;
}

/** The `fast` verify profile, gate by gate, four at a time (scripts/verify.mjs width). */
async function verifyAnchors() {
  const profileFile = path.join(CWD, 'scripts', 'verify-profile.mjs');
  if (!fs.existsSync(profileFile)) return [noData('verify-fast', 'scripts/verify-profile.mjs missing')];
  const { gatesForProfile } = await import(pathToFileURL(profileFile).href);
  const gates = gatesForProfile('fast');
  const results = new Array(gates.length);
  let next = 0;
  const worker = async () => {
    while (next < gates.length) {
      const i = next++;
      const g = gates[i];
      const res = await run(g.cmd, g.args, { env: g.env });
      const id = `gate:${g.name}`;
      if (res.error && res.exit === null) results[i] = noData(id, res.error, res.ms);
      else {
        const out = res.stdout + res.stderr;
        const tsLines = g.name === 'Typecheck' ? out.split('\n').filter((l) => /error TS\d+/.test(l)) : [];
        const tsErrors = g.name === 'Typecheck' ? tsLines.length : undefined;
        const severity = g.advisory ? 'advisory' : 'error';
        const parsed = res.exit === 0 ? [] : tsLines.length ? tsFindings(tsLines, severity) : eslintFindings(out, severity);
        const findings = findingsOf(
          id,
          res.exit === 0 ? [] : parsed.length ? parsed : [{ rule: 'gate', severity, message: out.trim().split('\n').slice(-4).join(' ⏎ ') }],
        );
        results[i] = { id, status: res.exit === 0 || g.advisory ? 'pass' : 'fail', exit: res.exit, ms: res.ms, findings, ...(tsErrors !== undefined ? { tsErrors } : {}) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, gates.length) }, worker));
  return results;
}

/**
 * ds_critique over EVERY feature UI file, tagged mobile | desktop by the Boundary gate's own law
 * (tools/spec-loop/surface.mjs). Forks are ratcheted per file by scripts/ds-forks.baseline.json
 * (shrink-only): a file with more forks than its baseline is an error (`fork-grew`); forks within
 * the baseline are tracked debt (advisory `fork`) for `spec-loop --debt`.
 */
const FORK_BASELINE = 'scripts/ds-forks.baseline.json';
async function critiqueAnchor() {
  const id = 'critique';
  const cli = path.join(CWD, 'tools', 'design-mcp', 'ds.mjs');
  if (!fs.existsSync(cli)) return noData(id, 'tools/design-mcp/ds.mjs missing');
  const { loadSurfaceLaw } = await import(pathToFileURL(path.join(LOOP_LIB, 'surface.mjs')).href);
  const surfaceOf = loadSurfaceLaw(CWD);
  const files = git('ls-files', '-co', '--exclude-standard', '--', 'src')
    .split('\n')
    .filter((f) => f.endsWith('.tsx') && !/\.(test|stories)\.tsx$/.test(f) && ['mobile', 'desktop'].includes(surfaceOf(f)) && fs.existsSync(path.join(CWD, f)));
  if (!files.length) return noData(id, 'no feature UI files found');
  // DESIGN_MCP_REPO: judge THIS checkout (a sandbox copy has its own git, not a lane worktree).
  const res = await run('node', [cli, 'critique-batch', ...files], { timeoutMs: 900_000, env: { DESIGN_MCP_REPO: CWD } });
  const rows = res.stdout.split('\n').filter((l) => l.startsWith('{')).map(parseJson).filter(Boolean);
  if (!rows.some((r) => r.ok)) return noData(id, `ds critique-batch answered nothing (exit ${res.exit}): ${(res.stderr || '').trim().split('\n').pop() ?? ''}`, res.ms);
  const baselinePath = path.join(CWD, FORK_BASELINE);
  const baseline = fs.existsSync(baselinePath) ? (parseJson(fs.readFileSync(baselinePath, 'utf8'))?.files ?? {}) : null;
  const findings = [];
  const forkCounts = {};
  const surfaces = { mobile: { files: 0, forks: 0, drift: 0 }, desktop: { files: 0, forks: 0, drift: 0 } };
  for (const row of rows) {
    const surface = surfaceOf(row.file);
    if (!row.ok) {
      findings.push(...findingsOf(id, [{ rule: 'critique-error', severity: 'advisory', file: row.file, message: `ds critique could not run: ${row.error}` }]));
      continue;
    }
    surfaces[surface].files++;
    const problems = row.critique.problems ?? [];
    const forks = problems.filter((p) => p.severity === 'forks-the-system');
    forkCounts[row.file] = forks.length;
    surfaces[surface].forks += forks.length;
    surfaces[surface].drift += problems.length - forks.length;
    for (const p of problems) {
      const rule = p.severity === 'forks-the-system' ? 'fork' : (p.rule ?? p.severity);
      findings.push(...findingsOf(id, [{ rule, severity: 'advisory', file: row.file, message: `L${p.line ?? '?'} ${p.what ?? ''}`, hint: p.fix }]).map((f) => ({ ...f, surface })));
    }
    const allowed = baseline ? (baseline[row.file] ?? 0) : forks.length;
    if (forks.length > allowed) {
      findings.push(
        ...findingsOf(id, [{ rule: 'fork-grew', severity: 'error', file: row.file, message: `${forks.length} design-system fork(s), baseline ${allowed} (${surface}): ${forks.map((p) => p.what).join('; ')}`, hint: forks[0]?.fix }]).map((f) => ({ ...f, surface })),
      );
    }
  }
  if (argv.includes('--write-fork-baseline')) writeForkBaseline(baselinePath, baseline, forkCounts);
  else if (!baseline) findings.push(...findingsOf(id, [{ rule: 'fork-baseline-missing', severity: 'advisory', message: `${FORK_BASELINE} missing — every fork is unratcheted (seed with --write-fork-baseline)` }]));
  return { id, status: findings.some((f) => f.severity === 'error') ? 'fail' : 'pass', exit: 0, ms: res.ms, files: rows.length, surfaces, findings };
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
        note: 'FROZEN BASELINE — design-system forks (ds_critique `forks-the-system`) per feature UI file. SHRINK-ONLY: a file above its count fails the spec sweep (`fork-grew`); `spec-loop --debt critique` burns it down. Rewrite with `node scripts/spec-sweep.mjs --write-fork-baseline` (never grows an entry).',
        files: next,
      },
      null,
      2,
    ) + '\n',
  );
}

/**
 * Operator rulings as executable contracts (tools/spec-loop/contracts.mjs). Static probes judge
 * the `--cwd` checkout; live probes run only when that checkout is the one the lane serves.
 */
async function contractsAnchor() {
  const id = 'contracts';
  const servesLane = path.resolve(LOOP_LIB, '..', '..') === CWD && !SKIP.has('smoke');
  const res = await run(TSX, [path.join(LOOP_LIB, 'live-contracts.mjs'), '--repo', CWD, ...(servesLane ? ['--live'] : [])], { timeoutMs: 900_000 });
  const body = parseJson(res.stdout);
  if (!body?.contracts) return noData(id, res.error ?? `exit ${res.exit}: ${(res.stderr || '').trim().split('\n').pop() ?? ''}`, res.ms);
  const findings = [];
  for (const c of body.contracts) {
    if (c.status === 'no_data') findings.push(...findingsOf(id, [{ rule: 'probe-no-data', severity: 'advisory', file: c.id, message: `[${c.mode}] ${c.id}: ${c.error}` }]));
    for (const v of c.violations) findings.push(...findingsOf(id, [{ rule: c.id, severity: 'error', file: v.file ?? null, message: `[${c.mode}] ${v.message}` }]));
  }
  const ran = body.contracts.filter((c) => c.status !== 'no_data');
  if (!ran.length) return noData(id, 'every contract probe returned no_data', res.ms);
  return { id, status: findings.some((f) => f.severity === 'error') ? 'fail' : 'pass', exit: res.exit, ms: res.ms, live: servesLane, probes: body.contracts.map(({ id: cid, mode, status, ms }) => ({ id: cid, mode, status, ms })), findings };
}

/** The live route-tree smoke at :3050. Exit 2 is the smoke's own no_data. */
async function smokeAnchor() {
  const id = 'smoke';
  const res = await run(TSX, ['tools/design-mcp/route-tree-smoke.mjs', '--json'], { timeoutMs: 900_000 });
  const body = parseJson(res.stdout);
  if (!body || res.exit === 2 || res.exit === null) return noData(id, body?.error ?? res.error ?? `exit ${res.exit}`, res.ms);
  const findings = [];
  for (const n of body.nodes ?? []) {
    for (const f of n.findings) findings.push(...findingsOf(id, [{ ...f, file: n.id }]));
  }
  const nodeNoData = (body.nodes ?? []).filter((n) => n.status === 'no_data').map((n) => n.id);
  return { id, status: res.exit === 0 ? 'pass' : 'fail', exit: res.exit, ms: res.ms, nodeNoData, samples: body.samples, findings };
}

/** L3: ds_route / ds_vocabulary answers that came back ask-operator / found:false since the last receipt. */
function gapAnchor() {
  const id = 'gaps';
  if (!fs.existsSync(GAP_LOG)) return noData(id, `${GAP_LOG} missing`);
  // Gaps are an event stream: the window opens at the previous receipt (kept or not), so each ask surfaces once.
  const latest = path.join(OUT, 'latest.json');
  const since = (fs.existsSync(latest) ? parseJson(fs.readFileSync(latest, 'utf8'))?.at : null) ?? '1970-01-01T00:00:00.000Z';
  const lines = fs.readFileSync(GAP_LOG, 'utf8').trim().split('\n');
  let routed = 0;
  let verdicted = 0;
  const findings = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const e = parseJson(lines[i]);
    if (!e || e.at <= since) break;
    if (e.tool !== 'ds_route' && e.tool !== 'ds_vocabulary') continue;
    routed++;
    if (e.verdict === undefined) continue;
    verdicted++;
    if (e.verdict === 'ask-operator' || e.verdict === 'not-found') {
      findings.push(...findingsOf(id, [{ rule: e.tool, severity: 'advisory', file: e.file ?? null, message: `${e.verdict}: ${e.ask ?? ''}` }]));
    }
  }
  if (routed > 0 && verdicted === 0) return noData(id, `${routed} ds_route/ds_vocabulary call(s) since ${since} logged without a verdict field`);
  const unique = [...new Map(findings.map((f) => [f.key, f])).values()];
  return { id, status: 'pass', exit: 0, ms: 0, calls: routed, findings: unique };
}

/** Shrink-only baselines: a baseline file whose total grew since last-kept is a regression. */
function baselineTotals() {
  const dir = path.join(CWD, 'scripts');
  const totals = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.baseline.json')).sort()) {
    const body = parseJson(fs.readFileSync(path.join(dir, f), 'utf8'));
    const files = body?.files ?? body;
    totals[`scripts/${f}`] = files && typeof files === 'object'
      ? Object.values(files).reduce((n, v) => n + (typeof v === 'number' ? v : 1), 0)
      : null;
  }
  return totals;
}

function anchorHashes() {
  return Object.fromEntries(
    ANCHOR_FILES.map((f) => {
      const p = path.join(CWD, f);
      return [f, fs.existsSync(p) ? createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16) : null];
    }),
  );
}

// ── Sweep ────────────────────────────────────────────────────────────────────
const started = Date.now();
const lastKept = fs.existsSync(BASELINE) ? parseJson(fs.readFileSync(BASELINE, 'utf8')) : null;
const dirtyFiles = new Set(
  git('status', '--porcelain')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).split(' -> ').pop()),
);

const skipped = (id) => ({ id, status: 'skipped', exit: null, ms: 0, findings: [] });
const parallel = await Promise.all([
  SKIP.has('routes') ? skipped('routes') : routesAnchor(),
  SKIP.has('nav-names') ? skipped('nav-names') : navNamesAnchor(),
  SKIP.has('disclosure') ? skipped('disclosure') : disclosureAnchor(),
  SKIP.has('critique') ? skipped('critique') : critiqueAnchor(),
  SKIP.has('verify') ? Promise.resolve([skipped('verify-fast')]) : verifyAnchors(),
]);
// The smoke shares the lane with nothing else in this sweep; run it after the CPU-heavy gates.
const smoke = SKIP.has('smoke') ? skipped('smoke') : await smokeAnchor();
// Contracts after the smoke: live probes share the lane, one Chromium at a time.
const contracts = SKIP.has('contracts') ? skipped('contracts') : await contractsAnchor();
const gaps = SKIP.has('gaps') ? skipped('gaps') : gapAnchor();
const anchors = [...parallel.flat(), smoke, contracts, gaps];

// Attribution: preexisting (in last-kept) · dirty (file has uncommitted edits) · committed.
const keptKeys = new Set((lastKept?.anchors ?? []).flatMap((a) => a.findings.map((f) => f.key)));
for (const a of anchors) {
  for (const f of a.findings) {
    f.attribution = keptKeys.has(f.key) ? 'preexisting' : f.file && dirtyFiles.has(f.file) ? 'dirty' : 'committed';
  }
}

const typecheck = anchors.find((a) => a.id === 'gate:Typecheck');
const gateAnchors = anchors.filter((a) => a.id.startsWith('gate:'));
const receipt = {
  schema: 1,
  at: new Date().toISOString(),
  host: os.hostname(),
  cwd: CWD,
  commit: git('rev-parse', 'HEAD').trim() || null,
  dirty: dirtyFiles.size,
  durationMs: 0,
  anchors,
  composite: {
    gates_pass: gateAnchors.length ? gateAnchors.filter((a) => a.status === 'pass').length : null,
    gates_total: gateAnchors.length || null,
    typecheck_errors: typecheck && typecheck.status !== 'no_data' ? (typecheck.tsErrors ?? 0) : null,
    // Unit tests run in the `full` profile only; the fast sweep never measures them.
    failing_tests: null,
  },
  baselines: baselineTotals(),
  anchorHashes: anchorHashes(),
  classification: null,
  kept: false,
  baselineReceipt: lastKept ? { at: lastKept.at, commit: lastKept.commit } : null,
};

// ── Classify against the last kept receipt (deterministic) ───────────────────
const cls = { regression: [], no_data: [], gap: [], shrink: [], anchors_changed: [], improvement: [] };
const keptById = new Map((lastKept?.anchors ?? []).map((a) => [a.id, a]));
for (const a of anchors) {
  if (a.status === 'skipped') continue;
  if (a.status === 'no_data') {
    cls.no_data.push({ anchor: a.id, reason: a.reason });
    continue;
  }
  const before = keptById.get(a.id);
  if (before?.status === 'pass' && a.status === 'fail') cls.regression.push({ anchor: a.id, kind: 'pass→fail' });
  if (before?.status === 'fail' && a.status === 'pass') cls.improvement.push({ anchor: a.id, kind: 'fail→pass' });
  if (lastKept) {
    for (const f of a.findings) {
      if (f.severity === 'error' && f.attribution !== 'preexisting') cls.regression.push({ anchor: a.id, kind: f.rule, file: f.file, message: f.message });
    }
    const nowKeys = new Set(a.findings.map((f) => f.key));
    const cleared = (before?.findings ?? []).filter((f) => f.severity === 'error' && !nowKeys.has(f.key));
    if (cleared.length) cls.improvement.push({ anchor: a.id, kind: 'errors-cleared', count: cleared.length });
  }
  if (a.id === 'gaps') for (const f of a.findings) cls.gap.push({ rule: f.rule, file: f.file, message: f.message });
  if (a.id === 'routes') {
    for (const f of a.findings) if (f.rule === 'literal-path' && f.severity === 'advisory') cls.shrink.push({ file: f.file, message: f.message });
  }
}
if (lastKept) {
  for (const [file, total] of Object.entries(receipt.baselines)) {
    const before = lastKept.baselines?.[file];
    if (typeof before === 'number' && typeof total === 'number' && total > before) {
      cls.regression.push({ anchor: 'baselines', kind: 'baseline-grew', file, message: `${before} → ${total} (shrink-only)` });
    }
  }
  for (const [file, hash] of Object.entries(receipt.anchorHashes)) {
    const before = lastKept.anchorHashes?.[file];
    if (before !== undefined && before !== hash) cls.anchors_changed.push({ file, before, now: hash });
  }
}

const label = !lastKept
  ? 'seed'
  : cls.regression.length
    ? 'regression'
    : cls.anchors_changed.length
      ? 'anchor-changed'
      : cls.no_data.length
        ? 'no_data'
        : cls.gap.length
          ? 'gap'
          : cls.shrink.length
            ? 'shrink'
            : cls.improvement.length
              ? 'improvement'
              : 'steady';
receipt.classification = { label, ...cls };
receipt.kept =
  KEEP &&
  (label === 'seed' || (!cls.regression.length && !cls.no_data.length && (!cls.anchors_changed.length || ACCEPT_ANCHORS)));
receipt.durationMs = Date.now() - started;

fs.mkdirSync(OUT, { recursive: true });
const receiptPath = path.join(OUT, `${receipt.at.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
if (receipt.kept) fs.writeFileSync(path.join(OUT, 'last-kept.json'), JSON.stringify(receipt, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify({ at: receipt.at, receipt: receiptPath, label, kept: receipt.kept }, null, 2) + '\n');

const openErrors = anchors.reduce((n, a) => n + a.findings.filter((f) => f.severity === 'error').length, 0);
const summary =
  `spec-sweep ${receipt.commit?.slice(0, 9) ?? 'no-commit'} ${label}: ` +
  `regressions ${cls.regression.length} · no_data ${cls.no_data.length} · gaps ${cls.gap.length} · shrink ${cls.shrink.length} · ` +
  `anchors changed ${cls.anchors_changed.length} · open errors ${openErrors} · ${Math.round(receipt.durationMs / 1000)}s${receipt.kept ? ' · kept' : ''}`;

// Pin board (Garisek /system?tab=pins reads .garisek/pins.json): one upserted pin per repo.
const PIN_FILE = opt('pin');
if (PIN_FILE) {
  const pinId = `spec-sweep:${path.basename(CWD)}`;
  const doc = fs.existsSync(PIN_FILE) ? (parseJson(fs.readFileSync(PIN_FILE, 'utf8')) ?? { pins: [] }) : { pins: [] };
  const pins = (Array.isArray(doc.pins) ? doc.pins : []).filter((p) => p.id !== pinId);
  pins.push({ id: pinId, statement: summary, repo: CWD, status: label, source: 'file', heartbeatAt: receipt.at, startedAt: new Date(started).toISOString(), visitor: null, runId: path.basename(receiptPath, '.json'), definitionId: 'cycleforge-spec-sweep', costUsd: 0 });
  fs.mkdirSync(path.dirname(PIN_FILE), { recursive: true });
  fs.writeFileSync(`${PIN_FILE}.tmp`, JSON.stringify({ ...doc, pins }, null, 2) + '\n');
  fs.renameSync(`${PIN_FILE}.tmp`, PIN_FILE);
}

if (JSON_OUT) process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
else {
  process.stdout.write(summary + '\n');
  for (const a of anchors) {
    const errs = a.findings.filter((f) => f.severity === 'error').length;
    process.stdout.write(`  ${a.status.padEnd(8)} ${a.id.padEnd(28)} ${String(a.ms).padStart(7)} ms  errors ${errs}${a.reason ? `  (${a.reason})` : ''}\n`);
  }
  for (const r of cls.regression.slice(0, 20)) process.stdout.write(`  REGRESSION ${r.anchor} ${r.kind}${r.file ? ` ${r.file}` : ''}${r.message ? ` — ${r.message}` : ''}\n`);
  for (const t of cls.anchors_changed) process.stdout.write(`  ANCHOR-CHANGED ${t.file} ${t.before} → ${t.now}${ACCEPT_ANCHORS ? ' (accepted)' : ''}\n`);
  process.stdout.write(`  receipt ${receiptPath}\n`);
}
process.exit(cls.regression.length ? 1 : 0);
