import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inboundSourcePlatformForRaw, inboundSourceTypeForPlatform } from './desk-csv';

describe('inboundSourceTypeForPlatform', () => {
  it('maps amazon / ebay / zoho; goodwill → manual', () => {
    assert.equal(inboundSourceTypeForPlatform('amazon'), 'amazon');
    assert.equal(inboundSourceTypeForPlatform('AMZ'), 'amazon');
    assert.equal(inboundSourceTypeForPlatform('ebay'), 'ebay');
    assert.equal(inboundSourceTypeForPlatform('goodwill'), 'manual');
    assert.equal(inboundSourceTypeForPlatform('zoho'), 'zoho');
  });
});

describe('inboundSourcePlatformForRaw', () => {
  it('keeps goodwill / amazon paint; drops bare manual', () => {
    assert.equal(inboundSourcePlatformForRaw('goodwill'), 'goodwill');
    assert.equal(inboundSourcePlatformForRaw('amazon'), 'amazon');
    assert.equal(inboundSourcePlatformForRaw('manual'), null);
  });
});
