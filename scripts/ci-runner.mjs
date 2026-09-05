#!/usr/bin/env node
/**
 * Self-hosted CI runner — one worktree per sha, input-hashed gates, a receipt.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §3.1, §3.3 steps
 * 1–4, §4.1. Pure rules live in `scripts/ci/ci-core.mjs` (tripwire:
 * `src/lib/ci/ci-core.test.ts`); this file is the I/O around them.
 *
 *   node scripts/ci-runner.mjs --drain                 # the systemd timer's job
 *
 * Exit code: `--drain` returns 0 unless the RUNNER itself failed (a red gate is
 * a receipt, not a runner error, and a permanently-failed timer unit hides the
 * next real problem). `--sha` returns 1 on a red receipt so a caller can branch.
 *   node scripts/ci-runner.mjs --sha HEAD              # one commit, profile by branch
 *   node scripts/ci-runner.mjs --sha <sha> --profile full [--branch main] [--keep-worktree]
 *
 * ## Why a worktree per run
 *
 * The working tree is shared with concurrent agent sessions — this repo's
 * standing hazard. CI that reads the live tree measures a moving target and
 * reports failures that belong to somebody else. Every gate here runs in
 * `/var/tmp/cycleforge-ci/<sha>`, checked out from the sha, with `.env` copied
 * in (worktrees do not carry gitignored env) and `node_modules` symlinked from
 * the main checkout (an offline `pnpm install` is not possible on this box: the
 * store does not hold the tarballs). The symlink is the one non-hermetic input
 * and is named in the receipt's `toolchain.nodeModules`; the lockfile is still
 * part of every compile gate's hash, so a dependency bump never serves a stale
 * pass — it re-runs against whatever the main tree has installed.
 *
 * ## The cache
 *
 * Before a gate runs, its input hash is computed from `git ls-files -s` over
 * the paths it declares (blob ids — no file reads) plus the toolchain and the
 * gate's own definition. `.ci/cache/<gate>/<hash>.json` present ⇒ `hit`, the
 * cached result is copied into the receipt, nothing runs. Only passes are
 * cached; a failure re-runs on the next commit with identical inputs, which is
 * the observation the flake quarantine (§4.3) reads from `.ci/history/`.
 *
 * ## What a commit never does
 *
 * Wait. The post-commit hook appends one line to `.ci/queue` and returns; the
 * `cycleforge-ci.timer` drains it. Nothing in the commit path runs a gate.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  copyFileSync,
  writeFileSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CI_PATHS,
  buildReceipt,
  detectFlakes,
  gateInputHash,
  gateSlug,
  isFirstRed,
  isQuarantined,
  mergeFlakes,
  parseQueue,
  profileForBranch,
  queueWithout,
  selectAffectedTests,
  summarizeGates,
  formatDuration,
} from './ci/ci-core.mjs';
import { buildGates, gatesForProfile } from './verify-profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKTREES = process.env.CYCLEFORGE_CI_WORKTREES ?? '/var/tmp/cycleforge-ci';
const GARISEK_OS = process.env.GARISEK_OS_ROOT ?? '/home/michaelgarisek/Projects/Garisek-OS';
/** A gate that runs longer than this is a hang, not a slow gate. */
const GATE_TIMEOUT_MS = 45 * 60 * 1000;
/** A lock older than this belongs to a runner that died; break it. */
const STALE_LOCK_MS = 4 * 60 * 60 * 1000;

const abs = (rel) => path.join(ROOT, rel);
const log = (msg) => process.stderr.write(`[ci-runner] ${msg}\n`);

function git(args, cwd = ROOT) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function parseArgs(argv) {
  const out = { drain: false, sha: null, profile: null, branch: null, keepWorktree: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--drain') out.drain = true;
    else if (a === '--sha') out.sha = argv[++i];
    else if (a === '--profile') out.profile = argv[++i];
    else if (a === '--branch') out.branch = argv[++i];
    else if (a === '--keep-worktree') out.keepWorktree = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'usage: ci-runner.mjs --drain | --sha <sha> [--profile fast|full] [--branch <name>] [--keep-worktree]\n',
      );
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!out.drain && !out.sha) throw new Error('need --drain or --sha <sha>');
  if (out.profile && !['fast', 'full'].includes(out.profile)) throw new Error(`bad --profile ${out.profile}`);
  return out;
}

