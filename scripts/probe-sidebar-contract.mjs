#!/usr/bin/env node
/**
 * Authed contract probe for the contextual-sidebar backend
 * (docs/refactors/sidebar/BACKEND-HANDOFF.md §"Testing contract" → "Authed probe script").
 *
 * Asserts, against a live lane (default http://localhost:3050):
 *   1. context  — every SIDEBAR_PAGE_NAV page and every item reachable from its NavContext:
 *                 200, strict NavContext shape, the requested item is active (round-trip),
 *                 `?view=top` → scope top, `back` null iff scope top.
 *   2. recents  — every NAV_RECENT_SURFACES surface: 200 (or 403 recorded), NavRecentRow shape;
 *                 POST→GET on `command_bar` puts the row first; POST on an adapter surface → 400.
 *   3. facets   — every facet context × option: `list total == facet total == desk-counts value`,
 *                 and the facet total filtered by an option == that option's count.
 *   4. identify — one fixture per identifier kind (sampled read-only from the DB) plus free text;
 *                 shape, exact → `single` with the expected entity, brand words → Bose; latency vs budget.
 *   5. brands   — typeahead ranks Bose first, detail shape + counts, products cursor paging.
 *   6. latency  — p50/p95 per endpoint, 20 samples after warm-up.
 *
 * Prints a table, writes docs/refactors/sidebar/probe-results.json, exits 1 on any FAIL.
 * WARN (latency budget misses, informational oddities) never fails the run.
 *
 * Usage:  node scripts/probe-sidebar-contract.mjs
 * Env:    PROBE_BASE_URL (http://localhost:3050), LH_TENANT_SLUG (usav), LH_STAFF_NAME (Michael),
 *         LH_STAFF_PIN, PROBE_SAMPLES (20). Fixtures read DATABASE_URL_UNPOOLED from the env or .env
 *         (READ ONLY transaction, rolled back; no session SET).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.PROBE_BASE_URL || 'http://localhost:3050';
const TENANT = process.env.LH_TENANT_SLUG || 'usav';
const STAFF_NAME = process.env.LH_STAFF_NAME || 'Michael';
const PIN = process.env.LH_STAFF_PIN;
const SAMPLES = Number(process.env.PROBE_SAMPLES) || 20;
const RESULTS_PATH = path.join(ROOT, 'docs/refactors/sidebar/probe-results.json');

// ── registries (copied; the probe is plain Node and cannot import TS) ─────────

/** `SIDEBAR_PAGE_NAV` (src/lib/sidebar-navigation.ts) — [page id, href]. */
const SIDEBAR_PAGES = [
  ['home', '/'], ['sales', '/dashboard?mode=sales'], ['operations', '/operations'], ['reports', '/reports'],
  ['triage', '/triage'], ['receive', '/unbox'], ['pickup', '/pickup'], ['repair', '/repair'],
  ['testing', '/test'], ['ready-to-pack', '/pick?ship=urgent'], ['incoming', '/incoming'],
  ['receiving', '/unbox'], ['sourcing', '/sourcing'], ['fba', '/shipping/fba'],
  ['label-intake', '/shipping/label-intake'], ['outbound', '/shipping/orders'], ['scan-out', '/shipping/scan-out'],
  ['packer', '/pack'], ['products', '/products'], ['inventory', '/inventory'],
  ['support', '/support'], ['studio', '/studio'],
];

/** `NAV_RECENT_SURFACES` (src/lib/nav/recents/surfaces.ts) — id → source. */
const RECENT_SURFACES = {
  'receiving.viewed': 'adapter', 'receiving.unbox_opened': 'adapter', 'receiving.scanned': 'adapter',
  'testing.opened': 'adapter', 'tech.scans': 'adapter', 'packer.packs': 'adapter', 'labels.prints': 'adapter',
  'pickup.orders': 'adapter', 'identify.opened': 'adapter',
  'support.tickets': 'nav_recents', detail_stacks: 'nav_recents', 'audit_log.trace': 'nav_recents',
  'labels.lookups': 'nav_recents', command_bar: 'nav_recents',
};

/** `NAV_FACET_GROUPS` (src/lib/nav/facets/contexts.ts) — context → [group id, param]. */
const QUEUE_GROUPS = [['stage', 'stage'], ['aging', 'aging'], ['late', 'late'], ['attention', 'attention'], ['ustatus', 'ustatus']];
const FACET_GROUPS = {
  'outbound.exceptions': [['category', 'category']],
  'outbound.triage': QUEUE_GROUPS,
  'outbound.pick': QUEUE_GROUPS,
  'outbound.po': [['aging', 'aging'], ['late', 'late'], ['attention', 'attention']],
  pickup: [['status', 'status']],
};

/**
 * The list each facet context counts (src/lib/outbound/desk-views.ts `countKey`;
 * the desk fetch is `fetchUnshippedOrdersData` in src/lib/dashboard-table-data.ts,
 * the Exceptions workbench reads /api/orders/exceptions, /pickup reads the LCPU lines feed).
 */
const FACET_LISTS = {
  'outbound.exceptions': { countKey: 'exceptions', list: '/api/orders/exceptions?limit=500', listParam: 'category', total: (j) => j.count, cap: 500 },
  'outbound.triage': { countKey: 'triage', list: '/api/orders?inWarehouse=true&listShape=queue', listParam: 'stage', total: (j) => j.count },
  'outbound.pick': { countKey: 'pick', list: '/api/orders?inWarehouse=true&listShape=queue&queue=pick', listParam: 'stage', total: (j) => j.count },
  'outbound.po': { countKey: 'po', list: '/api/orders?inWarehouse=true&listShape=queue&pair=po', listParam: null, total: (j) => j.count },
  pickup: { countKey: null, list: '/api/local-pickup-orders/lines?limit=500', listParam: null, total: (j) => j.lines?.length, cap: 500 },
};

const BUDGET_MS = { exact: 150, free: 400 };

// ── results ───────────────────────────────────────────────────────────────────

const checks = [];
const latency = {};
function record(section, name, status, detail = '', evidence = undefined) {
  checks.push({ section, name, status, detail, ...(evidence === undefined ? {} : { evidence }) });
}
const pass = (s, n, d, e) => record(s, n, 'PASS', d, e);
const fail = (s, n, d, e) => record(s, n, 'FAIL', d, e);
const warn = (s, n, d, e) => record(s, n, 'WARN', d, e);
const info = (s, n, d, e) => record(s, n, 'INFO', d, e);
const verdict = (s, n, ok, d, e) => (ok ? pass(s, n, d) : fail(s, n, d, e));

/** Run one probe item; a throw becomes a FAIL row for that item and the probe moves on. */
async function guard(section, item, fn) {
  try {
    return await fn();
  } catch (err) {
    fail(section, `${item} crashed`, String(err?.message ?? err).slice(0, 200), { stack: String(err?.stack ?? err).slice(0, 800), cause: causeChain(err) });
    return undefined;
  }
}

function sampleInto(key, ms, r = null) {
  if (r && !answered(r)) return;
  (latency[key] ??= []).push(ms);
}
function pct(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]);
}

// ── session + http ────────────────────────────────────────────────────────────

const tenantHeaders = { 'x-tenant-slug': TENANT, 'content-type': 'application/json' };

