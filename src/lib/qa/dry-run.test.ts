import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDryRun, type DryRunPreview } from './dry-run';

test('summarizeDryRun matches the operator-facing preview shape', () => {
  const preview: DryRunPreview = {
    wouldCreate: [
      { kind: 'internal orders', count: 3 },
      { kind: 'shipment records', count: 3 },
    ],
    wouldUpdate: [{ kind: 'existing products', count: 2 }],
    wouldSkip: [{ kind: 'duplicate order', count: 1 }],
    wouldCall: [{ provider: 'eBay', environment: 'Sandbox', operation: 'API' }],
  };
  const lines = summarizeDryRun(preview);
  assert.deepEqual(lines, [
    'Would create:',
    '  3 internal orders',
    '  3 shipment records',
    'Would update:',
    '  2 existing products',
    'Would skip:',
    '  1 duplicate order',
    'Would call:',
    '  eBay Sandbox API',
  ]);
});
