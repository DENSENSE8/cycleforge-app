/**
 * Find-plane catalog guards, materialization and adapter behaviour — the
 * family that replaced `/search`'s hand-rolled `<ul>` of result links.
 *
 * Four assertions here are load-bearing beyond the usual shape checks:
 *
 * - the IDENTIFIER PRECEDENCE. One derivation feeds both the identity chip and
 *   the Id header's sort; two would sort a column by a string nobody can see.
 *   The order is "what a human would quote back", and the internal pk is the
 *   last resort, never the first answer.
 * - the LEADING COLUMN. The operator's anatomy law puts the verifiable
 *   identifier in the premier slot and forbids a text-heavy status word there.
 *   On the compound skeleton that is the `fulfillment` track, relabelled from
 *   the catalog's identity field — if that relabel is lost the header reverts
 *   to the Orders default and the plane starts claiming every row is an order.
 * - NO DASHED TRACK. `bin` and `qty` are not on the search wire, so they are
 *   not catalog fields. A bound field whose resolver can only answer `null` is
 *   the dead-header failure this repo has already paid for twice.
 * - HEADER SORT. Every painted DATA track answers with a fact; chrome does not.
 *   Same law the cohort enforces, pinned per family so a rebind cannot quietly
 *   produce an inert header.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  SEARCH_HITS_COMPOUND_COLUMNS,
  searchHitsCompoundColumnsFor,
  searchHitsSortFactFor,
} from '@/components/search/hits-grid/search-hits-grid-layout';
import {
  searchHitRowId,
  searchHitsCompoundView,
} from '@/components/search/hits-grid/search-hits-row-view';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import { SEARCH_HITS_FIELD_CATALOG, SEARCH_HITS_PRODUCT_LAYOUT } from './search-hits';
import { resolveSearchHitsSlotValue, searchHitIdentifier } from './search-hits-resolve';

function hit(overrides: Partial<AiSearchHit> = {}): AiSearchHit {
  return {
    id: 4989,
    entityType: 'order',
    title: 'Bose QC45 remote',
    subtitle: '113-1397006-0292212 · Bose',
    href: '/search?sel=order:4989',
    matchField: 'tracking_number',
    facets: {
      status: 'SHIPPED',
      order_id: '113-1397006-0292212',
      source_platform: 'amazon',
      tracking_number: '9405508106244533289572',
      carrier: 'usps',
      happened_at: '2026-09-10T23:04:12.000Z',
    },
    ...overrides,
  };
}

function text(value: CompoundSlotValue | null): string | null {
  if (!value) return null;
  return value.kind === 'value' ? value.text : null;
}

describe('search-hits catalog', () => {
  it('every field id is namespaced to the family and bindable somewhere', () => {
    for (const field of SEARCH_HITS_FIELD_CATALOG) {
      assert.ok(field.id.startsWith('search-hits.'), `${field.id} is not namespaced`);
      assert.equal(field.family, 'search-hits');
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
    }
  });

  it('every product-layout binding names a field the catalog knows', () => {
    const known = new Set(SEARCH_HITS_FIELD_CATALOG.map((f) => f.id));
    const bound = [
      SEARCH_HITS_PRODUCT_LAYOUT.identityFieldId,
      ...SEARCH_HITS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...SEARCH_HITS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ].filter((id): id is string => Boolean(id));
    for (const id of bound) assert.ok(known.has(id), `${id} is bound but not in the catalog`);
    assert.equal(SEARCH_HITS_PRODUCT_LAYOUT.amountFieldId, null, 'a hit has no money fact');
  });

  it('every catalog field resolves from the wire — no permanently dashed track', () => {
    // `bin` and `qty` are absent on purpose: the search doc does not carry
    // them, and a field whose resolver can only answer null is a dead header.
    const names = SEARCH_HITS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(names.includes('search-hits.bin'), false);
    assert.equal(names.includes('search-hits.qty'), false);

    const full = hit({
      facets: {
        status: 'RECEIVED',
        order_id: '38-50690',
        po_number: 'PO-9912',
        source_order_id: '38-50690',
        serial_number: 'SN-ABCDEFGH',
        condition_grade: 'B',
        source_platform: 'ebay',
        tracking_number: '1Z999AA10123456784',
        carrier: 'ups',
        happened_at: '2026-09-10T23:04:12.000Z',
      },
    });
    for (const field of SEARCH_HITS_FIELD_CATALOG) {
      assert.ok(
        text(resolveSearchHitsSlotValue(full, field.id)),
        `${field.id} resolved to nothing on a fully-populated hit`,
      );
    }
  });
});

describe('search-hits identifier', () => {
  it('prefers the marketplace order id, abbreviated by the chip, never the pk', () => {
    assert.equal(searchHitIdentifier(hit()), '113-1397006-0292212');
  });

  it('falls through order → serial → po → tracking → pk', () => {
    assert.equal(
      searchHitIdentifier(hit({ entityType: 'unit', facets: { serial_number: 'SN-ABCDEFGH' } })),
      'SN-ABCDEFGH',
    );
    assert.equal(
      searchHitIdentifier(hit({ entityType: 'receiving', subtitle: '', facets: { po_number: 'PO-9912' } })),
      'PO-9912',
    );
    assert.equal(
      searchHitIdentifier(
        hit({ entityType: 'fba', subtitle: '', facets: { tracking_number: '1Z999AA10123456784' } }),
      ),
      '1Z999AA10123456784',
    );
    // The pk is a real handle on every desk here, but it is nobody's first
    // answer to "which one?" — so it is the last resort, not the default.
    assert.equal(searchHitIdentifier(hit({ entityType: 'sku', subtitle: '', facets: {} })), '4989');
  });

  it('the row key survives two entities sharing a pk', () => {
    assert.notEqual(
      searchHitRowId(hit({ entityType: 'order', id: 41 })),
      searchHitRowId(hit({ entityType: 'unit', id: 41 })),
    );
  });
});

describe('search-hits adapter', () => {
  it('leads with the handle and pairs the status word with its tone', () => {
    const view = searchHitsCompoundView(hit());
    assert.equal(view.orderId, '113-1397006-0292212');
    assert.equal(view.title, 'Bose QC45 remote');
    assert.equal(view.stateLabel, 'Shipped');
    // Shipped is LIFECYCLE success — a finished row, not ordinary progress.
    assert.equal(view.stateTone, 'done');
    assert.equal(view.tracking, '9405508106244533289572');
    assert.equal(view.platformValue, 'amazon');
    assert.equal(view.carrier, 'usps');
  });

  it('spends attention tone only on states a human must act on', () => {
    assert.equal(searchHitsCompoundView(hit({ facets: { status: 'DELIVERED' } })).stateTone, 'done');
    assert.equal(searchHitsCompoundView(hit({ facets: { status: 'RETURNED' } })).stateTone, 'alert');
    assert.equal(searchHitsCompoundView(hit({ facets: { status: 'OPEN' } })).stateTone, 'alert');
  });

  it('carries the exact instant on both DATES lines, not just a civil day', () => {
    const view = searchHitsCompoundView(hit());
    assert.ok(view.orderedAt?.label, 'no civil day on the Hash line');
    assert.ok(view.delay?.faceLabel, 'no clock on the Calendar line');
    // The tip is the whole stamp — a relative face alone is not SLA-usable.
    assert.match(String(view.orderedAt?.tip), /·/);
    assert.equal(view.delayTip, view.orderedAt?.tip);
    assert.equal(view.delay?.overdue, false, 'a find plane has no deadlines');
  });

  it('a hit with no stamp says nothing rather than inventing an age', () => {
    const view = searchHitsCompoundView(hit({ facets: { status: 'OPEN' } }));
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });

  it('never paints money or a photo — the wire carries neither', () => {
    const view = searchHitsCompoundView(hit());
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });
});

describe('search-hits materialization', () => {
  it('mounts the shared skeleton WHOLE — no family cuts chrome to taste', () => {
    for (const key of COMPOUND_COLUMN_KEYS) {
      assert.ok(
        SEARCH_HITS_COMPOUND_COLUMNS.some((c) => c.key === key),
        `${key} was filtered off the skeleton`,
      );
    }
  });

  it('the identifier owns the LEADING data track, relabelled from the catalog', () => {
    const keys = SEARCH_HITS_COMPOUND_COLUMNS.map((c) => c.key);
    // select is the gutter; the first DATA track is the identity.
    assert.deepEqual(keys.slice(0, 2), ['select', 'fulfillment']);
    const identity = SEARCH_HITS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.label, 'Id', 'the identity header reverted to the Orders default');
    assert.equal(identity?.fieldId, 'search-hits.identifier');
    assert.equal(identity?.type, 'id');
  });

  it('renames the chrome headers into the find plane vocabulary', () => {
    const label = (key: string) =>
      SEARCH_HITS_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Description');
    assert.equal(label('dates'), 'When');
  });

  it('opens one track per status binding, in binding order', () => {
    const bound = SEARCH_HITS_COMPOUND_COLUMNS.filter((c) => c.key.startsWith('status:'));
    assert.deepEqual(
      bound.map((c) => c.fieldId),
      SEARCH_HITS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
    );
  });

  it('compound morph paints subtitles inside the item cell, never as tracks', () => {
    assert.equal(
      SEARCH_HITS_COMPOUND_COLUMNS.some((c) => c.key.startsWith('subtitle:')),
      false,
    );
  });

  it('every painted DATA header click-sorts; chrome does not', () => {
    for (const col of SEARCH_HITS_COMPOUND_COLUMNS) {
      const fact = searchHitsSortFactFor(col);
      if (isSlotTableChromeTrack(col.key)) {
        assert.equal(fact, null, `${col.key} is chrome but offers a sort`);
      } else {
        assert.ok(fact, `${col.key} is a painted data track with a dead header`);
      }
    }
  });

  it('a rebound layout keeps the sort keyed to the FACT, not the slot index', () => {
    const rebound = searchHitsCompoundColumnsFor({
      ...SEARCH_HITS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'search-hits.channel' }],
    });
    const track = rebound.find((c) => c.key === 'status:1');
    assert.equal(track?.fieldId, 'search-hits.channel');
    assert.equal(searchHitsSortFactFor(track!), 'search-hits.channel');
  });
});