/** Same flow as scripts/lighthouse-mint-session.mjs: staff-picker → pinless signin. */
async function mintSession() {
  const pickerRes = await fetch(`${BASE_URL}/api/auth/staff-picker`, { headers: tenantHeaders });
  if (!pickerRes.ok) throw new Error(`staff-picker ${pickerRes.status}`);
  const picker = await pickerRes.json();
  const list = picker.staff ?? picker.staffList ?? picker;
  const staff = Array.isArray(list) ? list.find((s) => s.name === STAFF_NAME) ?? list[0] : null;
  if (!staff?.id) throw new Error(`no staff "${STAFF_NAME}" in the picker`);
  const res = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: 'POST',
    headers: tenantHeaders,
    body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal', ...(PIN ? { pin: PIN } : {}) }),
  });
  if (!res.ok) throw new Error(`signin ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const sid = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')])
    .filter(Boolean)
    .map((c) => c.split(';')[0])
    .find((c) => /^cf_sid(?:__[A-Za-z0-9_-]+)?=/.test(c));
  if (!sid) throw new Error('signin returned no cf_sid cookie');
  return { cookie: sid, staff: { id: staff.id, name: staff.name } };
}

let COOKIE = '';
let CURRENT_SECTION = 'setup';
let requestSeq = 0;
/** Requests that never got an HTTP answer (socket reset, refused, timeout) — each is also a FAIL row. */
const transportErrors = [];

function causeChain(err) {
  const chain = [];
  for (let e = err, depth = 0; e && depth < 5; e = e.cause, depth++) {
    const socket = e.socket
      ? { localPort: e.socket.localPort, remotePort: e.socket.remotePort, bytesWritten: e.socket.bytesWritten, bytesRead: e.socket.bytesRead }
      : undefined;
    chain.push({ name: e.name, code: e.code, message: String(e.message ?? e).slice(0, 300), ...(socket ? { socket } : {}) });
  }
  return chain;
}

/** Never throws: a transport failure comes back as `status: 0` so the calling check FAILs and the probe continues. */
async function http(method, url, body) {
  const seq = ++requestSeq;
  const started = performance.now();
  const payload = body ? JSON.stringify(body) : undefined;
  let res;
  let text;
  try {
    res = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: { cookie: COOKIE, 'x-tenant-slug': TENANT, ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const ms = performance.now() - started;
    const evidence = {
      seq,
      at: new Date().toISOString(),
      method,
      url,
      urlLength: url.length,
      bodyBytes: payload ? Buffer.byteLength(payload) : 0,
      cookieBytes: COOKIE.length,
      elapsedMs: Math.round(ms),
      phase: res ? 'reading body' : 'awaiting response',
      ...(res ? { status: res.status } : {}),
      cause: causeChain(err),
    };
    // Hold the probe until the lane answers again, so one restart costs one FAIL, not a burst of refusals.
    evidence.laneRecovery = await waitForLane();
    transportErrors.push(evidence);
    console.error(`[probe] transport error #${seq} ${method} ${url}: ${JSON.stringify(evidence.cause)} · lane ${JSON.stringify(evidence.laneRecovery)}`);
    fail(CURRENT_SECTION, `transport ${method} ${url.slice(0, 44)}`, `${evidence.cause.map((c) => c.code ?? c.name).join(' ← ')} after ${evidence.elapsedMs} ms (${evidence.phase}); lane back after ${evidence.laneRecovery.waitedMs} ms`, evidence);
    return { status: 0, json: null, text: `transport error: ${evidence.cause.map((c) => c.message).join(' ← ')}`, ms, cache: null, transport: evidence };
  }
  const ms = performance.now() - started;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body stays in `text` */
  }
  if (res.status >= 500 && json === null) {
    // The dev server's HTML error page (a compile error elsewhere in the tree), not a route answer.
    // This request's check FAILs; wait for the tree to compile again so the rest of the run measures routes.
    const message = /"message":"([^"]{0,300})/.exec(text)?.[1] ?? text.slice(0, 120);
    const laneRecovery = await waitForLane();
    laneErrors.push({ seq, at: new Date().toISOString(), url, status: res.status, message, laneRecovery });
    console.error(`[probe] lane error page #${seq} ${url}: ${message.slice(0, 160)} · lane ${JSON.stringify(laneRecovery)}`);
  }
  return { status: res.status, json, text, ms, cache: res.headers.get('x-cache') };
}

