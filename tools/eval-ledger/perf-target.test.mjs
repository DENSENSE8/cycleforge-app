#!/usr/bin/env node
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PERF_TARGET,
  analyzeBaselineGaps,
  formatGapReport,
} from "./perf-target.mjs";

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
});
