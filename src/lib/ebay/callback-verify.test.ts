/** Unit gate for the eBay OAuth callback verifier (node:test, no DOM). */
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  encryptIntegrationPayload,
  resetIntegrationKeyCacheForTests,
} from '@/lib/integrations/crypto';
import {
  connectActorStillMember,
  EBAY_STATE_TTL_MS,
  verifyEbayCallbackState,
} from './callback-verify';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const NONCE = 'a'.repeat(32);

before(() => {
  process.env.INTEGRATION_KMS_KEY = randomBytes(32).toString('base64');
  resetIntegrationKeyCacheForTests();
});

function mintState(overrides: Record<string, unknown> = {}): string {
  return encryptIntegrationPayload({
    organizationId: 'org_1',
    accountName: 'eBay Main',
    environment: 'production',
    role: 'seller',
    createdBy: 42,
    nonce: NONCE,
    issuedAt: NOW - 60_000,
    ...overrides,
  });
}

function verify(stateParam: string, cookieNonce: string | undefined) {
  return verifyEbayCallbackState({ stateParam, cookieNonce, now: NOW });
}

describe('verifyEbayCallbackState', () => {
  test('accepts a fresh, cookie-bound state and surfaces the binding fields', () => {
    const verdict = verify(mintState(), NONCE);
    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.state.organizationId, 'org_1');
    assert.equal(verdict.state.accountName, 'eBay Main');
    assert.equal(verdict.state.createdBy, 42);
    assert.equal(verdict.state.nonce, NONCE);
    assert.equal(verdict.state.role, 'seller');
  });

  test('rejects a tampered state as invalid (AES-GCM integrity)', () => {
    const enc = mintState();
    const tampered = enc.slice(0, -1) + (enc.endsWith('A') ? 'B' : 'A');
    assert.deepEqual(verify(tampered), { ok: false, code: 'ebay_invalid_oauth_state' });
  });

  test('rejects a state missing any binding field as incomplete', () => {
    for (const field of ['organizationId', 'accountName', 'nonce', 'createdBy', 'issuedAt']) {
      const verdict = verify(mintState({ [field]: undefined }), NONCE);
      assert.deepEqual(verdict, { ok: false, code: 'ebay_incomplete_oauth_state' }, field);
    }
  });

  test('rejects a state whose actor binding is not a finite number', () => {
    assert.deepEqual(verify(mintState({ createdBy: '42' }), NONCE), { ok: false, code: 'ebay_incomplete_oauth_state' });
    assert.deepEqual(verify(mintState({ createdBy: null }), NONCE), { ok: false, code: 'ebay_incomplete_oauth_state' });
  });

  test('rejects a state older than the TTL as expired', () => {
    const stale = NOW - EBAY_STATE_TTL_MS - 1;
    assert.deepEqual(verify(mintState({ issuedAt: stale }), NONCE), { ok: false, code: 'ebay_oauth_state_expired' });
    // One second inside the window is still fresh.
    assert.equal(verify(mintState({ issuedAt: NOW - EBAY_STATE_TTL_MS + 1000 }), NONCE).ok, true);
  });

  test('rejects a nonce that does not match the connect cookie (CSRF / replay)', () => {
    assert.deepEqual(verify(mintState(), 'b'.repeat(32)), { ok: false, code: 'ebay_invalid_oauth_state' });
    assert.deepEqual(verify(mintState(), undefined), { ok: false, code: 'ebay_invalid_oauth_state' });
    assert.deepEqual(verify(mintState(), ''), { ok: false, code: 'ebay_invalid_oauth_state' });
  });

  test('a replayed state cannot ride a second nonce-cookie round trip', () => {
    // The callback clears the cookie on every terminal outcome, so a replay
    // arrives with a different (or absent) cookie nonce — both rejected above.
    // This pins the semantics: same state, new cookie, still invalid.
    assert.deepEqual(verify(mintState(), 'c'.repeat(32)), { ok: false, code: 'ebay_invalid_oauth_state' });
  });
});

describe('connectActorStillMember', () => {
  function depsFor(rowCount: number) {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    return {
      calls,
      deps: {
        query: async (sql: string, params: readonly unknown[]) => {
          calls.push({ sql, params });
          return { rowCount };
        },
      },
    };
  }

  test('true when the staff row is still an active member of the org', async () => {
    const { deps, calls } = depsFor(1);
    assert.equal(await connectActorStillMember('org_1', 42, deps), true);
    assert.equal(calls.length, 1);
    // Binding order: staffId then organizationId — the query gates on BOTH.
    assert.deepEqual(calls[0]!.params, [42, 'org_1']);
    assert.match(calls[0]!.sql, /WHERE id = \$1\s+AND organization_id = \$2/);
  });

  test('false when no active staff row matches (removed or deactivated mid-consent)', async () => {
    assert.equal(await connectActorStillMember('org_1', 42, depsFor(0).deps), false);
  });
});
