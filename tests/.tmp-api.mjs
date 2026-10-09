import { request } from '@playwright/test';
import { BASE_URL, STORAGE } from './auth-preflight.mjs';

const req = await request.newContext({ baseURL: BASE_URL, storageState: STORAGE });
const t = Date.now();
const res = await req.get(`/api/nav/fulfilled?${process.argv[2] ?? ''}`, { timeout: 120_000 });
const body = await res.json();
const ms = Date.now() - t;
const bucket = process.argv[3];
const rows = body.entries.filter((e) => !bucket || e.buckets[0] === bucket);
console.log(res.status(), ms, 'ms', JSON.stringify(body).length, 'bytes', body.entries?.length, 'lines');
console.log(rows.slice(0, 8).map((e) => [e.ref, e.facts?.clock?.since, e.facts?.clock?.due]));
await req.dispose();