// ─── lock ────────────────────────────────────────────────────────────────────

function acquireLock() {
  const lock = abs(CI_PATHS.lock);
  mkdirSync(abs(CI_PATHS.root), { recursive: true });
  try {
    mkdirSync(lock);
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err;
    const age = Date.now() - statSync(lock).mtimeMs;
    if (age < STALE_LOCK_MS) return false;
    log(`breaking stale lock (${formatDuration(age)} old)`);
    rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock);
  }
  writeFileSync(path.join(lock, 'pid'), `${process.pid}\n`);
  return true;
}

function releaseLock() {
  rmSync(abs(CI_PATHS.lock), { recursive: true, force: true });
}

// ─── toolchain ───────────────────────────────────────────────────────────────

function toolchainInfo() {
  const pnpm = spawnSync('pnpm', ['--version'], { encoding: 'utf8' });
  return {
    node: process.version,
    pnpm: pnpm.status === 0 ? pnpm.stdout.trim() : null,
    platform: process.platform,
    arch: process.arch,
    nodeModules: `symlink:${path.join(ROOT, 'node_modules')}`,
  };
}

// ─── receipts ────────────────────────────────────────────────────────────────

function readReceipts() {
  const dir = abs(CI_PATHS.receipts);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function previousReceiptOnBranch(branch, excludeSha) {
  return readReceipts()
    .filter((r) => r.branch === branch && r.sha !== excludeSha)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))[0] ?? null;
}

// ─── flake quarantine (§4.3) ─────────────────────────────────────────────────

function readFlaky() {
  const file = abs(CI_PATHS.flaky);
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : (data.entries ?? []);
  } catch {
    return [];
  }
}

function readHistory(slug) {
  const file = abs(path.join(CI_PATHS.history, `${slug}.jsonl`));
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Fold this gate's history into `.ci/flaky.json`.
 *
 * Entries are only ever ADDED here. A gate that has stopped flaking is a claim
 * a person makes by clearing the file — the runner has no way to know the
 * difference between "fixed" and "has not flaked yet today".
 */
function recordFlakes(gateName, slug) {
  const found = detectFlakes(gateName, readHistory(slug));
  if (found.length === 0) return;
  const merged = mergeFlakes(readFlaky(), found);
  writeFileSync(abs(CI_PATHS.flaky), `${JSON.stringify(merged, null, 2)}\n`);
}

function notify(title, body) {
  spawnSync('notify-send', ['-a', 'cycleforge-ci', title, body], { stdio: 'ignore' });
}

// ─── one commit ──────────────────────────────────────────────────────────────

function resolveBranch(sha, explicit) {
  if (explicit) return explicit === 'detached' ? null : explicit;
  const names = git(['branch', '--points-at', sha, '--format=%(refname:short)'])
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.includes('main')) return 'main';
  return names[0] ?? null;
}

function makeWorktree(sha) {
  const wt = path.join(WORKTREES, sha);
  mkdirSync(WORKTREES, { recursive: true });
  if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
  git(['worktree', 'add', '--detach', wt, sha]);
  // Hermetic tree, two planted inputs: the main checkout's node_modules and .env.
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(wt, 'node_modules'));
  if (existsSync(abs('.env'))) copyFileSync(abs('.env'), path.join(wt, '.env'));
  return wt;
}

function removeWorktree(wt) {
  spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: ROOT, stdio: 'ignore' });
  rmSync(wt, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
}

/** Untracked files in the worktree minus what the runner planted itself. */
function untrackedIn(wt) {
  return git(['ls-files', '-o', '--exclude-standard'], wt)
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'node_modules' && s !== '.env');
}

/**
 * Files this commit changed, against its first parent. A root commit changes
 * everything, which correctly forces the full run.
 */
