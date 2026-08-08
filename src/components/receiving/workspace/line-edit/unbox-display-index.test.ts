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
  hasClassifyTab: true,
  hasLinkageTab: true,
  hasInventoryTab: true,
  hasListingsTab: true,
  hasUnits: true,
  hasPoNoteTab: true,
  hasTrackingTab: true,
  hasTimelineTab: true,
};

const BASE_SIGNALS: UnboxDisplayIndexSignals = {
  hasTicketId: false,
  photoCount: 0,
  classifyLabel: null,
  serialCount: 0,
  linkagePaired: false,
  isUnfound: false,
  trackingPresent: false,
  isReturnIntake: false,
};

test('checklist appears on the Root Index (floor % ring deleted)', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(
    rows.some((r) => r.id === 'checklist'),
    true,
  );
  assert.equal(rows.at(-1)?.id, 'checklist');
});

test('matched carton emits Listings · Classify · Pairing · Inventory · Units first', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.deepEqual(
    rows.slice(0, 5).map((r) => r.id),
    ['listings', 'classify', 'linkage', 'inventory', 'units'],
  );
});

test('Unbox rows carry PO-identity · stock · context groups', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(rows.find((r) => r.id === 'listings')?.group, 'verification');
  assert.equal(rows.find((r) => r.id === 'classify')?.group, 'verification');
  assert.equal(rows.find((r) => r.id === 'linkage')?.group, 'verification');
  assert.equal(rows.find((r) => r.id === 'inventory')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'photos')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'units')?.group, 'assets');
  assert.equal(rows.find((r) => r.id === 'ticket')?.group, 'context');
  assert.equal(rows.find((r) => r.id === 'timeline')?.group, 'context');
});

test('sparse gates hide units · listings · tracking · timeline', () => {
  const sparse: UnboxSideTabGates = {
    hasClassifyTab: true,
    hasLinkageTab: true,
    hasInventoryTab: true,
    hasListingsTab: false,
    hasUnits: false,
    hasPoNoteTab: false,
    hasTrackingTab: false,
    hasTimelineTab: false,
  };
  const ids = buildUnboxDisplayIndexRows(sparse, BASE_SIGNALS).map((r) => r.id);
  assert.ok(ids.includes('ticket'));
  assert.ok(ids.includes('photos'));
  assert.ok(ids.includes('classify'));
  assert.equal(ids.includes('units'), false);
  assert.equal(ids.includes('listings'), false);
  assert.equal(ids.includes('tracking'), false);
  assert.equal(ids.includes('timeline'), false);
});

test('ticket / photos / linkage / classify subtitles + tones', () => {
  const action = buildUnboxDisplayIndexRows(MATCHED, BASE_SIGNALS);
  assert.equal(action.find((r) => r.id === 'ticket')?.subtitle, 'No ticket');
  assert.equal(action.find((r) => r.id === 'ticket')?.tone, 'neutral');
  assert.equal(action.find((r) => r.id === 'photos')?.subtitle, 'None');
  assert.equal(action.find((r) => r.id === 'classify')?.tone, 'action');

  const ok = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    hasTicketId: true,
    photoCount: 3,
    classifyLabel: 'Return',
    serialCount: 2,
    linkagePaired: true,
    trackingPresent: true,
  });
  assert.equal(ok.find((r) => r.id === 'ticket')?.tone, 'ok');
  assert.equal(ok.find((r) => r.id === 'photos')?.subtitle, '3 photos');
  assert.equal(ok.find((r) => r.id === 'linkage')?.subtitle, 'Paired');
  assert.equal(ok.find((r) => r.id === 'classify')?.subtitle, 'Return');
  assert.equal(ok.find((r) => r.id === 'units')?.subtitle, '2 serials');
  assert.equal(ok.find((r) => r.id === 'tracking')?.tone, 'ok');
});

test('return intake marks Timeline as action', () => {
  const rows = buildUnboxDisplayIndexRows(MATCHED, {
    ...BASE_SIGNALS,
    isReturnIntake: true,
  });
  assert.equal(rows.find((r) => r.id === 'timeline')?.subtitle, 'Return history');
  assert.equal(rows.find((r) => r.id === 'timeline')?.tone, 'action');
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
  const photo = filterDisplayIndexRows(rows, 'photo');
  assert.equal(photo.length, 1);
  assert.equal(photo[0]?.id, 'photos');
  const noTicket = filterDisplayIndexRows(rows, 'no ticket');
  assert.ok(noTicket.some((r) => r.id === 'ticket'));
  assert.ok(filterDisplayIndexRows(rows, 'timeline').some((r) => r.id === 'timeline'));
});
