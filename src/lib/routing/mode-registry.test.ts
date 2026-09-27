/**
 * The route → mode registry is a declared contract: every page the app can
 * render resolves to an entry, and the longest declaration wins.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { modeRouteFor } from './mode-registry';

const APP_DIR = path.join(process.cwd(), 'src/app');

/** URL path of every `page.*` under `src/app` — route groups `(x)` and slots `@x` add no segment. */
function appPageRoutes(): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(APP_DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) continue;
    const segments = path
      .relative(APP_DIR, entry.parentPath)
      .split(path.sep)
      .filter((segment) => segment && !/^\(.*\)$/.test(segment) && !segment.startsWith('@'));
    routes.push(`/${segments.join('/')}`);
  }
  return routes;
}

test('every page under src/app resolves to a declared mode', () => {
  const routes = appPageRoutes();
  assert.ok(routes.includes('/') && routes.includes('/shipping/orders'), 'the page walk found the app tree');
  const undeclared = routes.filter((route) => modeRouteFor(route) === null);
  assert.deepEqual(undeclared, [], 'declare these routes in src/lib/routing/mode-registry.ts');
});

test('the longest declaration wins over its parent prefix', () => {
  assert.equal(modeRouteFor('/m/scan')?.mode, 'industrial');
  assert.equal(modeRouteFor('/m/scan/anything')?.mode, 'industrial');
  assert.equal(modeRouteFor('/m/pick')?.mode, 'triage');
});

test('an exact entry governs its own path only', () => {
  assert.equal(modeRouteFor('/m/orders')?.mode, 'industrial');
  assert.equal(modeRouteFor('/m/orders/123/info')?.mode, 'triage');
  assert.equal(modeRouteFor('/')?.mode, 'triage');
  assert.equal(modeRouteFor('/not-a-route'), null, 'the home entry is not a catch-all');
});

test('a prefix matches whole segments only', () => {
  assert.equal(modeRouteFor('/shipping/orders')?.mode, 'runtime');
  assert.equal(modeRouteFor('/shippingx'), null);
  assert.equal(modeRouteFor('/ai-chat')?.mode, 'assistant');
  assert.equal(modeRouteFor('/kiosk/v2')?.mode, 'counter');
});

test('no pathname resolves to nothing', () => {
  assert.equal(modeRouteFor(null), null);
  assert.equal(modeRouteFor(''), null);
});
