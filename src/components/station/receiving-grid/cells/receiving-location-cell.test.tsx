import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceivingLocationCell } from '@/components/station/receiving-grid/cells/ReceivingLocationCell';
import type { ReceivingGridCellProps } from '@/components/station/receiving-grid/cells/receiving-grid-cell-types';

function render(loc: string | null) {
  const props = {
    col: { key: 'location', label: 'Loc', type: 'location', width: '6rem' },
    rule: 'none',
    ctx: {
      row: { staging_location_label: loc, priority_lane: 'RETURN' },
      columnPrefs: undefined,
    },
  } as unknown as ReceivingGridCellProps;
  return renderToStaticMarkup(<ReceivingLocationCell {...props} />);
}

test('the staging location renders as plain text — never a copy chip', () => {
  const html = render('Receiving · Returns — Testing');
  assert.match(html, /Receiving · Returns — Testing/);
  assert.doesNotMatch(html, /<button/, 'a location is a place label, not a copyable identifier');
  assert.doesNotMatch(html, /font-mono/, 'mono is the retypable-identifier contract');
});

test('an empty location is an honest dash', () => {
  const html = render(null);
  assert.doesNotMatch(html, /<button/);
});
