import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQaHealthResponse } from './health';

test('QA health summary keeps only safe connection facts', () => {
  assert.deepEqual(
    summarizeQaHealthResponse('zoho', 200, { success: true, connected: true, token_ok: true }, 412),
    { provider: 'zoho', ok: true, connected: true, httpStatus: 200, durationMs: 412 },
  );
});

test('QA health summary marks an unconnected provider as failed without copying errors', () => {
  assert.deepEqual(
    summarizeQaHealthResponse('ebay', 200, { ok: false, connected: false, error: 'token-value' }, 91),
    { provider: 'ebay', ok: false, connected: false, httpStatus: 200, durationMs: 91 },
  );
});
