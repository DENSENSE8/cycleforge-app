/**
 * Unboxed / rail order helpers — preserveServerOrder must keep fetch order.
 * Run: `npx tsx --test src/components/sidebar/rail-shell/sidebar-rail-shared.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRailUpdatePatch, orderRailRowsByActivity } from './sidebar-rail-shared';
import { RECEIVING_RAIL_FEEDS } from '@/lib/receiving/rail/feeds';

describe('orderRailRowsByActivity', () => {
  const rows = [
    { id: 1, at: '2026-07-01T10:00:00Z' },
    { id: 2, at: '2026-07-20T12:00:00Z' },
    { id: 3, at: '2026-07-10T08:00:00Z' },
  ];

  it('preserveServerOrder=true keeps fetcher order even when activity times differ', () => {
    const ordered = orderRailRowsByActivity(rows, {
      preserveServerOrder: true,
      getActivityAt: (r) => r.at,
      getId: (r) => r.id,
    });
    assert.deepEqual(
      ordered.map((r) => r.id),
      [1, 2, 3],
    );
  });

  it('default re-sorts by activity DESC', () => {
    const ordered = orderRailRowsByActivity(rows, {
      getActivityAt: (r) => r.at,
      getId: (r) => r.id,
    });
    assert.deepEqual(
      ordered.map((r) => r.id),
      [2, 3, 1],
    );
  });
});

describe('mergeRailUpdatePatch', () => {
  const getUnboxOpened = (r: { unbox_opened_at?: string | null }) =>
    r.unbox_opened_at ?? null;

  it('applies narrow serial patches without touching unbox_opened_at', () => {
    const existing = {
      id: 10,
      unbox_opened_at: '2026-07-20T12:00:00Z',
      serials: [] as { id: number }[],
      item_name: 'Unfound PO',
    };
    const merged = mergeRailUpdatePatch(
      existing,
      { id: 10, serials: [{ id: 1 }], item_name: 'Return serial ABC' },
      getUnboxOpened,
    );
    assert.equal(merged.unbox_opened_at, '2026-07-20T12:00:00Z');
    assert.equal(merged.item_name, 'Return serial ABC');
    assert.equal(merged.serials.length, 1);
  });

  it('keeps Unboxed age when a Testing-style by-id dump nulls unbox_opened_at', () => {
    const existing = {
      id: 10,
      unbox_opened_at: '2026-07-20T12:00:00Z',
      item_name: 'Unfound PO',
      serials: [] as { id: number; serial_number: string }[],
    };
    // Mimic GET ?id= normalizeRow — full row with unbox_opened_at: null.
    const merged = mergeRailUpdatePatch(
      existing,
      {
        id: 10,
        unbox_opened_at: null,
        item_name: 'Return serial 064795940570213AE',
        serials: [{ id: 99, serial_number: '064795940570213AE' }],
      },
      getUnboxOpened,
    );
    assert.equal(merged.unbox_opened_at, '2026-07-20T12:00:00Z');
    assert.equal(merged.item_name, 'Return serial 064795940570213AE');
    assert.equal(merged.serials[0]?.serial_number, '064795940570213AE');
  });

  it('allows an intentional activity-axis rewrite when the patch supplies a stamp', () => {
    const existing = { id: 1, unbox_opened_at: '2026-07-01T00:00:00Z' };
    const merged = mergeRailUpdatePatch(
      existing,
      { id: 1, unbox_opened_at: '2026-07-20T18:00:00Z' },
      getUnboxOpened,
    );
    assert.equal(merged.unbox_opened_at, '2026-07-20T18:00:00Z');
  });
});

describe('unboxRecent feed', () => {
  it('preserves server order and labels first-open only', () => {
    const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
    assert.equal(feed.preserveServerOrder, true);
    assert.equal(feed.pinSelectedLead, false);
    assert.equal(feed.acceptLineUpdateBus, false);
    assert.equal(feed.listenLineDelete, false);
    assert.equal(
      feed.getActivityAt?.({
        id: 1,
        unbox_opened_at: '2026-07-20T12:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        scanned_at: '2026-07-20T18:00:00Z',
      } as never),
      '2026-07-20T12:00:00Z',
    );
    assert.equal(
      feed.getActivityAt?.({
        id: 2,
        unbox_opened_at: null,
        created_at: '2026-01-01T00:00:00Z',
        scanned_at: '2026-07-20T18:00:00Z',
      } as never),
      null,
    );
  });
});

describe('triage feed door-scan axis', () => {
  it('labels triageCombined by door-scan, not created_at', () => {
    const feed = RECEIVING_RAIL_FEEDS.triageCombined;
    assert.equal(
      feed.getActivityAt?.({
        id: 1,
        scanned_at: '2026-07-20T18:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        last_activity_at: '2026-07-19T00:00:00Z',
        unbox_opened_at: '2026-07-21T00:00:00Z',
      } as never),
      '2026-07-20T18:00:00Z',
    );
  });

  it('does not fall through to bare created_at when intake stamps are missing', () => {
    const feed = RECEIVING_RAIL_FEEDS.triageCombined;
    assert.equal(
      feed.getActivityAt?.({
        id: 1,
        created_at: '2026-01-01T00:00:00Z',
      } as never),
      null,
    );
  });
});
