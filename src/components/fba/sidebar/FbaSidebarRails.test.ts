import assert from 'node:assert/strict';
import test from 'node:test';
import { fbaRailDisplayTitle, fbaRailIdentity } from './FbaSidebarRails';

test('FBA rail identity never renders a catalog object as a title', () => {
  assert.equal(
    fbaRailDisplayTitle({ product_title: 'Bose SoundLink Color' }, 'X000000001'),
    'Bose SoundLink Color',
  );
  assert.equal(fbaRailDisplayTitle({ unknown: 'value' }, 'X000000001'), 'X000000001');
  assert.equal(fbaRailDisplayTitle('[object Object]', 'X000000001'), 'X000000001');
  assert.equal(fbaRailDisplayTitle('[OBJECT OBJECT]', 'X000000001'), 'X000000001');
  assert.equal(fbaRailDisplayTitle('  Bose QC45  ', 'X000000001'), 'Bose QC45');
});

test('FBA rail identity refuses object-shaped scan identifiers', () => {
  assert.deepEqual(
    fbaRailIdentity({ item_id: 42, fnsku: '[object Object]', display_title: '[object Object]' }),
    { scanIdentifier: null, title: 'FBA item #42' },
  );
  assert.deepEqual(
    fbaRailIdentity({ item_id: 43, fnsku: ' X000000043 ', display_title: '[object Object]' }),
    { scanIdentifier: 'X000000043', title: 'X000000043' },
  );
});