/** Poll the unauthenticated staff picker until the lane answers 200 (max 120 s). */
async function waitForLane() {
  const started = performance.now();
  let attempts = 0;
  let last = null;
  while (performance.now() - started < 120_000) {
    attempts++;
    try {
      const r = await fetch(`${BASE_URL}/api/auth/staff-picker`, { headers: tenantHeaders, signal: AbortSignal.timeout(10_000) });
      await r.arrayBuffer();
      last = r.status;
      if (r.ok) return { recovered: true, waitedMs: Math.round(performance.now() - started), attempts };
    } catch (err) {
      last = err.cause?.code ?? err.name;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { recovered: false, waitedMs: Math.round(performance.now() - started), attempts, last };
}
const laneErrors = [];
const REQUEST_TIMEOUT_MS = 60_000;
/** Latency counts answered requests only. */
const answered = (r) => r.status !== 0;
const get = (url) => http('GET', url);
const excerpt = (r) => (r.text ?? '').slice(0, 300);

// ── shape validators (hand mirrors of the zod schemas; strict keys) ─────────────

function strictKeys(obj, required, optional, where, errors) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${where}: not an object`);
    return false;
  }
  for (const k of required) if (!(k in obj)) errors.push(`${where}: missing ${k}`);
  for (const k of Object.keys(obj)) if (!required.includes(k) && !optional.includes(k)) errors.push(`${where}: unexpected key ${k}`);
  return true;
}
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isHref = (v) => typeof v === 'string' && v.startsWith('/');
const isInt = (v) => Number.isInteger(v);

function validateNavContext(c) {
  const e = [];
  if (!strictKeys(c, ['scope', 'page', 'back', 'search', 'sections', 'params', 'rollout'], ['filters', 'recents', 'savedViews', 'actions', 'scanInput'], 'ctx', e)) return e;
  if (!['top', 'section'].includes(c.scope)) e.push(`scope=${c.scope}`);
  if (strictKeys(c.page, ['id', 'label'], [], 'page', e) && !(isStr(c.page.id) && isStr(c.page.label))) e.push('page id/label');
  if (c.back !== null) {
    if (strictKeys(c.back, ['label', 'mode'], [], 'back', e) && (!isStr(c.back.label) || c.back.mode !== 'local')) e.push('back label/mode');
  }
  if ((c.scope === 'top') !== (c.back === null)) e.push(`back must be null iff scope top (scope=${c.scope}, back=${JSON.stringify(c.back)})`);
  if (strictKeys(c.search, ['scope', 'placeholder', 'source'], ['param'], 'search', e)) {
    if (!isStr(c.search.scope) || !isStr(c.search.placeholder)) e.push('search scope/placeholder');
    if (!['desk-store', 'url-param', 'identify'].includes(c.search.source)) e.push(`search.source=${c.search.source}`);
  }
  if (!Array.isArray(c.sections)) e.push('sections not array');
  else
    c.sections.forEach((s, si) => {
      if (!strictKeys(s, ['id', 'items'], ['label'], `sections[${si}]`, e)) return;
      if (!isStr(s.id) || ('label' in s && !isStr(s.label))) e.push(`sections[${si}] id/label`);
      if (!Array.isArray(s.items)) return e.push(`sections[${si}].items not array`);
      s.items.forEach((it, ii) => {
        const w = `sections[${si}].items[${ii}]`;
        if (it && typeof it === 'object') for (const [k, v] of Object.entries(it)) if (typeof v === 'number') e.push(`${w}: numeric ${k} (nav items carry no count)`);
        if (!strictKeys(it, ['id', 'label', 'href', 'active', 'kind'], ['badge'], w, e)) return;
        if (!isStr(it.id) || !isStr(it.label) || !isHref(it.href) || typeof it.active !== 'boolean') e.push(`${w} field types`);
        if (!['link', 'drill', 'filter', 'toggle'].includes(it.kind)) e.push(`${w} kind=${it.kind}`);
        if ('badge' in it && it.badge !== 'beta') e.push(`${w} badge=${it.badge}`);
      });
    });
  if (!Array.isArray(c.params) || !c.params.every(isStr)) e.push('params');
  if ('filters' in c && strictKeys(c.filters, ['facetContext', 'groups'], [], 'filters', e)) {
    if (!isStr(c.filters.facetContext) || !Array.isArray(c.filters.groups)) e.push('filters fields');
    else
      c.filters.groups.forEach((g, i) => {
        if (strictKeys(g, ['id', 'label', 'param', 'multi'], [], `filters.groups[${i}]`, e) && (!isStr(g.id) || !isStr(g.param) || typeof g.multi !== 'boolean')) e.push(`filters.groups[${i}] types`);
      });
  }
  if ('recents' in c && strictKeys(c.recents, ['endpoint', 'surface'], [], 'recents', e) && (!String(c.recents.endpoint).startsWith('/api/') || !isStr(c.recents.surface))) e.push('recents fields');
  if ('savedViews' in c && strictKeys(c.savedViews, ['storageKey', 'paramKeys'], [], 'savedViews', e) && (!isStr(c.savedViews.storageKey) || !Array.isArray(c.savedViews.paramKeys))) e.push('savedViews fields');
  if ('scanInput' in c && strictKeys(c.scanInput, ['grammar', 'endpoint'], [], 'scanInput', e) && (!isStr(c.scanInput.grammar) || !String(c.scanInput.endpoint).startsWith('/api/'))) e.push('scanInput fields');
  if ('actions' in c) {
    if (!Array.isArray(c.actions)) e.push('actions not array');
    else
      c.actions.forEach((a, i) => {
        if (!strictKeys(a, ['id', 'label'], ['href', 'intent'], `actions[${i}]`, e)) return;
        if (a.href === undefined && a.intent === undefined) e.push(`actions[${i}] needs href or intent`);
        if (a.href !== undefined && !isHref(a.href)) e.push(`actions[${i}].href`);
      });
  }
  if (!['legacy', 'contextual'].includes(c.rollout)) e.push(`rollout=${c.rollout}`);
  return e;
}

function validateRecentRow(r, i) {
  const e = [];
  const w = `rows[${i}]`;
  if (!strictKeys(r, ['id', 'entityType', 'entityId', 'title', 'subtitle', 'status', 'at', 'href'], [], w, e)) return e;
  if (!isStr(r.id) || !isStr(r.entityType) || !isStr(r.entityId)) e.push(`${w} id/entityType/entityId`);
  if (typeof r.title !== 'string') e.push(`${w}.title`);
  if (r.subtitle !== null && typeof r.subtitle !== 'string') e.push(`${w}.subtitle`);
  if (r.status !== null && typeof r.status !== 'string') e.push(`${w}.status`);
  if (!isStr(r.at) || Number.isNaN(Date.parse(r.at))) e.push(`${w}.at not ISO (${r.at})`);
  if (!isHref(r.href)) e.push(`${w}.href`);
  return e;
}

function validateFacets(f, context) {
  const e = [];
  if (!strictKeys(f, ['context', 'total', 'groups'], [], 'facets', e)) return e;
  if (f.context !== context) e.push(`context=${f.context}`);
  if (!isInt(f.total) || f.total < 0) e.push(`total=${f.total}`);
  if (!Array.isArray(f.groups)) return [...e, 'groups not array'];
  const want = FACET_GROUPS[context].map(([id, param]) => `${id}:${param}`).join(',');
  const got = f.groups.map((g) => `${g?.id}:${g?.param}`).join(',');
  if (want !== got) e.push(`groups ${got} ≠ declared ${want}`);
  f.groups.forEach((g, gi) => {
    if (!strictKeys(g, ['id', 'label', 'param', 'options'], [], `groups[${gi}]`, e)) return;
    if (!Array.isArray(g.options)) return e.push(`groups[${gi}].options`);
    g.options.forEach((o, oi) => {
      if (strictKeys(o, ['value', 'label', 'count'], [], `groups[${gi}].options[${oi}]`, e) && (typeof o.value !== 'string' || !isStr(o.label) || !isInt(o.count) || o.count < 0)) e.push(`groups[${gi}].options[${oi}] types`);
    });
  });
  return e;
}

const IDENTIFY_KINDS = ['order', 'unit', 'receiving', 'sku', 'repair', 'fba', 'warranty', 'ticket', 'location'];
const IDENTIFY_STAGES = ['exception', 'picking', 'to_ship', 'shipped', 'receiving'];
function validateIdentify(r) {
  const e = [];
  if (!strictKeys(r, ['mode', 'lines', 'truncated', 'context'], [], 'identify', e)) return e;
  if (!['single', 'list', 'none', 'batch'].includes(r.mode)) e.push(`mode=${r.mode}`);
  if (typeof r.truncated !== 'boolean') e.push('truncated');
  if (!Array.isArray(r.lines)) return [...e, 'lines'];
  r.lines.forEach((l, li) => {
    const w = `lines[${li}]`;
    if (!strictKeys(l, ['input', 'mode', 'tokens', 'filters', 'candidates'], [], w, e)) return;
    if (!['single', 'list', 'none'].includes(l.mode)) e.push(`${w}.mode=${l.mode}`);
    if (!Array.isArray(l.tokens)) e.push(`${w}.tokens`);
    if (strictKeys(l.filters, ['brands', 'conditions'], [], `${w}.filters`, e) && !Array.isArray(l.filters.brands)) e.push(`${w}.filters.brands`);
    if (!Array.isArray(l.candidates)) return e.push(`${w}.candidates`);
    l.candidates.forEach((c, ci) => {
      const cw = `${w}.candidates[${ci}]`;
      if (!strictKeys(c, ['kind', 'entityId', 'title', 'subtitle', 'brand', 'confidence', 'matchedOn', 'href', 'actions', 'stage', 'inContext'], [], cw, e)) return;
      if (!IDENTIFY_KINDS.includes(c.kind)) e.push(`${cw}.kind=${c.kind}`);
      if (!isInt(c.entityId) || c.entityId <= 0) e.push(`${cw}.entityId`);
      if (typeof c.title !== 'string') e.push(`${cw}.title`);
      if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) e.push(`${cw}.confidence`);
      if (!c.matchedOn || !isStr(c.matchedOn.field) || !isStr(c.matchedOn.token)) e.push(`${cw}.matchedOn`);
      if (!isHref(c.href)) e.push(`${cw}.href`);
      if (!Array.isArray(c.actions) || !c.actions.every((a) => isStr(a?.id) && isStr(a?.label) && (a.href === undefined || isHref(a.href)))) e.push(`${cw}.actions`);
      if (c.stage !== null && !IDENTIFY_STAGES.includes(c.stage)) e.push(`${cw}.stage=${c.stage}`);
      if (c.brand !== null && (!c.brand || !isInt(c.brand.id) || !isStr(c.brand.name) || typeof c.brand.confidence !== 'number')) e.push(`${cw}.brand`);
      if (typeof c.inContext !== 'boolean') e.push(`${cw}.inContext`);
    });
  });
  return e;
}

// ── 1. context ──────────────────────────────────────────────────────────────────

const SIDEBAR_PAGE_IDS = new Map(SIDEBAR_PAGES.map(([id, href]) => [id, href]));
const allItems = (ctx) => (ctx?.sections ?? []).flatMap((s) => s.items);
const ctxUrl = (p, top = false) => `/api/nav/context?path=${encodeURIComponent(p)}${top ? '&view=top' : ''}`;

async function probeContext() {
  const S = 'context';
  const resolved = new Map(); // href → context
  async function resolve(href) {
    if (resolved.has(href)) return resolved.get(href);
    const r = await get(ctxUrl(href));
    sampleInto('context(crawl)', r.ms, r);
    const out = { r, ctx: r.status === 200 ? r.json : null };
    resolved.set(href, out);
    if (r.status !== 200) {
      fail(S, `GET ${href}`, `status ${r.status}`, excerpt(r));
      return out;
    }
    const errors = validateNavContext(r.json);
    verdict(S, `shape ${href}`, errors.length === 0, errors.length ? errors.slice(0, 4).join('; ') : `scope=${r.json.scope} page=${r.json.page.id}`, { errors });
    if (r.json.scope === 'section') {
      // A page's own child may reuse the page id (Sales · `sales` Sales Board); only OTHER pages' rows leak.
      const leaked = allItems(r.json).filter((it) => it.id !== r.json.page.id && SIDEBAR_PAGE_IDS.get(it.id) === it.href);
      verdict(S, `section has no page items ${href}`, leaked.length === 0, leaked.map((i) => i.id).join(','), { leaked });
    }
    const top = await get(ctxUrl(href, true));
    sampleInto('context(crawl)', top.ms, top);
    const topOk = top.status === 200 && top.json?.scope === 'top' && top.json?.back === null && validateNavContext(top.json).length === 0;
    verdict(S, `view=top ${href}`, topOk, `status ${top.status} scope=${top.json?.scope} back=${JSON.stringify(top.json?.back)}`, excerpt(top));
    const lit = top.json ? allItems(top.json).filter((i) => i.active).map((i) => i.id) : [];
    if (topOk && lit.length === 0) {
      // schema.ts: `top` = "the lane map with the page lit". A page the lane map does not carry lights nothing.
      warn(S, `view=top lights page ${href}`, `nothing lit — page ${r.json.page.id} is not on the lane map`, { page: r.json.page.id, laneMapIds: allItems(top.json).map((i) => i.id) });
    }
    out.top = top.json;
    return out;
  }

  /** Requested item must come back active: in its own context, or (drill → section) lit in `?view=top`. */
  function roundTrip(label, href, itemId, out) {
    if (!out.ctx) return;
    const byId = allItems(out.ctx).filter((i) => i.id === itemId);
    const byHref = allItems(out.ctx).filter((i) => i.href === href);
    const active = allItems(out.ctx).filter((i) => i.active).map((i) => `${i.id}:${i.href}`);
    if (byId.length || byHref.length) {
      const ok = byId.some((i) => i.active) || byHref.some((i) => i.active);
      verdict(S, `round-trip ${label}`, ok, `${itemId} active=${ok} in ${out.ctx.page.id}/${out.ctx.scope}`, { active });
      return;
    }
    const lit = allItems(out.top).filter((i) => i.id === itemId);
    verdict(S, `round-trip ${label}`, lit.some((i) => i.active), `${itemId} not in its own ${out.ctx.scope} context; lit in view=top: ${lit.some((i) => i.active)}`, {
      resolvedPage: out.ctx.page.id,
      active,
      topActive: allItems(out.top).filter((i) => i.active).map((i) => i.id),
    });
  }

  const visited = new Set();
  const queue = [];
  for (const [pageId, href] of SIDEBAR_PAGES) await guard(S, `page ${pageId} (${href})`, async () => {
    const out = await resolve(href);
    if (out.ctx && out.ctx.page.id !== pageId) {
      // Two registry pages share `/unbox` (receive · receiving); the resolver can only pick one.
      const sharing = SIDEBAR_PAGES.filter(([, h]) => h === href).map(([id]) => id);
      const onLaneMap = allItems(out.top).some((i) => i.id === pageId);
      if (sharing.includes(out.ctx.page.id)) info(S, `page ${pageId} (${href})`, `resolves to page ${out.ctx.page.id} (href shared by ${sharing.join(', ')})`);
      else if (!onLaneMap) warn(S, `page ${pageId} (${href})`, `resolves to page ${out.ctx.page.id}; registry page ${pageId} is not on the lane map`, { resolved: out.ctx.page.id });
      else fail(S, `page ${pageId} (${href})`, `resolves to page ${out.ctx.page.id}`, { resolved: out.ctx.page.id });
    }
    roundTrip(`page ${pageId}`, href, out.ctx && out.ctx.page.id !== pageId ? out.ctx.page.id : pageId, out);
    if (out.ctx) queue.push(out.ctx);
    visited.add(href);
  });
  // Crawl every section item (and whatever sections those reach).
  while (queue.length) {
    const ctx = queue.shift();
    if (ctx.scope !== 'section') continue;
    for (const it of allItems(ctx)) {
      const key = `${it.id}@${it.href}`;
      if (visited.has(key)) continue;
      visited.add(key);
      await guard(S, `${ctx.page.id}.${it.id} (${it.href})`, async () => {
        const out = await resolve(it.href);
        roundTrip(`${ctx.page.id}.${it.id} (${it.href})`, it.href, it.id, out);
        if (out.ctx && !visited.has(`ctx:${out.ctx.page.id}:${out.ctx.scope}:${it.href}`)) {
          visited.add(`ctx:${out.ctx.page.id}:${out.ctx.scope}:${it.href}`);
          queue.push(out.ctx);
        }
      });
    }
  }
  const bad = await get(ctxUrl('//evil.example'));
  verdict(S, 'foreign path refused', bad.status === 400, `status ${bad.status}`, excerpt(bad));
  info(S, 'coverage', `${resolved.size} distinct paths resolved (pages + section items)`);
}

// ── 2. recents ──────────────────────────────────────────────────────────────────

async function probeRecents() {
  const S = 'recents';
  for (const [surface, source] of Object.entries(RECENT_SURFACES)) await guard(S, `GET ${surface}`, async () => {
    const r = await get(`/api/nav/recents?surface=${encodeURIComponent(surface)}`);
    sampleInto('recents', r.ms, r);
    if (r.status === 403) {
      info(S, `GET ${surface}`, `403 ${r.json?.permission ?? ''} (permission missing — recorded)`);
      return;
    }
    if (r.status !== 200) {
      fail(S, `GET ${surface}`, `status ${r.status}`, excerpt(r));
      return;
    }
    const e = [];
    strictKeys(r.json, ['surface', 'rows'], [], 'body', e);
    if (r.json?.surface !== surface) e.push(`surface=${r.json?.surface}`);
    (r.json?.rows ?? []).forEach((row, i) => e.push(...validateRecentRow(row, i)));
    verdict(S, `GET ${surface} [${source}]`, e.length === 0, e.length ? e.slice(0, 4).join('; ') : `${r.json.rows.length} rows`, { errors: e });
  });

  const entityId = '/shipping/orders';
  const post = await http('POST', '/api/nav/recents', { surface: 'command_bar', entityType: 'page', entityId, label: 'Shipping' });
  verdict(S, 'POST command_bar page', post.status === 200, `status ${post.status}`, excerpt(post));
  const after = await get('/api/nav/recents?surface=command_bar');
  const first = after.json?.rows?.[0];
  verdict(S, 'POST→GET row first', first?.entityType === 'page' && first?.entityId === entityId && first?.href === entityId, `first=${first ? `${first.entityType}:${first.entityId}→${first.href}` : 'none'}`, after.json?.rows?.slice(0, 3));

  const adapter = await http('POST', '/api/nav/recents', { surface: 'receiving.viewed', entityType: 'receiving', entityId: '1', label: 'x' });
  verdict(S, 'POST adapter surface → 400', adapter.status === 400, `status ${adapter.status} ${adapter.json?.error ?? ''}`, excerpt(adapter));
  const badType = await http('POST', '/api/nav/recents', { surface: 'command_bar', entityType: 'nope', entityId: '1', label: 'x' });
  verdict(S, 'POST bad entityType → 400', badType.status === 400, `status ${badType.status} ${badType.json?.error ?? ''}`, excerpt(badType));
}

// ── 3. facets ───────────────────────────────────────────────────────────────────

const facetUrl = (context, extra = '') => `/api/nav/facets?context=${encodeURIComponent(context)}${extra}`;

async function probeFacets() {
  const S = 'facets';
  const desk = await get('/api/orders/desk-counts');
  if (desk.status !== 200) fail(S, 'desk-counts', `status ${desk.status}`, excerpt(desk));
  const deskCounts = desk.json ?? {};
  info(S, 'desk-counts', `x-cache=${desk.cache} ${JSON.stringify(deskCounts)}`);

  for (const context of Object.keys(FACET_GROUPS)) await guard(S, `context ${context}`, async () => {
    const r = await get(facetUrl(context));
    sampleInto('facets', r.ms, r);
    if (r.status !== 200) {
      (r.status === 403 ? info : fail)(S, `GET ${context}`, `status ${r.status}`, excerpt(r));
      return;
    }
    const e = validateFacets(r.json, context);
    verdict(S, `shape ${context}`, e.length === 0, e.length ? e.slice(0, 4).join('; ') : `total=${r.json.total}`, { errors: e });
    const facet = r.json;
    const spec = FACET_LISTS[context];

    // list total == facet total == desk-counts value
    const list = await get(spec.list);
    const listTotal = list.status === 200 ? spec.total(list.json) : null;
    const capped = spec.cap != null && listTotal === spec.cap;
    const deskValue = spec.countKey ? deskCounts[spec.countKey] : undefined;
    const numbers = { facetTotal: facet.total, listTotal, listCache: list.cache, list: spec.list, ...(spec.countKey ? { deskKey: spec.countKey, deskValue, deskCache: desk.cache } : {}) };
    if (list.status !== 200) fail(S, `list ${context}`, `status ${list.status} for ${spec.list}`, excerpt(list));
    else if (capped) warn(S, `list total ${context}`, `list capped at ${spec.cap}; facet total ${facet.total}`, numbers);
    else verdict(S, `list total == facet total ${context}`, listTotal === facet.total, `list ${listTotal} (x-cache ${list.cache ?? '-'}) vs facet ${facet.total}`, numbers);
    if (spec.countKey) verdict(S, `facet total == desk-counts.${spec.countKey}`, deskValue === facet.total, `desk ${deskValue} vs facet ${facet.total}`, numbers);

    // every option: filtered facet total == option count (and the list's own filter when it has one)
    for (const group of facet.groups) {
      for (const opt of group.options) await guard(S, `${context} ${group.param}=${opt.value}`, async () => {
        const q = `&${encodeURIComponent(group.param)}=${encodeURIComponent(opt.value)}`;
        const fr = await get(facetUrl(context, q));
        sampleInto('facets', fr.ms, fr);
        const filteredTotal = fr.json?.total;
        const shapeErr = fr.status === 200 ? validateFacets(fr.json, context) : [`status ${fr.status}`];
        verdict(S, `${context} ${group.param}=${opt.value}`, shapeErr.length === 0 && filteredTotal === opt.count, `option count ${opt.count} vs filtered total ${filteredTotal}`, { option: opt, filteredTotal, errors: shapeErr });
        if (spec.listParam === group.param) {
          const lr = await get(`${spec.list}${q}`);
          const lt = lr.status === 200 ? spec.total(lr.json) : null;
          verdict(S, `${context} list ${group.param}=${opt.value}`, lt === opt.count, `list ${lt} (x-cache ${lr.cache ?? '-'}) vs option ${opt.count}`, { url: `${spec.list}${q}`, listTotal: lt, optionCount: opt.count });
        }
      });
    }
  });
  const bad = await get(facetUrl('outbound.nope'));
  verdict(S, 'unknown context → 400', bad.status === 400, `status ${bad.status}`, excerpt(bad));
}

// ── 4. identify ─────────────────────────────────────────────────────────────────

function loadDsn() {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL_UNPOOLED='));
  return line ? line.slice('DATABASE_URL_UNPOOLED='.length).trim().replace(/^["']|["']$/g, '') : null;
}

/** One real identifier per kind, each unique in its own table. Read-only, rolled back. */
const FIXTURE_SQL = {
  tracking: `SELECT o.id AS entity_id, stn.tracking_number_normalized AS q, 'order' AS kind
      FROM orders o JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id AND stn.organization_id = o.organization_id
     WHERE o.organization_id = $1 AND stn.tracking_number_normalized ~ '^1Z[0-9A-Z]{16}$'
       AND (SELECT COUNT(*) FROM orders x WHERE x.organization_id = $1 AND x.shipment_id = o.shipment_id) = 1
       AND NOT EXISTS (SELECT 1 FROM receiving_carton r WHERE r.organization_id = $1 AND r.shipment_id = stn.id)
       AND NOT EXISTS (SELECT 1 FROM shipment_links sl WHERE sl.organization_id = $1 AND sl.shipment_id = stn.id AND sl.owner_type = 'ORDER' AND sl.owner_id <> o.id)
     ORDER BY o.id DESC LIMIT 1`,
  amazon_order: orderSql(`'^\\d{3}-\\d{7}-\\d{7}$'`),
  ebay_order: orderSql(`'^\\d{2}-\\d{5}-\\d{5}$'`),
  numeric_order: orderSql(`'^\\d{6,9}$'`),
  serial: `SELECT su.id AS entity_id, su.normalized_serial AS q, 'unit' AS kind FROM serial_units su
     WHERE su.organization_id = $1 AND su.normalized_serial ~ '^[A-Z0-9]{8,}$' AND su.normalized_serial ~ '[A-Z]' AND su.normalized_serial ~ '\\d'
       AND (SELECT COUNT(*) FROM serial_units x WHERE x.organization_id = $1 AND x.normalized_serial = su.normalized_serial) = 1
       AND NOT EXISTS (SELECT 1 FROM tech_serial_numbers t WHERE t.organization_id = $1 AND t.serial_number = su.normalized_serial)
       AND NOT EXISTS (SELECT 1 FROM sku_catalog sc WHERE sc.organization_id = $1 AND upper(sc.sku) = su.normalized_serial)
     ORDER BY su.id DESC LIMIT 1`,
  sku: `SELECT sc.id AS entity_id, sc.sku AS q, 'sku' AS kind FROM sku_catalog sc
     WHERE sc.organization_id = $1 AND sc.is_active AND sc.sku ~ '\\d' AND sc.sku !~ '^TMP-' AND sc.sku ~ '^[A-Za-z0-9-]+$'
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.organization_id = $1 AND (o.order_id = sc.sku OR o.item_number = sc.sku))
       AND NOT EXISTS (SELECT 1 FROM serial_units su WHERE su.organization_id = $1 AND su.normalized_serial = upper(sc.sku))
     ORDER BY sc.id DESC LIMIT 1`,
  gtin: `SELECT sc.id AS entity_id, sc.gtin AS q, 'sku' AS kind FROM sku_catalog sc
     WHERE sc.organization_id = $1 AND sc.gtin ~ '^\\d{14}$'
       AND (SELECT COUNT(*) FROM sku_catalog x WHERE x.organization_id = $1 AND (x.gtin = sc.gtin OR x.upc = sc.gtin OR x.ean = sc.gtin)) = 1
     ORDER BY sc.id DESC LIMIT 1`,
  fnsku: `SELECT sc.id AS entity_id, f.fnsku AS q, 'sku' AS kind FROM fba_fnskus f
      JOIN sku_catalog sc ON sc.organization_id = f.organization_id AND (sc.id = f.sku_catalog_id OR (f.sku_catalog_id IS NULL AND sc.sku = f.sku))
     WHERE f.organization_id = $1 AND f.fnsku ~ '^X0[A-Z0-9]{8}$'
       AND (SELECT COUNT(*) FROM fba_fnskus x WHERE x.organization_id = $1 AND x.fnsku = f.fnsku) = 1
     ORDER BY f.fnsku LIMIT 1`,
  po: `SELECT r.id AS entity_id, r.zoho_purchaseorder_number AS q, 'receiving' AS kind FROM receiving_carton r
     WHERE r.organization_id = $1 AND r.zoho_purchaseorder_number ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,}$'
       AND (SELECT COUNT(*) FROM receiving_carton x WHERE x.organization_id = $1
             AND r.zoho_purchaseorder_number IN (x.zoho_purchaseorder_number, x.zoho_purchaseorder_id, x.source_order_id)) = 1
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.organization_id = $1 AND (o.order_id = r.zoho_purchaseorder_number OR o.item_number = r.zoho_purchaseorder_number))
     ORDER BY r.id DESC LIMIT 1`,
  receiving_handle: `SELECT r.id AS entity_id, 'R-' || r.id AS q, 'receiving' AS kind FROM receiving_carton r WHERE r.organization_id = $1 ORDER BY r.id DESC LIMIT 1`,
  unit_handle: `SELECT su.id AS entity_id, 'U-' || su.id AS q, 'unit' AS kind FROM serial_units su WHERE su.organization_id = $1
       AND NOT EXISTS (SELECT 1 FROM serial_units x WHERE x.organization_id = $1 AND x.normalized_serial = 'U-' || su.id)
     ORDER BY su.id DESC LIMIT 1`,
  digital_link: `SELECT sc.id AS entity_id, 'https://id.gs1.org/01/' || sc.gtin AS q, 'sku' AS kind FROM sku_catalog sc
     WHERE sc.organization_id = $1 AND sc.gtin ~ '^\\d{14}$'
       AND (SELECT COUNT(*) FROM sku_catalog x WHERE x.organization_id = $1 AND (x.gtin = sc.gtin OR x.upc = sc.gtin OR x.ean = sc.gtin)) = 1
     ORDER BY sc.id ASC LIMIT 1`,
};
function orderSql(re) {
  return `SELECT o.id AS entity_id, o.order_id AS q, 'order' AS kind FROM orders o
     WHERE o.organization_id = $1 AND o.order_id ~ ${re}
       AND (SELECT COUNT(*) FROM orders x WHERE x.organization_id = $1 AND (x.order_id = o.order_id OR x.item_number = o.order_id)) = 1
       AND NOT EXISTS (SELECT 1 FROM receiving_carton r WHERE r.organization_id = $1 AND o.order_id IN (r.zoho_purchaseorder_number, r.zoho_purchaseorder_id, r.source_order_id))
       AND NOT EXISTS (SELECT 1 FROM sku_catalog sc WHERE sc.organization_id = $1 AND (sc.sku = o.order_id OR sc.gtin = o.order_id OR sc.upc = o.order_id))
     ORDER BY o.id DESC LIMIT 1`;
}

async function sampleFixtures() {
  const dsn = loadDsn();
  if (!dsn) {
    fail('identify', 'fixtures', 'DATABASE_URL_UNPOOLED not set — cannot sample identifier fixtures');
    return [];
  }
  const client = new pg.Client({ connectionString: dsn });
  await client.connect();
  const fixtures = [];
  try {
    await client.query('BEGIN READ ONLY');
    const org = (await client.query('SELECT id FROM organizations WHERE slug = $1', [TENANT])).rows[0]?.id;
    if (!org) throw new Error(`no organization with slug ${TENANT}`);
    for (const [cls, sql] of Object.entries(FIXTURE_SQL)) {
      const row = (await client.query(sql, [org])).rows[0];
      if (!row) info('identify', `fixture ${cls}`, 'none in this tenant — skipped');
      else fixtures.push({ cls, q: String(row.q), kind: row.kind, entityId: Number(row.entity_id) });
    }
    if (!fixtures.some((f) => f.cls === 'fnsku')) {
      // No FNSKU links to sku_catalog in this tenant; still observe what identify does with a real one.
      const row = (await client.query(
        `SELECT f.fnsku AS q, (SELECT COUNT(*) FROM fba_fnskus x WHERE x.organization_id = $1) AS total
           FROM fba_fnskus f WHERE f.organization_id = $1 AND f.fnsku ~ '^X0[A-Z0-9]{8}$' ORDER BY f.fnsku LIMIT 1`,
        [org],
      )).rows[0];
      if (row) fixtures.push({ cls: 'fnsku_unlinked', q: String(row.q), kind: null, entityId: null, note: `${row.total} FNSKUs, none linked to sku_catalog` });
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return fixtures;
}

async function probeIdentify() {
  const S = 'identify';
  const fixtures = (await guard(S, 'fixture sampling', sampleFixtures)) ?? [];
  const idUrl = (q) => `/api/identify?q=${encodeURIComponent(q)}`;
  const latencyClass = {};
  const time = async (cls, q, n) => {
    await get(idUrl(q)); // warm-up
    for (let i = 0; i < n; i++) {
      const r = await get(idUrl(q));
      if (answered(r)) (latencyClass[cls] ??= []).push(r.ms);
      sampleInto('identify', r.ms, r);
    }
  };

  for (const f of fixtures) await guard(S, `fixture ${f.cls} "${f.q}"`, async () => {
    const r = await get(idUrl(f.q));
    if (r.status !== 200) {
      fail(S, `${f.cls} ${f.q}`, `status ${r.status}`, excerpt(r));
      return;
    }
    const e = validateIdentify(r.json);
    if (e.length) fail(S, `shape ${f.cls}`, e.slice(0, 4).join('; '), e);
    const line = r.json.lines?.[0];
    const top = line?.candidates?.[0];
    if (f.kind === null) {
      info(S, `observe ${f.cls} "${f.q}"`, `${f.note}; mode=${r.json.mode} ${line?.candidates?.length ?? 0} candidates`, { tokens: line?.tokens, candidates: (line?.candidates ?? []).slice(0, 3) });
      return;
    }
    const ok = r.json.mode === 'single' && line?.mode === 'single' && top?.kind === f.kind && top?.entityId === f.entityId;
    verdict(S, `exact ${f.cls} "${f.q}"`, ok, `mode=${r.json.mode} top=${top ? `${top.kind}:${top.entityId} via ${top.matchedOn?.field}` : 'none'} expected ${f.kind}:${f.entityId} (${line?.candidates?.length ?? 0} candidates)`, {
      q: f.q,
      expected: { kind: f.kind, entityId: f.entityId },
      candidates: (line?.candidates ?? []).slice(0, 5).map((c) => ({ kind: c.kind, entityId: c.entityId, title: c.title, matchedOn: c.matchedOn, confidence: c.confidence })),
      tokens: line?.tokens,
    });
    await time('exact', f.q, SAMPLES);
  });

  const isBose = (c) => /^bose$/i.test(c?.brand?.root?.name ?? c?.brand?.name ?? '');
  for (const q of ['bose', 'bsoe', 'guitar hero', 'jbl flip']) await guard(S, `free "${q}"`, async () => {
    const r = await get(idUrl(q));
    if (r.status !== 200) {
      fail(S, `free "${q}"`, `status ${r.status}`, excerpt(r));
      return;
    }
    const e = validateIdentify(r.json);
    if (e.length) fail(S, `shape "${q}"`, e.slice(0, 4).join('; '), e);
    const line = r.json.lines?.[0];
    const cands = line?.candidates ?? [];
    const summary = cands.slice(0, 3).map((c) => `${c.kind}:${c.entityId} ${c.title.slice(0, 30)} [${c.brand?.name ?? '-'}]`).join(' | ');
    const evidence = { mode: r.json.mode, filters: line?.filters, tokens: line?.tokens, top: cands.slice(0, 5).map((c) => ({ kind: c.kind, entityId: c.entityId, title: c.title, brand: c.brand?.name ?? null, root: c.brand?.root?.name ?? null, matchedOn: c.matchedOn })) };
    if (q === 'bose' || q === 'bsoe') {
      const boseFilter = (line?.filters?.brands ?? []).some((b) => /^bose$/i.test(b.name));
      const topBose = cands.length > 0 && cands.slice(0, 5).every(isBose);
      verdict(S, `brand "${q}" → Bose`, boseFilter && topBose, `brand filter Bose=${boseFilter}; top5 all Bose=${topBose}; ${cands.length} candidates: ${summary}`, evidence);
    } else {
      (cands.length ? info : warn)(S, `free "${q}"`, `mode=${r.json.mode} ${cands.length} candidates: ${summary || 'none'}`, evidence);
    }
    await time('free', q, SAMPLES);
  });

  // 3-line batch: first three exact fixtures, one per line
  const batch = fixtures.filter((f) => f.kind !== null).slice(0, 3);
  if (batch.length === 3) await guard(S, 'batch 3 lines', async () => {
    const r = await http('POST', '/api/identify', { q: batch.map((f) => f.q).join('\n') });
    const e = r.status === 200 ? validateIdentify(r.json) : [`status ${r.status}`];
    const lines = r.json?.lines ?? [];
    const each = batch.map((f, i) => lines[i]?.mode === 'single' && lines[i]?.candidates?.[0]?.kind === f.kind && lines[i]?.candidates?.[0]?.entityId === f.entityId);
    verdict(S, 'batch 3 lines', e.length === 0 && r.json?.mode === 'batch' && lines.length === 3 && each.every(Boolean), `mode=${r.json?.mode} lines=${lines.length} per-line ok=${each.join(',')}`, { errors: e, lines: lines.map((l) => ({ input: l.input, mode: l.mode, top: l.candidates?.[0] && `${l.candidates[0].kind}:${l.candidates[0].entityId}` })) });
    const q = batch.map((f) => f.q).join('\n');
    for (let i = 0; i < SAMPLES; i++) {
      const t = await http('POST', '/api/identify', { q });
      if (answered(t)) (latencyClass.batch ??= []).push(t.ms);
    }
  });

  const empty = await get(idUrl(''));
  verdict(S, 'empty q → 400', empty.status === 400, `status ${empty.status}`, excerpt(empty));

  for (const [cls, values] of Object.entries(latencyClass)) {
    const p50 = pct(values, 50);
    const p95 = pct(values, 95);
    const budget = cls === 'exact' ? BUDGET_MS.exact : cls === 'free' ? BUDGET_MS.free : null;
    const detail = `p50 ${p50} ms · p95 ${p95} ms · n=${values.length}${budget ? ` · budget p95 <${budget} ms` : ''}`;
    if (budget && p95 >= budget) warn(S, `latency ${cls}`, detail);
    else info(S, `latency ${cls}`, detail);
  }
  return latencyClass;
}

// ── 5. brands ──────────────────────────────────────────────────────────────────

async function probeBrands() {
  const S = 'brands';
  const list = await get('/api/brands?q=bose');
  sampleInto('brands', list.ms, list);
  const first = list.json?.brands?.[0];
  verdict(S, 'typeahead q=bose → Bose first', list.status === 200 && /^bose$/i.test(first?.name ?? ''), `status ${list.status} first=${first?.name ?? 'none'} (${(list.json?.brands ?? []).slice(0, 3).map((b) => b.name).join(', ')})`, excerpt(list));
  if (!first) return;
  const listErr = [];
  (list.json.brands ?? []).forEach((b, i) =>
    strictKeys(b, ['id', 'name', 'slug', 'kind', 'parentBrandId', 'publisher', 'matchedAlias', 'aliasRank', 'activeSkuCount'], [], `brands[${i}]`, listErr),
  );
  verdict(S, 'typeahead shape', listErr.length === 0, listErr.slice(0, 3).join('; '), listErr);

  const detail = await get(`/api/brands/${first.id}`);
  sampleInto('brands', detail.ms, detail);
  const d = detail.json;
  const e = [];
  if (detail.status !== 200) e.push(`status ${detail.status}`);
  else {
    strictKeys(d, ['success', 'brand', 'aliases', 'parent', 'children', 'counts'], [], 'detail', e);
    strictKeys(d.counts, ['skuCount', 'activeSkuCount', 'openOrderCount', 'onHandUnits'], [], 'counts', e);
    for (const [k, v] of Object.entries(d.counts ?? {})) if (!isInt(v) || v < 0) e.push(`counts.${k}=${v}`);
    if (d.brand?.id !== first.id) e.push(`brand.id=${d.brand?.id}`);
    if (!Array.isArray(d.aliases) || !Array.isArray(d.children)) e.push('aliases/children');
  }
  verdict(S, `GET /api/brands/${first.id} shape`, e.length === 0, e.length ? e.slice(0, 4).join('; ') : `counts ${JSON.stringify(d.counts)}`, e.length ? { errors: e, body: excerpt(detail) } : undefined);
  if (d?.counts) verdict(S, 'typeahead activeSkuCount == detail activeSkuCount', first.activeSkuCount === d.counts.activeSkuCount, `list ${first.activeSkuCount} vs detail ${d.counts.activeSkuCount}`);

  // Cursor paging: walk every page (limit 50) for active and all; totals == detail counts, no repeats.
  for (const [status, countKey] of [['active', 'activeSkuCount'], ['all', 'skuCount']]) await guard(S, `products status=${status} paging`, async () => {
    const seen = new Set();
    let cursor = null;
    let pages = 0;
    let dupes = 0;
    const shapeErr = [];
    do {
      const r = await get(`/api/brands/${first.id}/products?limit=50&status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      sampleInto('brands', r.ms, r);
      if (r.status !== 200) {
        shapeErr.push(`page ${pages + 1} status ${r.status}: ${excerpt(r)}`);
        break;
      }
      for (const [i, it] of (r.json.items ?? []).entries()) {
        if (pages === 0 && i < 3) strictKeys(it, ['skuCatalogId', 'sku', 'title', 'isActive', 'imageUrl', 'brand', 'brandConfidence', 'brandSource', 'onHandUnits'], [], `items[${i}]`, shapeErr);
        if (seen.has(it.skuCatalogId)) dupes++;
        seen.add(it.skuCatalogId);
      }
      cursor = r.json.nextCursor;
      pages++;
    } while (cursor && pages < 200);
    const expected = d?.counts?.[countKey];
    verdict(S, `products status=${status} paging`, shapeErr.length === 0 && dupes === 0 && seen.size === expected, `${pages} pages, ${seen.size} unique, ${dupes} repeats vs counts.${countKey}=${expected}`, shapeErr.length ? shapeErr.slice(0, 3) : undefined);
  });
  const badCursor = await get(`/api/brands/${first.id}/products?cursor=not-a-cursor`);
  verdict(S, 'malformed cursor → 400', badCursor.status === 400, `status ${badCursor.status}`, excerpt(badCursor));
  const missing = await get('/api/brands/999999999');
  verdict(S, 'unknown brand → 404', missing.status === 404, `status ${missing.status}`, excerpt(missing));
}

