import test from 'node:test';
import assert from 'node:assert/strict';
import { getQaScenario, listQaScenarios, QA_SCENARIOS } from './registry';

test('every scenario has a stable id, reset policy, and expected arrays', () => {
  const ids = new Set<string>();
  for (const s of QA_SCENARIOS) {
    assert.equal(ids.has(s.id), false, `duplicate scenario id ${s.id}`);
    ids.add(s.id);
    assert.match(s.id, /^[a-z0-9]+(\.[a-z0-9-]+)+$/);
    assert.ok(s.title.length > 0);
    assert.ok(s.expectedInternalState.length > 0);
    assert.ok(Array.isArray(s.expectedProviderCalls));
    assert.ok(Array.isArray(s.expectedAuditEvents));
    assert.ok(Array.isArray(s.expectedJobs));
  }
});

test('families the brief named are present', () => {
  const ids = QA_SCENARIOS.map((s) => s.id);
  for (const id of [
    'ebay.successful-order-import',
    'ebay.duplicate-order',
    'ebay.expired-token',
    'ebay.provider-rate-limit',
    'zoho.new-purchase-order',
    'zoho.duplicate-webhook',
    'shipping.successful-label-purchase',
    'shipping.duplicate-idempotency-key',
  ]) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
});

test('getQaScenario / listQaScenarios', () => {
  assert.equal(getQaScenario('missing')?.id, undefined);
  assert.equal(getQaScenario('ebay.expired-token')?.family, 'ebay');
  assert.ok(listQaScenarios('ebay').every((s) => s.family === 'ebay'));
});
