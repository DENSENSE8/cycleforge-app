import assert from 'node:assert/strict';
import test from 'node:test';
import { spineParentTone } from './spine-parent-tone';

test('Media Library keeps muted blue identity on a neutral interaction surface', () => {
  const tone = spineParentTone('ops-photos');
  assert.equal(tone.icon, 'text-blue-700/85');
  assert.equal(tone.marker, 'bg-blue-600/80');
  assert.match(tone.row, /hover:bg-surface-hover/);
  assert.match(tone.row, /active=true.*bg-blue-50\/35/);
  assert.match(tone.row, /active=true.*text-text-default/);
  assert.match(tone.section, /owns-current=true.*ring-blue-200\/60/);
  assert.doesNotMatch(tone.row, /hover:bg-blue-50\/70/);
  assert.doesNotMatch(tone.row, /text-blue-800/);
  assert.doesNotMatch(`${tone.icon} ${tone.marker} ${tone.row} ${tone.section}`, /fuchsia/);
});

test('Sales keeps muted green identity without coloring its label or hover fill', () => {
  const tone = spineParentTone('sales');
  assert.equal(tone.icon, 'text-green-700/85');
  assert.equal(tone.marker, 'bg-green-600/80');
  assert.match(tone.row, /hover:bg-surface-hover/);
  assert.match(tone.row, /active=true.*bg-green-50\/35/);
  assert.match(tone.row, /active=true.*text-text-default/);
  assert.match(tone.section, /owns-current=true.*bg-green-50\/35/);
  assert.doesNotMatch(tone.row, /(?:^|\s)hover:bg-green/);
  assert.doesNotMatch(tone.row, /text-green-800/);
  assert.doesNotMatch(`${tone.icon} ${tone.marker} ${tone.row} ${tone.section}`, /violet/);
});
