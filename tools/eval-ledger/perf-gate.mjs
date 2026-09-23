#!/usr/bin/env node
/**
 * Perf Host gate — Lighthouse baseline gap + optional live ratchet.
 *
 * Modes (MACHINE_GATE_PERF / --mode=):
 *   debt     (default) — print gap to north star 95; exit 0 (never wedges Cursor)
 *   strict   — exit 1 if any Tier-1 category floor is below PERF_TARGET
 *   check    — run `pnpm run lighthouse:check` when LH_BASE_URL set; else debt + warn
 *
 * Cursor stop must NOT default to check/strict (full Lighthouse is minutes).
 * Hermes sets LOOP_PERF=debt|check|strict. Repair law always cites 95.
 *
 *   node tools/eval-ledger/perf-gate.mjs
 *   node tools/eval-ledger/perf-gate.mjs --mode=strict
 *   MACHINE_GATE_PERF=check LH_BASE_URL=http://127.0.0.1:3100 node tools/eval-ledger/perf-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PERF_REPAIR_LAW,
  PERF_TARGET,
  analyzeBaselineGaps,
  formatGapReport,
  loadBaseline,
} from "./perf-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function modeFromArgv() {
  const flag = process.argv.find((a) => a.startsWith("--mode="));
  if (flag) return flag.slice("--mode=".length);
  if (process.argv.includes("--strict")) return "strict";
  if (process.argv.includes("--check")) return "check";
  if (process.argv.includes("--debt")) return "debt";
  const env = (process.env.MACHINE_GATE_PERF || process.env.LOOP_PERF || "debt")
    .trim()
    .toLowerCase();
  if (["debt", "strict", "check", "0", "off", "false"].includes(env)) return env;
  return "debt";
}

function pathEnv() {
  const home = process.env.HOME || "";
  const extras = [
    path.join(home, ".npm-global/bin"),
    path.join(home, ".local/share/mise/shims"),
  ];
  return [...extras, process.env.PATH || ""].join(path.delimiter);
}

function stamp(extra) {
  const dir = path.join(ROOT, ".garisek");
  mkdirSync(dir, { recursive: true });
  const body = {
    ...extra,
    target: PERF_TARGET,
    updatedAt: new Date().toISOString(),
    updatedMs: Date.now(),
  };
  writeFileSync(path.join(dir, "perf-session.json"), `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

function failBrief(detail) {
  const body = `Machine perf gate failed. ${PERF_REPAIR_LAW}\n\n\`\`\`\n${detail.slice(0, 2000)}\n\`\`\`\n`;
  process.stdout.write(body);
  process.exit(1);
}

function main() {
  const mode = modeFromArgv();
  if (mode === "0" || mode === "off" || mode === "false") {
    console.error("[perf-gate] disabled");
    stamp({ ok: null, mode: "off" });
    process.exit(0);
  }

  const baseline = loadBaseline();
  if (!baseline) {
    console.error("[perf-gate] missing lighthouse-baseline.json");
    process.exit(75);
  }

  const analysis = analyzeBaselineGaps(baseline);
  const report = formatGapReport(analysis);
  process.stderr.write(`[perf-gate] mode=${mode}\n${report}\n`);

  if (mode === "debt") {
    stamp({
      ok: true,
      mode: "debt",
      tier1Gaps: analysis.tier1BelowTarget.length,
      gaps: analysis.tier1BelowTarget.slice(0, 20),
    });
    process.stderr.write(`[perf-gate] ${PERF_REPAIR_LAW}\n`);
    process.exit(0);
  }

  if (mode === "strict") {
    stamp({
      ok: analysis.ok,
      mode: "strict",
      tier1Gaps: analysis.tier1BelowTarget.length,
      gaps: analysis.tier1BelowTarget.slice(0, 20),
    });
    if (!analysis.ok) {
      failBrief(report);
    }
    process.stderr.write("[perf-gate] Tier-1 floors meet target 95.\n");
    process.exit(0);
  }

  // check — live ratchet when a production server is advertised
  const base = process.env.LH_BASE_URL;
  if (!base) {
    process.stderr.write(
      "[perf-gate] check skipped — set LH_BASE_URL (and LH_COOKIE) after `pnpm build` + start. Falling back to debt.\n",
    );
    stamp({
      ok: true,
      mode: "check-skipped",
      tier1Gaps: analysis.tier1BelowTarget.length,
      gaps: analysis.tier1BelowTarget.slice(0, 20),
    });
    process.exit(0);
  }

  process.stderr.write(`[perf-gate] lighthouse:check against ${base}\n`);
  const r = spawnSync(
    "pnpm",
    ["run", "lighthouse:check", "--", "--tier", "1", "--runs", "1"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: pathEnv() },
      timeout: 900_000,
    },
  );
  const text = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status !== 0) {
    stamp({ ok: false, mode: "check", exitCode: r.status, tier1Gaps: analysis.tier1BelowTarget.length });
    failBrief(text || report);
  }
  stamp({ ok: true, mode: "check", tier1Gaps: analysis.tier1BelowTarget.length });
  process.stderr.write("[perf-gate] lighthouse:check OK\n");
  process.exit(0);
}

main();
