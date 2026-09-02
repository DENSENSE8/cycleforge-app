import test from 'node:test';
import assert from 'node:assert/strict';
import { createQaTestRunId, sanitizeQaRunMetadata } from './test-runs';

test('QA test-run ids are prefixed UUIDs', () => {
  assert.match(createQaTestRunId(), /^qtr_[0-9a-f-]{36}$/);
});

test('QA metadata keeps only explicitly safe diagnostic fields', () => {
  assert.deepEqual(
    sanitizeQaRunMetadata({
      provider: 'eBay Sandbox',
      durationMs: 412,
      requestCount: 3,
      authorization: 'must-not-persist',
      accessToken: 'must-not-persist',
    }),
    { provider: 'eBay Sandbox', durationMs: 412, requestCount: 3 },
  );
});

test('QA metadata preserves safe connection health status only', () => {
  assert.deepEqual(
    sanitizeQaRunMetadata({ provider: 'zoho', ok: true, connected: false, error: 'secret-token' }),
    { provider: 'zoho', ok: true, connected: false },
  );
});
