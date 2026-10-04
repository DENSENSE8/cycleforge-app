#!/usr/bin/env node
/**
 * Run every probed contract (tools/spec-loop/contracts.mjs) against one checkout.
 *
 *   node_modules/.bin/tsx <loop>/tools/spec-loop/live-contracts.mjs --repo <checkout> [--live] [--only id,id]
 *
 * Run with cwd = the judged checkout (so `@/…` imports resolve through its tsconfig). Static probes
 * import that checkout's own registries; live probes (only with --live) drive Chromium at the dev
 * origin through the shared auth preflight. Prints one JSON document:
 *   { contracts: [{ id, status: pass|fail|no_data, mode: static|live, violations, ms }] }
 * A probe that throws is `no_data` with the error — never a pass, never a fail.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROBED } from './contracts.mjs';

const argv = process.argv.slice(2);
const opt = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
const REPO = path.resolve(opt('repo') ?? process.cwd());
const LIVE = argv.includes('--live');
const ONLY = opt('only')?.split(',');
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const contracts = PROBED.filter((c) => !ONLY || ONLY.includes(c.id));

const results = [];
async function probe(contract, mode, fn) {
  const started = Date.now();
  try {
    const violations = await fn();
    results.push({ id: contract.id, mode, status: violations.length ? 'fail' : 'pass', violations, ms: Date.now() - started });
  } catch (err) {
    results.push({ id: contract.id, mode, status: 'no_data', violations: [], error: String(err?.message ?? err).split('\n')[0], ms: Date.now() - started });
  }
}

for (const c of contracts) if (c.static) await probe(c, 'static', () => c.static({ repo: REPO, load }));

if (LIVE && contracts.some((c) => c.live)) {
  const { BASE_URL, ensureSession, STORAGE } = await import(pathToFileURL(path.join(REPO, 'tests/auth-preflight.mjs')).href);
  const session = await ensureSession({ baseURL: BASE_URL, storage: STORAGE });
  if (!session.ok) {
    for (const c of contracts.filter((x) => x.live)) results.push({ id: c.id, mode: 'live', status: 'no_data', violations: [], error: `no signed-in session: ${session.error}`, ms: 0 });
  } else {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 430, height: 932 } };
    for (const c of contracts.filter((x) => x.live)) {
      const context = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: viewports[c.live.viewport] });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      await probe(c, 'live', () => c.live.run({ page, load }));
      await context.close();
    }
    await browser.close();
  }
}

process.stdout.write(JSON.stringify({ repo: REPO, live: LIVE, contracts: results }, null, 2) + '\n');
