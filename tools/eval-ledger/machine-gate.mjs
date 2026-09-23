#!/usr/bin/env node
/**
 * Shared Host machine gate — Cursor stop + Hermes LOOP_VERIFY_COMMAND.
 *
 * Exit codes (no LLM grader, never writes the tree):
 *   0   pass
 *   1   machine red (print repair brief on stdout)
 *   124 timeout (Cursor stop fail-opens; Hermes records unmeasured)
 *   75  infra missing (Cursor fail-open; Hermes fail)
 *
 * Always runs verify:fast. Scoped slot-table / eval:station when dirty
 * paths match. Hermes sets
 * LOOP_RUN_ID so a clean worktree still runs verify:fast (no chat dirty-skip).
 *
 *   node tools/eval-ledger/machine-gate.mjs
 *   node tools/eval-ledger/machine-gate.mjs --dry-fail
 *   CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC=280 node tools/eval-ledger/machine-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERF_REPAIR_LAW } from "./perf-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NODE =
  process.env.CODE_GRAPH_NODE ||
  process.env.DESIGN_MCP_NODE ||
  process.execPath;

const args = new Set(process.argv.slice(2));
const DRY_FAIL = args.has("--dry-fail");
const FORCE =
  args.has("--force") ||
  Boolean(process.env.LOOP_RUN_ID) ||
  Boolean(process.env.HERMES_CODER_WORKTREE);

const VERIFY_TIMEOUT_SEC = Number(
  process.env.CYCLEFORGE_EVAL_STOP_TIMEOUT_SEC ||
    process.env.MACHINE_GATE_TIMEOUT_SEC ||
    "280",
);

/** Same contract text Cursor stop and Hermes repair must share. */
export const CYCLEFORGE_REPAIR_LAW = [
  "Make that contract green. Do not change paint.",
  "Do not fold Queue/Viewed/History into the funnel.",
  "Do not delete overlay visibility / zIndex.panel.",
  "Do not invent Operator verdict.",
  "Allowed: fix SLOT_TABLE_ENGINE_CONTRACT / DataTableFilterMenu always-mounted / KEEP rows.",
  "Forbidden: FilterRefinementBar, hunt tiles, screenshot baselines as a resume reason.",
  PERF_REPAIR_LAW,
].join(" ");

const STATION_WORKSPACES = {
  unbox: "src/components/receiving/unbox/UnboxLineWorkspace.tsx",
  triage: "src/components/receiving/triage/TriageLineWorkspace.tsx",
  pack: "src/components/packer/PackOrderWorkspace.tsx",
  testing: "src/components/tech/TestingLineWorkspace.tsx",
  shipping: "src/components/tech/TechRightPane.tsx",
  "scan-out": "src/components/outbound/workspaces/ScanOutWorkspace.tsx",
};

const TABLE_MARKERS = [
  "src/components/tables/",
  "src/lib/tables/",
  "CompoundCells",
  "DataTable",
  "DateRangePickerField",
  "useSlotTableLayout",
  "materialize-tracks",
  "slot-table-cohort",
];

function log(msg) {
  process.stderr.write(`[machine-gate] ${msg}\n`);
}

function pathEnv() {
  const extras = [
    path.join(process.env.HOME || "", ".npm-global/bin"),
    path.join(process.env.HOME || "", ".local/share/mise/shims"),
    path.join(process.env.HOME || "", ".nvm/versions/node/v24.14.1/bin"),
  ];
  return [...extras, process.env.PATH || ""].join(path.delimiter);
}

function porcelainPaths() {
  const r = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, PATH: pathEnv() },
  });
  if (r.error) throw r.error;
  const paths = [];
  for (const line of (r.stdout || "").split("\n")) {
    if (!line.trim()) continue;
    let rest = line.length > 3 ? line.slice(3) : line;
    if (rest.includes(" -> ")) rest = rest.split(" -> ").pop();
    paths.push(rest.trim());
  }
  return paths;
}

function needsSlotTable(paths) {
  return paths.some((p) => TABLE_MARKERS.some((m) => p.includes(m)));
}

function stationIds(paths) {
  return Object.entries(STATION_WORKSPACES)
    .filter(([, ws]) =>
      paths.some((p) => p === ws || p.endsWith("/" + path.basename(ws))),
    )
    .map(([id]) => id);
}

function run(cmd, cmdArgs, timeoutSec = VERIFY_TIMEOUT_SEC) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: timeoutSec * 1000,
    env: { ...process.env, PATH: pathEnv() },
  });
  if (r.error && r.error.code === "ETIMEDOUT") {
    return { code: 124, text: `timeout after ${timeoutSec}s: ${r.error}` };
  }
  if (r.signal === "SIGTERM" && r.status === null) {
    return { code: 124, text: `timeout after ${timeoutSec}s (signal)` };
  }
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  return { code: r.status ?? 1, text };
}

