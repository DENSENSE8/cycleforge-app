import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSidebarContextPanel, isRaillessSurface } from '@/lib/sidebar-navigation';

/**
 * The rail-less contract, as behaviour.
 * give that width back (the regression the operator screenshotted 2026-08-30);
 */

const params = (qs = '') => new URLSearchParams(qs);

test('every Shipping desk segment is rail-less', () => {
  for (const path of [
    '/shipping/orders',
    '/shipping/fba',
    '/shipping/shipped',
    '/shipping/labels',
  ]) {
    assert.equal(isRaillessSurface(path, params()), true, `${path} must be rail-less`);
  }
});

test('a desk segment stays rail-less with its own params attached', () => {
  assert.equal(isRaillessSurface('/shipping/orders', params('cage=1')), true);
  assert.equal(isRaillessSurface('/shipping/fba', params('fbaMode=plan')), true);
  assert.equal(isRaillessSurface('/shipping/labels', params('open=42')), true);
  assert.equal(
    isRaillessSurface('/shipping/shipped', params('shippedWeekOffset=2')),
    true,
  );
});

test('Support ticket alias of To ship stays rail-less', () => {
  // `/shipping/orders?context=support` is Support's spine pin on the Shipping
  // desk, not a second rail. Focus + Saved views must stay collapsed.
  assert.equal(
    isRaillessSurface('/shipping/orders', params('context=support')),
    true,
  );
  assert.equal(
    isRaillessSurface('/shipping/orders', params('context=support&openOrderId=7')),
    true,
  );
});

test('Support keeps a rail only on Tickets recents', () => {
  assert.equal(isRaillessSurface('/support', params()), false);
  assert.equal(isRaillessSurface('/support', params('mode=tickets')), false);
  assert.equal(isRaillessSurface('/support', params('ticket=12')), false);
  for (const mode of ['voicemail', 'calls', 'warranty', 'issues', 'orders']) {
    assert.equal(
      isRaillessSurface('/support', params(`mode=${mode}`)),
      true,
      `/support?mode=${mode} must collapse the left column`,
    );
  }
});

test('scan-out is rail-less — mobile-first composer, no left recent rail', () => {
  assert.equal(
    isRaillessSurface('/shipping/scan-out', params()),
    true,
    'Scan out collapses the left column for full-bleed center + bottom scan',
  );
});

test('other scan stations keep their rail', () => {
  for (const path of ['/unbox', '/pack', '/test', '/triage']) {
    assert.equal(isRaillessSurface(path, params()), false, `${path} keeps its rail`);
  }
});

test('the Inbound desk is rail-less by its own clause', () => {
  // Inbound opted into `deskChrome` on 2026-09-14 (its two lanes are its tab row), and is STILL rail-less by its own clause — the two flags…
  assert.equal(isRaillessSurface('/incoming', params()), true);
  assert.equal(isRaillessSurface('/incoming/anything', params()), true);
});

test('the Repair desk is rail-less once favorites moved into the catalog picker', () => {
  // Its left column had one tenant (the Favorites rail); the `?new=true` intake
  // overlay it also hosted now mounts on the right pane via RepairIntakeHost.
  assert.equal(isRaillessSurface('/repair', params()), true);
  assert.equal(isRaillessSurface('/repair', params('tab=done')), true);
});

test('the dashboard is rail-less only in its outbound domain', () => {
  assert.equal(isRaillessSurface('/dashboard', params('mode=sales')), false);
});

test('no pathname is not a desk stage', () => {
  assert.equal(isRaillessSurface(null, params()), false);
  assert.equal(isRaillessSurface('', params()), false);
});

test('wearing the desk chrome does NOT cost a desk its rail', () => {
  // The 2026-08-31 decoupling, as behaviour.
  // Inventory is the exception that *did* take `railless` (operator 2026-09-15).
  for (const path of ['/products', '/sourcing', '/operations']) {
    assert.equal(
      isRaillessSurface(path, params()),
      false,
      `${path} wears the chrome and KEEPS its rail`,
    );
  }
});

test('the Inventory desk is rail-less on every mount', () => {
  // Callers: isRaillessSurface + CONTEXT_PANEL_ROUTE_KEYS. No data schemas.
  // User: "remove the sidebar in general for all the mounting points, in the inventory page in general for the left sidebar"
  for (const [path, qs] of [
    ['/inventory', ''],
    ['/inventory/triage', ''],
    ['/inventory/pulse', ''],
    ['/inventory/graph', ''],
    ['/inventory?section=replenish', 'section=replenish'],
    ['/inventory/locations', ''],
    ['/inventory/locations', 'tab=rooms'],
    ['/inventory/locations', 'tab=bins'],
    ['/inventory/locations', 'tab=map'],
    ['/inventory/locations', 'tab=manage'],
    ['/inventory/locations', 'tab=totes'],
    ['/warehouse', ''],
    ['/warehouse', 'tab=rooms'],
  ] as const) {
    const search = qs.includes('=') ? params(qs) : params(qs);
    const pathname = path.split('?')[0]!;
    assert.equal(
      isRaillessSurface(pathname, search),
      true,
      `${path}${qs ? `?${qs}` : ''} must collapse the left column`,
    );
  }
  assert.equal(hasSidebarContextPanel('/inventory'), false);
  assert.equal(hasSidebarContextPanel('/inventory/locations'), false);
  assert.equal(hasSidebarContextPanel('/warehouse'), false);
});

test('rail-less is declared, never inferred from having tabs', () => {
  // Shipping and Inventory declare it. If another desk ever reads `true` here,
  // someone added `railless: true` on purpose — which is the whole point of
  // the flag being written down.
  assert.equal(isRaillessSurface('/shipping/orders', params()), true);
  assert.equal(isRaillessSurface('/inventory', params()), true);
  assert.equal(isRaillessSurface('/products', params('view=manuals')), false);
});
