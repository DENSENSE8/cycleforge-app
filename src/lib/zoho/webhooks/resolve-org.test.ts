import test from 'node:test';
import assert from 'node:assert/strict';

import type { OrgId } from '@/lib/tenancy/constants';
import { resolveOrgFromWebhook } from './resolve-org';

const ORG_ID = '00000000-0000-0000-0000-000000000001' as OrgId;

function deps(options: { known?: boolean; secret?: string } = {}) {
  return {
    resolveToken: async () => options.known === false ? null : ORG_ID,
    getCredentials: async () => ({
      clientId: 'client',
      clientSecret: 'client-secret',
      refreshToken: 'refresh',
      orgId: 'zoho-org',
      webhookSecret: options.secret,
    }),
  };
}

test('missing token fails closed without attempting tenant resolution', async () => {
  let called = false;
  const result = await resolveOrgFromWebhook(
    { token: null },
    {
      resolveToken: async () => {
        called = true;
        return ORG_ID;
      },
      getCredentials: async () => null,
    },
  );

  assert.deepEqual(result, { ok: false, status: 401, reason: 'webhook token required' });
  assert.equal(called, false);
});

test('unknown or revoked token returns an opaque not-found result', async () => {
  const result = await resolveOrgFromWebhook({ token: 'unknown' }, deps({ known: false }));
  assert.deepEqual(result, { ok: false, status: 404, reason: 'unknown webhook token' });
});

test('known token without a per-org secret is rejected', async () => {
  const result = await resolveOrgFromWebhook({ token: 'known' }, deps());
  assert.deepEqual(result, {
    ok: false,
    status: 401,
    reason: 'webhook secret not provisioned for org',
  });
});

test('known token resolves only with its organization signing secret', async () => {
  const result = await resolveOrgFromWebhook({ token: 'known' }, deps({ secret: 'org-secret' }));
  assert.deepEqual(result, {
    ok: true,
    orgId: ORG_ID,
    signingSecret: 'org-secret',
    source: 'token',
  });
});