// ── 6. latency ─────────────────────────────────────────────────────────────────

async function probeLatency() {
  const S = 'latency';
  const endpoints = {
    context: '/api/nav/context?path=%2Fshipping%2Forders',
    'context(top)': '/api/nav/context?path=%2Fshipping%2Forders&view=top',
    recents: '/api/nav/recents?surface=command_bar',
    'recents(adapter)': '/api/nav/recents?surface=identify.opened',
    facets: '/api/nav/facets?context=outbound.triage',
    'facets(exceptions)': '/api/nav/facets?context=outbound.exceptions',
    'identify(free)': '/api/identify?q=bose',
    brands: '/api/brands?q=bose',
  };
  const rows = {};
  for (const [name, url] of Object.entries(endpoints)) {
    for (let i = 0; i < 2; i++) await get(url); // warm-up
    const values = [];
    let unanswered = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const r = await get(url);
      if (answered(r)) values.push(r.ms);
      else unanswered++;
    }
    rows[name] = { p50: pct(values, 50), p95: pct(values, 95), n: values.length, unanswered };
    info(S, name, `p50 ${rows[name].p50} ms · p95 ${rows[name].p95} ms · n=${values.length}${unanswered ? ` · ${unanswered} unanswered` : ''}`);
  }
  return rows;
}

