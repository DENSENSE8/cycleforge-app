/**
 * Materializer laws: slot-indexed keys stable under rebind, bands inserted at
 * the family anchors, compound subtitles open no tracks, stale bindings skip,
 * and a base skeleton that hand-splices a slot track is refused.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FieldCatalog } from './field-catalog/types';
import {
  isSlotTrackKey,
  materializeTracks,
  trackGeometryFor,
  type MaterializableTrack,
} from './materialize-tracks';
import type { SlotLayout } from './slot-layout';

const CATALOG: FieldCatalog = [
  { id: 'orders.order_id', family: 'orders', label: 'Order', displayType: 'id', slotKinds: ['identity'] },
  // Synthetic fixture, but the verb faces mirror the shipped catalog's
  // Needed-class pending copy so this file cannot read as a stale vocabulary.
  { id: 'orders.picked', family: 'orders', label: 'Pick', displayType: 'stage_event', slotKinds: ['status'], iconKey: 'picked', stageLabels: { done: 'Picked', pending: 'Needed' } },
  { id: 'orders.packed', family: 'orders', label: 'Packed', displayType: 'stage_event', slotKinds: ['status'], iconKey: 'packed' },
  { id: 'orders.qty', family: 'orders', label: 'Qty', displayType: 'number', slotKinds: ['subtitle'] },
  { id: 'orders.notes', family: 'orders', label: 'Notes', displayType: 'note', slotKinds: ['subtitle'] },
];

/** Compound-shaped chrome skeleton (keys only matter to the materializer). */
const BASE: readonly MaterializableTrack[] = [
  { key: 'select', width: 'minmax(3rem, 3rem)' },
  { key: 'thumb', width: 'minmax(3rem, 3rem)' },
  { key: 'fulfillment', width: 'minmax(6.5rem, 6.5rem)' },
  { key: 'item', width: 'minmax(18rem, 18rem)' },
  { key: 'state', width: 'minmax(10rem, 10rem)' },
  { key: 'amount', width: 'minmax(7rem, 7rem)' },
  { key: 'actions', width: 'minmax(2.5rem, 2.5rem)' },
  { key: '_fill', width: 'minmax(0rem, 1fr)' },
];

function layout(overrides: Partial<SlotLayout> = {}): SlotLayout {
  return {
    morph: 'compound',
    identityFieldId: 'orders.order_id',
    statusBindings: [{ fieldId: 'orders.picked' }],
    subtitleBindings: [],
    amountFieldId: null,
    ...overrides,
  };
}

describe('materializeTracks — compound', () => {
  it('inserts the status band after the state anchor, keyed by slot index', () => {
    const tracks = materializeTracks({ layout: layout(), catalog: CATALOG, base: BASE });
    assert.deepEqual(
      tracks.map((t) => t.key),
      ['select', 'thumb', 'fulfillment', 'item', 'state', 'status:1', 'amount', 'actions', '_fill'],
    );
    const status1 = tracks.find((t) => t.key === 'status:1')!;
    assert.equal(status1.label, 'Pick');
    assert.equal(status1.fieldId, 'orders.picked');
    assert.equal(status1.slotIconKey, 'picked');
    assert.equal(status1.slotDisplayType, 'stage_event');
    assert.deepEqual(status1.slotStageLabels, { done: 'Picked', pending: 'Needed' });
    // Step-track geometry (Slice 1's 9rem + the 28px actor mark).
    assert.equal(status1.width, 'minmax(10rem, 10rem)');
    assert.equal(status1.resizable, true);
  });

  it('keeps the key when a slot is REBOUND to a different field', () => {
    const rebound = materializeTracks({
      layout: layout({ statusBindings: [{ fieldId: 'orders.packed' }] }),
      catalog: CATALOG,
      base: BASE,
    });
    const status1 = rebound.find((t) => t.key === 'status:1')!;
    assert.equal(status1.fieldId, 'orders.packed');
    assert.equal(status1.label, 'Packed');
  });

  it('numbers multiple status slots in binding order', () => {
    const tracks = materializeTracks({
      layout: layout({ statusBindings: [{ fieldId: 'orders.picked' }, { fieldId: 'orders.packed' }] }),
      catalog: CATALOG,
      base: BASE,
    });
    assert.deepEqual(
      tracks.filter((t) => isSlotTrackKey(t.key)).map((t) => [t.key, t.fieldId]),
      [
        ['status:1', 'orders.picked'],
        ['status:2', 'orders.packed'],
      ],
    );
  });

  it('opens no tracks for empty bindings and none for compound subtitles', () => {
    const tracks = materializeTracks({
      layout: layout({ statusBindings: [], subtitleBindings: [{ fieldId: 'orders.qty' }] }),
      catalog: CATALOG,
      base: BASE,
    });
    assert.deepEqual(tracks.map((t) => t.key), BASE.map((t) => t.key));
  });

  it('skips a stale binding and renumbers densely', () => {
    const tracks = materializeTracks({
      layout: layout({ statusBindings: [{ fieldId: 'orders.ghost' }, { fieldId: 'orders.packed' }] }),
      catalog: CATALOG,
      base: BASE,
    });
    const slots = tracks.filter((t) => isSlotTrackKey(t.key));
    assert.deepEqual(slots.map((t) => [t.key, t.fieldId]), [['status:1', 'orders.packed']]);
  });

  it('refuses a base skeleton that hand-splices a slot track', () => {
    assert.throws(
      () =>
        materializeTracks({
          layout: layout(),
          catalog: CATALOG,
          base: [...BASE, { key: 'status:1', width: '1rem' }],
        }),
      /hand-spliced/,
    );
  });

  it('refuses a missing anchor rather than silently dropping the band', () => {
    assert.throws(
      () =>
        materializeTracks({
          layout: layout(),
          catalog: CATALOG,
          base: BASE.filter((t) => t.key !== 'state'),
        }),
      /anchor 'state'/,
    );
  });
});

describe('materializeTracks — sheet', () => {
  it('opens one subtitle track per binding after the item anchor', () => {
    const tracks = materializeTracks({
      layout: layout({
        morph: 'sheet',
        subtitleBindings: [{ fieldId: 'orders.qty' }, { fieldId: 'orders.notes' }],
      }),
      catalog: CATALOG,
      base: BASE,
    });
    assert.deepEqual(
      tracks.map((t) => t.key),
      [
        'select', 'thumb', 'fulfillment', 'item',
        'subtitle:1', 'subtitle:2',
        'state', 'status:1', 'amount', 'actions', '_fill',
      ],
    );
  });
});

describe('trackGeometryFor', () => {
  it('gives money an end alignment and stage_event the 10rem step track', () => {
    assert.equal(trackGeometryFor('money').align, 'end');
    assert.equal(trackGeometryFor('stage_event').width, 'minmax(10rem, 10rem)');
  });
});