function repairBrief(snapshot, detail) {
  const snap = snapshot || "docs/eval/cohorts/slot-table/snapshots/";
  let body = `Machine eval failed. Stamp .garisek/eval-session.json. Snapshot ${snap}. ${CYCLEFORGE_REPAIR_LAW}`;
  if (detail) {
    let clipped = detail.trim();
    if (clipped.length > 2000) clipped = clipped.slice(0, 2000) + "\n…(truncated)";
    body += `\n\n\`\`\`\n${clipped}\n\`\`\``;
  }
  return body.replaceAll("All checks passed", "(checks failed)");
}

function fail(snapshot, detail) {
  const brief = repairBrief(snapshot, detail);
  process.stdout.write(brief + "\n");
  process.exit(1);
}

/** Hermes / design-mcp sometimes leave `__ds_smoke_*` probes that break tsc/eslint. */
function sweepHermesDebris() {
  const roots = [path.join(ROOT, "src"), path.join(ROOT, "tools")];
  const killed = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next") continue;
        walk(full);
      } else if (ent.name.startsWith("__ds_smoke")) {
        try {
          unlinkSync(full);
          killed.push(path.relative(ROOT, full));
        } catch {
          /* ignore */
        }
      }
    }
  };
  for (const r of roots) {
    if (existsSync(r)) walk(r);
  }
  if (killed.length) log(`swept Hermes debris: ${killed.join(", ")}`);
}

function main() {
  if (DRY_FAIL) {
    log("--dry-fail");
    fail(
      "docs/eval/cohorts/slot-table/snapshots/(dry-run)",
      "DRY FAIL: fixture tripwire for machine-gate / Hermes loop.",
    );
  }

  sweepHermesDebris();

  let dirty = [];
  try {
    dirty = porcelainPaths();
  } catch (e) {
    log(`git status failed (${e}) — infra`);
    process.exit(75);
  }

  if (!FORCE && dirty.length === 0) {
    log("clean tree and not forced — pass");
    process.exit(0);
  }

  log(`verify:fast timeout=${VERIFY_TIMEOUT_SEC}s`);
  const fast = run("pnpm", ["--config.verify-deps-before-run=false", "run", "verify:fast"]);
  if (fast.code === 124) {
    log("verify:fast timed out");
    process.exit(124);
  }
  if (fast.code !== 0) {
    fail(".garisek/eval-session.json", fast.text);
  }

  if (needsSlotTable(dirty) || args.has("--slot-table")) {
    log("eval:cohort slot-table --skip-verify");
    const r = run(NODE, [
      "--import",
      "tsx",
      "tools/eval-ledger/run-cohort-eval.mjs",
      "slot-table",
      "--skip-verify",
    ]);
    if (r.code === 124) process.exit(124);
    if (r.code !== 0) {
      const snapDir = path.join(ROOT, "docs/eval/cohorts/slot-table/snapshots");
      let snap = "docs/eval/cohorts/slot-table/snapshots/";
      if (existsSync(snapDir)) {
        const logs = readdirSync(snapDir)
          .filter((f) => f.endsWith("-tripwire.log"))
          .sort()
          .reverse();
        if (logs[0]) snap = path.join("docs/eval/cohorts/slot-table/snapshots", logs[0]);
      }
      fail(snap, r.text);
    }
  }

  for (const sid of stationIds(dirty)) {
    log(`eval:station ${sid} --skip-verify`);
    const r = run(NODE, [
      "--import",
      "tsx",
      "tools/eval-ledger/run-station-eval.mjs",
      sid,
      "--skip-verify",
    ]);
    if (r.code === 124) process.exit(124);
    if (r.code !== 0) {
      fail(`docs/eval/stations/${sid}/snapshots/`, r.text);
    }
  }

  // Perf north star (95): always emit cheap baseline-gap debt. Live Lighthouse
  // only when MACHINE_GATE_PERF / LOOP_PERF is check|strict (Hermes / CI).
  {
    const raw = (process.env.MACHINE_GATE_PERF || process.env.LOOP_PERF || "debt")
      .trim()
      .toLowerCase();
    const mode =
      raw === "strict" || raw === "check"
        ? raw
        : raw === "off" || raw === "0" || raw === "false"
          ? "off"
          : "debt";
    if (mode !== "off") {
      log(`perf-gate --mode=${mode}`);
      const timeoutSec = mode === "check" ? 900 : 30;
      const perf = run(NODE, ["tools/eval-ledger/perf-gate.mjs", `--mode=${mode}`], timeoutSec);
      if (perf.code === 124) process.exit(124);
      if (perf.code !== 0 && (mode === "strict" || mode === "check")) {
        process.stdout.write(perf.text || "");
        process.exit(1);
      }
    }
  }

  log("pass");
  process.exit(0);
}

main();
