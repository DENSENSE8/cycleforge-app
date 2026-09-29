/** nav-registry contracts — active-route identification for the /m shell. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_NAV_DESTINATIONS, isGroupActive, isLeafActive } from './nav-registry';
import { domainLane, type DomainGroupId } from '@/lib/nav/lanes';

// ─── isLeafActive ────────────────────────────────────────────────────────────

test('leaf activates on exact match', () => {
  assert.equal(isLeafActive('/m/pick', '/m/pick'), true);
});

test('leaf activates on nested detail routes', () => {
  assert.equal(isLeafActive('/m/pick/123', '/m/pick'), true);
  assert.equal(isLeafActive('/m/orders/88/info', '/m/orders'), true);
});

test('leaf does not activate on a longer sibling path sharing the prefix', () => {
  assert.equal(isLeafActive('/m/pickaxe', '/m/pick'), false);
});

test('null pathname never activates', () => {
  assert.equal(isLeafActive(null, '/m/pick'), false);
});

// ─── isGroupActive ───────────────────────────────────────────────────────────

test('the Outbound lane activates on every route it claims', () => {
  const outbound = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'fulfillment');
  assert.equal(outbound?.kind, 'group');
  if (outbound?.kind !== 'group') return;
  for (const p of [
    '/m/work',
    '/m/pick',
    '/m/pick/9',
    '/m/pack',
    '/m/orders/12',
    '/m/shipping/shipments/3',
  ]) {
    assert.equal(isGroupActive(p, outbound.matchPrefixes), true, p);
  }
  assert.equal(isGroupActive('/m/scan', outbound.matchPrefixes), false);
  // Exceptions is its own L0 row now; its routes never light the Outbound lane.
  assert.equal(isGroupActive('/m/exceptions/fbm%3A7', outbound.matchPrefixes), false);
});

test('Exceptions is an L0 drawer row over every kind — not a row inside any lane', () => {
  const exceptions = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'exceptions');
  assert.equal(exceptions?.kind, 'leaf');
  assert.equal(exceptions?.href, '/m/exceptions');
  assert.equal(isLeafActive('/m/exceptions/pairs%3A12', '/m/exceptions'), true);
  for (const item of MOBILE_NAV_DESTINATIONS) {
    if (item.kind !== 'group') continue;
    assert.equal(item.children.some((child) => child.href === '/m/exceptions'), false, `${item.id} must not repeat the Exceptions door`);
  }
});

test('Products and Reports are permission-gated L0 mobile destinations', () => {
  const products = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'products');
  const reports = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'reports');
  assert.equal(products?.kind, 'leaf');
  assert.equal(products?.href, '/m/products');
  assert.equal(products?.requires, 'sku_stock.view');
  assert.equal(reports?.kind, 'leaf');
  assert.equal(reports?.href, '/m/reports');
  assert.equal(reports?.requires, 'operations.view');
});

// ─── Registry integrity ──────────────────────────────────────────────────────

test('destination ids are unique', () => {
  const ids: string[] = [];
  for (const item of MOBILE_NAV_DESTINATIONS) {
    ids.push(item.id);
    if (item.kind === 'group') ids.push(...item.children.map((c) => c.id));
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('every destination href routes into the /m app', () => {
  for (const item of MOBILE_NAV_DESTINATIONS) {
    if (item.kind === 'leaf') assert.ok(item.href.startsWith('/m'), item.href);
    else for (const child of item.children) assert.ok(child.href.startsWith('/m'), child.href);
  }
});

test('the icon law: every PARENT carries a glyph, no child has the field', () => {
  for (const item of MOBILE_NAV_DESTINATIONS) {
    // Operator 2026-09-14: "icon at the parent level only". An L0 row and a
    // lane header are both parents; a row inside a lane is not.
    assert.equal(typeof item.icon, 'function', `${item.id} is a parent and needs a glyph`);
    if (item.kind !== 'group') continue;
    for (const child of item.children) {
      assert.equal(
        'icon' in child,
        false,
        `${item.id}/${child.id} is a child — the glyph belongs to its lane`,
      );
    }
  }
});

test('lane faces come from the shared registry', () => {
  for (const group of MOBILE_NAV_DESTINATIONS.filter((item) => item.kind === 'group')) {
    const lane = domainLane(group.id as DomainGroupId);
    assert.equal(group.label, lane.label, `${group.id} label`);
    assert.equal(group.icon, lane.icon, `${group.id} icon`);
  }
});

test('Scan stays out of the drawer — it owns the permanent top-right seat', () => {
  const hrefs: string[] = [];
  for (const item of MOBILE_NAV_DESTINATIONS) {
    hrefs.push(item.href ?? '');
    if (item.kind === 'group') hrefs.push(...item.children.map((c) => c.href));
  }
  assert.equal(hrefs.includes('/m/scan'), false);
});

test('Quality control is an L0 door onto the scan kernel armed for QC, gated on tech.qc_pass', () => {
  // The checklist GET/POST both carry `tech.qc_pass`; a drawer row without the
  // same gate would open a station whose first step 403s.
  const qc = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'qc');
  assert.equal(qc?.kind, 'leaf');
  assert.equal(qc?.href, '/m/scan?work=qc', 'the one scan kernel, armed for QC — not a second scan door');
  assert.equal(qc?.requires, 'tech.qc_pass');
});
