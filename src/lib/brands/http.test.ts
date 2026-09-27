/** Route-level tests for /api/brands* — zod refusal, org isolation, auth refusal. DB-free. */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { AuthContext } from '@/lib/auth/withAuth';
import type { RecordAuditArgs } from '@/lib/audit-logs';
import {
  handleBrandCreate,
  handleBrandGet,
  handleBrandList,
  handleBrandProducts,
  handleBrandUpdate,
  type BrandHttpDeps,
} from './http';
import { MemBrandDb } from './mem-store.fixture';
import { GET as listRoute, POST as createRoute } from '@/app/api/brands/route';

const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';
const BASE = 'http://localhost:3050';

function ctxFor(orgId: string): AuthContext {
  return {
    organizationId: orgId,
    staffId: 9,
    role: 'admin',
    permissions: new Set(['sku_stock.view', 'sku_stock.manage']),
    user: null,
    session: null,
    markAuditWritten: () => {},
  } as unknown as AuthContext;
}

function harness(db = new MemBrandDb()) {
  const audits: Array<{ orgId: string; args: RecordAuditArgs }> = [];
  const idem = new Map<string, { status_code: number; response_body: Record<string, unknown> }>();
  const deps: BrandHttpDeps = {
    read: (orgId, fn) => fn(db.store(orgId)),
    write: (orgId, fn) => fn(db.store(orgId)),
    audit: async (ctx, _req, args) => {
      audits.push({ orgId: ctx.organizationId, args });
    },
    idempotency: {
      get: async (orgId, key, route) => idem.get(`${orgId}|${key}|${route}`) ?? null,
      save: async (p) => {
        idem.set(`${p.orgId}|${p.idempotencyKey}|${p.route}`, { status_code: p.statusCode, response_body: p.responseBody });
      },
    },
    review: async () => {
      throw new Error('not used');
    },
  };
  return { db, deps, audits };
}

const get = (path: string) => new NextRequest(`${BASE}${path}`);
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`${BASE}${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });

test('zod: a body carrying organizationId is refused — the org only comes from the session', async () => {
  const { db, deps } = harness();
  const res = await handleBrandCreate(send('POST', '/api/brands', { name: 'Bose', organizationId: ORG_B }), ctxFor(ORG_A), deps);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'INVALID_BODY');
  assert.equal(db.writes, 0);
});

test('zod: bad kinds, empty patches, out-of-range limits and non-numeric ids are 400s that touch nothing', async () => {
  const { db, deps } = harness();
  const bose = db.addBrand(ORG_A, { name: 'Bose' });
  const cases = await Promise.all([
    handleBrandCreate(send('POST', '/api/brands', { name: 'X', kind: 'manufacturer' }), ctxFor(ORG_A), deps),
    handleBrandUpdate(send('PATCH', `/api/brands/${bose.id}`, {}), ctxFor(ORG_A), String(bose.id), deps),
    handleBrandUpdate(send('PATCH', `/api/brands/${bose.id}`, { aliasesAdd: 'qc' }), ctxFor(ORG_A), String(bose.id), deps),
    handleBrandList(get('/api/brands?limit=500'), ctxFor(ORG_A), deps),
    handleBrandGet(get('/api/brands/abc'), ctxFor(ORG_A), 'abc', deps),
    handleBrandProducts(get(`/api/brands/${bose.id}/products?status=gone`), ctxFor(ORG_A), String(bose.id), deps),
    handleBrandProducts(get(`/api/brands/${bose.id}/products?cursor=%%%`), ctxFor(ORG_A), String(bose.id), deps),
  ]);
  assert.deepEqual(cases.map((r) => r.status), [400, 400, 400, 400, 400, 400, 400]);
  assert.equal(db.writes, 0);
});

test('org isolation: an org-B brand never resolves for org A (read, update, products, list)', async () => {
  const { db, deps } = harness();
  const foreign = db.addBrand(ORG_B, { name: 'Bose' }, ['boser']);
  const id = String(foreign.id);

  assert.equal((await handleBrandGet(get(`/api/brands/${id}`), ctxFor(ORG_A), id, deps)).status, 404);
  assert.equal((await handleBrandProducts(get(`/api/brands/${id}/products`), ctxFor(ORG_A), id, deps)).status, 404);
  const patch = await handleBrandUpdate(send('PATCH', `/api/brands/${id}`, { name: 'Hijacked' }), ctxFor(ORG_A), id, deps);
  assert.equal(patch.status, 404);
  assert.equal(foreign.name, 'Bose');

  const list = await (await handleBrandList(get('/api/brands?q=bose'), ctxFor(ORG_A), deps)).json();
  assert.deepEqual(list.brands, []);
  // The owning org still sees it.
  assert.equal((await handleBrandGet(get(`/api/brands/${id}`), ctxFor(ORG_B), id, deps)).status, 200);
});

test('create: the same name in two orgs is two brands; within one org an owned alias is a 409 naming the owner', async () => {
  const { db, deps, audits } = harness();
  db.addBrand(ORG_B, { name: 'Bose' });
  const created = await handleBrandCreate(send('POST', '/api/brands', { name: 'Bose', aliases: ['QC'] }), ctxFor(ORG_A), deps);
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.brand.name, 'Bose');
  assert.deepEqual(audits.map((a) => [a.orgId, a.args.action, a.args.entityId]), [[ORG_A, 'brand.create', body.brand.id]]);

  const clash = await handleBrandCreate(send('POST', '/api/brands', { name: 'QC Clone', aliases: ['qc'] }), ctxFor(ORG_A), deps);
  assert.equal(clash.status, 409);
  const err = await clash.json();
  assert.deepEqual(err.collisions.map((c: { normalizedAlias: string; ownerBrandId: number }) => [c.normalizedAlias, c.ownerBrandId]), [['qc', body.brand.id]]);
  assert.equal(audits.length, 1, 'a refused create is not audited');
});

test('create: a retried POST with the same Idempotency-Key replays the 201 instead of colliding', async () => {
  const { db, deps } = harness();
  const req = () => send('POST', '/api/brands', { name: 'JBL' }, { 'idempotency-key': 'k-1' });
  const first = await handleBrandCreate(req(), ctxFor(ORG_A), deps);
  const writes = db.writes;
  const again = await handleBrandCreate(req(), ctxFor(ORG_A), deps);
  assert.equal(first.status, 201);
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), await first.json());
  assert.equal(db.writes, writes);
});

test('update: alias add + remove in one PATCH, audited with the alias diff', async () => {
  const { db, deps, audits } = harness();
  const bose = db.addBrand(ORG_A, { name: 'Bose' }, ['bose corp']);
  const res = await handleBrandUpdate(
    send('PATCH', `/api/brands/${bose.id}`, { aliasesAdd: ['Boser'], aliasesRemove: ['Bose Corp'] }),
    ctxFor(ORG_A),
    String(bose.id),
    deps,
  );
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).aliases.map((a: { normalizedAlias: string }) => a.normalizedAlias).sort(), ['bose', 'boser']);
  assert.deepEqual(audits[0]!.args.extra, { aliasesAdded: ['Boser'], aliasesRemoved: ['bose corp'] });
});

test('auth: without a session the real routes refuse before any handler runs', async () => {
  const list = await listRoute(get('/api/brands?q=bose'), { params: Promise.resolve({}) } as never);
  const create = await createRoute(send('POST', '/api/brands', { name: 'Bose' }), { params: Promise.resolve({}) } as never);
  assert.equal(list.status, 401);
  assert.equal(create.status, 401);
});
