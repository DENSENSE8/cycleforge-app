import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  buildSignedZohoWebhookRequest,
  deliverAuthenticZohoWebhook,
  type AuthenticWebhookDeps,
} from './webhook-authentic';
import { verifyZohoWebhookSignature } from '@/lib/zoho/webhooks/verify';

const ORG = '00000000-0000-0000-0000-000000000002' as const;

interface Captured {
  processed: Array<{ token: string; signature: string; body: string }>;
}

function fakes(opts: {
  token?: string;
  secret?: string;
  raw?: string;
  status?: number;
  body?: unknown;
  identity?: { token: string; secret: string } | null;
} = {}) {
  const cap: Captured = { processed: [] };
  const identity = opts.identity === undefined
    ? { token: opts.token ?? 'tok_abc', secret: opts.secret ?? 'org-secret' }
    : opts.identity;
  const deps: AuthenticWebhookDeps = {
    loadIdentity: async () => identity,
    loadRawBody: async () => opts.raw ?? '{"event_id":"evt-1","event_type":"purchaseorder.updated"}',
    process: async (request, token) => {
      const body = await request.text();
      cap.processed.push({
        token,
        signature: request.headers.get('x-zoho-webhook-signature') ?? '',
        body,
      });
      return { status: opts.status ?? 200, body: opts.body ?? { ok: true, deduped: true, event_id: 'evt-1' } };
    },
  };
  return { deps, cap };
}

test('provider-authentic delivery signs with the org secret and uses the token path', async () => {
  const { deps, cap } = fakes();
  const result = await deliverAuthenticZohoWebhook(ORG, { eventId: 'evt-1' }, deps);
  assert.equal(result.authentic, true);
  assert.equal(result.label, 'Provider-authentic signed delivery');
  assert.equal(result.verified, true);
  assert.equal(result.httpStatus, 200);
  assert.equal(cap.processed.length, 1);
  assert.equal(cap.processed[0]!.token, 'tok_abc');
  const check = verifyZohoWebhookSignature(
    cap.processed[0]!.body,
    new Headers({ 'x-zoho-webhook-signature': cap.processed[0]!.signature }),
    { secret: 'org-secret' },
  );
  assert.equal(check.ok, true);
  assert.match(result.tokenPath, /\/api\/zoho\/webhooks\/tok_ab/);
});

test('signature_mismatch signs with a wrong secret so production verification fails', async () => {
  const { deps, cap } = fakes({ status: 401, body: { ok: false, error: 'signature verification failed' } });
  const result = await deliverAuthenticZohoWebhook(
    ORG,
    { eventId: 'evt-1', expect: 'rejected_signature' },
    deps,
  );
  assert.equal(result.verified, false);
  assert.equal(result.httpStatus, 401);
  const check = verifyZohoWebhookSignature(
    cap.processed[0]!.body,
    new Headers({ 'x-zoho-webhook-signature': cap.processed[0]!.signature }),
    { secret: 'org-secret' },
  );
  assert.equal(check.ok, false);
});

test('missing webhook identity fails closed without calling process', async () => {
  const { deps, cap } = fakes({ identity: null });
  await assert.rejects(
    () => deliverAuthenticZohoWebhook(ORG, { eventId: 'evt-1' }, deps),
    /not provisioned/,
  );
  assert.equal(cap.processed.length, 0);
});

test('mintFreshEventId rewrites event_id so production dedupe will dispatch', async () => {
  const { deps, cap } = fakes({
    raw: '{"event_id":"evt-1","event_type":"purchaseorder.deleted"}',
    body: { ok: true, deduped: false, action: 'po.deleted' },
  });
  const result = await deliverAuthenticZohoWebhook(
    ORG,
    { eventId: 'evt-1', mintFreshEventId: true },
    deps,
  );
  assert.equal(result.httpStatus, 200);
  const sent = JSON.parse(cap.processed[0]!.body) as { event_id: string };
  assert.match(sent.event_id, /^qa-auth-/);
  assert.notEqual(sent.event_id, 'evt-1');
  assert.equal(result.eventId, sent.event_id);
});

test('envelope fixture does not load a stored event', async () => {
  const { deps, cap } = fakes({ body: { ok: true, action: 'po.deleted', skipped: false } });
  const result = await deliverAuthenticZohoWebhook(
    ORG,
    {
      envelope: {
        event_id: 'qa-auth-fixed',
        event_type: 'purchaseorder.deleted',
        data: { purchaseorder: { purchaseorder_id: 'QA-MISSING-PO' } },
      },
    },
    deps,
  );
  assert.equal(result.eventId, 'qa-auth-fixed');
  assert.equal(JSON.parse(cap.processed[0]!.body).event_type, 'purchaseorder.deleted');
});

test('buildSignedZohoWebhookRequest posts the raw body on the token URL', () => {
  const req: NextRequest = buildSignedZohoWebhookRequest({
    token: 'tok',
    rawBody: '{"a":1}',
    signature: 'deadbeef',
  });
  assert.equal(req.method, 'POST');
  assert.match(req.url, /\/api\/zoho\/webhooks\/tok/);
  assert.equal(req.headers.get('x-zoho-webhook-signature'), 'deadbeef');
});
