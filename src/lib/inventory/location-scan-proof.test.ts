import assert from 'node:assert/strict';
import test from 'node:test';
import { signLocationScanProof, verifyLocationScanProof } from './location-scan-proof';

const secret = 'test-location-proof-secret-at-least-32-characters';
const identity = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  staffId: 7,
  locationCode: 'c0101100',
};

test('binds a location scan proof to tenant, staff, and canonical location', () => {
  const signed = signLocationScanProof(identity, {
    secret,
    now: 1_800_000_000,
    ttlSeconds: 300,
    nonce: 'fixed-location-nonce-1234',
  });
  const claims = verifyLocationScanProof(signed.token, { ...identity, locationCode: 'C0101100' }, {
    secret,
    now: 1_800_000_100,
  });
  assert.equal(claims.locationCode, 'C0101100');
  assert.throws(() => verifyLocationScanProof(signed.token, { ...identity, staffId: 8 }, { secret, now: 1_800_000_100 }));
  assert.throws(() => verifyLocationScanProof(signed.token, { ...identity, locationCode: 'C0101200' }, { secret, now: 1_800_000_100 }));
});

test('expires a location scan proof', () => {
  const signed = signLocationScanProof(identity, { secret, now: 1_800_000_000, ttlSeconds: 300 });
  assert.throws(
    () => verifyLocationScanProof(signed.token, identity, { secret, now: 1_800_000_301 }),
    /expired/i,
  );
});
