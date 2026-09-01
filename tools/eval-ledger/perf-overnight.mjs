#!/usr/bin/env node
/**
 * Overnight Lighthouse-95 Host loop — local Hermes coder, Host decides.
 *
 * Loops until Tier-1 floors meet PERF_TARGET (95 / LCP≤2.5s) OR wall-clock /
 * round caps. One worst gap per round. Never lowers baselines. Never strips
 * Tier-1 density. Cursor stop is NOT this loop (too expensive / cloud-billed).
 *
 * Prerequisites:
 *   1. Prod server: NEXT_DIST_DIR=.next-perf pnpm build && AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
 *   2. export LH_BASE_URL=http://127.0.0.1:3100
 *   3. export LH_COOKIE="$(node scripts/lighthouse-mint-session.mjs)"
 *   4. Hermes coder profile installed (or HERMES_CODER_BIN)
 *
 *   pnpm run eval:perf-overnight -- --dry-run
 *   pnpm run eval:perf-overnight -- --max-hours 10 --max-rounds 40
 *   nohup pnpm run eval:perf-overnight -- --max-hours 12 > /tmp/perf-overnight.log 2>&1 &
 *
 * Honesty: streaming first payload is the main LCP lever. The loop will keep
 * grinding; a single night may not close every Tier-1 gap if the box is busy
 * or Hermes stalls — leave it running or resume; win = analyzeBaselineGaps().ok.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERF_TARGET,
  PERF_REPAIR_LAW,
  analyzeBaselineGaps,
  formatGapReport,
  loadBaseline,
} from "./perf-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOG_DIR = path.join(ROOT, ".cursor");
const LOG_FILE = path.join(LOG_DIR, "perf-overnight.log");
const STATE_FILE = path.join(LOG_DIR, "perf-overnight-state.json");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}
function has(flag) {
  return process.argv.includes(flag);
}

const DRY = has("--dry-run");
const IN_PLACE = has("--in-place") || process.env.PERF_OVERNIGHT_IN_PLACE === "1";
const MAX_HOURS = Number(arg("--max-hours", process.env.PERF_OVERNIGHT_MAX_HOURS || "12"));
const MAX_ROUNDS = Number(arg("--max-rounds", process.env.PERF_OVERNIGHT_MAX_ROUNDS || "48"));
const HOPS_PER_GAP = Number(arg("--hops", process.env.PERF_OVERNIGHT_HOPS || "3"));
const TIER = Number(arg("--tier", "1"));
const ROUTES_FILTER = (arg("--routes", process.env.PERF_OVERNIGHT_ROUTES || "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => (s.startsWith("/") ? s : `/${s}`));
const HERMES =
  process.env.HERMES_CODER_BIN ||
  process.env.HERMES_BIN ||
  "hermes";
const CODER_PROFILE = process.env.HERMES_CODER_PROFILE || "coder";
const WORKTREE_ROOT =
  process.env.LOOP_CODER_WORKTREE_ROOT ||
  path.join(ROOT, ".claude", "worktrees");

function log(line) {
  const row = `[perf-overnight ${new Date().toISOString()}] ${line}`;
  console.error(row);
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_FILE, row + "\n");
}

function pathEnv() {
  const home = process.env.HOME || "";
  return [
    path.join(home, ".npm-global/bin"),
    path.join(home, ".local/share/mise/shims"),
    process.env.PATH || "",
  ].join(path.delimiter);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: "utf8",
    env: { ...process.env, PATH: pathEnv(), ...(opts.env || {}) },
    timeout: opts.timeoutMs ?? 600_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    code: r.status ?? (r.error ? 1 : 0),
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    error: r.error,
  };
}

function saveState(state) {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function pickGap(analysis) {
  let pool = analysis.gaps.filter((g) => g.tier === TIER || ROUTES_FILTER.length > 0);
  if (ROUTES_FILTER.length) {
    pool = analysis.gaps.filter((g) =>
      ROUTES_FILTER.some((r) => g.route === r || g.route.startsWith(r + "/")),
    );
  } else {
    pool = analysis.gaps.filter((g) => g.tier === TIER);
  }
  // Prefer LCP and performance — those move Speed Insights / loading time.
  const ranked = [...pool].sort((a, b) => {
    const rank = (g) => (g.key === "lcpMs" ? 0 : g.key === "performance" ? 1 : 2);
    return rank(a) - rank(b) || b.gap - a.gap;
  });
  return ranked[0] || null;
}

function buildPrompt({ gap, attempt, maxAttempts, gitStatus, lastLog }) {
  return [
    `This is an OVERNIGHT PERF hop — attempt ${attempt} of ${maxAttempts}.`,
    `Repo: cycleforge-app. Goal: Tier-${TIER} Lighthouse / Speed Insights ≥ ${PERF_TARGET.performance}.`,
    "",
    PERF_REPAIR_LAW,
    "",
    "Current worst gap (fix ONLY this — one route, one metric):",
    `- route: ${gap.route}`,
    `- metric: ${gap.key}`,
    `- floor: ${gap.floor}`,
    `- measured: ${gap.measured ?? "(unknown)"}`,
    `- target: ${gap.target}`,
    `- gap: ${gap.gap}`,
    "",
    "Doctrine (LIGHTHOUSE.md): data-heavy workbenches LCP-wait on post-hydration",
    "fetch. Prefer streaming / SSR first payload for this route. Bundle micro-cuts",
    "are secondary. Do not delete columns, density, or Tier-1 UX to inflate a score.",
    "",
    "FORBIDDEN:",
    "- Lowering lighthouse-baseline.json floors / --allow-lower",
    "- Stripping workbench chrome, filters, or Kinetic Ledger density",
    "- @ts-ignore, eslint-disable, deleting tests, editing verify scripts",
    "- git commit / push / new branch / touching .env / killing dev servers",
    "- Creating __ds_smoke_* / design-mcp probe files under src/ (leaves lint+tsc red)",
    "- Leaving typecheck/lint red between hops — machine-gate must stay green",
    "",
    "git status --porcelain:",
    gitStatus.trim() || "(clean)",
    "",
    lastLog ? `--- prior hop / verify ---\n${lastLog.slice(0, 4000)}\n` : "",
    "When done: list files changed and why they should move this metric toward target.",
  ]
    .filter(Boolean)
    .join("\n");
}

function ensureWorktree(name) {
  const abs = path.join(WORKTREE_ROOT, name);
  mkdirSync(WORKTREE_ROOT, { recursive: true });
  if (!existsSync(abs)) {
    const add = run("git", ["worktree", "add", "-b", `perf-overnight-${name}`, abs, "HEAD"]);
    if (add.code !== 0) {
      // branch may exist — try without -b
      const add2 = run("git", ["worktree", "add", abs, "HEAD"]);
      if (add2.code !== 0) {
        throw new Error(`worktree add failed: ${add.stderr || add2.stderr}`);
      }
    }
  }
  // symlink node_modules from main
  const nm = path.join(abs, "node_modules");
  if (!existsSync(nm)) {
    run("ln", ["-sfn", path.join(ROOT, "node_modules"), nm]);
  }
  return abs;
}

function measureRoute(route) {
  if (!process.env.LH_BASE_URL) {
    log("LH_BASE_URL unset — skipping live measure (debt-only round)");
    return { code: 0, skipped: true };
  }
  log(`lighthouse audit ${route} (1 run) + ratchet baseline up`);
  return run(
    "node",
    [
      "scripts/lighthouse-audit.mjs",
      "--routes",
      route,
      "--runs",
      "1",
      "--update-baseline",
      "--ignore-load",
    ],
    { timeoutMs: 600_000 },
  );
}

function machineGate(cwd) {
  return run("node", ["tools/eval-ledger/machine-gate.mjs", "--force"], {
    cwd,
    timeoutMs: 420_000,
    env: {
      ...process.env,
      LOOP_RUN_ID: process.env.LOOP_RUN_ID || `perf-overnight-${Date.now()}`,
      LOOP_PERF: "debt",
      MACHINE_GATE_PERF: "debt",
    },
  });
}

function hermesCoder(worktree, prompt) {
  log(`coder: ${HERMES} -p ${CODER_PROFILE} --in ${worktree}`);
  return run(HERMES, ["-p", CODER_PROFILE, "--in", worktree, "-z", prompt], {
    cwd: worktree,
    timeoutMs: Number(process.env.LOOP_CODER_TIMEOUT_MS || 900_000),
    env: {
      ...process.env,
      HERMES_CODER_WORKTREE: worktree,
      LOOP_RUN_ID: process.env.LOOP_RUN_ID || `perf-overnight`,
    },
  });
}

async function main() {
  log(
    `start dry=${DRY} maxHours=${MAX_HOURS} maxRounds=${MAX_ROUNDS} hops=${HOPS_PER_GAP} tier=${TIER} routes=${ROUTES_FILTER.join(",") || "(all tier)"} targetPerf=${PERF_TARGET.performance}`,
  );

  if (!DRY) {
    const which = run("bash", ["-lc", `command -v ${HERMES} || true`]);
    if (!which.stdout.trim()) {
      console.error(
        `Hermes binary not found (${HERMES}). Install profiles or set HERMES_CODER_BIN. --dry-run still works.`,
      );
      process.exit(2);
    }
  }

  const started = Date.now();
  const deadline = started + MAX_HOURS * 3600_000;
  const wtName = `perf-overnight-${new Date().toISOString().slice(0, 10)}`;
  const worktree = DRY || IN_PLACE ? ROOT : ensureWorktree(wtName);
  log(`worktree=${worktree} inPlace=${IN_PLACE || DRY}`);

  let round = 0;
  let wins = 0;
  /** @type {string[]} */
  const history = [];

  while (round < MAX_ROUNDS && Date.now() < deadline) {
    round += 1;
    const baseline = loadBaseline();
    if (!baseline) {
      log("missing lighthouse-baseline.json — abort");
      process.exit(75);
    }
    const analysis = analyzeBaselineGaps(baseline);
    log(formatGapReport(analysis).split("\n")[1] || "gap report");

    if (analysis.ok && !ROUTES_FILTER.length) {
      log("WIN — Tier-1 floors meet north star 95");
      saveState({ ok: true, round, wins, history, finishedAt: new Date().toISOString() });
      process.exit(0);
    }

    const gap = pickGap(analysis);
    if (!gap) {
      log(ROUTES_FILTER.length ? "WIN — allowlisted routes meet target (or have no baseline gaps)" : "no tier gaps left — win");
      saveState({
        ok: true,
        round,
        wins,
        history,
        routes: ROUTES_FILTER,
        finishedAt: new Date().toISOString(),
      });
      process.exit(0);
    }

    log(`round ${round}/${MAX_ROUNDS}: attack ${gap.route} ${gap.key} gap=${gap.gap}`);
    history.push(`${gap.route}:${gap.key}:${gap.gap}`);
    saveState({
      ok: false,
      round,
      wins,
      current: gap,
      history,
      updatedAt: new Date().toISOString(),
    });

    if (DRY) {
      console.log("--- prompt preview ---\n" + buildPrompt({ gap, attempt: 1, maxAttempts: HOPS_PER_GAP, gitStatus: "", lastLog: "" }).slice(0, 1200));
      log("dry-run: one round only");
      process.exit(0);
    }

    let lastLog = "";
    for (let hop = 1; hop <= HOPS_PER_GAP; hop++) {
      if (Date.now() >= deadline) break;
      const git = run("git", ["status", "--porcelain"], { cwd: worktree, timeoutMs: 15_000 });
      const prompt = buildPrompt({
        gap,
        attempt: hop,
        maxAttempts: HOPS_PER_GAP,
        gitStatus: git.stdout,
        lastLog,
      });
      const coder = hermesCoder(worktree, prompt);
      lastLog = (coder.stdout + "\n" + coder.stderr).slice(0, 8000);
      log(`coder exit=${coder.code}`);

      const gate = machineGate(worktree);
      lastLog += "\n" + (gate.stdout + gate.stderr).slice(0, 4000);
      log(`machine-gate exit=${gate.code}`);
      if (gate.code !== 0 && hop < HOPS_PER_GAP) continue;
      break;
    }

    // Sync worktree changes onto measurement tree: if worktree !== ROOT, we
    // measure from worktree by setting cwd via copying is hard — instead run
    // lighthouse with LH against whatever server serves the built app. Operator
    // should rebuild periodically; we trigger a quick rebuild when hops wrote.
    const dirty = run("git", ["status", "--porcelain"], { cwd: worktree, timeoutMs: 15_000 });
    if (dirty.stdout.trim()) {
      log("changes present — rebuild .next-perf for measure (may take a while)");
      const build = run(
        "bash",
        ["-lc", "NEXT_DIST_DIR=.next-perf pnpm build"],
        { cwd: worktree, timeoutMs: 900_000 },
      );
      log(`build exit=${build.code}`);
      // Server may need restart — operator's long-running next start with
      // NEXT_DIST_DIR=.next-perf will pick up if they use a watcher; otherwise
      // measure still hits old bits. Document restart in log.
      if (build.code === 0) {
        log("NOTE: restart `next start -p 3100` if it does not hot-load .next-perf");
      }
    }

    const measured = measureRoute(gap.route);
    log(`measure exit=${measured.code} skipped=${Boolean(measured.skipped)}`);

    const after = analyzeBaselineGaps(loadBaseline());
    const still = after.gaps.find(
      (g) => g.route === gap.route && g.key === gap.key,
    );
    if (!still || still.gap < gap.gap) {
      wins += 1;
      log(`progress on ${gap.route} ${gap.key}: ${gap.gap} → ${still ? still.gap : 0}`);
    } else {
      log(`no floor improvement yet for ${gap.route} ${gap.key}`);
    }
  }

  const final = analyzeBaselineGaps(loadBaseline());
  saveState({
    ok: final.ok,
    round,
    wins,
    history,
    finishedAt: new Date().toISOString(),
    reason: final.ok ? "target-met" : Date.now() >= deadline ? "deadline" : "max-rounds",
  });
  log(
    final.ok
      ? "WIN — finished with target met"
      : `STOP — ${Date.now() >= deadline ? "deadline" : "max-rounds"}; resume with same command`,
  );
  process.exit(final.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
