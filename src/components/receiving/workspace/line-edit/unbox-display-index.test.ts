/**
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDisplayIndexRows } from '@/components/station/displays/display-index';
import {
  buildUnboxDisplayIndexRows,
  type UnboxDisplayIndexSignals,
} from './unbox-display-index';
import type { UnboxSideTabGates } from './unbox-side-tabs';

const MATCHED: UnboxSideTabGates = {
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
};

const BASE_SIGNALS: UnboxDisplayIndexSignals = {
  hasTicketId: false,
  photoCount: 0,
  serialCount: 0,
  linkagePaired: false,
  isUnfound: false,
  trackingPresent: false,
};

test('checklist appears on the Root Index (floor % ring deleted)', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(
    rows.some((r) => r.id === 'checklist'),
    true,
  );
  assert.equal(rows.at(-1)?.id, 'checklist');
});

test('matched carton emits Listings · Pairing · Inventory · Units · Prebox first', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, { ...BASE_SIGNALS, serialCount: 2 });
  assert.deepEqual(
    rows.slice(0, 5).map((r) => r.id),
    ['listings', 'linkage', 'inventory', 'units', 'prebox'],
  );
  // Classify is not a display — its three fields are InlinePillPicker menus on
  // the carton identity bar, so a leaf here was a second editor (dropped
  // 2026-08-19).
  assert.equal(rows.some((r) => r.id === 'classify'), false);
});

test('Unbox rows carry PO-identity · stock · context groups', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(rows.find((r) => r.id === 'listings')?.group, 'verification');
  assert.equal(rows.find((r) => r.id === 'linkage')?.group, 'verification');
  assert.equal(rows.find((r) => r.id === 'inventory')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'photos')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'units')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'prebox')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'overview')?.group, 'context');
  assert.equal(rows.find((r) => r.id === 'ticket')?.group, 'context');
  assert.equal(rows.find((r) => r.id === 'tracking')?.group, 'context');
  assert.deepEqual(
    rows.filter((r) => r.group === 'context').map((r) => r.id),
    ['overview', 'ticket', 'tracking', 'locations'],
  );
  assert.equal(rows.find((r) => r.id === 'overview')?.subtitle, 'Order · tracking · PO');
  assert.equal(rows.some((r) => r.id === 'timeline'), false);
  assert.equal(rows.some((r) => r.id === 'support'), false);
});

test('sparse gates hide units · listings · tracking — Prebox stays', () => {
  const sparse: UnboxSideTabGates = {
      hasLinkageTab: true,
    hasInventoryTab: true,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
  };
  const ids = buildUnboxDisplayIndexRows(sparse, BASE_SIGNALS).map((r) => r.id);
  assert.ok(ids.includes('overview'));
  assert.ok(ids.includes('ticket'));
  assert.ok(ids.includes('photos'));
  assert.ok(ids.includes('prebox'));
  assert.equal(ids.includes('classify'), false);
  assert.equal(ids.includes('units'), false);
  assert.equal(ids.includes('listings'), false);
  assert.equal(ids.includes('tracking'), false);
  assert.equal(ids.includes('timeline'), false);
  assert.equal(ids.includes('support'), false);
});

test('ticket / photos / linkage subtitles + tones', () => {
  const action = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(action.find((r) => r.id === 'ticket')?.subtitle, 'No ticket');
  assert.equal(action.find((r) => r.id === 'ticket')?.tone, 'neutral');
  assert.equal(action.find((r) => r.id === 'photos')?.subtitle, 'None');

  const ok = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    hasTicketId: true,
    photoCount: 3,
    serialCount: 2,
    linkagePaired: true,
    trackingPresent: true,
  });
  assert.equal(ok.find((r) => r.id === 'ticket')?.tone, 'ok');
  assert.equal(ok.find((r) => r.id === 'photos')?.subtitle, '3 photos');
  assert.equal(ok.find((r) => r.id === 'linkage')?.subtitle, 'Paired');
  assert.equal(ok.find((r) => r.id === 'units')?.subtitle, '2 serials');
  assert.equal(ok.find((r) => r.id === 'tracking')?.tone, 'ok');
  assert.equal(ok.find((r) => r.id === 'tracking')?.subtitle, 'Events · attach');
});

test('Prebox with serials is quiet (no unit-ready chip / no action tone)', () => {
  const empty = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(empty.find((r) => r.id === 'prebox')?.subtitle, 'Need serials');
  assert.equal(empty.find((r) => r.id === 'prebox')?.tone, 'neutral');

  const ready = buildUnboxDisplayIndexRows(MATCHED, { ...BASE_SIGNALS, serialCount: 1 });
  assert.equal(ready.find((r) => r.id === 'prebox')?.subtitle, '');
  assert.equal(ready.find((r) => r.id === 'prebox')?.tone, 'ok');
});

test('unfound unpaired Linkage is action', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    isUnfound: true,
    linkagePaired: false,
  });
  assert.equal(rows.find((r) => r.id === 'linkage')?.tone, 'action');
  assert.equal(rows.find((r) => r.id === 'linkage')?.subtitle, 'Unpaired');
});

test('Inventory subtitle reflects receive ratio when paired', () => {
  const unpaired = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(unpaired.find((r) => r.id === 'inventory')?.subtitle, 'Unpaired');
  assert.equal(unpaired.find((r) => r.id === 'inventory')?.tone, 'action');

  const partial = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    linkagePaired: true,
    inventoryReceived: 1,
    inventoryExpected: 3,
  });
  assert.equal(partial.find((r) => r.id === 'inventory')?.subtitle, '1/3 received');
  assert.equal(partial.find((r) => r.id === 'inventory')?.tone, 'neutral');

  const done = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    linkagePaired: true,
    inventoryReceived: 3,
    inventoryExpected: 3,
  });
  assert.equal(done.find((r) => r.id === 'inventory')?.tone, 'ok');
});

// Filters the SoT helper against REAL Unbox rows — `display-index.test.ts`
// covers the same function against fixtures. The Unbox-local `filter…` shim
// this used to call was a pass-through with no production callers.
test('filterDisplayIndexRows matches label · subtitle · id on Unbox rows', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(filterDisplayIndexRows(rows, '').length, rows.length);
  assert.equal(filterDisplayIndexRows(rows, '   ').length, rows.length);
  const overview = filterDisplayIndexRows(rows, 'overview');
  assert.equal(overview.length, 1);
  assert.equal(overview[0]?.id, 'overview');
  const photo = filterDisplayIndexRows(rows, 'photo');
  assert.equal(photo.length, 1);
  assert.equal(photo[0]?.id, 'photos');
  const noTicket = filterDisplayIndexRows(rows, 'no ticket');
  assert.ok(noTicket.some((r) => r.id === 'ticket'));
  assert.equal(filterDisplayIndexRows(rows, 'timeline').length, 0);
  assert.equal(filterDisplayIndexRows(rows, 'support').length, 0);
});
