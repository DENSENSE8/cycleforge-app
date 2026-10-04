#!/usr/bin/env node
/**
 * Live smoke of every LIVE node in the route tree (src/lib/nav/route-tree.ts),
 * at the phone viewport, through the dev origin. Read-only: any inventory write
 * is a failure. The permanent form of the route-tree phase-1 acceptance probes.
 *
 *   node_modules/.bin/tsx tools/design-mcp/route-tree-smoke.mjs [--json]
 *
 * Samples for `[param]` segments are discovered from the pages themselves
 * (stock drill → a location, racks list → a rack, location → a tote / photos).
 * A node with no resolvable sample is `no_data`, never a pass.
 *
 * Per node it checks: HTTP < 400, no sign-in bounce, no page error, no Next
 * error surface, visible links stay inside the node's own subtree (collections),
 * PathChips present on records/collections ≥3 deep (advisory), and a compat
 * node's landing (advisory: phase 2 makes them forward).
 */
import { chromium } from '@playwright/test';
import { ROUTE_TREE, routeAncestry, routeForPath, routeNode } from '../../src/lib/nav/route-tree.ts';
import { BASE_URL, ensureSession, STORAGE } from '../../tests/auth-preflight.mjs';

const JSON_OUT = process.argv.includes('--json');
const WRITE_PATHS = /^\/api\/(locations|handling-units|stock|inventory|bins|racks)(?:\/|$)/;

/** Exit 0 = pass, 1 = a node failed, 2 = the sensor could not run (no_data). */
function emit(result) {
  if (JSON_OUT) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    for (const n of result.nodes) {
      const tail = n.findings.map((f) => `\n    [${f.severity}] ${f.rule}: ${f.message}`).join('');
      process.stdout.write(`${n.status.padEnd(7)} ${n.id.padEnd(18)} ${n.url ?? '—'} (${n.ms} ms)${tail}\n`);
    }
    if (result.noData) process.stdout.write(`route-tree smoke: NO DATA — ${result.error}\n`);
    else process.stdout.write(result.ok ? 'route-tree smoke: all live nodes pass\n' : 'route-tree smoke: FAILED\n');
  }
  process.exit(result.noData ? 2 : result.ok ? 0 : 1);
}

const session = await ensureSession({ baseURL: BASE_URL, storage: STORAGE });
if (!session.ok) emit({ ok: false, noData: true, error: `no signed-in session at ${BASE_URL}: ${session.error}`, nodes: [] });

/** Is `id` inside the subtree of `rootId` (or an ancestor of it)? */
function related(id, rootId) {
  const chain = routeAncestry(id).map((n) => n.id);
  if (chain.includes(rootId)) return true;
  return routeAncestry(rootId).some((n) => n.id === id);
}

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const writes = [];
let pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err).slice(0, 300)));
page.on('request', (request) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
    const p = new URL(request.url()).pathname;
    if (WRITE_PATHS.test(p)) writes.push(`${request.method()} ${p}`);
  }
});

/** Visible same-origin hrefs on the current page (closed menus are hidden). */
async function visibleHrefs() {
  return page.locator('a[href]').evaluateAll((links) =>
    links
      .filter((a) => {
        const r = a.getBoundingClientRect();
        const s = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !a.closest('[aria-hidden="true"],[inert]');
      })
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/')),
  );
}

async function settle(url) {
  pageErrors = [];
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  return res;
}

