import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { IdentifyRequestSchema } from '@/lib/identify/schema';
import { GET, POST } from './route';

const ctx = { params: Promise.resolve({}) };

test('GET refuses a caller with no session', async () => {
  const res = await GET(new NextRequest('http://localhost:3050/api/identify?q=R-1'), ctx);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHENTICATED' });
});

test('POST refuses a caller with no session before reading the body', async () => {
  const res = await POST(
    new NextRequest('http://localhost:3050/api/identify', { method: 'POST', body: JSON.stringify({ q: 'R-1' }) }),
    ctx,
  );
  assert.equal(res.status, 401);
});

test('the request takes a non-blank paste, a nav context id and a bounded limit — nothing else', () => {
  assert.equal(IdentifyRequestSchema.safeParse({ q: 'R-1\nbose 700', context: 'outbound.exceptions', limit: '5' }).success, true);
  assert.equal(IdentifyRequestSchema.safeParse({ q: 'R-1', context: 'outbound' }).success, true);
  for (const bad of [
    { q: '   \n ' },
    { q: 'x', context: '/shipping/orders' },
    { q: 'x', context: 'a.b.c' },
    { q: 'x', limit: 26 },
    { q: 'x', limit: 0 },
    // orgId never rides the body.
    { q: 'x', orgId: '00000000-0000-0000-0000-000000000001' },
  ]) {
    assert.equal(IdentifyRequestSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});
