import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PACK_PLACEABLE_KINDS,
  PACK_PLACEMENT_SOURCES,
} from './pack-placement-constants';

test('pack-placement allows DESK and STAGING only as placeable kinds', () => {
  assert.deepEqual([...PACK_PLACEABLE_KINDS], ['DESK', 'STAGING']);
});

test('pack-placement lists placement write sources', () => {
  assert.ok((PACK_PLACEMENT_SOURCES as readonly string[]).includes('tech_scan'));
  assert.ok((PACK_PLACEMENT_SOURCES as readonly string[]).includes('move'));
  assert.ok((PACK_PLACEMENT_SOURCES as readonly string[]).includes('admin'));
});
