/**
 * AES-256-GCM roundtrip for the integration vault.
 *
 * Runs with the existing `node --test --import tsx` harness — no extra deps.
 * Uses a fixed key here (deterministic test); production code reads it from
 * INTEGRATION_KMS_KEY.
 */

import { test, before } from 'node:test';
import { strictEqual, throws, ok } from 'node:assert';
import { randomBytes } from 'node:crypto';

// crypto.ts reads INTEGRATION_KMS_KEY lazily inside getKey(), so setting it
// from a `before()` hook is enough — the imports below don't trigger a
// key read.
import {
  encryptIntegrationPayload,
  decryptIntegrationPayload,
  isIntegrationPayloadDecryptError,
  resetIntegrationKeyCacheForTests,
} from './crypto';

before(() => {
  process.env.INTEGRATION_KMS_KEY = randomBytes(32).toString('base64');
});

test('roundtrip preserves arbitrary JSON', () => {
  const original = {
    clientId: 'abc',
    refreshToken: 'rt_' + 'x'.repeat(80),
    nested: { a: 1, b: [1, 2, 3], c: 'tab\there\nthere' },
    bool: true,
    nullish: null,
  };
  const enc = encryptIntegrationPayload(original);
  const dec = decryptIntegrationPayload<typeof original>(enc);
  strictEqual(JSON.stringify(dec), JSON.stringify(original));
});

test('ciphertext differs between calls (random IV)', () => {
  const a = encryptIntegrationPayload({ x: 1 });
  const b = encryptIntegrationPayload({ x: 1 });
  ok(a !== b, 'two encryptions of the same plaintext must differ');
});

test('tampering with ciphertext throws on decrypt', () => {
  const enc = encryptIntegrationPayload({ x: 1 });
  // Flip the last char of the base64 so the underlying ciphertext mutates.
  const tampered = enc.slice(0, -1) + (enc.endsWith('A') ? 'B' : 'A');
  throws(() => decryptIntegrationPayload(tampered));
});

test('rejects malformed envelope', () => {
  throws(() => decryptIntegrationPayload(''));
  throws(() => decryptIntegrationPayload('not-base64!'));
});

/* ── Key rotation (INTEGRATION_KMS_KEY_PREVIOUS) ──────────────────────────
 * Regression cover for 2026-08-21: local dev and Vercel production shared one
 * Neon database with different INTEGRATION_KMS_KEY values, so each environment
 * silently locked the other out of `organization_integrations` on every OAuth
 * token refresh. Accepting retired keys for decryption is what makes changing
 * the key a config edit instead of an outage.
 */
test('a payload written under a retired key still decrypts', () => {
  const oldKey = randomBytes(32).toString('base64');
  const newKey = randomBytes(32).toString('base64');

  process.env.INTEGRATION_KMS_KEY = oldKey;
  delete process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  resetIntegrationKeyCacheForTests();
  const envelope = encryptIntegrationPayload({ refreshToken: 'rt_rotate' });

  // Rotate: new key primary, old key retained for reads.
  process.env.INTEGRATION_KMS_KEY = newKey;
  process.env.INTEGRATION_KMS_KEY_PREVIOUS = oldKey;
  resetIntegrationKeyCacheForTests();

  strictEqual(
    decryptIntegrationPayload<{ refreshToken: string }>(envelope).refreshToken,
    'rt_rotate',
  );
  // And new writes use the NEW key — the old one is read-only.
  process.env.INTEGRATION_KMS_KEY_PREVIOUS = '';
  resetIntegrationKeyCacheForTests();
  strictEqual(
    decryptIntegrationPayload<{ refreshToken: string }>(
      encryptIntegrationPayload({ refreshToken: 'rt_new' }),
    ).refreshToken,
    'rt_new',
  );
});

test('several retired keys are accepted, newest first', () => {
  const k1 = randomBytes(32).toString('base64');
  const k2 = randomBytes(32).toString('base64');
  const k3 = randomBytes(32).toString('base64');

  process.env.INTEGRATION_KMS_KEY = k1;
  delete process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  resetIntegrationKeyCacheForTests();
  const underK1 = encryptIntegrationPayload({ v: 1 });

  process.env.INTEGRATION_KMS_KEY = k2;
  resetIntegrationKeyCacheForTests();
  const underK2 = encryptIntegrationPayload({ v: 2 });

  process.env.INTEGRATION_KMS_KEY = k3;
  process.env.INTEGRATION_KMS_KEY_PREVIOUS = `${k2},${k1}`;
  resetIntegrationKeyCacheForTests();

  strictEqual(decryptIntegrationPayload<{ v: number }>(underK1).v, 1);
  strictEqual(decryptIntegrationPayload<{ v: number }>(underK2).v, 2);
});

test('a malformed previous key is skipped, not fatal', () => {
  const good = randomBytes(32).toString('base64');
  process.env.INTEGRATION_KMS_KEY = good;
  delete process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  resetIntegrationKeyCacheForTests();
  const envelope = encryptIntegrationPayload({ ok: true });

  process.env.INTEGRATION_KMS_KEY_PREVIOUS = 'not-a-valid-key,,zzzz';
  resetIntegrationKeyCacheForTests();
  strictEqual(decryptIntegrationPayload<{ ok: boolean }>(envelope).ok, true);
});

test('a wrong key names the key mismatch, not "unsupported state"', () => {
  process.env.INTEGRATION_KMS_KEY = randomBytes(32).toString('base64');
  delete process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  resetIntegrationKeyCacheForTests();
  const envelope = encryptIntegrationPayload({ secret: 'x' });

  process.env.INTEGRATION_KMS_KEY = randomBytes(32).toString('base64');
  resetIntegrationKeyCacheForTests();
  throws(
    () => decryptIntegrationPayload(envelope),
    /encrypted under a different key/,
    'the error must point at the key, not at the ciphertext',
  );
});

test('isIntegrationPayloadDecryptError matches the KMS mismatch message', () => {
  ok(
    isIntegrationPayloadDecryptError(
      new Error(
        'integration payload could not be decrypted with INTEGRATION_KMS_KEY — it was encrypted under a different key.',
      ),
    ),
  );
  ok(!isIntegrationPayloadDecryptError(new Error('No active Zoho connection for org x')));
});
