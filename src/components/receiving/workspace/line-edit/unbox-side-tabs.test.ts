/**
 * Unit tests for the Unbox side-display resolver.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION_LOOK_DISPLAY_ID } from '@/components/station/displays/display-index';
import {
  UNBOX_DISPLAY_INDEX,
  UNBOX_STRIP_TAB_ORDER,
  isUnboxSideTabVisible,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  resolveUnboxSideTab,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
  hasTimelineTab: true,
};

/** Unfound local-pickup carton with nothing scanned yet — the sparsest lane. */
const SPARSE: UnboxSideTabGates = {
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: false,
  hasUnits: false,
  hasPoNoteTab: false,
  hasTrackingTab: false,
  hasTimelineTab: false,
};

test('closed, index and Look resolve to no carton leaf', () => {
  assert.equal(resolveUnboxSideTab(null, MATCHED), null);
  assert.equal(resolveUnboxSideTab(UNBOX_DISPLAY_INDEX, MATCHED), null);
  assert.equal(resolveUnboxSideTab(STATION_LOOK_DISPLAY_ID, MATCHED), null);
  assert.equal(resolveUnboxSideTab('bogus', MATCHED), null);
});

test('a visible request is returned unchanged', () => {
  for (const tab of UNBOX_STRIP_TAB_ORDER) {
    assert.equal(resolveUnboxSideTab(tab, MATCHED), tab);
  }
});

test('a request gated off falls back to the first visible strip leaf', () => {
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'linkage');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'linkage');
  assert.equal(resolveUnboxSideTab('timeline', SPARSE), 'linkage');
  assert.equal(
    resolveUnboxSideTab('linkage', { ...MATCHED, hasLinkageTab: false }),
    'listings',
  );
});

test('a found return order gates Pairing off', () => {
  assert.equal(isUnboxSideTabVisible('linkage', { ...MATCHED, hasLinkageTab: false }), false);
});

test('prebox · photos · ticket · checklist · locations are always on', () => {
  for (const tab of ['prebox', 'photos', 'ticket', 'checklist', 'locations'] as const) {
    assert.equal(isUnboxSideTabVisible(tab, SPARSE), true, tab);
  }
});

test('Checklist trails the strip; Locations and Timeline sit below the carton leaves', () => {
  assert.equal(UNBOX_STRIP_TAB_ORDER.at(-1), 'checklist');
  assert.ok(UNBOX_STRIP_TAB_ORDER.indexOf('locations') > UNBOX_STRIP_TAB_ORDER.indexOf('tracking'));
  assert.ok(UNBOX_STRIP_TAB_ORDER.indexOf('timeline') > UNBOX_STRIP_TAB_ORDER.indexOf('locations'));
});

test('nest parsers coerce unknown values to the actions list', () => {
  assert.equal(parseUnboxPhotoAction('compare'), 'compare');
  assert.equal(parseUnboxPhotoAction('browse'), 'actions');
  assert.equal(parseUnboxPhotoAction(undefined), 'actions');
  assert.equal(parseUnboxLinkageAction('note'), 'note');
  assert.equal(parseUnboxLinkageAction('link'), 'actions');
  assert.equal(parseUnboxLinkageAction(undefined), 'actions');
});
