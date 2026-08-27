/**
 * Unit tests for the Unbox side-display resolver.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNBOX_DISPLAY_INDEX,
  UNBOX_PHOTO_ACTION_ORDER,
  UNBOX_SIDE_TAB_ORDER,
  UNBOX_STRIP_TAB_ORDER,
  canonicalizeUnboxSideTab,
  isUnboxSideTabVisible,
  parseUnboxDisplayNav,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  parseUnboxPhotoActionWire,
  resolveUnboxDisplayNav,
  resolveUnboxSideTab,
  resolveUnboxTicketAction,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
};

/** Unfound local-pickup carton with nothing scanned yet — the sparsest lane. */
const SPARSE: UnboxSideTabGates = {
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: false,
  hasUnits: false,
  hasPoNoteTab: false,
  hasTrackingTab: false,
};

test('null in → null out: the Displays column is closed, not defaulted open', () => {
  assert.equal(resolveUnboxSideTab(null, MATCHED), null);
  assert.equal(resolveUnboxSideTab(null, SPARSE), null);
});

test('a visible request is returned unchanged', () => {
  for (const tab of UNBOX_SIDE_TAB_ORDER) {
    assert.equal(resolveUnboxSideTab(tab, MATCHED), tab);
  }
});

test('a request gated off falls back to first visible strip leaf', () => {
  // SPARSE: listings gated → Pairing is the leftmost survivor. (Classify left
  // the Displays 2026-08-19 — its pills live on the carton identity bar.)
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'linkage');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'linkage');
  assert.equal(resolveUnboxSideTab('tracking', SPARSE), 'linkage');
});

test('ticket · photos · prebox · checklist survive every gate', () => {
  const nothing: UnboxSideTabGates = {
    hasLinkageTab: false,
    hasInventoryTab: false,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
  };
  assert.equal(isUnboxSideTabVisible('ticket', nothing), true);
  assert.equal(isUnboxSideTabVisible('photos', nothing), true);
  assert.equal(isUnboxSideTabVisible('prebox', nothing), true);
  assert.equal(isUnboxSideTabVisible('checklist', nothing), true);
  assert.equal(resolveUnboxSideTab('checklist', nothing), 'checklist');
  assert.equal(resolveUnboxSideTab('units', nothing), 'prebox');
});

test('checklist is a Displays leaf — on the strip / index order', () => {
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('checklist'), true);
  assert.equal(UNBOX_STRIP_TAB_ORDER.at(-1), 'checklist');
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('checklist'), true);
});

test('strip order is Listings · Pairing · Inventory · Units · … — no Claim, no Classify cell', () => {
  assert.deepEqual(UNBOX_STRIP_TAB_ORDER.slice(0, 4), [
    'listings',
    'linkage',
    'inventory',
    'units',
  ]);
  // Classify is NOT a display — urgency · platform · type are InlinePillPicker
  // menus on the carton identity bar, so a leaf here was a second editor.
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('classify' as never), false);
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('classify' as never), false);
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('timeline' as never), false);
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('support' as never), false);
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('timeline' as never), false);
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('support' as never), false);
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('claim' as never),
    false,
    'Claim is nested under Ticket, not a strip id',
  );
});

test('linkage is gated on having a carton to pair', () => {
  assert.equal(isUnboxSideTabVisible('linkage', MATCHED), true);
  assert.equal(
    isUnboxSideTabVisible('linkage', { ...MATCHED, hasLinkageTab: false }),
    false,
  );
});

test('inventory is gated on having a carton (same door as Linkage)', () => {
  assert.equal(isUnboxSideTabVisible('inventory', MATCHED), true);
  assert.equal(
    isUnboxSideTabVisible('inventory', { ...MATCHED, hasInventoryTab: false }),
    false,
  );
});

