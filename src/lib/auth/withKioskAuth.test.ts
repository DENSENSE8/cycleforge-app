/** withKioskAuth — device-principal resolution + scope denial, DB-free. */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withKioskAuth, type KioskAuthDeps } from './withKioskAuth';
import { dogfoodKioskDeviceLabel } from './kiosk-device';

const ORG = '00000000-0000-0000-0000-0000000000aa';

function fakeReq(token?: string, clientId?: string): NextRequest {
  const jar: Record<string, string | undefined> = {
    cf_kiosk: token,
    cf_kiosk_client: clientId,
  };
  return {
    method: 'POST',
    nextUrl: { pathname: '/api/kiosk/intake' },
    cookies: {
      get: (name: string) => (jar[name] ? { value: jar[name] as string } : undefined),
    },
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

test('refuses a tokenless request when no dev autobind is available (issuance failed / not provided)', async () => {
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

test('dev: a tokenless request auto-binds THIS CLIENT\'s dogfood device and pins cf_kiosk', async () => {
  let seen: KioskAuthContext | null = null;
  const calls: string[] = [];
  const boundClientIds: string[] = [];
  const handler = withKioskAuth(
    (_req, ctx) => {
      seen = ctx;
      return NextResponse.json({ ok: true });
    },
    {
      ...depsResolving(null, calls),
      devAutobind: async (clientId) => {
        boundClientIds.push(clientId);
        return {
          device: {
            deviceId: 1,
            organizationId: '00000000-0000-0000-0000-000000000001',
            label: dogfoodKioskDeviceLabel(clientId),
          },
          token: 'issued-dogfood-token',
        };
      },
    },
  );

  const res = await handler(fakeReq(undefined, 'client-aaaaaa'), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  assert.ok(seen, 'handler ran on the auto-bound device');
  assert.equal((seen as unknown as KioskAuthContext).deviceId, 1);
  // The bind is keyed by THIS browser's durable id, so it rotates only this
  // surface's row — production and localhost stop evicting each other.
  assert.deepEqual(boundClientIds, ['client-aaaaaa']);
  assert.equal(
    (seen as unknown as KioskAuthContext).deviceLabel,
    'Dogfood auto-bind · client-aaaaaa',
  );
  // The binding is pinned so the NEXT request arrives already paired.
  // (kiosk-device is server-only; the cookie name is a stable literal here.)
  assert.equal(res.cookies.get('cf_kiosk')?.value, 'issued-dogfood-token');
  assert.equal(res.cookies.get('cf_kiosk_client')?.value, 'client-aaaaaa');
  assert.deepEqual(calls, ['<none>']);
});

test('dev: a client with no id gets one minted and pinned, so it owns its own row next time', async () => {
  const boundClientIds: string[] = [];
  const handler = withKioskAuth(
    () => NextResponse.json({ ok: true }),
    {
      ...depsResolving(null),
      devAutobind: async (clientId) => {
        boundClientIds.push(clientId);
        return {
          device: { deviceId: 2, organizationId: '00000000-0000-0000-0000-000000000001', label: dogfoodKioskDeviceLabel(clientId) },
          token: 'issued-dogfood-token',
        };
      },
    },
  );

  const res = await handler(fakeReq(undefined), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  const minted = res.cookies.get('cf_kiosk_client')?.value;
  assert.ok(minted && minted.length >= 8, 'a client id was minted and pinned');
  assert.deepEqual(boundClientIds, [minted]);
});

test('dev: a junk client cookie is not trusted into a device label', async () => {
  const boundClientIds: string[] = [];
  const handler = withKioskAuth(
    () => NextResponse.json({ ok: true }),
    {
      ...depsResolving(null),
      devAutobind: async (clientId) => {
        boundClientIds.push(clientId);
        return {
          device: { deviceId: 3, organizationId: '00000000-0000-0000-0000-000000000001', label: dogfoodKioskDeviceLabel(clientId) },
          token: 'issued-dogfood-token',
        };
      },
    },
  );

  // 200 chars of label-breaking punctuation: rejected, replaced by a fresh id.
  const junk = `${'x'.repeat(200)} · DROP`;
  const res = await handler(fakeReq(undefined, junk), { params: Promise.resolve({}) });
  assert.equal(res.status, 200);
  assert.equal(boundClientIds.length, 1);
  assert.notEqual(boundClientIds[0], junk);
  assert.ok(
    dogfoodKioskDeviceLabel(boundClientIds[0]!).length <= 120,
    'the label stays inside the kiosk_devices CHECK',
  );
});

test('production: a tokenless request is still refused 401 even with autobind wired', async () => {
  let ran = false;
  const handler = withKioskAuth(
    () => { ran = true; return new Response('ok'); },
    {
      ...depsResolving(null),
      devAutobind: async () => ({
        device: { deviceId: 1, organizationId: '00000000-0000-0000-0000-000000000001', label: 'Dogfood auto-bind' },
        token: 'issued-dogfood-token',
      }),
      isProduction: () => true,
    },
  );

  const res = await handler(fakeReq(undefined), { params: Promise.resolve({}) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'KIOSK_UNPAIRED' });
  assert.equal(ran, false);
});

test('dev: a failed autobind (issuance error) still refuses 401 instead of masking the outage', async () => {
  let ran = false;
  const handler = withKioskAuth(
    () => { ran = true; return new Response('ok'); },
    { ...depsResolving(null), devAutobind: async () => null },
  );

  const res = await handler(fakeReq(undefined), { params: Promise.resolve({}) });
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
