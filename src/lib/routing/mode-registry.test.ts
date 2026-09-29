/**
 * The route → mode registry is a declared contract: every page the app can
 * render resolves to an entry, and the longest declaration wins.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { ModeName } from '@/design-system/modes/registry';
import { resolveRegionMode } from '@/design-system/providers/resolve-region-mode';
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
  assert.equal(modeRouteFor('/')?.mode, 'triage');
  assert.equal(modeRouteFor('/not-a-route'), null, 'the home entry is not a catch-all');
});

test('a prefix matches whole segments only', () => {
  assert.equal(modeRouteFor('/shipping/orders')?.mode, 'triage');
  assert.equal(modeRouteFor('/shippingx'), null);
  assert.equal(modeRouteFor('/m/pack/start/7')?.mode, 'industrial');
  assert.equal(modeRouteFor('/m/packer'), modeRouteFor('/m'), '/m/pack does not own /m/packer');
  assert.equal(modeRouteFor('/ai-chat')?.mode, 'assistant');
  assert.equal(modeRouteFor('/kiosk/v2')?.mode, 'counter');
});

test('no pathname resolves to nothing', () => {
  assert.equal(modeRouteFor(null), null);
  assert.equal(modeRouteFor(''), null);
});

test('industrial is declared only by /m/* operation flows — no desk page is ever industrial', () => {
  const industrialDesks = appPageRoutes().filter(
    (route) => modeRouteFor(route)?.mode === 'industrial' && route !== '/m' && !route.startsWith('/m/'),
  );
  assert.deepEqual(industrialDesks, []);
});

test('phone operation flows declare industrial; reading flows and the whole pick flow declare triage (owner 2026-09-28)', () => {
  const operations = ['/m/scan', '/m/pack', '/m/pack/start/7', '/m/id/scan-out/7', '/m/r/5', '/m/r/5/classify', '/m/loc/A-01', '/m/pair/A-01/SKU1', '/m/u/9/qc'];
  for (const pathname of operations) assert.equal(modeRouteFor(pathname)?.mode, 'industrial', pathname);
  const reading = ['/m', '/m/home', '/m/work', '/m/orders', '/m/orders/7/info', '/m/imports', '/m/exceptions', '/m/rs/3', '/m/pick', '/m/pick/42', '/m/id/pick/42'];
  for (const pathname of reading) assert.equal(modeRouteFor(pathname)?.mode, 'triage', pathname);
});

/** What a portalled region asking for `requested` paints on `pathname`. */
function paints(pathname: string, requested: ModeName, form?: boolean): ModeName {
  return resolveRegionMode(requested, modeRouteFor(pathname)?.mode ?? null, { form });
}

test('a portalled triage sheet takes its operation flow’s industrial, holds triage as a form, and stays triage on desks', () => {
  assert.equal(paints('/m/scan', 'triage'), 'industrial');
  assert.equal(paints('/m/scan', 'triage', true), 'triage');
  assert.equal(paints('/m/home', 'triage'), 'triage');
  assert.equal(paints('/shipping/orders', 'triage'), 'triage');
});
