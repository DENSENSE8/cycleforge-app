#!/usr/bin/env node
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PERF_TARGET,
  analyzeBaselineGaps,
  formatGapReport,
  noProgressDecision,
  roundsFromHistory,
} from "./perf-target.mjs";

/** `.cursor/perf-overnight-state.json` history as it stood after the 2026-09-01 run (48 rounds, max-rounds). */
const HISTORY_2026_09_01 = [
  "/test:performance:15", "/test:performance:15", "/unbox:performance:12",
  "/test:performance:10", "/test:performance:10", "/test:performance:10", "/test:performance:10", "/test:performance:10",
  "/test:performance:9", "/test:performance:9", "/test:performance:9", "/test:performance:9", "/test:performance:9", "/test:performance:9", "/test:performance:9",
  "/settings:performance:7",
  ...Array.from({ length: 32 }, () => "/test:performance:6"),
];

describe("perf-target 95 north star", () => {
  test("targets are 95 / 2.5s LCP", () => {
    assert.equal(PERF_TARGET.performance, 95);
    assert.equal(PERF_TARGET.accessibility, 95);
    assert.equal(PERF_TARGET.bestPractices, 95);
    assert.equal(PERF_TARGET.lcpMs, 2500);
  });

  test("gap analysis ranks Tier-1 shortfalls", () => {
    const { gaps, tier1BelowTarget, ok } = analyzeBaselineGaps({
      routes: {
        "/triage": {
          tier: 1,
          scenario: "authenticated",
          min: { performance: 92, accessibility: 94, bestPractices: 96 },
          measured: { performance: 92, accessibility: 94, bestPractices: 96, lcpMs: 1480 },
        },
        "/studio": {
          tier: 3,
          scenario: "authenticated",
          min: { performance: 40, accessibility: 90, bestPractices: 90 },
          measured: { performance: 40, lcpMs: 9000 },
        },
      },
    });
    assert.equal(ok, false);
    assert.ok(tier1BelowTarget.some((g) => g.route === "/triage" && g.key === "performance" && g.gap === 3));
    assert.ok(gaps.some((g) => g.route === "/studio"));
    assert.match(formatGapReport({ gaps, tier1BelowTarget, ok }), /target 95/);
  });

  test("meeting floors reports ok", () => {
    const analysis = analyzeBaselineGaps({
      routes: {
        "/ok": {
          tier: 1,
          scenario: "authenticated",
          min: { performance: 95, accessibility: 95, bestPractices: 96 },
          measured: { performance: 96, accessibility: 95, bestPractices: 96, lcpMs: 1200 },
        },
      },
    });
    assert.equal(analysis.ok, true);
    assert.equal(analysis.tier1BelowTarget.length, 0);
  });

  test("no-progress exit: three flat rounds stop the loop", () => {
    const flat = [
      { route: "/a", key: "performance", before: 6, after: 6 },
      { route: "/a", key: "performance", before: 6, after: 6 },
      { route: "/a", key: "performance", before: 6, after: 6 },
    ];
    assert.deepEqual(noProgressDecision(flat, 3), { stop: true, round: 3, reason: "no-progress", streak: 3 });
    const recovering = [
      { route: "/a", key: "performance", before: 6, after: 6 },
      { route: "/a", key: "performance", before: 6, after: 6 },
      { route: "/a", key: "performance", before: 6, after: 5 },
      { route: "/a", key: "performance", before: 5, after: null },
    ];
    assert.equal(noProgressDecision(recovering, 3).stop, false);
  });

  test("replay 2026-09-01: 48 rounds would have stopped at round 6 with reason no-progress", () => {
    assert.equal(HISTORY_2026_09_01.length, 48);
    const rounds = roundsFromHistory(HISTORY_2026_09_01);
    // rounds 4–6 attacked /test performance gap=10 with no floor improvement
    // (perf-overnight.log 11:29–11:34); the streak reaches 3 at round 6.
    assert.deepEqual(noProgressDecision(rounds, 3), { stop: true, round: 6, reason: "no-progress", streak: 3 });
    // The 31-round flat tail (rounds 18–48, gap=6) is what the operator saw;
    // any max-no-progress ≤ 31 ends the run inside it at the latest.
    const tailOnly = roundsFromHistory(HISTORY_2026_09_01.slice(16));
    assert.equal(noProgressDecision(tailOnly, 3).round, 3);
  });
});
