import assert from 'node:assert/strict';
import test from 'node:test';
import { signWmsGatewayTicket, verifyWmsGatewayTicket } from './wms-ticket';

test('signs the stable two-part WMS gateway ticket contract', () => {
  const ticket = signWmsGatewayTicket({
    organizationId: '00000000-0000-0000-0000-000000000001' as never,
    staffId: 7,
    deviceId: 'scanner-1',
  }, {
    secret: 'test-secret-with-at-least-thirty-two-characters',
    now: 1_800_000_000,
    ttlSeconds: 30,
    nonce: 'fixed-nonce-1234567890',
  });

  const [payload, signature, extra] = ticket.token.split('.');
  assert.ok(payload);
  assert.ok(signature);
  assert.equal(extra, undefined);
  assert.equal(ticket.expiresAt, '2027-01-15T08:00:30.000Z');
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
  assert.equal(claims.organizationId, '00000000-0000-0000-0000-000000000001');
  assert.equal(claims.staffId, 7);
  assert.equal(claims.deviceId, 'scanner-1');
  const verified = verifyWmsGatewayTicket(ticket.token, {
    secret: 'test-secret-with-at-least-thirty-two-characters',
    now: 1_800_000_001,
  });
  assert.equal(verified.staffId, 7);
  assert.throws(() => verifyWmsGatewayTicket(`${ticket.token}x`, {
    secret: 'test-secret-with-at-least-thirty-two-characters',
    now: 1_800_000_001,
  }));
});
