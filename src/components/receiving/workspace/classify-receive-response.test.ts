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

test('classifyReceiveResponse: LINES_INCOMPLETE is amber remaining, not a network failure', () => {
  const c = classifyReceiveResponse({
    at: Date.now(),
    durationMs: 40,
    httpStatus: 409,
    ok: false,
    body: {
      success: false,
      error: 'LINES_INCOMPLETE',
      blockers: ['SKU-1: 2 remaining'],
    },
  });
  assert.equal(c.verdict, 'lines_incomplete');
  assert.equal(c.tone, 'amber');
  assert.match(c.headline, /Finish line remaining/i);
  assert.match(c.detail, /SKU-1: 2 remaining/);
});

test('classifyReceiveResponse: undecryptable Zoho vault is receive-in-inventory, not reconnect', () => {
  const c = classifyReceiveResponse({
    at: Date.now(),
    durationMs: 80,
    httpStatus: 200,
    ok: true,
    body: {
      success: true,
      zoho: {
        attempted: 1,
        ok: false,
        skip_reason: 'inventory_credentials_unreadable',
        error:
          'integration payload could not be decrypted with INTEGRATION_KMS_KEY — it was encrypted under a different key.',
      },
    },
  });
  assert.equal(c.verdict, 'api_error');
  assert.equal(c.tone, 'rose');
  assert.match(c.headline, /Could not receive in Zoho Inventory/i);
  assert.match(c.detail, /could not be decrypted/i);
});
