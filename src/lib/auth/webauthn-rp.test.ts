import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStaffWebAuthnHost,
  staffWebAuthnExpectedOrigins,
  staffWebAuthnRpId,
} from './webauthn-rp';

test('staffWebAuthnRpId: uses hostname from env origin', () => {
  assert.equal(staffWebAuthnRpId('https://app.cycleforge.ai'), 'app.cycleforge.ai');
  assert.equal(staffWebAuthnRpId('https://app.cycleforge.ai/'), 'app.cycleforge.ai');
});

test('staffWebAuthnRpId: falls back to default staff app host', () => {
  assert.equal(staffWebAuthnRpId(''), 'app.cycleforge.ai');
  assert.equal(staffWebAuthnRpId(null), 'app.cycleforge.ai');
});

test('isStaffWebAuthnHost: accepts apex and single-label tenant staff hosts', () => {
  const rp = 'app.cycleforge.ai';
  assert.equal(isStaffWebAuthnHost('app.cycleforge.ai', rp), true);
  assert.equal(isStaffWebAuthnHost('usav.app.cycleforge.ai', rp), true);
  assert.equal(isStaffWebAuthnHost('acme-co.app.cycleforge.ai', rp), true);
});

test('isStaffWebAuthnHost: rejects kiosk hosts and multi-label prefixes', () => {
  const rp = 'app.cycleforge.ai';
  assert.equal(isStaffWebAuthnHost('usav.kiosk.app.cycleforge.ai', rp), false);
  assert.equal(isStaffWebAuthnHost('a.b.app.cycleforge.ai', rp), false);
  assert.equal(isStaffWebAuthnHost('evil.com', rp), false);
});

test('isStaffWebAuthnHost: accepts localhost when rpID is localhost', () => {
  assert.equal(isStaffWebAuthnHost('localhost', 'localhost'), true);
  assert.equal(isStaffWebAuthnHost('127.0.0.1', 'localhost'), false);
});

test('staffWebAuthnExpectedOrigins: apex and tenant share parent rpID', () => {
  const env = 'https://app.cycleforge.ai';
  const apex = staffWebAuthnExpectedOrigins({
    requestOrigin: 'https://app.cycleforge.ai',
    envOrigin: env,
  });
  const tenant = staffWebAuthnExpectedOrigins({
    requestOrigin: 'https://usav.app.cycleforge.ai',
    envOrigin: env,
  });
  assert.equal(apex.rpID, 'app.cycleforge.ai');
  assert.equal(tenant.rpID, 'app.cycleforge.ai');
  assert.ok(apex.expectedOrigins.includes('https://app.cycleforge.ai'));
  assert.ok(tenant.expectedOrigins.includes('https://usav.app.cycleforge.ai'));
  assert.ok(tenant.expectedOrigins.includes('https://app.cycleforge.ai'));
});

test('staffWebAuthnExpectedOrigins: kiosk origin is not a staff WebAuthn origin', () => {
  const kiosk = staffWebAuthnExpectedOrigins({
    requestOrigin: 'https://usav.kiosk.app.cycleforge.ai',
    envOrigin: 'https://app.cycleforge.ai',
  });
  assert.equal(kiosk.rpID, 'app.cycleforge.ai');
  assert.equal(kiosk.expectedOrigins.includes('https://usav.kiosk.app.cycleforge.ai'), false);
  assert.ok(kiosk.expectedOrigins.includes('https://app.cycleforge.ai'));
});
