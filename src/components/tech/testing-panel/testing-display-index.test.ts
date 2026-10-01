/**
 *   node --import tsx --test src/components/tech/testing-panel/testing-display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestingDisplayIndexRows } from './testing-display-index';

test('buildTestingDisplayIndexRows marks unpaired linkage without a ticket leaf', () => {
  const rows = buildTestingDisplayIndexRows(
    ['listing', 'checklist', 'linkage'],
    {
      hasSkuPairing: false,
      hasSkuTabs: true,
      hasTimeline: false,
      linkagePaired: false,
      isUnfound: true,
      listingLabel: null,
    },
  );
  assert.equal(rows.find((r) => r.id === 'ticket'), undefined);
  assert.equal(rows.find((r) => r.id === 'linkage')?.subtitle, 'Unpaired');
  assert.ok(rows.some((r) => r.id === 'checklist'));
});
