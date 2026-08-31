/**
 * Header page switcher — Scan Stations peers, not subgroup drills.
 *
 *   node --import tsx --test src/components/layout/header-page-switcher.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeaderPage } from './header-page-face';
import { HEADER_PAGE_MENU_SCROLL_CLASS } from './header-shell';

const FLOOR_IDS = [
  'triage',
  'receive',
  'pickup',
  'repair',
  'testing',
  'ready-to-pack',
  'packer',
  'scan-out',
];

test('Unbox switcher lists every Scan Stations bench, not Arrival/Unbox only', () => {
  const face = resolveHeaderPage('receive');
  assert.ok(face);
  assert.equal(face!.menuNav, 'page');
  assert.equal(face!.menuAriaLabel, 'Scan Stations');
  assert.deepEqual(
    face!.menuRows?.map((r) => r.id),
    FLOOR_IDS,
  );
  assert.deepEqual(
    face!.menuRows?.map((r) => r.label),
    [
      'Arrival',
      'Unbox',
      'Local Pickup',
      'Repair Service',
      'Quality Control',
      'Ready to Pack',
      'Packing',
      'Scan out',
    ],
  );
});

test('Quality Control and Packing use the same flat Scan Stations menu', () => {
  const qc = resolveHeaderPage('testing');
  const pack = resolveHeaderPage('packer');
  assert.deepEqual(qc?.menuRows?.map((r) => r.id), FLOOR_IDS);
  assert.deepEqual(pack?.menuRows?.map((r) => r.id), FLOOR_IDS);
  assert.equal(qc?.activeRowId, 'testing');
  assert.equal(pack?.activeRowId, 'packer');
});

test('page menu end clearance is scroll-padding, not an empty layout row', () => {
  assert.match(HEADER_PAGE_MENU_SCROLL_CLASS, /scroll-pb-8/);
  assert.doesNotMatch(HEADER_PAGE_MENU_SCROLL_CLASS, /(?:^|\s)pb-8(?:\s|$)/);
});
