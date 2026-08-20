import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReceiveResponse } from './classify-receive-response';

test('classifyReceiveResponse: syncTimeoutPending is amber pending, not network', () => {
  const c = classifyReceiveResponse({
    at: Date.now(),
    durationMs: 30_000,
    httpStatus: 0,
    ok: false,
    body: null,
    syncTimeoutPending: true,
  });
  assert.equal(c.verdict, 'sync_pending');
  assert.equal(c.tone, 'amber');
  assert.match(c.headline, /Inventory sync still running/i);
});

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