// ── main ───────────────────────────────────────────────────────────────────────

function printTable() {
  const cols = ['section', 'status', 'check', 'detail'];
  const rows = checks.map((c) => [c.section, c.status, c.name, c.detail]);
  const widths = [10, 6, 58];
  const clip = (s, w) => (s.length > w ? `${s.slice(0, w - 1)}…` : s.padEnd(w));
  console.log(cols.map((c, i) => (i < 3 ? clip(c, widths[i]) : c)).join(' │ '));
  console.log(widths.map((w) => '─'.repeat(w)).join('─┼─') + '─┼─' + '─'.repeat(40));
  for (const r of rows) console.log(r.map((v, i) => (i < 3 ? clip(String(v), widths[i]) : String(v))).join(' │ '));
}

async function main() {
  const startedAt = new Date().toISOString();
  const session = await mintSession();
  COOKIE = session.cookie;
  // Warm the lane so the first measured calls are not compile/cold-start.
  await get('/api/nav/context?path=%2F');

  const sections = [
    ['context', probeContext],
    ['recents', probeRecents],
    ['facets', probeFacets],
    ['identify', probeIdentify],
    ['brands', probeBrands],
    ['latency', probeLatency],
  ];
  const extras = {};
  for (const [name, fn] of sections) {
    CURRENT_SECTION = name;
    extras[name] = await guard(name, 'section', fn);
  }
  CURRENT_SECTION = 'report';

  const crawl = Object.fromEntries(
    Object.entries(latency).map(([k, v]) => [k, { p50: pct(v, 50), p95: pct(v, 95), n: v.length }]),
  );
  if (laneErrors.length) {
    fail('lane', 'dev server error pages', `${laneErrors.length} request(s) got the dev server's HTML error page (compile error elsewhere in the tree); the probe waited for recovery after each`, laneErrors);
  }
  const counts = checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});

  printTable();
  console.log('\nLatency (all probe calls, ms):');
  for (const [k, v] of Object.entries(crawl)) console.log(`  ${k.padEnd(18)} p50 ${String(v.p50).padStart(5)} · p95 ${String(v.p95).padStart(5)} · n=${v.n}`);
  console.log(`\nPASS ${counts.PASS ?? 0} · FAIL ${counts.FAIL ?? 0} · WARN ${counts.WARN ?? 0} · INFO ${counts.INFO ?? 0}`);

  const identifyLatency = Object.fromEntries(
    Object.entries(extras.identify ?? {}).map(([k, v]) => [k, { p50: pct(v, 50), p95: pct(v, 95), n: v.length, budgetP95: BUDGET_MS[k] ?? null }]),
  );
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        tenant: TENANT,
        staff: session.staff.name,
        startedAt,
        finishedAt: new Date().toISOString(),
        summary: counts,
        latency: { endpoints: extras.latency ?? {}, identifyByClass: identifyLatency, allCalls: crawl },
        transportErrors,
        laneErrors,
        checks,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nwrote ${path.relative(ROOT, RESULTS_PATH)}`);
  process.exitCode = counts.FAIL ? 1 : 0;
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exit(2);
});
