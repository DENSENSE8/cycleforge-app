/**
 * withKioskAuth — device-principal resolution + scope denial, DB-free.
 *
 * Uses the injectable `KioskAuthDeps` (the house Deps-injection pattern) so the
 * gate is exercised with a fake device resolver — no Postgres, no cookies
 * plumbing beyond a minimal fake request.
 *
 *   npx tsx --test src/lib/auth/withKioskAuth.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { withKioskAuth, type KioskAuthDeps } from './withKioskAuth';
import type { KioskAuthContext } from './kiosk-context';
import type { ResolvedKioskDevice } from './kiosk-device';

const ORG = '00000000-0000-0000-0000-0000000000aa';

function fakeReq(token?: string): NextRequest {
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/kiosk/intake' },
    cookies: { get: (_name: string) => (token ? { value: token } : undefined) },
  } as unknown as NextRequest;
}

function depsResolving(device: ResolvedKioskDevice | null, calls: string[] = []): KioskAuthDeps {
  return {
    loadDevice: async (token) => {
      calls.push(token ?? '<none>');
      return device;
    },
  };
}

test('resolves a valid device token to a kiosk principal (org read from the row, no staffId)', async () => {
  let seen: KioskAuthContext | null = null;
  const handler = withKioskAuth(
    (_req, ctx) => {
      seen = ctx;
      return new Response('ok', { status: 200 });
    },
    depsResolving({ deviceId: 42, organizationId: ORG, label: 'Front counter iPad' }),
  );

  const res = await handler(fakeReq('device-token-abc'), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  assert.ok(seen, 'handler ran');
  const ctx = seen as unknown as KioskAuthContext;
  assert.equal(ctx.principal, 'kiosk');
  assert.equal(ctx.deviceId, 42);
  // Org comes from the resolved device row — never trusted from the request.
  assert.equal(ctx.organizationId, ORG);
  // A device principal has NO staff identity.
  assert.equal((ctx as Record<string, unknown>).staffId, undefined);
});

test('refuses a request with no device token (401 KIOSK_UNPAIRED, handler never runs)', async () => {
  let ran = false;
  const calls: string[] = [];
  const handler = withKioskAuth(
    () => { ran = true; return new Response('ok'); },
    depsResolving(null, calls),
  );

  const res = await handler(fakeReq(undefined), { params: Promise.resolve({}) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'KIOSK_UNPAIRED' });
  assert.equal(ran, false, 'handler must not run for an unpaired device');
  assert.deepEqual(calls, ['<none>'], 'resolver was asked with no token');
});

test('refuses a revoked / unknown token (resolver returns null → 401, scope denied)', async () => {
  let ran = false;
  const handler = withKioskAuth(
    () => { ran = true; return new Response('ok'); },
    depsResolving(null),
  );

  const res = await handler(fakeReq('revoked-or-unknown'), { params: Promise.resolve({}) });
  assert.equal(res.status, 401);
  assert.equal(ran, false);
});

test('a throwing handler is caught by the error floor (JSON 500, not a bodyless crash)', async () => {
  const handler = withKioskAuth(
    () => { throw new Error('boom'); },
    depsResolving({ deviceId: 7, organizationId: ORG, label: 'Kiosk' }),
  );

  const res = await handler(fakeReq('device-token-xyz'), { params: Promise.resolve({}) });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, 'INTERNAL');
  assert.equal(body.message, 'boom');
});
