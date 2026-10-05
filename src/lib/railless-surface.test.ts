import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSidebarContextPanel,
  isRaillessSurface,
  isStationSurfaceRoute,
} from '@/lib/sidebar-navigation';

/**
 * The rail-less contract, as behaviour.
 * give that width back (the regression the operator screenshotted 2026-08-30);
 */

const params = (qs = '') => new URLSearchParams(qs);

test('every Shipping desk segment is rail-less', () => {
  for (const path of [
    '/shipping/orders',
    '/shipping/fba',
    '/fulfilled',
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
      isRaillessSurface('/fulfilled', params('shippedWeekOffset=2')),
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

test('scan-out is rail-less — mobile-first composer, no left recent rail', () => {
  assert.equal(
    isRaillessSurface('/shipping/scan-out', params()),
    true,
    'Scan out collapses the left column for full-bleed center + bottom scan',
  );
});

test('scan stations keep an intake-only rail', () => {
  for (const path of ['/unbox', '/pack', '/test', '/triage']) {
    assert.equal(isRaillessSurface(path, params()), false, `${path} keeps its rail`);
  }
});

test('the Inbound desk is rail-less by its own clause', () => {
  // Inbound is rail-less by its own `railless` clause, not derived from anything else.
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

test('desk chrome and route-owned context panels are independent', () => {
  for (const path of ['/products', '/sourcing', '/operations']) {
    assert.equal(
      isRaillessSurface(path, params()),
      false,
      `${path} does not need a railless route declaration`,
    );
  }
  assert.equal(hasSidebarContextPanel('/products'), false);
  assert.equal(hasSidebarContextPanel('/operations'), false);
  assert.equal(hasSidebarContextPanel('/dashboard'), false);
  assert.equal(hasSidebarContextPanel('/audit-log/packing'), false);
  assert.equal(hasSidebarContextPanel('/settings/audit'), false);
  assert.equal(hasSidebarContextPanel('/shipping/fba'), false);
  assert.equal(hasSidebarContextPanel('/fba'), false);
  assert.equal(isStationSurfaceRoute('/shipping/orders'), false);
});

test('Warehouse uses the existing navigation spine, never a second route-owned sidebar', () => {
  assert.equal(isRaillessSurface('/inventory/stock', params()), false);
  assert.equal(isRaillessSurface('/inventory/locations', params()), false);
  assert.equal(hasSidebarContextPanel('/inventory'), false);
  assert.equal(hasSidebarContextPanel('/inventory/stock'), false);
  assert.equal(hasSidebarContextPanel('/inventory/locations'), false);
  assert.equal(hasSidebarContextPanel('/warehouse'), false);
});

test('rail-less is declared, never inferred from having tabs', () => {
  // Shipping declares it. If another desk ever reads `true` here,
  // someone added `railless: true` on purpose — which is the whole point of
  // the flag being written down.
  assert.equal(isRaillessSurface('/shipping/orders', params()), true);
  assert.equal(isRaillessSurface('/inventory', params()), false);
  assert.equal(isRaillessSurface('/inventory/stock', params()), false);
  assert.equal(isRaillessSurface('/inventory/locations', params()), false);
  assert.equal(isRaillessSurface('/products', params('view=manuals')), false);
});
