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
  canonicalizeUnboxSideTab,
  isUnboxSideTabVisible,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  parseUnboxUnitsAction,
  resolveUnboxSideTab,
  resolveUnboxTicketAction,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasClassifyTab: true,
  hasLinkageTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
  hasTimelineTab: true,
};

/** Unfound local-pickup carton with nothing scanned yet — the sparsest lane. */
const SPARSE: UnboxSideTabGates = {
  hasClassifyTab: true,
  hasLinkageTab: true,
  hasListingsTab: false,
  hasUnits: false,
  hasPoNoteTab: false,
  hasTrackingTab: false,
  hasTimelineTab: false,
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

test('a request gated off falls back to Ticket (leftmost strip survivor)', () => {
  assert.equal(resolveUnboxSideTab('units', SPARSE), 'ticket');
  assert.equal(resolveUnboxSideTab('listings', SPARSE), 'ticket');
  assert.equal(resolveUnboxSideTab('tracking', SPARSE), 'ticket');
});

test('ticket · photos · checklist · support survive every gate', () => {
  const nothing: UnboxSideTabGates = {
    hasClassifyTab: false,
    hasLinkageTab: false,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
    hasTimelineTab: false,
  };
  assert.equal(isUnboxSideTabVisible('ticket', nothing), true);
  assert.equal(isUnboxSideTabVisible('photos', nothing), true);
  assert.equal(isUnboxSideTabVisible('checklist', nothing), true);
  assert.equal(isUnboxSideTabVisible('support', nothing), true);
  assert.equal(resolveUnboxSideTab('checklist', nothing), 'checklist');
  assert.equal(resolveUnboxSideTab('units', nothing), 'ticket');
});

test('checklist is ring-only — not on the strip order', () => {
  assert.equal(UNBOX_STRIP_TAB_ORDER.includes('checklist'), false);
  assert.equal(UNBOX_STRIP_TAB_ORDER[0], 'ticket');
  assert.equal(UNBOX_SIDE_TAB_ORDER.includes('checklist'), true);
});

test('strip order is Ticket · Photos · Linkage · Classify · … — no Claim cell', () => {
  assert.deepEqual(UNBOX_STRIP_TAB_ORDER.slice(0, 4), [
    'ticket',
    'photos',
    'linkage',
    'classify',
  ]);
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

test('legacy pairing / po-note / claim canonicalize', () => {
  assert.equal(canonicalizeUnboxSideTab('pairing'), 'linkage');
  assert.equal(canonicalizeUnboxSideTab('po-note'), 'linkage');
  assert.equal(canonicalizeUnboxSideTab('claim'), 'ticket');
  assert.equal(canonicalizeUnboxSideTab('ticket'), 'ticket');
  assert.equal(canonicalizeUnboxSideTab('not-a-tab'), null);
});

test('photo / linkage / ticket / units nested action parsers', () => {
  // absent / legacy browse = gallery default (no Browse tab)
  assert.equal(parseUnboxPhotoAction(null), 'browse');
  assert.equal(parseUnboxPhotoAction('browse'), 'browse');
  assert.equal(parseUnboxPhotoAction('move'), 'move');
  assert.equal(parseUnboxPhotoAction('bogus'), 'browse');
  assert.equal(parseUnboxLinkageAction('note', { hasPoNoteTab: true }), 'note');
  assert.equal(parseUnboxLinkageAction('note', { hasPoNoteTab: false }), 'link');
  // Presence-only: linked ticket → chat; no ticket → claim (URL verb ignored).
  assert.equal(resolveUnboxTicketAction(true), 'chat');
  assert.equal(resolveUnboxTicketAction(false), 'claim');
  assert.equal(parseUnboxUnitsAction('prebox', { hasPrebox: true }), 'prebox');
  assert.equal(parseUnboxUnitsAction('prebox', { hasPrebox: false }), 'units');
  assert.equal(parseUnboxUnitsAction(null, { hasPrebox: true }), 'units');
});

test('overview is NOT a side tab — the carton owns the centre', () => {
  assert.equal(
    UNBOX_SIDE_TAB_ORDER.includes('overview' as never),
    false,
    'moving overview into the Displays column would empty the workbench body',
  );
});