test('legacy pairing / po-note / claim canonicalize; timeline / support open index', () => {
  assert.equal(canonicalizeUnboxSideTab('pairing'), 'linkage');
  assert.equal(canonicalizeUnboxSideTab('po-note'), 'linkage');
  assert.equal(canonicalizeUnboxSideTab('claim'), 'ticket');
  assert.equal(canonicalizeUnboxSideTab('ticket'), 'ticket');
  assert.equal(canonicalizeUnboxSideTab('not-a-tab'), null);
  assert.equal(canonicalizeUnboxSideTab('timeline'), null);
  assert.equal(canonicalizeUnboxSideTab('support'), null);
  assert.equal(parseUnboxDisplayNav('timeline'), UNBOX_DISPLAY_INDEX);
  assert.equal(parseUnboxDisplayNav('support'), UNBOX_DISPLAY_INDEX);
});

test('photo / linkage / ticket nested action parsers', () => {
  // absent / legacy browse = Actions (in-column hover-strip selections)
  assert.equal(parseUnboxPhotoAction(null), 'actions');
  assert.equal(parseUnboxPhotoAction('browse'), 'actions');
  assert.equal(parseUnboxPhotoAction('actions'), 'actions');
  assert.equal(parseUnboxPhotoAction('link'), 'link');
  assert.equal(parseUnboxPhotoAction('move'), 'move');
  assert.equal(parseUnboxPhotoAction('send'), 'send');
  assert.equal(parseUnboxPhotoAction('compare'), 'compare');
  assert.equal(parseUnboxPhotoAction('bogus'), 'actions');
  // Nested altitude: nest order + absent URL lands bench verb.
  assert.deepEqual(
    [...UNBOX_PHOTO_ACTION_ORDER],
    ['actions', 'link', 'move', 'send', 'compare'],
  );
  assert.equal(parseUnboxPhotoAction(null), UNBOX_PHOTO_ACTION_ORDER[0]);
  assert.equal(parseUnboxPhotoActionWire('compare'), 'compare');
  assert.equal(parseUnboxPhotoActionWire('browse'), 'browse');
  assert.equal(parseUnboxPhotoActionWire('bogus'), null);
  assert.equal(parseUnboxLinkageAction('note', { hasPoNoteTab: true }), 'note');
  assert.equal(parseUnboxLinkageAction('note', { hasPoNoteTab: false }), 'actions');
  assert.equal(parseUnboxLinkageAction('link', { hasPoNoteTab: true }), 'link');
  assert.equal(parseUnboxLinkageAction(null, { hasPoNoteTab: true }), 'actions');
  // Presence-only: linked ticket → chat; no ticket → claim (URL verb ignored).
  assert.equal(resolveUnboxTicketAction(true), 'chat');
  assert.equal(resolveUnboxTicketAction(false), 'claim');
});

test('prebox is an always-on Assets peer leaf (not nested under Units)', () => {
  assert.ok(UNBOX_SIDE_TAB_ORDER.includes('prebox'));
  assert.ok(UNBOX_STRIP_TAB_ORDER.includes('prebox'));
  assert.equal(isUnboxSideTabVisible('prebox', MATCHED), true);
  assert.equal(isUnboxSideTabVisible('prebox', SPARSE), true);
  assert.deepEqual(resolveUnboxDisplayNav('prebox', MATCHED), { open: true, leaf: 'prebox' });
  assert.deepEqual(resolveUnboxDisplayNav('prebox', SPARSE), { open: true, leaf: 'prebox' });
});

test('overview is NOT a side tab — the carton owns the centre', () => {
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('overview' as never),
    false,
    'moving overview into the Displays column would empty the workbench body',
  );
});

test('display=index opens Root Index with no leaf', () => {
  assert.equal(parseUnboxDisplayNav('index'), UNBOX_DISPLAY_INDEX);
  assert.equal(canonicalizeUnboxSideTab('index'), null, 'index is nav, not a leaf id');
  assert.deepEqual(resolveUnboxDisplayNav(UNBOX_DISPLAY_INDEX, MATCHED), {
    open: true,
    leaf: null,
  });
  assert.deepEqual(resolveUnboxDisplayNav(null, MATCHED), { open: false, leaf: null });
  assert.deepEqual(resolveUnboxDisplayNav('units', MATCHED), { open: true, leaf: 'units' });
  assert.deepEqual(resolveUnboxDisplayNav('units', SPARSE), { open: true, leaf: 'linkage' });
});
