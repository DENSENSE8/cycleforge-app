#!/usr/bin/env node
/**
 * Spec loop — sense → work → verify → (optionally) land, with omp as the only harness.
 *
 *   node scripts/spec-loop.mjs --plant                  prove the loop: plant tools/spec-loop/mutants.mjs, fix them
 *   node scripts/spec-loop.mjs                          fix the live tree's NEW regressions (vs its last kept receipt)
 *   node scripts/spec-loop.mjs --debt <selector>        burn down EXISTING findings, one unit at a time:
 *        contracts | contract:<id>                       an operator contract (tools/spec-loop/contracts.mjs)
 *        critique | critique:mobile | critique:desktop   the file with the most design-system forks
 *        <anchor>                                         error findings of any anchor, one file per unit
 *   node scripts/spec-loop.mjs --goal docs/handoff/X.md  implement a handoff; gates = no new findings + verifier
 *
 *   options: --units N (debt, default 1) --model <writer> (default xai-oauth/grok-4.7) --attempts N (4)
 *            --max-time 15m --verifier <model> | --no-verify --apply --keep-sandbox --sandbox <dir>
 *
 * Invariants (handoff §5, cockpit plan §5.5, tools/spec-loop/contracts.mjs header):
 *  - The shared tree is never edited by a worker. Work happens in a sandbox COPY with a private git;
 *    the deliverable is a patch under .garisek/omp-work/<run>/. `--apply` (operator-run only, never a
 *    timer) lands it with `git apply` after every gate passed.
 *  - Pass/fail is scripts/spec-sweep.mjs — this checkout's copy, judging the sandbox. Workers get
 *    file tools only (no shell); the verifier gets read-only tools.
 *  - A diff touching the evaluator, rulings, exemptions or outside the unit's lease, or adding a
 *    gate silencer, is reverted unseen.
 *  - The verifier (different model family) can only veto. Unverified is never green.
 *  - keep on improvement, revert on regression, record both (attempts.tsv).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTRACTS, lawFor } from '../tools/spec-loop/contracts.mjs';
import { MUTANTS } from '../tools/spec-loop/mutants.mjs';
import { runOmp } from '../tools/spec-loop/omp.mjs';
import { portContract, portFindings } from '../tools/spec-loop/port.mjs';
import { loadSurfaceLaw } from '../tools/spec-loop/surface.mjs';
import { verify, VERIFIER_MODEL } from '../tools/spec-loop/verifier.mjs';

const LIVE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const PLANT = argv.includes('--plant');
const DEBT = opt('debt');
const GOAL = opt('goal');
const MODE = PLANT ? 'plant' : DEBT ? 'debt' : GOAL ? 'goal' : 'regressions';
const MODEL = opt('model', 'xai-oauth/grok-4.7');
const THINKING = opt('thinking', 'medium');
const ATTEMPTS = Number(opt('attempts', '4'));
const UNITS = Number(opt('units', '1'));
const MAX_TIME = opt('max-time', '15m');
const VERIFY = !argv.includes('--no-verify');
const VERIFIER = opt('verifier', VERIFIER_MODEL);
const APPLY = argv.includes('--apply');
const SANDBOX = path.resolve(opt('sandbox', path.join(os.homedir(), '.cache', 'cycleforge-spec-loop', 'sandbox')));
const RUN_ID = `loop_${new Date().toISOString().replace(/[:.]/g, '-')}`;
const RUN_DIR = path.join(LIVE, '.garisek', 'omp-work', RUN_ID);
const SWEEP_SKIP = 'smoke,gaps'; // the lane serves the shared tree, not the sandbox; gaps are a live event stream

/** The worker may not touch these: the evaluator, its library, baselines, exemptions and operator rulings. */
const FORBIDDEN = [
  /^scripts\/spec-/,
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
/** Silencing a gate inside a file the worker may edit is tampering too. */
const SILENCERS = /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/;
/** Without a lease, a worker may change application source only. */
const WORKER_SCOPE = /^src\//;
/** Files a harness writes when a model addresses a tool device as a path (`xd://bash` → `xd:/bash`). */
const HARNESS_ARTIFACT = /^[a-z]+:\//;
/** Housekeeping findings that are never work. */
const IGNORED_RULES = new Set(['critique-cap', 'critique-error', 'drill-budget', 'no-sample', 'probe-no-data', 'fork-baseline-missing']);

fs.mkdirSync(RUN_DIR, { recursive: true });
const log = (line) => {
  process.stdout.write(line + '\n');
  fs.appendFileSync(path.join(RUN_DIR, 'loop.log'), `${new Date().toISOString()} ${line}\n`);
};

function sh(cmd, args, { cwd = SANDBOX, input, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
  if (res.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} → ${res.status}: ${res.stderr || res.stdout}`);
  return res.stdout ?? '';
}
const sgit = (...args) => sh('git', args);
const surfaceOf = loadSurfaceLaw(LIVE);

// ── Sandbox: a copy of the shared tree (tracked + untracked, not ignored) with a private git ──
function buildSandbox() {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  const files = sh('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: LIVE })
    .split('\0')
    .filter((f) => f && fs.existsSync(path.join(LIVE, f)));
  sh('rsync', ['-a', '--from0', '--files-from=-', `${LIVE}/`, `${SANDBOX}/`], { cwd: LIVE, input: files.join('\0') });
  fs.symlinkSync(path.join(LIVE, 'node_modules'), path.join(SANDBOX, 'node_modules'));
  sgit('init', '-q', '-b', 'sandbox');
  sgit('config', 'user.email', 'spec-loop@localhost');
  sgit('config', 'user.name', 'spec-loop');
  fs.appendFileSync(path.join(SANDBOX, '.git', 'info', 'exclude'), 'node_modules\n.next/\n.garisek/spec-sweep/\n*.tsbuildinfo\n');
  sgit('add', '-A');
  sgit('commit', '-q', '-m', `baseline: copy of ${LIVE} at ${sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: LIVE }).trim()}`);
  return files.length;
}

// ── Sweep (the evaluator: this checkout's copy, judging the sandbox) ─────────
async function sweep(label, baselineFile) {
  const out = path.join(RUN_DIR, `sweep-${label}.json`);
  const args = ['scripts/spec-sweep.mjs', '--cwd', SANDBOX, '--skip', SWEEP_SKIP, '--json', '--no-keep', '--out', path.join(RUN_DIR, 'receipts')];
  if (baselineFile) args.push('--baseline', baselineFile);
  const started = Date.now();
  await new Promise((resolve) => {
    const fd = fs.openSync(out, 'w');
    const child = spawn('node', args, {
      cwd: LIVE,
      stdio: ['ignore', fd, 'ignore'],
      env: { ...process.env, NODE_OPTIONS: '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON' },
    });
    child.on('close', () => (fs.closeSync(fd), resolve()));
  });
  const receipt = JSON.parse(fs.readFileSync(out, 'utf8'));
  log(`sweep ${label}: ${receipt.classification.label} (${Math.round((Date.now() - started) / 1000)}s)`);
  return receipt;
}

const tagged = (receipt) => receipt.anchors.flatMap((a) => a.findings.filter((f) => !IGNORED_RULES.has(f.rule)).map((f) => ({ anchor: a.id, ...f })));

/** Findings present now but not in the baseline (any severity). */
function newFindings(receipt, baseline) {
  const before = new Set((baseline?.anchors ?? []).flatMap((a) => a.findings.map((f) => f.key)));
  return tagged(receipt).filter((f) => !before.has(f.key));
}

/**
 * The baseline only critiqued what it saw. Before judging a change, critique the PRE-change
 * content of every file it touched and fold those findings into the baseline as preexisting, so a
 * worker is never blamed for (or rewarded for hiding) old debt.
 */
function extendBaseline(baseline, files, ref) {
  const critique = baseline.anchors.find((a) => a.id === 'critique');
  if (!critique) return baseline;
  for (const file of files) {
    if (!/\.tsx?$/.test(file)) continue;
    const old = spawnSync('git', ['show', `${ref}:${file}`], { cwd: SANDBOX, encoding: 'utf8' });
    if (old.status !== 0) continue; // new file: no baseline
    const current = fs.existsSync(path.join(SANDBOX, file)) ? fs.readFileSync(path.join(SANDBOX, file)) : null;
    fs.writeFileSync(path.join(SANDBOX, file), old.stdout);
    const res = spawnSync('node', [path.join(SANDBOX, 'tools/design-mcp/ds.mjs'), 'critique', file], { cwd: SANDBOX, encoding: 'utf8', env: { ...process.env, DESIGN_MCP_REPO: SANDBOX } });
    if (current) fs.writeFileSync(path.join(SANDBOX, file), current);
    else fs.rmSync(path.join(SANDBOX, file));
    let body = null;
    try {
      body = JSON.parse(res.stdout);
    } catch {
      continue;
    }
    for (const p of body.problems ?? []) {
      const rule = p.severity === 'forks-the-system' ? 'fork' : (p.rule ?? p.severity);
      const message = `L${p.line ?? '?'} ${p.what ?? ''}`;
      const key = ['critique', rule, file, message.replace(/\d+/g, '#').slice(0, 160)].join('|');
      if (!critique.findings.some((f) => f.key === key)) critique.findings.push({ key, severity: 'advisory', rule, file, message });
    }
  }
  return baseline;
}

function writeJson(name, value) {
  const file = path.join(RUN_DIR, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

// ── Planting (proof mode) ────────────────────────────────────────────────────
function plant() {
  const touched = [];
  for (const m of MUTANTS) {
    for (const [file, content] of Object.entries(m.create ?? {})) {
      fs.mkdirSync(path.dirname(path.join(SANDBOX, file)), { recursive: true });
      fs.writeFileSync(path.join(SANDBOX, file), content);
      touched.push(file);
    }
    for (const e of m.edits ?? []) {
      const p = path.join(SANDBOX, e.file);
      const text = fs.readFileSync(p, 'utf8');
      if (!text.includes(e.find)) throw new Error(`mutant ${m.id}: anchor text not found in ${e.file}`);
      fs.writeFileSync(p, text.replace(e.find, e.replace));
      touched.push(e.file);
    }
  }
  sgit('add', '-A');
  sgit('commit', '-q', '-m', 'planted mutants');
  return [...new Set(touched)];
}

/** Detector kill check: every mutant expectation must be caught by its anchor. */
function killCheck(receipt) {
  return MUTANTS.map((m) => {
    const expectations = m.expect.map((x) => ({
      ...x,
      caught: receipt.anchors.some((a) => a.id === x.anchor && a.findings.some((f) => f.file === x.file && (f.rule === x.rule || f.message.includes(x.rule)))),
    }));
    return { id: m.id, killed: expectations.every((c) => c.caught), expectations };
  });
}

// ── Units of work ────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, targets: any[], lease: string[] | null, port: boolean, goal?: string }} Unit
 * Debt units come from the SEED receipt (existing findings); one unit = one contract or one file.
 */
function debtUnits(seed, selector) {
  const all = tagged(seed);
  if (selector === 'contracts' || selector.startsWith('contract:')) {
    const want = selector.startsWith('contract:') ? selector.slice('contract:'.length) : null;
    const byContract = new Map();
    for (const f of all.filter((x) => x.anchor === 'contracts' && x.severity === 'error' && (!want || x.rule === want))) {
      if (!byContract.has(f.rule)) byContract.set(f.rule, []);
      byContract.get(f.rule).push(f);
    }
    return [...byContract.entries()]
      .map(([id, targets]) => ({ id: `contract:${id}`, targets, lease: CONTRACTS.find((c) => c.id === id)?.lease ?? null, port: false, contract: CONTRACTS.find((c) => c.id === id) }))
      .filter((u) => u.contract?.fix === 'worker');
  }
  if (selector === 'critique' || selector.startsWith('critique:')) {
    const surface = selector.split(':')[1] ?? null;
    const byFile = new Map();
    for (const f of all.filter((x) => x.anchor === 'critique' && x.rule === 'fork' && x.file && (!surface || x.surface === surface))) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    return [...byFile.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([file, targets]) => ({ id: `critique:${file}`, targets, lease: [file], port: true, surface: surfaceOf(file) }));
  }
  const byFile = new Map();
  for (const f of all.filter((x) => x.anchor === selector && x.severity === 'error')) {
    const k = f.file ?? '(repo-wide)';
    if (!byFile.has(k)) byFile.set(k, []);
    byFile.get(k).push(f);
  }
  return [...byFile.entries()].map(([file, targets]) => ({ id: `${selector}:${file}`, targets, lease: file === '(repo-wide)' ? null : [file], port: false }));
}

// ── Work order (deterministic template) ──────────────────────────────────────
function contractHints(unit) {
  const surfaces = [...new Set(unit.targets.filter((f) => f.anchor === 'critique' || f.anchor === 'port').map((f) => f.surface ?? surfaceOf(f.file ?? '')))].filter((s) => s === 'mobile' || s === 'desktop');
  const lines = [];
  for (const surface of surfaces) {
    const what = [...new Set(unit.targets.filter((f) => f.anchor === 'critique').map((f) => f.message.replace(/^L\S+\s*/, '')))].slice(0, 3).join('; ');
    const res = spawnSync('node', ['tools/design-mcp/ds.mjs', 'contract', `${surface} ${what || 'button action'}`, '--limit', '4'], { cwd: LIVE, encoding: 'utf8' });
    try {
      for (const m of JSON.parse(res.stdout).matches) lines.push(`- (${surface}) ${m.id} — import \`${m.import}\` — use when: ${m.useWhen?.slice(0, 200)} — do not: ${m.doNot?.slice(0, 240)}`);
    } catch {
      /* contract lookup is advisory */
    }
  }
  return lines;
}

