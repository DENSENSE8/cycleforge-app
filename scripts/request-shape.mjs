#!/usr/bin/env node
/**
 * Request-shape capture — what a route asks the network for, and what that costs.
 *
 * Answers four questions per route, because a "consolidation" that only wins on
 * one of them can lose overall:
 *
 *   1. DEPTH       how many round trips are serially dependent before the page
 *                  is usable (A must resolve before B can start). Worst for LCP.
 *   2. WIDTH       how many requests one mount fires in parallel. HTTP/2
 *                  multiplexes these, so width is cheaper than depth — but each
 *                  is still a server round trip and a client cache entry.
 *   3. REDUNDANCY  the same payload fetched more than once because two features
 *                  grew without coordinating. Usually two React Query keys over
 *                  one endpoint, or a raw fetch beside a perfectly good hook.
 *   4. POLL-vs-PUSH what re-fires on a window-focus regain that a realtime
 *                  channel already covers.
 *
 * ## Measure against a PRODUCTION build. Always.
 *
 * Dev is not merely slower, it reports a DIFFERENT SHAPE: React StrictMode
 * double-invokes effects, so every raw `fetch`-in-`useEffect` appears twice and
 * the redundancy column is fiction. This script detects a dev server and refuses
 * unless you pass --allow-dev.
 *
 *   NEXT_DIST_DIR=.next-perf pnpm build
 *   AUTH_PINLESS_SIGNIN=true NEXT_DIST_DIR=.next-perf npx next start -p 3100
 *   npm run perf:requests -- --route=/unbox --route=/triage
 *
 * Never build or serve from the checkout a `next dev` owns — it holds `.next`.
 * The isolated distDir + port above is the whole reason for those two env vars.
 *
 * ## Output
 *
 * A table on stdout and a JSON artifact per route under
 * `docs/performance/request-shape/`. Re-run after a change and diff the JSON —
 * that is the before/after, and it is the only honest way to claim a win.
 *
 * Numbers are comparable **within one harness config**, not against an ad-hoc
 * DevTools capture. Viewport and settle time decide which components mount, so
 * a 1600x950 / 10s run and a hand-driven capture will disagree on the count and
 * both be right. Same lesson `LIGHTHOUSE.md` teaches about `formFactor`: change
 * the profile and the baseline is void. Keep the flags identical across a
 * before/after pair.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO, 'docs', 'performance', 'request-shape');

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const BASE = flag('base', process.env.RS_BASE_URL || 'http://localhost:3100');
const ROUTES = argv.filter((a) => a.startsWith('--route=')).map((a) => a.slice(8));
const TENANT = flag('tenant', process.env.RS_TENANT_SLUG || 'usav');
const STAFF = flag('staff', process.env.RS_STAFF_NAME || 'Michael');
const SETTLE_MS = Number(flag('settle', '10000'));
const ALLOW_DEV = has('allow-dev');
const SKIP_FOCUS = has('no-focus');

if (ROUTES.length === 0) {
  console.error('Usage: npm run perf:requests -- --route=/unbox [--route=/triage] [--base=http://localhost:3100]');
  process.exit(2);
}

/**
 * Two requests are "chained" when the second starts within this window of the
 * first ending — i.e. the second was almost certainly gated on the first. Wide
 * enough to survive a React render between them, narrow enough that two things
 * that merely happen to be slow don't get called a chain.
 */
const CHAIN_GAP_MS = 75;

// ── auth ────────────────────────────────────────────────────────────────────
/** Pinless station sign-in — the same flow `lighthouse-mint-session.mjs` uses. */
async function mintSession() {
  const headers = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };
  const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers });
  if (!picker.ok) throw new Error(`staff-picker ${picker.status} — is the server up at ${BASE}?`);
  const body = await picker.json();
  const list = body.staff ?? body.staffList ?? body;
  const staff = Array.isArray(list)
    ? list.find((s) => s.name === STAFF) ?? list[0]
    : null;
  if (!staff?.id) throw new Error(`no staff found (looked for "${STAFF}") — wrong tenant slug?`);

  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }),
  });
  if (!res.ok) {
    throw new Error(
      `signin ${res.status} — is the server running with AUTH_PINLESS_SIGNIN=true?`,
    );
  }
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const sid = cookies.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith('cf_sid='));
  if (!sid) throw new Error('signin succeeded but no cf_sid cookie came back');
  const [name, ...rest] = sid.split('=');
  return { name, value: rest.join('=') };
}

