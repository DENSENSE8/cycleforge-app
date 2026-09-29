import assert from 'node:assert/strict';
import test from 'node:test';
import { spineParentTone } from './spine-parent-tone';

test('Media Library stays blue across its complete parent treatment', () => {
  const tone = spineParentTone('ops-photos');
  assert.match(tone.icon, /text-blue-/);
  assert.match(tone.marker, /bg-blue-/);
  assert.match(tone.row, /bg-blue-/);
  assert.match(tone.section, /bg-blue-/);
  assert.doesNotMatch(`${tone.icon} ${tone.marker} ${tone.row} ${tone.section}`, /fuchsia/);
});

test('Sales stays green across idle, hover, active and parent states', () => {
  const tone = spineParentTone('sales');
  assert.match(tone.icon, /text-green-/);
  assert.match(tone.marker, /bg-green-/);
  assert.match(tone.row, /hover:bg-green-/);
  assert.match(tone.row, /active=true.*bg-green-/);
  assert.match(tone.section, /owns-current=true.*bg-green-/);
  assert.doesNotMatch(`${tone.icon} ${tone.marker} ${tone.row} ${tone.section}`, /violet/);
});
