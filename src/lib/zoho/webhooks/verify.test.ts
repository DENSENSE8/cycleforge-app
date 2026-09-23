import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { verifyZohoWebhookSignature } from './verify';

const HEADER = 'x-zoho-webhook-signature';

function sign(body: string, secret: string, encoding: 'hex' | 'base64' = 'hex'): string {
  return createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest(encoding);
}

function headersWith(sig: string): Headers {
  return new Headers({ [HEADER]: sig });
}

test('per-org secret: a correctly signed body verifies', () => {
  const body = '{"event_type":"purchaseorder.created","data":{}}';
  const secret = 'org-a-secret';
  const res = verifyZohoWebhookSignature(body, headersWith(sign(body, secret)), { secret });
  assert.equal(res.ok, true);
});

test('MULTI-TENANT ISOLATION: a body signed with org A secret is rejected under org B secret', () => {
  const body = '{"event_type":"purchaseorder.created","data":{}}';
  const sigFromA = sign(body, 'org-a-secret');
  // Verifier uses org B's secret → must NOT accept org A's signature.
  const res = verifyZohoWebhookSignature(body, headersWith(sigFromA), { secret: 'org-b-secret' });
  assert.equal(res.ok, false);
});

test('tampered body fails even with the right secret', () => {
  const secret = 'org-a-secret';
  const sig = sign('{"amount":1}', secret);
  const res = verifyZohoWebhookSignature('{"amount":9999}', headersWith(sig), { secret });
  assert.equal(res.ok, false);
});

test('missing signature header → fail (not throw)', () => {
  const res = verifyZohoWebhookSignature('{}', new Headers(), { secret: 's' });
  assert.equal(res.ok, false);
});

test('empty per-org secret → fail closed', () => {
  const res = verifyZohoWebhookSignature('{}', headersWith('deadbeef'), { secret: '' });
  assert.equal(res.ok, false);
});
