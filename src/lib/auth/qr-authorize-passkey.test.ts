/**
 * QR authorize body guards — unsigned Face ID claim must be rejected.
 *
 * Callers: POST /api/auth/qr/authorize uses isUnsignedQrVerifiedClaim.
 * User instruction: authorize requires WebAuthn; drop client verified:true.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnsignedQrVerifiedClaim } from './webauthn-rp';

test('qr authorize: rejects client-claimed verified:true without WebAuthn response', () => {
  assert.equal(
    isUnsignedQrVerifiedClaim({ token: 'x', staffId: 1, verified: true }),
    true,
  );
});

test('qr authorize: accepts body with WebAuthn response even if verified is set', () => {
  assert.equal(
    isUnsignedQrVerifiedClaim({
      token: 'x',
      verified: true,
      response: { id: 'cred', rawId: 'cred', response: {}, type: 'public-key', clientExtensionResults: {} },
    }),
    false,
  );
});

test('qr authorize: token-only (phone session bind) is not an unsigned claim', () => {
  assert.equal(isUnsignedQrVerifiedClaim({ token: 'x' }), false);
});

test('qr authorize: token + response is not an unsigned claim', () => {
  assert.equal(
    isUnsignedQrVerifiedClaim({
      token: 'x',
      response: { id: 'cred', rawId: 'cred', response: {}, type: 'public-key', clientExtensionResults: {} },
    }),
    false,
  );
});