// ── capture ─────────────────────────────────────────────────────────────────
/** Everything the page asked the API for, straight off the Resource Timing buffer. */
const COLLECT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const rows = performance.getEntriesByType('resource')
    .filter((e) => e.name.includes('/api/'))
    .map((e) => ({
      url: e.name.replace(location.origin, ''),
      start: Math.round(e.startTime),
      end: Math.round(e.responseEnd),
      ms: Math.round(e.duration),
      bytes: e.transferSize || e.encodedBodySize || 0,
    }))
    .sort((a, b) => a.start - b.start);
  return {
    url: location.href,
    ttfb: Math.round(nav.responseStart || 0),
    // Dev tells, both verified against this app's dev server AND its live
    // production build: the react-dev-overlay custom element only ever exists
    // in dev, and Turbopack registers HMR update listeners only in dev.
    //   dev  :3050            -> nextjs-portal true,  UPDATE_LISTENERS object
    //   prod app.cycleforge.ai -> nextjs-portal false, UPDATE_LISTENERS undefined
    isDev:
      !!document.querySelector('nextjs-portal')
      || typeof window.TURBOPACK_CHUNK_UPDATE_LISTENERS !== 'undefined',
    rows,
  };
})()`;

/**
 * One blur → focus cycle, then whatever the page re-fetched because of it.
 *
 * TanStack Query v5's focus manager listens for `visibilitychange` on WINDOW,
 * not document, and reads `document.visibilityState`. Both halves are required:
 * dispatching on document alone measures nothing and reads as a clean result.
 */
const focusCycle = (waitMs) => `(async () => {
  const t0 = performance.now();
  const set = (v) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(v === 'hidden' ? 'blur' : 'focus'));
  };
  set('hidden');
  await new Promise((r) => setTimeout(r, 400));
  set('visible');
  await new Promise((r) => setTimeout(r, ${waitMs}));
  const rows = performance.getEntriesByType('resource')
    .filter((e) => e.name.includes('/api/') && e.startTime > t0)
    .map((e) => ({ url: e.name.replace(location.origin, ''), ms: Math.round(e.duration), bytes: e.transferSize || e.encodedBodySize || 0 }));
  return { count: rows.length, bytes: rows.reduce((a, r) => a + r.bytes, 0), rows };
})()`;

// ── classification ──────────────────────────────────────────────────────────
/** Strip cache-buster / id params so `?receivingId=1` and `?receivingId=2` don't merge. */
function endpointOf(url) {
  return url.split('?')[0];
}

function classify(rows) {
  // REDUNDANCY — byte-identical URL, more than once.
  const byUrl = new Map();
  for (const r of rows) byUrl.set(r.url, [...(byUrl.get(r.url) ?? []), r]);
  const duplicates = [...byUrl.entries()]
    .filter(([, hits]) => hits.length > 1)
    .map(([url, hits]) => ({
      url,
      count: hits.length,
      wastedBytes: hits.slice(1).reduce((a, h) => a + h.bytes, 0),
    }))
    .sort((a, b) => b.wastedBytes - a.wastedBytes);

  // REDUNDANCY (softer) — one endpoint, several param shapes. Often two query
  // keys over one payload; sometimes legitimately different data. Judge it.
  const byEndpoint = new Map();
  for (const r of rows) byEndpoint.set(endpointOf(r.url), [...(byEndpoint.get(endpointOf(r.url)) ?? []), r]);
  const multiShape = [...byEndpoint.entries()]
    .filter(([, hits]) => new Set(hits.map((h) => h.url)).size > 1)
    .map(([endpoint, hits]) => ({
      endpoint,
      shapes: [...new Set(hits.map((h) => h.url))],
      totalBytes: hits.reduce((a, h) => a + h.bytes, 0),
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes);

  // DEPTH — B starts just after A ends.
  //
  // This is a HEURISTIC and it cannot prove causation: when a dozen requests
  // finish in the same 75ms, every one of them looks like a parent. So report
  // each B once, paired only with its CLOSEST candidate parent, and treat the
  // output as a shortlist to confirm in code — not as a proven chain.
  const chains = [];
  for (const b of rows) {
    let best = null;
    for (const a of rows) {
      if (a === b || b.start < a.end || b.start - a.end > CHAIN_GAP_MS) continue;
      if (!best || b.start - a.end < b.start - best.end) best = a;
    }
    if (best) chains.push({ from: best.url, to: b.url, gapMs: b.start - best.end, tailEnd: b.end });
  }
  chains.sort((a, b) => b.tailEnd - a.tailEnd);

  // WIDTH — peak concurrent in-flight.
  let peak = 0;
  for (const probe of rows.map((r) => r.start)) {
    const inFlight = rows.filter((r) => r.start <= probe && r.end > probe).length;
    if (inFlight > peak) peak = inFlight;
  }

  // Cheap smells worth a look every time.
  const countProbes = rows.filter(
    (r) => /[?&]limit=1(&|$)/.test(r.url) && !r.url.includes('count_only'),
  );
  const heaviest = [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  const slowest = [...rows].sort((a, b) => b.ms - a.ms).slice(0, 8);

  return { duplicates, multiShape, chains: chains.slice(0, 10), peakConcurrency: peak, countProbes, heaviest, slowest };
}

// ── report ──────────────────────────────────────────────────────────────────
const kb = (b) => `${(b / 1024).toFixed(1)}KB`;
const pad = (s, n) => String(s).slice(0, n).padEnd(n);

function report(route, cap) {
  const { rows } = cap;
  const bytes = rows.reduce((a, r) => a + r.bytes, 0);
  const c = cap.analysis;
  const L = [];
  L.push('');
  L.push(`══ ${route} ${'═'.repeat(Math.max(0, 66 - route.length))}`);
  L.push(`   ${rows.length} API requests · ${kb(bytes)} · TTFB ${cap.ttfb}ms · peak concurrency ${c.peakConcurrency}`);

  if (cap.focus) {
    L.push('');
    L.push('   POLL-vs-PUSH — what a window-focus regain re-fetches');
    L.push(`     cycle 1: ${cap.focus[0].count} req · ${kb(cap.focus[0].bytes)}`);
    L.push(`     cycle 2: ${cap.focus[1].count} req · ${kb(cap.focus[1].bytes)}   <- seconds later; anything here ignores its own staleTime`);
  }

  if (c.duplicates.length) {
    L.push('');
    L.push('   REDUNDANCY — identical URL, more than once');
    for (const d of c.duplicates) L.push(`     ${d.count}x  ${pad(d.url, 72)} wasted ${kb(d.wastedBytes)}`);
  }
  if (c.multiShape.length) {
    L.push('');
    L.push('   REDUNDANCY? — one endpoint, several param shapes (judge each)');
    for (const m of c.multiShape.slice(0, 6)) {
      L.push(`     ${pad(m.endpoint, 56)} ${kb(m.totalBytes)}`);
      for (const s of m.shapes.slice(0, 4)) L.push(`         ${s}`);
    }
  }
  if (c.chains.length) {
    L.push('');
    L.push('   DEPTH? — B started within 75ms of A finishing (candidates — confirm in code,');
    L.push('            co-timing looks identical to causation from out here)');
    for (const ch of c.chains.slice(0, 6)) {
      L.push(`     ${pad(ch.from, 48)}`);
      L.push(`       └→ ${pad(ch.to, 46)} (+${ch.gapMs}ms, tail ends ${ch.tailEnd}ms)`);
    }
  }
  if (c.countProbes.length) {
    L.push('');
    L.push('   COUNT PROBES — `limit=1` with no `count_only`; each still runs the list SQL');
    for (const p of c.countProbes) L.push(`     ${pad(p.url, 72)} ${p.ms}ms ${kb(p.bytes)}`);
  }
  L.push('');
  L.push('   SLOWEST');
  for (const s of c.slowest.slice(0, 5)) L.push(`     ${String(s.ms).padStart(6)}ms  ${kb(s.bytes).padStart(8)}  ${s.url}`);
  L.push('');
  L.push('   HEAVIEST');
  for (const s of c.heaviest.slice(0, 5)) L.push(`     ${kb(s.bytes).padStart(8)}  ${String(s.ms).padStart(6)}ms  ${s.url}`);
  return L.join('\n');
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  // `@playwright/test` is the devDependency this repo actually carries (the e2e
  // suite); it re-exports the same `chromium` driver. Fall back to the bare
  // `playwright` package for checkouts that have it instead.
  let chromium;
  for (const mod of ['@playwright/test', 'playwright']) {
    try {
      ({ chromium } = await import(mod));
      if (chromium) break;
    } catch { /* try the next one */ }
  }
  if (!chromium) {
    console.error('No Playwright driver found. Try: npx playwright install chromium');
    process.exit(1);
  }

  const cookie = await mintSession();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const { hostname } = new URL(BASE);
  await ctx.addCookies([{ ...cookie, domain: hostname, path: '/' }]);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = [];

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);

    const cap = await page.evaluate(COLLECT);
    if (cap.isDev && !ALLOW_DEV) {
      console.error(
        `\n${route} is being served by a DEV build.\n` +
          'React StrictMode double-invokes effects there, so every raw fetch-in-effect\n' +
          'appears twice and the REDUNDANCY column is fiction. Build and serve a\n' +
          'production bundle on an isolated distDir + port (see the header of this\n' +
          'file), or pass --allow-dev if you truly only want the slow-path shape.',
      );
      await browser.close();
      process.exit(1);
    }

    if (!SKIP_FOCUS) {
      cap.focus = [
        await page.evaluate(focusCycle(7000)),
        await page.evaluate(focusCycle(7000)),
      ];
    }
    cap.analysis = classify(cap.rows);
    cap.route = route;
    cap.base = BASE;
    cap.capturedAt = new Date().toISOString();

    console.log(report(route, cap));
    const file = path.join(OUT_DIR, `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}.json`);
    fs.writeFileSync(file, `${JSON.stringify(cap, null, 2)}\n`);
    out.push(path.relative(REPO, file));
    await page.close();
  }

  await browser.close();
  console.log(`\nwrote:\n${out.map((f) => `  ${f}`).join('\n')}`);
  console.log('\nRe-run after a change and diff these files. That diff is the claim.\n');
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
