/**
 *   node --import tsx --test src/components/station/scan-bar/preview-classify.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPreviewFromArmed,
  formatPreviewLine,
  formatPreviewSource,
} from './preview-classify';

const labels = {
  ticket: 'Ticket',
  tracking: 'Tracking',
  order: 'PO',
} as const;

test('formatPreviewLine names the type and value', () => {
  assert.equal(
    formatPreviewLine({
      typeLabel: 'Ticket',
      value: 'T-1001',
      source: 'auto',
    }),
    'Would search Ticket: T-1001',
  );
});

test('formatPreviewSource: Forced vs Auto', () => {
  assert.equal(
    formatPreviewSource({
      typeLabel: 'PO',
      value: 'PO-9',
      source: 'forced',
      autoTypeLabel: 'Tracking',
    }),
    'Forced PO',
  );
  assert.equal(
    formatPreviewSource({
      typeLabel: 'Tracking',
      value: '1Z999',
      source: 'auto',
    }),
    'Auto → Tracking',
  );
});

test('classifyPreviewFromArmed: empty is null; armed is Forced', () => {
  assert.equal(
    classifyPreviewFromArmed({
      value: '   ',
      armedMode: null,
      autoMode: 'tracking',
      labels,
    }),
    null,
  );
  const auto = classifyPreviewFromArmed({
    value: 'T-12',
    armedMode: null,
    autoMode: 'ticket',
    labels,
  });
  assert.deepEqual(auto, {
    typeLabel: 'Ticket',
    value: 'T-12',
    source: 'auto',
    autoTypeLabel: 'Ticket',
  });
  const forced = classifyPreviewFromArmed({
    value: '1Z999',
    armedMode: 'order',
    autoMode: 'tracking',
    labels,
  });
  assert.equal(forced?.source, 'forced');
  assert.equal(forced?.typeLabel, 'PO');
  assert.equal(forced?.autoTypeLabel, 'Tracking');
});
