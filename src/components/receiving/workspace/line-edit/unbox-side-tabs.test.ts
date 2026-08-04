/**
 * Unit tests for the Unbox side-display resolver.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_SIDE_TAB_ORDER,
  UNBOX_STRIP_TAB_ORDER,
  isUnboxSideTabVisible,
  resolveUnboxSideTab,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasClassifyTab: true,
  hasPairingTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
  hasTimelineTab: true,
};

/** Unfound local-pickup carton with nothing scanned yet — the sparsest lane. */
const SPARSE: UnboxSideTabGates = {
  hasClassifyTab: true,
  // An unfound carton is exactly the one that needs pairing — it has a carton
  // record, it just has no PO yet.
  hasPairingTab: true,
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

test('a request gated off falls back to the first strip-visible tab, never an empty column', () => {
  // The operator had Units open and deleted the last serial: `hasUnits` flips
  // false under them. Painting an empty push column would read as a bug.
  //
  // Checklist is ring-only — fallback lands on the first strip tab that survives
  // the gates (Pairing leftmost on the unfound lane).
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'pairing');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'pairing');
  assert.equal(resolveUnboxSideTab('tracking', SPARSE), 'pairing');
});

test('checklist and support survive every gate — an open carton always has both', () => {
  const nothing: UnboxSideTabGates = {
    hasClassifyTab: false,
    hasPairingTab: false,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
    hasTimelineTab: false,
  };
  assert.equal(isUnboxSideTabVisible('checklist', nothing), true);
  assert.equal(isUnboxSideTabVisible('support', nothing), true);
  // Checklist is still resolvable via URL / ring even when strip tabs are gone.
  assert.equal(resolveUnboxSideTab('checklist', nothing), 'checklist');
  // Gated-off strip tab falls back to support — the only strip survivor here.
  assert.equal(resolveUnboxSideTab('units', nothing), 'support');
});

test('checklist is ring-only — not on the strip order', () => {
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('checklist'), false);
  assert.equal(UNBOX_STRIP_TAB_ORDER[0], 'pairing');
  // Body registry still includes checklist for ?display= deep links.
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('checklist'), true);
});

test('pairing is a strip display, gated on having a carton to pair', () => {
  // It moved here from the `contents` step body (2026-08-02): its toggle always
  // lived on the right edge, so the surface belongs there too. The tab's
  // selected-ness IS the open state — there is no `pairingOpen` beside it.
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('pairing'), true);
  assert.equal(isUnboxSideTabVisible('pairing', MATCHED), true);
  assert.equal(
    isUnboxSideTabVisible('pairing', {
      ...MATCHED,
      hasPairingTab: false,
    }),
    false,
    'no carton record → the hub can only teach, which is not worth a strip cell',
  );
  // Pairing leftmost whenever it is on the strip (Classify may sit beside it
  // when unfound). Matched strip: Pairing → Listings → …
  assert.deepEqual(UNBOX_STRIP_TAB_ORDER.slice(0, 3), ['pairing', 'classify', 'listings']);
});

test('overview is NOT a side tab — the carton owns the centre', () => {
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('overview' as never),
    false,
    'moving overview into the Displays column would empty the workbench body',
  );
});
