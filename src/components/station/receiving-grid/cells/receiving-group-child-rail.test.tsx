import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderReceivingCompoundCell } from '@/components/station/receiving-grid/cells/ReceivingCompoundCells';
import type {
  ReceivingGridCellColumn,
  ReceivingGridCellCtx,
} from '@/components/station/receiving-grid/cells/receiving-grid-cell-types';

/**
 * PROPAGATION, not a second implementation.
 *
 * The group-child rail (operator 2026-09-15) is mounted ONCE, in
 * `renderCompoundGridCell`, gated on `CompoundRowView.quietIdentity`. Unbox
 * reaches that mount through THIS dispatcher, which is the only place
 * their `quietIdentity` becomes a view field — so if the engine mark ever stops
 * reaching the station lanes, it breaks here first.
 *
 * Mounted markup rather than a source grep: the question is whether a ctx flag
 * survives `viewFor`, and reading either file cannot answer that.
 */
const COL = {
  key: 'fulfillment',
  label: 'Id',
  type: 'id',
  width: '6.5rem',
} as unknown as ReceivingGridCellColumn;

function paint(quietIdentity: boolean): string {
  const ctx = {
    row: { id: 7, po_number: 'PO-7' },
    columns: [COL],
    productTitle: 'A thing',
    poValue: 'PO-7',
    trackingValue: '1ZAAA',
    stageLabel: 'EXPECTED',
    isChecked: false,
    onToggle: () => {},
    clickSelect: false,
    quietIdentity,
  } as unknown as ReceivingGridCellCtx;
  return renderToStaticMarkup(
    <>{renderReceivingCompoundCell(COL, true, ctx) as React.ReactElement}</>,
  );
}

test('a station group CHILD inherits the engine membership rail', () => {
  const html = paint(true);
  assert.match(html, /data-group-child-rail/);
  assert.match(html, /absolute inset-y-0 left-0 w-0\.5 bg-border-default/);
  // Soft border ink, never the body-text black the fold close used to carry.
  assert.doesNotMatch(html, /bg-text-default/);
});

test('a standalone station line carries no rail', () => {
  assert.doesNotMatch(paint(false), /data-group-child-rail/);
});
