import test from 'node:test';
import assert from 'node:assert/strict';
import { QA_SCENARIOS } from './registry';
import {
  QA_SCENARIO_RUNNERS,
  describeScenario,
  playwrightCommand,
  scenariosInSuite,
} from './runners';
import { evaluateReleaseReadiness } from './checklist';
import type { ScenarioRunResult } from './run-types';

test('every registry scenario has a runner and vice versa', () => {
  for (const s of QA_SCENARIOS) {
    assert.ok(QA_SCENARIO_RUNNERS[s.id], `missing runner for ${s.id}`);
  }
  for (const id of Object.keys(QA_SCENARIO_RUNNERS)) {
    assert.ok(QA_SCENARIOS.some((s) => s.id === id), `runner for unknown scenario ${id}`);
  }
});

test('deterministic suite is secret-free and non-empty', () => {
  const ids = scenariosInSuite('deterministic');
  assert.ok(ids.includes('ebay.missing-required-field'));
  assert.ok(ids.includes('zoho.duplicate-webhook'));
  assert.ok(ids.includes('shipping.successful-label-purchase'));
  assert.ok(ids.includes('zoho.changed-line-quantity'));
  assert.ok(ids.includes('zoho.provider-authentic-signature'));
  assert.ok(!ids.includes('ebay.successful-order-import'));
});

test('playwrightCommand is the qa-desktop invocation', () => {
  assert.equal(
    playwrightCommand('tests/e2e/pack-placement.spec.ts', 'qa-desktop'),
    'npx playwright test tests/e2e/pack-placement.spec.ts --project=qa-desktop',
  );
  const described = describeScenario('fixtures.e2e-outbound');
  assert.ok(described?.playwrightCommand?.includes('pack-placement.spec.ts'));
});

test('release checklist fails closed on required failures', () => {
  const base = (id: string, status: ScenarioRunResult['status'], releaseRequired: boolean): ScenarioRunResult => ({
    scenarioId: id,
    title: id,
    status,
    durationMs: 1,
    detail: '',
    errorClass: null,
    runId: 'qa_20260901_aaaaaa',
    suite: 'deterministic',
    releaseRequired,
    playwrightCommand: null,
  });
  const ready = evaluateReleaseReadiness([
    base('ebay.missing-required-field', 'passed', true),
    base('shipping.successful-label-purchase', 'passed', true),
  ]);
  assert.equal(ready.readyForRelease, true);
  const blocked = evaluateReleaseReadiness([
    base('ebay.missing-required-field', 'failed', true),
    base('shipping.successful-label-purchase', 'passed', true),
  ]);
  assert.equal(blocked.readyForRelease, false);
  assert.deepEqual(blocked.missingRequired, ['ebay.missing-required-field']);
});
