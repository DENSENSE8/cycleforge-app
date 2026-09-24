import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReceiveResponse } from './classify-receive-response';

test('classifyReceiveResponse: networkError stays rose', () => {
  const c = classifyReceiveResponse({
    at: Date.now(),
    durationMs: 1200,
    httpStatus: 0,
    ok: false,
    body: null,
    networkError: 'Failed to fetch',
  });
  assert.equal(c.verdict, 'network');
  assert.equal(c.tone, 'rose');
});