function buildPrompt(unit, open, attempt, previous) {
  const byFile = new Map();
  for (const f of open) {
    const k = f.file ?? '(repo-wide)';
    if (!byFile.has(k)) byFile.set(k, []);
    byFile.get(k).push(f);
  }
  const law = lawFor(open);
  const hints = contractHints({ ...unit, targets: open });
  return `# Spec-loop work order ${RUN_ID} · ${unit.id} · attempt ${attempt}

You are changing a sandbox copy of CycleForge so that the findings below disappear for real. Read
AGENTS.md first. You have file tools only; a separate process re-runs every check and a verifier
from another model family reviews your diff, so do not claim success — make the code right.
${unit.goal ? `\n## Goal (operator handoff — implement it)\n${unit.goal}\n` : ''}
## Findings to remove (${open.length})
${[...byFile.entries()]
  .map(([file, list]) => `### ${file}${file !== '(repo-wide)' ? ` (${surfaceOf(file)})` : ''}\n${list.map((f) => `- [${f.anchor} · ${f.severity} · ${f.rule}] ${f.message}${f.hint ? `\n  fix: ${f.hint}` : ''}`).join('\n')}`)
  .join('\n\n') || '- (none: implement the goal without adding any finding)'}

## Law (operator rulings — the verifier checks your diff against these)
${law.map((c) => `- [${c.id}] ${c.statement}${c.interpretation ? `\n  reading: ${c.interpretation}` : ''}\n  operator's words: "${c.ruling.words}"`).join('\n') || '- (see AGENTS.md)'}
- Every Warehouse URL comes from \`@/lib/nav/route-tree\`; a page the route tree does not own is removed, not registered.
- Mobile code stays in src/components/mobile/** or src/app/m/**; desktop code never imports it (Component split).
${unit.lease ? `\n## Lease — the ONLY files you may edit\n${unit.lease.map((f) => `- ${f}`).join('\n')}\nAn edit to any other file reverts the whole attempt.\n` : ''}${hints.length ? `\n## Design-system primitives that already exist (ds_contract)\n${hints.join('\n')}\nRead the primitive's source and copy how an existing caller uses it.\n` : ''}
## Hard rules
- Never edit: scripts/spec-*, scripts/*-guard.*, *.baseline.json, exemption/allowlist files, scripts/verify*.mjs,
  tools/design-mcp/**, tools/spec-loop/**, src/lib/nav/route-tree*.ts, src/lib/disclosure/**, eslint config,
  package.json, *.test.*, AGENTS.md, .omp/**. No eslint-disable / @ts-ignore / @ts-expect-error.
- Keep every job the code did: port a hand-rolled control onto the primitive and keep its verb; never delete a feature
  to make a finding go away unless the law above says it must go.
- Smallest change that satisfies the law. Do not refactor unrelated code.
- Never edit a quotation of an operator / owner ruling (quoted, attributed, usually dated words) — rulings are verbatim history.
${previous ? `\n## Previous attempt\n${previous}\n` : ''}`;
}

// ── One unit: attempts until green + verified, or out of attempts ────────────
async function runUnit(unit, baseline, startReceipt, summary) {
  const unitDir = unit.id.replace(/[^\w.-]+/g, '_').slice(0, 80);
  const contract = unit.port ? portContract(SANDBOX, unit.targets.map((f) => f.file).filter(Boolean)) : [];
  const targetKeys = new Set(unit.targets.map((f) => f.key));
  const remainingOf = (receipt) => {
    const now = tagged(receipt);
    const nowKeys = new Set(now.map((f) => f.key));
    const stillThere = unit.targets.filter((f) => nowKeys.has(f.key));
    const fresh = newFindings(receipt, baseline).filter((f) => !targetKeys.has(f.key));
    return [...stillThere, ...fresh, ...portFindings(SANDBOX, contract)];
  };
  let open = remainingOf(startReceipt);
  const unitStart = sgit('rev-parse', 'HEAD').trim();
  const row = { unit: unit.id, contract: contract.map((v) => `${v.text} (${v.file})`), attempts: [], success: false };
  log(`unit ${unit.id}: ${open.length} finding(s)${contract.length ? `; port contract: ${row.contract.join(', ')}` : ''}${unit.lease ? `; lease: ${unit.lease.join(', ')}` : ''}`);
  if (!open.length && !unit.goal) {
    row.success = true;
    summary.units.push(row);
    return true;
  }

  // Autofix first: ESLint's own fixer on lint findings costs no model call.
  const lintFiles = [...new Set(open.filter((f) => f.anchor === 'gate:Lint' && f.file).map((f) => f.file))];
  if (lintFiles.length) {
    spawnSync(path.join(LIVE, 'node_modules/.bin/eslint'), ['--fix', ...lintFiles], { cwd: SANDBOX, encoding: 'utf8' });
    if (sgit('status', '--porcelain', '-uall').trim()) {
      const after = await sweep(`${unitDir}-autofix`, writeJson(`baseline-${unitDir}-autofix.json`, extendBaseline(baseline, lintFiles, 'HEAD')));
      const remaining = remainingOf(after);
      const introduced = remaining.filter((f) => !open.some((o) => o.key === f.key));
      if (remaining.length < open.length && !introduced.length) {
        sgit('add', '-A');
        sgit('commit', '-q', '-m', `${unit.id} autofix: ${open.length} → ${remaining.length}`);
        log(`autofix: kept (${open.length} → ${remaining.length})`);
        open = remaining;
      } else {
        sgit('reset', '-q', '--hard');
        sgit('clean', '-qfd');
        log('autofix: reverted (no net improvement)');
      }
    }
  }

  let previous = null;
  for (let attempt = 1; attempt <= ATTEMPTS && (open.length || (unit.goal && !row.success)); attempt++) {
    const pre = sgit('rev-parse', 'HEAD').trim();
    const promptFile = path.join(RUN_DIR, `prompt-${unitDir}-${attempt}.md`);
    fs.writeFileSync(promptFile, buildPrompt(unit, open, attempt, previous));
    const work = await runOmp({ cwd: SANDBOX, model: MODEL, thinking: THINKING, tools: 'read,edit,write,grep,glob', promptFile, outFile: path.join(RUN_DIR, `omp-${unitDir}-${attempt}.jsonl`), maxTime: MAX_TIME, sessionDir: path.join(RUN_DIR, 'sessions') });
    // A worker without a shell sometimes "calls" a tool device by writing to its URI (run
    // loop_2026-10-04T08-12-37: files `xd:/bash`, `xd:/mcp__design_mcp_ds_route`). Nothing ran —
    // they are plain files — but they are not source: drop them before judging.
    for (const f of sgit('ls-files', '--others', '--exclude-standard').split('\n').filter((p) => HARNESS_ARTIFACT.test(p))) {
      fs.rmSync(path.join(SANDBOX, f), { force: true });
      log(`  dropped harness artifact ${f}`);
    }
    const changed = sgit('status', '--porcelain', '-uall').split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop());
    sgit('add', '-A');
    const addedLines = sgit('diff', '--cached', '-U0', pre).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    sgit('reset', '-q');
    const tampered = [
      ...changed.filter((f) => FORBIDDEN.some((re) => re.test(f))),
      ...addedLines.filter((l) => SILENCERS.test(l)).map((l) => `silencer: ${l.slice(1).trim().slice(0, 80)}`),
    ];
    const outsideLease = unit.lease ? changed.filter((f) => !unit.lease.includes(f)) : changed.filter((f) => !WORKER_SCOPE.test(f));
    const a = { attempt, before: open.length, after: null, seconds: work.seconds, cost: work.cost, files: changed, verdict: null };
    const revert = () => {
      sgit('reset', '-q', '--hard', pre);
      sgit('clean', '-qfd');
    };
    if (!changed.length) {
      a.status = 'no-change';
      previous = 'Your previous attempt changed no files. The findings above are still present.';
    } else if (tampered.length) {
      revert();
      a.status = 'reverted-tamper';
      previous = `Your previous attempt was reverted in full: it touched forbidden files or silenced a gate (${tampered.join(', ')}).`;
    } else if (outsideLease.length) {
      revert();
      a.status = 'reverted-lease';
      previous = `Your previous attempt was reverted in full: it edited files outside its scope (lease, or src/** without one) (${outsideLease.join(', ')}).`;
    } else {
      const after = await sweep(`${unitDir}-${attempt}`, writeJson(`baseline-${unitDir}-${attempt}.json`, extendBaseline(baseline, changed, pre)));
      const remaining = remainingOf(after);
      a.after = remaining.length;
      const introduced = remaining.filter((f) => !open.some((o) => o.key === f.key));
      const improved = unit.goal ? !remaining.length : remaining.length < open.length && !introduced.length;
      if (!improved) {
        revert();
        a.status = 'revert';
        previous =
          `Your previous attempt was reverted: findings ${a.before} → ${remaining.length}` +
          (introduced.length ? `, and it introduced:\n${introduced.map((f) => `- [${f.anchor} · ${f.rule}] ${f.file ?? ''} ${f.message}`).join('\n')}` : '.');
      } else if (remaining.length) {
        sgit('add', '-A');
        sgit('commit', '-q', '-m', `${unit.id} attempt ${attempt}: ${a.before} → ${remaining.length}`);
        a.status = 'keep';
        open = remaining;
        previous = `Kept: ${a.before} → ${remaining.length} findings. Continue with what remains.`;
      } else {
        // Deterministically green: the verifier may veto, never approve on its own.
        sgit('add', '-A');
        const diff = sgit('diff', '--cached', unitStart);
        sgit('reset', '-q');
        const verdict = VERIFY
          ? await verify({ cwd: SANDBOX, dir: RUN_DIR, label: `${unitDir}-${attempt}`, model: VERIFIER, contracts: [...lawFor(unit.targets), ...(unit.goal ? [{ id: 'goal', statement: unit.goal.slice(0, 4000) }] : [])], findings: unit.targets, diff })
          : { verdict: 'confirm', reasons: [{ about: 'verifier', why: 'skipped (--no-verify)' }] };
        a.verdict = verdict.verdict;
        a.verifier = { model: verdict.model ?? null, reasons: verdict.reasons, seconds: verdict.seconds ?? 0, cost: verdict.cost ?? 0 };
        if (verdict.verdict === 'confirm') {
          sgit('add', '-A');
          sgit('commit', '-q', '-m', `${unit.id} attempt ${attempt}: green, verified`);
          a.status = 'keep-green-verified';
          open = [];
          row.success = true;
        } else {
          revert();
          a.status = verdict.verdict === 'refute' ? 'refuted' : 'unverified';
          previous = `The deterministic checks passed, but the verifier ${verdict.verdict === 'refute' ? 'REFUTED' : 'could not verify'} your change:\n${verdict.reasons.map((r) => `- [${r.about}] ${r.why}`).join('\n')}\nFix what it found; do not argue with it.`;
        }
      }
    }
    row.attempts.push(a);
    fs.appendFileSync(
      path.join(RUN_DIR, 'attempts.tsv'),
      [unit.id, attempt, a.status, a.before, a.after ?? '', a.seconds, a.verdict ?? '', a.files.join(' '), `$${(a.cost + (a.verifier?.cost ?? 0)).toFixed(4)}`].join('\t') + '\n',
    );
    log(`  attempt ${attempt}: ${a.status} (${a.before} → ${a.after ?? '—'}) ${a.seconds}s${a.verdict ? ` · verifier ${a.verdict}` : ''} · files: ${a.files.join(', ') || 'none'}`);
  }
  summary.units.push(row);
  return row.success;
}

// ── Main ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(RUN_DIR, 'attempts.tsv'), 'unit\tattempt\tstatus\tbefore\tafter\tseconds\tverdict\tfiles\tcost\n');
log(`run ${RUN_ID} · mode ${MODE}${DEBT ? ` ${DEBT}` : ''}${GOAL ? ` ${GOAL}` : ''} · writer ${MODEL} · verifier ${VERIFY ? VERIFIER : 'off'} · sandbox ${SANDBOX}`);
log(`sandbox: ${buildSandbox()} files copied`);
const summary = { runId: RUN_ID, mode: MODE, selector: DEBT ?? GOAL ?? null, writer: MODEL, verifier: VERIFY ? VERIFIER : null, units: [], success: false };

let baseline;
let units = [];
let start;
if (MODE === 'regressions') {
  const latest = JSON.parse(fs.readFileSync(path.join(LIVE, '.garisek/spec-sweep/latest.json'), 'utf8'));
  const keptFile = path.join(LIVE, '.garisek/spec-sweep/last-kept.json');
  baseline = JSON.parse(fs.readFileSync(fs.existsSync(keptFile) ? keptFile : latest.receipt, 'utf8'));
  start = await sweep('start', writeJson('baseline-start.json', baseline));
  units = [{ id: 'regressions', targets: newFindings(start, baseline), lease: null, port: true }];
} else {
  baseline = await sweep('seed', null);
  start = baseline;
  if (MODE === 'plant') {
    const planted = plant();
    log(`planted ${MUTANTS.length} mutant(s) touching ${planted.join(', ')}`);
    baseline = extendBaseline(baseline, planted, 'HEAD~1');
    start = await sweep('start', writeJson('baseline-start.json', baseline));
    summary.killCheck = killCheck(start);
    for (const k of summary.killCheck) log(`kill check ${k.id}: ${k.killed ? 'caught' : 'MISSED'} ${JSON.stringify(k.expectations.map((e) => `${e.anchor}/${e.rule}:${e.caught}`))}`);
    units = [{ id: 'planted', targets: newFindings(start, baseline), lease: null, port: true }];
  } else if (MODE === 'debt') {
    units = debtUnits(baseline, DEBT).slice(0, UNITS);
    log(`debt ${DEBT}: ${units.length} unit(s): ${units.map((u) => `${u.id} (${u.targets.length})`).join(', ') || 'none'}`);
  } else {
    units = [{ id: `goal:${path.basename(GOAL)}`, targets: [], lease: null, port: false, goal: fs.readFileSync(path.resolve(LIVE, GOAL), 'utf8').slice(0, 20_000) }];
  }
}

for (const unit of units) {
  const ok = await runUnit(unit, baseline, start, summary);
  if (ok && units.length > 1) start = await sweep(`after-${unit.id.replace(/[^\w.-]+/g, '_').slice(0, 60)}`, writeJson('baseline-next.json', baseline));
}

summary.success = units.length > 0 && summary.units.every((u) => u.success);
const fixBase = sgit('log', '--format=%H', '--grep', PLANT ? '^planted mutants$' : '^baseline:').split('\n')[0].trim();
const patch = sgit('diff', fixBase, 'HEAD');
const patchFile = path.join(RUN_DIR, 'fix.patch');
fs.writeFileSync(patchFile, patch);
writeJson('summary.json', summary);
log(`${summary.success ? 'GREEN + VERIFIED' : 'NOT GREEN'} · ${summary.units.filter((u) => u.success).length}/${units.length} unit(s) · patch ${patchFile} (${patch.split('\n').filter((l) => l.startsWith('diff --git')).length} file(s))`);

if (APPLY && summary.success && !PLANT && patch.trim()) {
  const check = spawnSync('git', ['apply', '--check', patchFile], { cwd: LIVE, encoding: 'utf8' });
  if (check.status !== 0) log(`apply: REFUSED — the shared tree moved under the patch: ${check.stderr.trim().split('\n')[0]}`);
  else {
    sh('git', ['apply', patchFile], { cwd: LIVE });
    log(`apply: landed ${patchFile} on ${LIVE}`);
  }
}
if (!argv.includes('--keep-sandbox') && summary.success) fs.rmSync(SANDBOX, { recursive: true, force: true });
process.exit(summary.success ? 0 : 1);
