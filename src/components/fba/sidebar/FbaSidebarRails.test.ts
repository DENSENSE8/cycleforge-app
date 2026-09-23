import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fbaRailDisplayTitle, fbaRailIdentity } from './FbaSidebarRails';

test('FBA plan rail maps status marks and detail labels through semantic roles', () => {
  const source = readFileSync('src/components/fba/sidebar/FbaSidebarRails.tsx', 'utf8');

  assert.match(source, /PLANNED: 'bg-fill-warning'/);
  assert.match(source, /TESTED: 'bg-fill-success'/);
  assert.match(source, /PACKED: 'bg-fill-info'/);
  assert.match(source, /LABEL_ASSIGNED: 'bg-fill-fulfillment'/);
  assert.match(source, /bg-surface-accent/);
  assert.doesNotMatch(source, /\b(?:bg|text|border|ring|fill|stroke|shadow)-(?:red|emerald|purple|violet|blue|amber|indigo)-\d{2,3}\b/);
  assert.doesNotMatch(source, /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/);
});

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