// ── Walk the stock drill; discover samples for [param] segments ──────────────
// The stock node's note is the law: a drill of EVERY place, empty ones say "Empty" (it read
// "stocked places only" until 2026-10-03). So every level must render something — deeper
// choices, locations, or an explicit empty state. A blank level is the failure.
const samples = { code: null, rack: null, id: null, stockId: null };
const stockFindings = [];
const DRILL_BUDGET = Number(process.env.SMOKE_DRILL_BUDGET || 400);
// Drill depth = how many slice params the URL carries. Generic on purpose: the drill grows
// levels (`?side=left|right` landed 2026-10-03 between aisle and bay) faster than any list here.
const NOT_A_LEVEL = ['q', 'back', 'open', 'page'];
const depthOf = (h) => [...new URLSearchParams(h.split('?')[1] ?? '').keys()].filter((k) => !NOT_A_LEVEL.includes(k)).length;
const codeOf = (h) => decodeURIComponent(h.split(/[?#]/)[0].split('/').pop());
const locationCodes = [];
try {
  const queue = ['/m/stock'];
  const seen = new Set(queue);
  let visits = 0;
  while (queue.length && visits < DRILL_BUDGET) {
    const href = queue.shift();
    visits++;
    await settle(href);
    const here = depthOf(href);
    // The level renders after a client fetch: wait for deeper drill links, location links or the empty state.
    await page
      .waitForFunction(
        ({ depth, skip }) => {
          const root = document.querySelector('[data-testid="mobile-v2-stock"]');
          if (!root) return false;
          const deeper =
            [...root.querySelectorAll('a[href^="/m/stock?"]')].some(
              (a) => [...new URLSearchParams(a.getAttribute('href').split('?')[1] ?? '').keys()].filter((k) => !skip.includes(k)).length > depth,
            ) || root.querySelector('button:not(nav button)');
          return deeper || root.querySelector('a[href^="/m/loc/"]') || /No stock|Empty/i.test(root.textContent ?? '');
        },
        { depth: here, skip: NOT_A_LEVEL },
        { timeout: 20_000 },
      )
      .catch(() => {});
    const hrefs = await visibleHrefs();
    const deeper = hrefs.filter((h) => h.startsWith('/m/stock?') && depthOf(h) > here);
    // Some levels choose with buttons (aisle → `?side=`): press each, keep the URL if it went deeper.
    if (!deeper.length) {
      const choices = await page.locator('[data-testid="mobile-v2-stock"] button:not(nav button)').count();
      for (let i = 0; i < Math.min(choices, 6); i++) {
        const before = page.url();
        await page.locator('[data-testid="mobile-v2-stock"] button:not(nav button)').nth(i).click({ timeout: 5_000 }).catch(() => {});
        await page.waitForURL((u) => u.href !== before, { timeout: 5_000 }).catch(() => {});
        const next = page.url().replace(/^https?:\/\/[^/]+/, '');
        if (next.startsWith('/m/stock?') && depthOf(next) > here) deeper.push(next);
        if (page.url() !== before) await settle(href);
      }
    }
    const locs = hrefs.filter((h) => ['location', 'rack'].includes(routeForPath(h)?.id ?? ''));
    // Prefer a stocked location as the sample: an empty one has no rows to open.
    const stocked = await page
      .locator('a[href^="/m/loc/"]')
      .evaluateAll((links) => links.filter((a) => !/^\s*\S+\s+Empty\b/.test(a.innerText)).map((a) => a.getAttribute('href')));
    for (const l of [...stocked, ...locs]) if (!locationCodes.includes(codeOf(l))) locationCodes.push(codeOf(l));
    const emptyState = await page.locator('[data-testid="mobile-v2-stock"]').filter({ hasText: /No stock|Empty/i }).count();
    if (here > 0 && deeper.length === 0 && locs.length === 0 && emptyState === 0) {
      stockFindings.push({ rule: 'blank-level', severity: 'error', message: `drill level renders nothing — no choices, no locations, no empty state: ${href}` });
    }
    for (const d of deeper) if (!seen.has(d)) (seen.add(d), queue.push(d));
  }
  if (queue.length) stockFindings.push({ rule: 'drill-budget', severity: 'advisory', message: `${queue.length} drill level(s) not visited (budget ${DRILL_BUDGET})` });
  samples.code = locationCodes[0] ?? null;
  await settle('/m/racks');
  const rackHref = (await visibleHrefs()).find((h) => routeForPath(h)?.id === 'location' || routeForPath(h)?.id === 'rack');
  if (rackHref) samples.rack = codeOf(rackHref);
  for (const code of locationCodes.slice(0, 10)) {
    if (samples.id && samples.stockId) break;
    await settle(`/m/loc/${encodeURIComponent(code)}`);
    const hrefs = await visibleHrefs();
    const tote = hrefs.find((h) => routeForPath(h)?.id === 'container');
    if (tote && !samples.id) samples.id = codeOf(tote);
    const photos = hrefs.find((h) => routeForPath(h)?.id === 'stock-photos');
    if (photos && !samples.stockId) samples.stockId = decodeURIComponent(photos.split(/[?#]/)[0].split('/')[3]);
  }
} catch (err) {
  // Discovery failure leaves samples null → those nodes report no_data.
  stockFindings.push({ rule: 'discovery', severity: 'advisory', message: String(err?.message ?? err).split('\n')[0] });
}
// Totes and stock photos open from buttons, not links: read one id each from the DB (SELECT only).
if (!samples.id || !samples.stockId) {
  try {
    await import('dotenv/config');
    const { default: pg } = await import('pg');
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const { rows } = await db.query(
      `SELECT (SELECT id FROM handling_units hu WHERE hu.organization_id = o.id ORDER BY id DESC LIMIT 1) AS tote,
              (SELECT id FROM sku_stock s WHERE s.organization_id = o.id ORDER BY id DESC LIMIT 1) AS stock
         FROM organizations o WHERE o.slug = $1`,
      [process.env.PW_TENANT_SLUG || 'usav'],
    );
    await db.end();
    samples.id ??= rows[0]?.tote != null ? String(rows[0].tote) : null;
    samples.stockId ??= rows[0]?.stock != null ? String(rows[0].stock) : null;
  } catch (err) {
    stockFindings.push({ rule: 'discovery', severity: 'advisory', message: `DB sample read failed: ${String(err?.message ?? err).split('\n')[0]}` });
  }
}
if (process.env.SMOKE_TOTE) samples.id = process.env.SMOKE_TOTE;

/** @param {import('../../src/lib/nav/route-tree.ts').RouteNode} node */
function resolve(node) {
  const value = { location: samples.code, 'location-info': samples.code, rack: samples.rack, container: samples.id, 'stock-photos': samples.stockId }[node.id];
  if (!node.path.includes('[')) return node.path;
  if (!value) return null;
  return node.path.replace(/\[[^\]]+\]/, encodeURIComponent(value));
}

// ── Probe every live node ────────────────────────────────────────────────────
const nodes = [];
for (const node of ROUTE_TREE.filter((n) => n.status === 'live' && n.path)) {
  const started = Date.now();
  const url = resolve(node);
  const findings = [];
  const out = { id: node.id, kind: node.kind, url, status: 'pass', finalUrl: null, landed: null, findings, ms: 0 };
  if (!url) {
    out.status = 'no_data';
    findings.push({ rule: 'no-sample', severity: 'advisory', message: `no sample discovered for ${node.path}` });
    nodes.push(out);
    continue;
  }
  try {
    const res = await settle(url);
    const final = new URL(page.url());
    out.finalUrl = final.pathname + final.search;
    out.landed = routeForPath(final.pathname)?.id ?? null;
    if (final.pathname.includes('/signin')) {
      findings.push({ rule: 'auth', severity: 'error', message: 'saved session bounced to sign-in' });
    }
    if (res && res.status() >= 400) findings.push({ rule: 'http', severity: 'error', message: `HTTP ${res.status()}` });
    const errorSurface = await page
      .locator('text=/Application error|Unhandled Runtime Error|This page could not be found/i')
      .count();
    if (errorSurface > 0) findings.push({ rule: 'error-surface', severity: 'error', message: 'Next error surface rendered' });
    for (const e of pageErrors) findings.push({ rule: 'page-error', severity: 'error', message: e });

    if (node.kind === 'collection') {
      const foreign = new Set();
      for (const h of await visibleHrefs()) {
        const target = routeForPath(h);
        if (target && !related(target.id, node.id)) foreign.add(`${target.id} (${h.split('?')[0]})`);
      }
      for (const f of foreign) findings.push({ rule: 'foreign-door', severity: 'error', message: `list page links outside its subtree: ${f}` });
    }
    if ((node.kind === 'record' || node.kind === 'collection') && routeAncestry(node.id).length >= 3) {
      const chips = await page.locator('nav:has(> ol [aria-current])').count();
      if (chips === 0) findings.push({ rule: 'path-chips', severity: 'advisory', message: 'no PathChips on a node ≥3 deep' });
    }
    if (node.kind === 'compat' && node.forwardsTo && out.landed !== node.forwardsTo) {
      findings.push({
        rule: 'compat-forward',
        severity: 'advisory',
        message: `landed on ${out.landed ?? out.finalUrl}, tree says it forwards to ${routeNode(node.forwardsTo)?.path ?? node.forwardsTo}`,
      });
    }
  } catch (err) {
    findings.push({ rule: 'navigation', severity: 'error', message: String(err?.message ?? err).split('\n')[0] });
  }
  if (node.id === 'stock') findings.push(...stockFindings);
  if (findings.some((f) => f.severity === 'error')) out.status = 'fail';
  out.ms = Date.now() - started;
  nodes.push(out);
}

await browser.close();
if (writes.length) nodes.push({ id: '(writes)', kind: 'guard', url: null, status: 'fail', findings: writes.map((w) => ({ rule: 'write', severity: 'error', message: w })), ms: 0 });
emit({ ok: nodes.every((n) => n.status !== 'fail'), baseUrl: BASE_URL, samples, nodes });
