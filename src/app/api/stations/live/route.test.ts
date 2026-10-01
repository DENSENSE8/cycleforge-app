import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from './route';

const ctx = { params: Promise.resolve({}) };

test('GET refuses an unauthenticated station-feed reader', async () => {
  const response = await GET(new NextRequest('http://localhost:3050/api/stations/live'), ctx);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'UNAUTHENTICATED' });
});
