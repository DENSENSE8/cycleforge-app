import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeskStageSurface } from '@/lib/sidebar-navigation';

/**
 * The rail-less contract, as behaviour.
 *
 * This replaces the intent of the deleted `outbound-rail-dedup.guard.test.ts`
 * without reviving its method: it calls the predicate and asserts what it
 * ANSWERS, rather than reading a component's source text to see which rail it
 * composes (AGENTS.md — pin an invariant where it can be observed).
 *
 * What it is really protecting: `ContextPanelLayout` subtracts this from
 * `hasPanel`, so a `false` here is a 360px column reserved beside a
 * fixed-width desk stage that was measured to give that width back — the
 * regression the operator screenshotted on 2026-08-30.
 */

const params = (qs = '') => new URLSearchParams(qs);

test('every Shipping desk segment is rail-less', () => {
  for (const path of [
    '/shipping/orders',
    '/shipping/fba',
    '/shipping/shipped',
    '/shipping/labels',
  ]) {
    assert.equal(isDeskStageSurface(path, params()), true, `${path} must be rail-less`);
  }
});

test('a desk segment stays rail-less with its own params attached', () => {
  assert.equal(isDeskStageSurface('/shipping/orders', params('cage=1')), true);
  assert.equal(isDeskStageSurface('/shipping/fba', params('fbaMode=plan')), true);
  assert.equal(isDeskStageSurface('/shipping/labels', params('open=42')), true);
  assert.equal(
    isDeskStageSurface('/shipping/shipped', params('shippedWeekOffset=2')),
    true,
  );
});

test('scan-out keeps its station rail — it is not a desk-chrome page', () => {
  assert.equal(
    isDeskStageSurface('/shipping/scan-out', params()),
    false,
    'Scan out is a Scan Station: edge-to-edge shell, recents rail intact',
  );
});

test('scan stations at large are never rail-less', () => {
  for (const path of ['/unbox', '/pack', '/test', '/triage']) {
    assert.equal(isDeskStageSurface(path, params()), false, `${path} keeps its rail`);
  }
});

test('the Inbound desk is rail-less by its own clause', () => {
  // `/incoming` has NOT opted into deskChrome; deriving alone would hand its
  // rail back, which is why the explicit clause stays until it opts in.
  assert.equal(isDeskStageSurface('/incoming', params()), true);
  assert.equal(isDeskStageSurface('/incoming/anything', params()), true);
});

test('the dashboard is rail-less only in its outbound domain', () => {
  assert.equal(isDeskStageSurface('/dashboard', params('mode=sales')), false);
});

test('no pathname is not a desk stage', () => {
  assert.equal(isDeskStageSurface(null, params()), false);
  assert.equal(isDeskStageSurface('', params()), false);
});
