/**
 * History status-chip tooltip: DONE (Received) is bare; UNBOXED names the
 * inventory provider via the shared sync tip SoT; other stages keep the stage tip
 * on fine vocabulary. Coarse vocabulary never surfaces testing stage tips.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingHistoryStatusTooltip } from './receiving-grid-row-helpers';

test('DONE → null (Received chip has no status tooltip)', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'DONE',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Received Jul 31 by Alice',
    }),
    null,
  );
});

test('UNBOXED → awaiting confirmation in provider label', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'UNBOXED',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Unboxed Jul 31 by Alice',
    }),
    'Awaiting confirmation in Zoho Inventory',
  );
});

test('other stages keep stage tip', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'MATCHED',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Matched Jul 31 by Alice',
    }),
    'Matched Jul 31 by Alice',
  );
});

test('other stages with empty tip → null', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'MATCHED',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: '',
    }),
    null,
  );
});

test('coarse — FAILED drops stage tip (Received is bare)', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'FAILED',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Failed Jul 31 by Alice',
      statusVocabulary: 'coarse',
    }),
    null,
  );
});

test('coarse — AWAITING_TEST drops stage tip', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'AWAITING_TEST',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Awaiting test Jul 31',
      statusVocabulary: 'coarse',
    }),
    null,
  );
});

test('coarse — UNBOXED keeps sync tip', () => {
  assert.equal(
    receivingHistoryStatusTooltip({
      workflowStatus: 'UNBOXED',
      inventoryProviderLabel: 'Zoho Inventory',
      stageTip: 'Unboxed Jul 31 by Alice',
      statusVocabulary: 'coarse',
    }),
    'Awaiting confirmation in Zoho Inventory',
  );
});
