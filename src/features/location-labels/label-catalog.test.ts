import assert from 'node:assert/strict';
import test from 'node:test';
import { labelCatalogHref, legacyLabelTabTarget, parseLabelCatalogKind } from './label-catalog';

test('retired Totes and Bay labels tabs land on their Labels tiles', () => {
  assert.equal(legacyLabelTabTarget('totes', null), '/inventory/locations?tab=labels&kind=tote');
  assert.equal(legacyLabelTabTarget('bays', null), '/inventory/locations?tab=labels&kind=location');
  assert.equal(legacyLabelTabTarget('racks', null), '/inventory/locations?tab=labels&kind=location');
});

test('a bay with a code keeps its rack detail view, and live tabs never redirect', () => {
  assert.equal(legacyLabelTabTarget('bays', 'A0101100'), null);
  assert.equal(legacyLabelTabTarget('labels', null), null);
  assert.equal(legacyLabelTabTarget(null, null), null);
});

test('the bare Labels href is the grid; retired and unknown kinds read as the grid', () => {
  assert.equal(labelCatalogHref(null), '/inventory/locations?tab=labels');
  assert.equal(parseLabelCatalogKind('tote'), 'tote');
  assert.equal(parseLabelCatalogKind('rack'), null);
  assert.equal(parseLabelCatalogKind('special'), null);
  assert.equal(parseLabelCatalogKind(null), null);
});
