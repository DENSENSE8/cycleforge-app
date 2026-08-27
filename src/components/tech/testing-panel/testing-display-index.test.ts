/**
 *   node --import tsx --test src/components/tech/testing-panel/testing-display-index.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestingDisplayIndexRows } from './testing-display-index';

test('buildTestingDisplayIndexRows quiet ticket + unpaired linkage', () => {
  const rows = buildTestingDisplayIndexRows(
    ['ticket', 'listing', 'checklist', 'linkage'],
    {
      hasTicketId: false,
      hasSkuPairing: false,
      hasSkuTabs: true,
      hasTimeline: false,
      linkagePaired: false,
      isUnfound: true,
      listingLabel: null,
    },
  );
  assert.equal(rows.find((r) => r.id === 'ticket')?.subtitle, 'No ticket');
  assert.equal(rows.find((r) => r.id === 'ticket')?.tone, 'neutral');
  assert.equal(rows.find((r) => r.id === 'linkage')?.subtitle, 'Unpaired');
  assert.ok(rows.some((r) => r.id === 'checklist'));
});
