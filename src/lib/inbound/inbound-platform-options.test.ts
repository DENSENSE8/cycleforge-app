import test from 'node:test';
import assert from 'node:assert/strict';
import { inboundPlatformOptions } from './inbound-platform-options';

test('pickers show full platform names, never the catalog abbreviation', () => {
  const options = inboundPlatformOptions([
    { value: 'goodwill', label: 'GW' },
    { value: 'amazon', label: 'AMZ' },
    { value: 'fba', label: 'FBA' },
    { value: 'best_buy', label: 'BEST BUY' },
    { value: 'ebay', label: 'eBay' },
  ]);
  assert.deepEqual(options, [
    { value: 'amazon', label: 'Amazon' },
    { value: 'goodwill', label: 'Goodwill' },
    { value: 'ebay', label: 'eBay' },
    { value: 'fba', label: 'Amazon (FBA)' },
    { value: 'best_buy', label: 'BEST BUY' },
  ]);
});