function changedFiles(sha, wt) {
  const parent = spawnSync('git', ['rev-parse', '--verify', `${sha}^`], { cwd: wt, encoding: 'utf8' });
  if (parent.status !== 0) return null;
  return git(['diff', '--name-only', `${sha}^`, sha], wt)
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * The union of `impact_analysis` over the changed files — the dependency graph
 * this repo already owns, used for test selection instead of an ML guess
 * (§4.2: at this size the graph is exact and cheap).
 *
 * A file the graph does not know contributes nothing, and the CALLER treats an
 * empty union over real source changes as a stale index and falls back to the
 * full run. Silence and "nothing depends on this" must not look the same.
 */
function impactedFiles(changed) {
  const cg = path.join(GARISEK_OS, 'tools/code-graph/cg.mjs');
  if (!existsSync(cg)) return { files: [], reachable: false };
  const out = new Set();
  let reachable = false;
  for (const file of changed) {
    if (!file.startsWith('src/') || !/\.tsx?$/.test(file)) continue;
    const res = spawnSync(process.execPath, [cg, 'impact', `file:${file}`, '--depth', '3'], {
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (res.status !== 0) continue;
    try {
      const data = JSON.parse(res.stdout);
      if (Array.isArray(data?.files)) {
        reachable = true;
        for (const entry of data.files) if (entry?.file) out.add(entry.file);
      }
    } catch {
      /* a non-JSON answer is a missing index, not an impact of zero */
    }
  }
  return { files: [...out], reachable };
}

/**
 * Turn the `Unit tests` gate into `unit:affected` for a presubmit run.
 *
 * Returns null when the selection cannot be trusted (stale graph) or when the
 * profile already runs everything — the caller then keeps the full gate. The
 * decision lands on the receipt as `selection`, so a run that under-tested can
 * always be told apart from one that had nothing to test.
 */
function affectedUnitGate({ gate, sha, wt }) {
  const changed = changedFiles(sha, wt);
  if (!changed) return { gate: null, selection: 'all (root commit)' };
  const { files: impacted, reachable } = impactedFiles(changed);
  const selection = selectAffectedTests({
    changed,
    impacted: reachable ? impacted : [],
    hasTest: (file) => existsSync(path.join(wt, file)),
  });
  if (selection.stale) return { gate: null, selection: 'all (graph stale)' };
  if (selection.files.length === 0 && !changed.some((f) => f.startsWith('src/'))) {
    return { gate: 'skip', selection: 'none (no source changed)' };
  }
  if (selection.files.length === 0) return { gate: null, selection: 'all (nothing selected)' };
  return {
    gate: {
      ...gate,
      name: 'Unit tests (affected)',
      cmd: 'node',
      args: [
        '--test',
        '--test-concurrency=4',
        '--require',
        './scripts/register-server-only-shim.cjs',
        '--import',
        'tsx',
        '--test-reporter',
        'spec',
        ...selection.files,
      ],
      // Dynamic, and deliberately so: the cache key must cover exactly the
      // tests this run selected, or a later commit with a different selection
      // would hit a pass that never covered it.
      inputs: [...selection.files, 'pnpm-lock.yaml', 'package.json'],
    },
    selection: selection.reason,
  };
}

function runGate({ gate, wt, sha, env }) {
  const slug = gateSlug(gate.name);
  const logDir = abs(path.join(CI_PATHS.logs, sha));
  mkdirSync(logDir, { recursive: true });
  const logPath = path.join(CI_PATHS.logs, sha, `${slug}.log`);
  const started = Date.now();
  const res = spawnSync(gate.cmd, gate.args, {
    cwd: wt,
    env: { ...env, ...(gate.env ?? {}) },
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    timeout: GATE_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - started;
  const header = `$ ${gate.cmd} ${gate.args.join(' ')}\n# cwd ${wt}\n# exit ${res.status ?? 'signal ' + res.signal}${res.error ? ` · ${res.error.message}` : ''} · ${formatDuration(durationMs)}\n\n`;
  writeFileSync(abs(logPath), header + (res.stdout ?? '') + (res.stderr ?? ''));
  const passed = res.status === 0;
  return {
    status: passed ? 'pass' : gate.advisory ? 'advisory-fail' : 'fail',
    durationMs,
    logPath,
  };
}

async function runOne({ sha: rawSha, branch: rawBranch, profile: forcedProfile, keepWorktree }) {
  const sha = git(['rev-parse', '--verify', `${rawSha}^{commit}`]).trim();
  const branch = resolveBranch(sha, rawBranch);
  const profile = forcedProfile ?? process.env.CI_PROFILE ?? profileForBranch(branch);
  const startedAt = new Date().toISOString();
  const toolchain = toolchainInfo();
  log(`${sha.slice(0, 7)} (${branch ?? 'detached'}) · profile ${profile}`);

  const warnings = [];
  let wt = null;
  let untracked = [];
  let selection = null;
  const gates = [];
  const quarantined = [];
  const eslintCacheDir = path.join(WORKTREES, '.eslint-cache', sha);

  try {
    wt = makeWorktree(sha);
    untracked = untrackedIn(wt);
    if (untracked.length) {
      warnings.push(`worktree not hermetic: ${untracked.length} untracked file(s) — ${untracked.slice(0, 5).join(', ')}`);
    }
    const env = {
      ...process.env,
      // The gates' `node` and `#!/usr/bin/env node` shebangs must be THIS node.
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
      TEST_CONCURRENCY: process.env.TEST_CONCURRENCY ?? '4',
      NEXT_TELEMETRY_DISABLED: '1',
      CI_SHA: sha,
    };
    const allGates = buildGates(wt, { eslintCacheDir });
    const list = [...gatesForProfile(profile, allGates)];

    /*
     * Presubmit runs the tests the change can REACH; postsubmit on `main` runs
     * everything (§4.2). Selection buys cost, not correctness — the full run is
     * what covers the fraction the graph misses — so the decision is recorded
     * on the receipt either way, and a stale graph falls back rather than
     * quietly testing less.
     */
    if (profile === 'full') {
      selection = 'all (postsubmit)';
    } else {
      const template = allGates.find((g) => g.name === 'Unit tests');
      const affected = affectedUnitGate({ gate: template, sha, wt });
      selection = affected.selection;
      if (affected.gate && affected.gate !== 'skip') list.push(affected.gate);
      else if (affected.gate === null) list.push(template);
      log(`  unit selection: ${selection}`);
    }

    const flaky = readFlaky();

    for (const gate of list) {
      const slug = gateSlug(gate.name);
      const command = `${path.basename(gate.cmd)} ${gate.args.join(' ')}`;
      const lsFiles = gate.inputs?.length ? git(['ls-files', '-s', '--', ...gate.inputs], wt) : '';
      const inputHash = gateInputHash({ gate, toolchain, lsFiles });
      const cacheFile = inputHash ? abs(path.join(CI_PATHS.cache, slug, `${inputHash}.json`)) : null;

      if (cacheFile && existsSync(cacheFile)) {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
        gates.push({
          gate: gate.name,
          slug,
          inputHash,
          cached: 'hit',
          status: cached.status,
          durationMs: cached.durationMs,
          logPath: cached.logPath,
          from: cached.sha,
          command,
        });
        log(`  ${gate.name}: hit (${cached.sha.slice(0, 7)})`);
        continue;
      }

      log(`  ${gate.name}: running…`);
      const result = runGate({ gate, wt, sha, env });
      // A gate that has already disagreed with itself on THESE inputs is noise,
      // not signal: it reports, it is named on the receipt, and it does not
      // block. Advisory until a human clears `.ci/flaky.json`.
      if (result.status === 'fail' && isQuarantined(flaky, gate.name, inputHash)) {
        result.status = 'advisory-fail';
        quarantined.push({ gate: gate.name, inputHash, reason: 'flaky on identical inputs' });
        log(`  ${gate.name}: FAILED but quarantined (advisory)`);
      }
      gates.push({ gate: gate.name, slug, inputHash, cached: 'ran', ...result, command });
      log(`  ${gate.name}: ${result.status} in ${formatDuration(result.durationMs)}`);

      if (inputHash) {
        mkdirSync(abs(path.join(CI_PATHS.history)), { recursive: true });
        appendFileSync(
          abs(path.join(CI_PATHS.history, `${slug}.jsonl`)),
          `${JSON.stringify({ inputHash, sha, status: result.status, durationMs: result.durationMs, at: new Date().toISOString() })}\n`,
        );
        if (result.status === 'pass') {
          mkdirSync(path.dirname(cacheFile), { recursive: true });
          writeFileSync(
            cacheFile,
            `${JSON.stringify({ gate: gate.name, inputHash, status: result.status, durationMs: result.durationMs, logPath: result.logPath, sha, at: new Date().toISOString() }, null, 2)}\n`,
          );
        }
        // Same inputs, two answers ⇒ flaky. Recorded now so the NEXT run of
        // this gate is advisory rather than blocking.
        recordFlakes(gate.name, slug);
      }
    }
  } catch (err) {
    warnings.push(`runner error: ${err instanceof Error ? err.message : String(err)}`);
    if (gates.length === 0) {
      gates.push({
        gate: 'runner',
        slug: 'runner',
        inputHash: null,
        cached: 'ran',
        status: 'fail',
        durationMs: 0,
        logPath: '',
        command: 'ci-runner.mjs',
      });
    }
  } finally {
    rmSync(eslintCacheDir, { recursive: true, force: true });
    if (wt && !keepWorktree) removeWorktree(wt);
  }

  const receipt = buildReceipt({
    sha,
    branch,
    profile,
    startedAt,
    finishedAt: new Date().toISOString(),
    worktree: wt ?? path.join(WORKTREES, sha),
    toolchain,
    untracked,
    warnings,
    gates,
    selection,
    quarantined,
  });
  mkdirSync(abs(CI_PATHS.receipts), { recursive: true });
  writeFileSync(abs(path.join(CI_PATHS.receipts, `${sha}.json`)), `${JSON.stringify(receipt, null, 2)}\n`);
  log(`${sha.slice(0, 7)} ${receipt.ok ? 'GREEN' : 'RED'} · ${summarizeGates(gates)} · ${formatDuration(receipt.durationMs)}`);

  if (isFirstRed(receipt, previousReceiptOnBranch(branch, sha))) {
    const failing = gates.filter((g) => g.status === 'fail').map((g) => g.gate).join(', ');
    notify(`CI red: ${sha.slice(0, 7)} (${branch ?? 'detached'})`, failing || 'runner error');
  }
  return receipt;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!acquireLock()) {
    log('another runner holds .ci/lock — leaving the queue for it');
    return 0;
  }
  let exit = 0;
  try {
    if (args.drain) {
      const queueFile = abs(CI_PATHS.queue);
      const jobs = existsSync(queueFile) ? parseQueue(readFileSync(queueFile, 'utf8')) : [];
      if (jobs.length === 0) return 0;
      log(`draining ${jobs.length} queued commit(s)`);
      for (const job of jobs) {
        try {
          // A RED receipt is the drain's product, not its failure. Exiting
          // non-zero here marks the systemd unit `failed` forever and buries
          // the next real problem under a permanently-red unit — the receipt
          // is where a gate result belongs. Only a crash below sets `exit`.
          await runOne({ ...job, profile: null, keepWorktree: false });
        } catch (err) {
          log(`job ${job.sha} crashed: ${err instanceof Error ? err.message : err}`);
          exit = 1;
        } finally {
          // Re-read: lines appended while this job ran must survive.
          const now = existsSync(queueFile) ? readFileSync(queueFile, 'utf8') : '';
          writeFileSync(queueFile, queueWithout(now, [job.sha]));
        }
      }
    } else {
      const receipt = await runOne({
        sha: args.sha,
        branch: args.branch,
        profile: args.profile,
        keepWorktree: args.keepWorktree,
      });
      exit = receipt.ok ? 0 : 1;
    }
  } finally {
    releaseLock();
  }
  return exit;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log(err instanceof Error ? err.stack ?? err.message : String(err));
    releaseLock();
    process.exit(2);
  },
);
