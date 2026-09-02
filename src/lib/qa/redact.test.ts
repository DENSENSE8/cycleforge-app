import test from 'node:test';
import assert from 'node:assert/strict';
import { isSecretKey, redactRecord, redactValue } from './redact';

test('secret key matcher covers tokens, auth headers, and db urls', () => {
  assert.equal(isSecretKey('accessToken'), true);
  assert.equal(isSecretKey('refresh_token'), true);
  assert.equal(isSecretKey('Authorization'), true);
  assert.equal(isSecretKey('clientSecret'), true);
  assert.equal(isSecretKey('DATABASE_URL'), true);
  assert.equal(isSecretKey('provider'), false);
  assert.equal(isSecretKey('httpStatus'), false);
});

test('redactRecord strips credential fields and keeps operational ones', () => {
  const out = redactRecord({
    provider: 'ebay',
    operation: 'importOrders',
    status: 429,
    accessToken: 'secret-access',
    headers: { Authorization: 'Bearer abc', Accept: 'application/json' },
  });
  assert.equal(out.provider, 'ebay');
  assert.equal(out.status, 429);
  assert.equal(out.accessToken, '[redacted]');
  const headers = out.headers as Record<string, unknown>;
  assert.equal(headers.Authorization, '[redacted]');
  assert.equal(headers.Accept, 'application/json');
});

test('redactValue leaves empty secrets empty', () => {
  const out = redactValue({ refreshToken: '' }) as Record<string, unknown>;
  assert.equal(out.refreshToken, '');
});
