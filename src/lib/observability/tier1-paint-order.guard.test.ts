/**
 * Tier-1 paint order guard — declared LCP hosts must not gate primary paint
 * behind `ssr: false` without an SSR stand-in sibling.
 *
 * Run: `npx tsx --test src/lib/observability/tier1-paint-order.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TIER1_PAINT_ORDER, paintMarkId, resolveTier1Route } from './tier1-paint-order';

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const root = process.cwd();
const read = (rel: string) => code(readFileSync(join(root, rel), 'utf8'));

describe('Tier-1 paint content order registry', () => {
  it('declares unique paths and mark routes', () => {
    const paths = TIER1_PAINT_ORDER.map((r) => r.path);
    assert.equal(new Set(paths).size, paths.length);
    const marks = TIER1_PAINT_ORDER.map((r) => r.markRoute);
    assert.equal(new Set(marks).size, marks.length);
    // Exercise helpers so knip keeps them live.
    assert.equal(resolveTier1Route('/dashboard')?.path, '/shipping/orders');
    assert.equal(paintMarkId('orders', 'primary'), 'orders:primary');
  });

  it('every lcpHost and skeleton path exists', () => {
    for (const route of TIER1_PAINT_ORDER) {
      for (const host of route.lcpHosts) {
        assert.ok(existsSync(join(root, host)), `missing lcpHost ${host} (${route.path})`);
      }
      if (route.skeleton) {
        assert.ok(
          existsSync(join(root, route.skeleton)),
          `missing skeleton ${route.skeleton} (${route.path})`,
        );
      }
    }
  });

  it('LCP hosts do not put the primary surface behind ssr: false without a stand-in', () => {
    for (const route of TIER1_PAINT_ORDER) {
      if (route.lcpSurface !== 'primary') continue;
      for (const host of route.lcpHosts) {
        const src = read(host);
        if (!/ssr:\s*false/.test(src)) continue;
        // Allowed only when the same file (or declared skeleton) documents a stand-in.
        const hasStandInComment =
          /ssr-stand-in|SSR stand-in|OrdersQueueFirstPaint|UnboxStationFirstPaint|UnboxBrowseFirstPaint|WorkbenchSkeleton/i.test(
            src,
          );
        const hasSkeleton = Boolean(route.skeleton && existsSync(join(root, route.skeleton)));
        assert.ok(
          hasStandInComment || hasSkeleton,
          `${host} gates ssr:false on LCP path ${route.path} without stand-in / skeleton`,
        );
      }
    }
  });

  it('To-ship desk seeds via HydrationBoundary (Packer golden)', () => {
    const page = read('src/app/shipping/orders/page.tsx');
    assert.match(page, /HydrationBoundary/);
    assert.match(page, /seedUnshippedQueue|OrdersQueueFirstPaint/);
  });

  it('Unbox seeds station above the shell (rail sibling) + first-paint stand-in', () => {
    // Rail is a sibling of the page — seed must hydrate in the root layout.
    const layout = read('src/app/layout.tsx');
    assert.match(layout, /maybeSeedUnboxShell/);
    assert.match(layout, /ShellQuerySeed/);

    const page = read('src/app/unbox/page.tsx');
    assert.match(page, /UnboxBrowseShell/);
    assert.doesNotMatch(page, /HydrationBoundary|seedUnboxStation/);

    const shell = read('src/components/receiving/unbox/UnboxBrowseShell.tsx');
    assert.match(shell, /UnboxStationFirstPaint/);

    const seed = read('src/lib/queries/unbox-spine-seed.server.ts');
    assert.match(seed, /seedUnboxStation/);
    assert.match(seed, /unbox_opened/);
    assert.match(seed, /receiving-siblings/);
  });

  it('Search LCP is header find + browse shell — not a desk remount', () => {
    const page = read('src/app/search/page.tsx');
    assert.match(page, /SearchBrowseShell/);
    assert.doesNotMatch(page, /SearchFindStage/);
    assert.doesNotMatch(page, /ShippedDetailsPanel|OrderRecordBody/);
  });
});
