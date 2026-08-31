import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRaillessSurface } from '@/lib/sidebar-navigation';

/**
 * The rail-less contract, as behaviour.
 *
 * This replaces the intent of the deleted `outbound-rail-dedup.guard.test.ts`
 * without reviving its method: it calls the predicate and asserts what it
 * ANSWERS, rather than reading a component's source text to see which rail it
 * composes (AGENTS.md — pin an invariant where it can be observed).
 *
 * What it is really protecting, in BOTH directions since the 2026-08-31 split:
 *
 * - a wrong `false` reserves a 360px column beside a stage that was measured to
 *   give that width back (the regression the operator screenshotted 2026-08-30);
 * - a wrong `true` DELETES the navigator of a desk that reads `?id=` / `?skuId=`
 *   / `?open=` off its rail. That is the failure the `railless` flag exists to
 *   make impossible: wearing the page chrome no longer implies losing the rail.
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

test('scan-out keeps its station rail — it is not a desk-chrome page', () => {
  assert.equal(
    isRaillessSurface('/shipping/scan-out', params()),
    false,
    'Scan out is a Scan Station: edge-to-edge shell, recents rail intact',
  );
});

test('scan stations at large are never rail-less', () => {
  for (const path of ['/unbox', '/pack', '/test', '/triage']) {
    assert.equal(isRaillessSurface(path, params()), false, `${path} keeps its rail`);
  }
});

test('the Inbound desk is rail-less by its own clause', () => {
  // `/incoming` has NOT opted into deskChrome; deriving alone would hand its
  // rail back, which is why the explicit clause stays until it opts in.
  assert.equal(isRaillessSurface('/incoming', params()), true);
  assert.equal(isRaillessSurface('/incoming/anything', params()), true);
});

test('the dashboard is rail-less only in its outbound domain', () => {
  assert.equal(isRaillessSurface('/dashboard', params('mode=sales')), false);
});

test('no pathname is not a desk stage', () => {
  assert.equal(isRaillessSurface(null, params()), false);
  assert.equal(isRaillessSurface('', params()), false);
});

test('wearing the desk chrome does NOT cost a desk its rail', () => {
  // The 2026-08-31 decoupling, as behaviour. These four wear the same
  // `DeskPageChrome` as Shipping and navigate BY their context rail — the
  // manual picker, the SKU picker and the exception list write the params
  // their bodies read. Deriving rail-less from `deskChrome` deleted exactly
  // this, which is why the flags are two facts and not one.
  for (const path of ['/products', '/inventory', '/sourcing', '/operations']) {
    assert.equal(
      isRaillessSurface(path, params()),
      false,
      `${path} wears the chrome and KEEPS its rail`,
    );
  }
});

test('rail-less is declared, never inferred from having tabs', () => {
  // Shipping is the only page that declares it today. If a fifth desk ever
  // reads `true` here, someone added `railless: true` on purpose — which is the
  // whole point of the flag being written down.
  assert.equal(isRaillessSurface('/shipping/orders', params()), true);
  assert.equal(isRaillessSurface('/products', params('view=manuals')), false);
});
