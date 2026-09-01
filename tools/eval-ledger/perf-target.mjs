#!/usr/bin/env node
/**
 * Cycle Forge perf north star — Lighthouse + Speed Insights target.
 *
 * Floors live in lighthouse-baseline.json (ratchet: never lower without
 * --allow-lower). The Host always *targets* these numbers; live audits are
 * opt-in (slow). Machine-gate / Hermes repair law cite this module.
 *
 *   node tools/eval-ledger/perf-target.mjs           # print targets + gap
 *   node tools/eval-ledger/perf-target.mjs --json
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASELINE_PATH = path.join(ROOT, "lighthouse-baseline.json");

/** Operator north star (raised 2026-09-01 from 92). */
export const PERF_TARGET = {
  performance: 95,
  accessibility: 95,
  bestPractices: 95,
  /** SEO only on signed-out public routes — private warehouse is Disallow: /. */
  seo: 95,
  lcpMs: 2500,
  tbtMs: 200,
  cls: 0.1,
};

export const PERF_REPAIR_LAW = [
  `North star: Lighthouse Performance / Accessibility / Best-Practices ≥ ${PERF_TARGET.performance} (Speed Insights / CWV aligned); LCP ≤ ${PERF_TARGET.lcpMs}ms.`,
  "Ratchet lighthouse-baseline.json floors upward toward that target — never lower a floor to silence the gate.",
  "Do not strip Tier-1 workbench density or chase Tier-3 Studio scores to inflate a number.",
  "Prefer streaming first payload / cutting LCP over micro-bundle theatre.",
].join(" ");

/**
 * @typedef {{ route: string, tier: number, key: string, floor: number, measured: number | null, target: number, gap: number }} PerfGap
 */

/**
 * @param {unknown} baseline
 * @returns {{ gaps: PerfGap[], tier1BelowTarget: PerfGap[], ok: boolean }}
 */
export function analyzeBaselineGaps(baseline) {
  const routes = baseline?.routes && typeof baseline.routes === "object" ? baseline.routes : {};
  /** @type {PerfGap[]} */
  const gaps = [];
  for (const [route, entry] of Object.entries(routes)) {
    const tier = Number(entry?.tier ?? 0);
    const scenario = entry?.scenario ?? "authenticated";
    const keys =
      scenario === "signed-out"
        ? ["performance", "accessibility", "bestPractices", "seo"]
        : ["performance", "accessibility", "bestPractices"];
    for (const key of keys) {
      const target = PERF_TARGET[key];
      if (typeof target !== "number") continue;
      const floor = entry?.min?.[key];
      if (typeof floor !== "number") continue;
      const measured =
        typeof entry?.measured?.[key] === "number" ? entry.measured[key] : null;
      const gap = Math.max(0, target - floor);
      if (gap > 0) {
        gaps.push({ route, tier, key, floor, measured, target, gap });
      }
    }
    const lcp = entry?.measured?.lcpMs;
    if (typeof lcp === "number" && lcp > PERF_TARGET.lcpMs) {
      gaps.push({
        route,
        tier,
        key: "lcpMs",
        floor: lcp,
        measured: lcp,
        target: PERF_TARGET.lcpMs,
        gap: lcp - PERF_TARGET.lcpMs,
      });
    }
  }
  gaps.sort((a, b) => b.gap - a.gap || a.route.localeCompare(b.route));
  const tier1BelowTarget = gaps.filter((g) => g.tier === 1);
  return { gaps, tier1BelowTarget, ok: tier1BelowTarget.length === 0 };
}

export function loadBaseline(root = ROOT) {
  const p = path.join(root, "lighthouse-baseline.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function formatGapReport(analysis) {
  const lines = [
    `Perf target: Performance/a11y/BP ≥ ${PERF_TARGET.performance}; LCP ≤ ${PERF_TARGET.lcpMs}ms`,
    `Tier-1 gaps to target: ${analysis.tier1BelowTarget.length} (all gaps: ${analysis.gaps.length})`,
  ];
  const show = analysis.tier1BelowTarget.slice(0, 12);
  for (const g of show) {
    const meas = g.measured != null ? ` measured=${g.measured}` : "";
    lines.push(
      `  ${g.route} tier${g.tier} ${g.key}: floor=${g.floor}${meas} → target ${g.target} (gap ${g.gap})`,
    );
  }
  if (analysis.tier1BelowTarget.length > show.length) {
    lines.push(`  …+${analysis.tier1BelowTarget.length - show.length} more`);
  }
  if (analysis.ok) lines.push("Tier-1 floors meet the 95 north star.");
  return lines.join("\n");
}

function main() {
  const asJson = process.argv.includes("--json");
  const baseline = loadBaseline();
  if (!baseline) {
    console.error(`missing ${BASELINE_PATH}`);
    process.exit(75);
  }
  const analysis = analyzeBaselineGaps(baseline);
  if (asJson) {
    console.log(JSON.stringify({ target: PERF_TARGET, ...analysis }, null, 2));
  } else {
    console.log(formatGapReport(analysis));
    console.log(`\n${PERF_REPAIR_LAW}`);
  }
  // Informational — debt to 95 is expected until floors ratchet up.
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
