/**
 * Unit tests for the Unbox side-display resolver.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_SIDE_TAB_ORDER,
  isUnboxSideTabVisible,
  resolveUnboxSideTab,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasClassifyTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
  hasTimelineTab: true,
};

/** Unfound local-pickup carton with nothing scanned yet — the sparsest lane. */
const SPARSE: UnboxSideTabGates = {
  hasClassifyTab: true,
  hasListingsTab: false,
  hasUnits: false,
  hasPoNoteTab: false,
  hasTrackingTab: false,
  hasTimelineTab: false,
};

test('null in → null out: the Displays column is closed, not defaulted open', () => {
  // The single-state model: there is no separate open flag to drift from the
  // active tab, so "no tab" must never resolve to "some tab".
  assert.equal(resolveUnboxSideTab(null, MATCHED), null);
  assert.equal(resolveUnboxSideTab(null, SPARSE), null);
});

test('a visible request is returned unchanged', () => {
  for (const tab of UNBOX_SIDE_TAB_ORDER) {
    assert.equal(resolveUnboxSideTab(tab, MATCHED), tab);
  }
});

test('a request gated off falls back to the first visible tab, never an empty column', () => {
  // The operator had Units open and deleted the last serial: `hasUnits` flips
  // false under them. Painting an empty push column would read as a bug.
  //
  // The fallback is `checklist` since 2026-08-02 (it leads the strip and is
  // never gated off), and that is the better answer than the old `classify`:
  // a display dropped out from under the operator should land on the one that
  // always has something true to say about the carton.
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'checklist');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'checklist');
  assert.equal(resolveUnboxSideTab('tracking', SPARSE), 'checklist');
});

test('checklist and support survive every gate — an open carton always has both', () => {
  const nothing: UnboxSideTabGates = {
    hasClassifyTab: false,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
    hasTimelineTab: false,
  };
  assert.equal(isUnboxSideTabVisible('checklist', nothing), true);
  assert.equal(isUnboxSideTabVisible('support', nothing), true);
  // Checklist leads the strip, so it is the fallback when everything else gates
  // off — the display that always has something true to say about the carton.
  assert.equal(resolveUnboxSideTab('units', nothing), 'checklist');
});

test('checklist LEADS the strip — it is the default display', () => {
  // The station's live "where am I". Two clicks to find out what is left on a
  // carton is a cost paid on every box, so it is not behind the ⋯ menu and it is
  // not second.
  assert.equal(UNBOX_SIDE_TAB_ORDER[0], 'checklist');
});

test('overview is NOT a side tab — the carton owns the centre', () => {
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('overview' as never),
    false,
    'moving overview into the Displays column would empty the workbench body',
  );
});
