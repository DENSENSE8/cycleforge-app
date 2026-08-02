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
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'classify');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'classify');
  assert.equal(resolveUnboxSideTab('tracking', SPARSE), 'classify');
});

test('support survives every gate — an open carton always has it', () => {
  const nothing: UnboxSideTabGates = {
    hasClassifyTab: false,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
    hasTimelineTab: false,
  };
  assert.equal(isUnboxSideTabVisible('support', nothing), true);
  // Was `checklist` until 2026-08-01 — with the procedure in the workbench
  // centre, Support is the last ungated display and so the fallback.
  assert.equal(resolveUnboxSideTab('units', nothing), 'support');
});

test('checklist is NOT a side tab — there is exactly ONE procedure surface', () => {
  // Deleted, not moved. A mirror "for reference" is a second procedure surface
  // in one station, and the two would disagree the first time one of them
  // learned about skips.
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('checklist' as never), false);
});

test('overview is NOT a side tab — the carton owns the centre', () => {
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('overview' as never),
    false,
    'moving overview into the Displays column would empty the workbench body',
  );
});
