import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenarioSuite } from './run';

test('deterministic suite passes without a provider or QA org', async () => {
  const report = await runScenarioSuite({ suite: 'deterministic', persist: false });
  assert.equal(report.failed, 0, report.results.filter((r) => r.status === 'failed').map((r) => `${r.scenarioId}: ${r.detail}`).join('; '));
  assert.ok(report.passed >= 6, `expected several passes, got ${report.passed}`);
  const missing = report.results.find((r) => r.scenarioId === 'ebay.missing-required-field');
  assert.equal(missing?.status, 'passed');
  const label = report.results.find((r) => r.scenarioId === 'shipping.successful-label-purchase');
  assert.equal(label?.status, 'passed');
  assert.match(label?.detail ?? '', /will not buy live postage/i);
  const dup = report.results.find((r) => r.scenarioId === 'zoho.duplicate-webhook');
  assert.equal(dup?.status, 'passed');
});
