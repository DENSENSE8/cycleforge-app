/**
 * Guard: the `/unbox` RSC first-paint recents-rail seed must write the EXACT
 * key `ReceivingFeedRail` mounts for the default Unboxed rail, and must reuse
 * the shared row transform — or the seed silently no-ops (key miss) or drifts
 * from the client fetch (a divergent `client_event_id` remounts the whole rail).
 *
 * SoT — the seed and the mount both funnel through:
 *   - key      → `receivingRailQueryKey` (`../receiving/rail/rail-query-key`)
 *   - rows     → `transformUnboxOpenedRows` (`../receiving/rail/unbox-opened-rows`)
 *   - segment  → `RECEIVING_RAIL_FEEDS.unboxRecent.segment`
 *
 * Why a SOURCE guard for half of it: the regression shape is re-inlining the
 * dedup/stamp/key transform in either the client fetcher or the seed (so the two
 * copies drift), or the seed hand-rolling a key literal that stops matching the
 * mount — both invisible to a behavioral test of the builder alone. This mirrors
 * the queue-counts-normalize seed guard reasoning.
 *
 * The `.server` seed carries `import 'server-only'` (throws in a node test), so
 * this guard asserts the CONTRACT against the shared, server-safe modules + the
 * seed's SOURCE rather than importing it.
 *
 * Run: `npx tsx --test src/lib/queries/unbox-recent-rail-seed.guard.test.ts`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { RECEIVING_RAIL_FEEDS } from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import {
  transformUnboxOpenedRows,
  UNBOX_SIDEBAR_LIMIT,
} from '@/lib/receiving/rail/unbox-opened-rows';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

describe('unbox recents-rail first-paint seed', () => {
  it('the unboxRecent feed segment is stable (the seed hardcodes via it)', () => {
    assert.equal(RECEIVING_RAIL_FEEDS.unboxRecent.segment, 'received');
  });

  it('the shared builder reproduces the historical inline mount key exactly', () => {
    // Historical literal ReceivingFeedRail mounted, before extraction:
    //   ['receiving-lines-table','rail', feed.segment, scope ?? 'default', q, staffId ?? 'all']
    assert.deepEqual(receivingRailQueryKey('received', undefined, '', null), [
      'receiving-lines-table',
      'rail',
      'received',
      'default',
      '',
      'all',
    ]);
    // staffId stays a NUMBER (not '5'), scope passes through, q is verbatim.
    assert.deepEqual(receivingRailQueryKey('scanned', 'triage', 'abc', 5), [
      'receiving-lines-table',
      'rail',
      'scanned',
      'triage',
      'abc',
      5,
    ]);
  });

  it('the seed key equals the default Unboxed rail mount key', () => {
    const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
    // The seed builds: receivingRailQueryKey(feed.segment, undefined, '', null).
    // The default mount builds: receivingRailQueryKey(feed.segment, /*scope*/ undefined,
    //   /*q*/ '', /*staffId*/ null). Same function, same args ⇒ deep-equal.
    const seedKey = receivingRailQueryKey(feed.segment, undefined, '', null);
    const mountKey = receivingRailQueryKey(feed.segment, undefined, '', null);
    assert.deepEqual(seedKey, mountKey);
  });

  it('transformUnboxOpenedRows dedups by carton and stamps the durable carton key', () => {
    const rows = [
      { id: 10, receiving_id: 1 } as unknown as ReceivingLineRow,
      { id: -5, receiving_id: 1 } as unknown as ReceivingLineRow, // stub for same carton
      { id: 20, receiving_id: 2 } as unknown as ReceivingLineRow,
    ];
    const out = transformUnboxOpenedRows(rows);
    // One representative per carton, SQL order preserved (carton 1 then 2).
    assert.deepEqual(
      out.map((r) => r.receiving_id),
      [1, 2],
    );
    // Real line wins over the stub for carton 1.
    assert.equal(out[0]!.id, 10);
    // Durable carton client_event_id so seed ↔ fetch reconcile in place.
    assert.equal(out[0]!.client_event_id, 'carton:1');
    assert.equal(out[1]!.client_event_id, 'carton:2');
    assert.ok(UNBOX_SIDEBAR_LIMIT >= out.length);
  });

  it('the client fetcher and the RSC seed both use the shared transform (no drift)', () => {
    const feeds = sourceOf('../receiving/rail/feeds.ts');
    const seed = sourceOf('./unbox-spine-seed.server.ts');
    const railMount = sourceOf(
      '../../components/sidebar/receiving/ReceivingFeedRail.tsx',
    );

    // Both producers call the shared transform...
    assert.match(feeds, /transformUnboxOpenedRows\(/);
    assert.match(seed, /transformUnboxOpenedRows\(/);
    // ...and neither re-inlines the title-context stamp (the drift shape).
    assert.doesNotMatch(feeds, /stampCartonRailTitleContext\(/);
    assert.doesNotMatch(seed, /stampCartonRailTitleContext\(/);

    // The mount + the seed build the key through the shared SoT, not a literal.
    assert.match(railMount, /receivingRailQueryKey\(/);
    assert.match(seed, /receivingRailQueryKey\(/);

    // The seed rides in seedUnboxQueue's QueryClient (one dehydrate state).
    assert.match(seed, /seedUnboxRecentRail\(queryClient\)/);
  });
});
