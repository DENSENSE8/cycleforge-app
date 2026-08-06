/**
 * Unboxed sync tip: fine + coarse UNBOXED name the inventory provider;
 * other statuses return null.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  receivingCoarseUnboxedSyncTooltip,
  receivingUnboxedSyncTooltip,
} from './unboxed-sync-tooltip';

test('fine UNBOXED → awaiting confirmation in provider label', () => {
  assert.equal(
    receivingUnboxedSyncTooltip({
      workflowStatus: 'UNBOXED',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    'Awaiting confirmation in Zoho Inventory',
  );
});

test('fine UNBOXED with blank provider falls back to Inventory', () => {
  assert.equal(
    receivingUnboxedSyncTooltip({
      workflowStatus: 'unboxed',
      inventoryProviderLabel: '  ',
    }),
    'Awaiting confirmation in Inventory',
  );
});

test('fine DONE / MATCHED → null', () => {
  assert.equal(
    receivingUnboxedSyncTooltip({
      workflowStatus: 'DONE',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    null,
  );
  assert.equal(
    receivingUnboxedSyncTooltip({
      workflowStatus: 'MATCHED',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    null,
  );
});

test('coarse UNBOXED → awaiting confirmation', () => {
  assert.equal(
    receivingCoarseUnboxedSyncTooltip({
      coarse: 'UNBOXED',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    'Awaiting confirmation in Zoho Inventory',
  );
});

test('coarse RECEIVED / SCANNED → null', () => {
  assert.equal(
    receivingCoarseUnboxedSyncTooltip({
      coarse: 'RECEIVED',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    null,
  );
  assert.equal(
    receivingCoarseUnboxedSyncTooltip({
      coarse: 'SCANNED',
      inventoryProviderLabel: 'Zoho Inventory',
    }),
    null,
  );
});
