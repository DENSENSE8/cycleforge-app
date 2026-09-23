import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SOURCE = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
const WRITER = readFileSync(
  new URL('../../../../lib/packing/packer-log-writer.ts', import.meta.url),
  'utf8',
);

test('mobile pack draft keeps a photo parent separate from a completed pack fact', () => {
  assert.match(SOURCE, /startPackerLogCapture/);
  assert.doesNotMatch(SOURCE, /INSERT INTO packer_\s*logs/);
  assert.match(WRITER, /completion_state, packed_by/);
  assert.match(WRITER, /PACKER_LOG_CAPTURING/);
  assert.match(WRITER, /ON CONFLICT \(organization_id, shipment_id\)/);
  assert.doesNotMatch(SOURCE, /createStationActivityLog/);
  assert.doesNotMatch(SOURCE, /mirrorLegacyPackingToAllocations/);
  assert.doesNotMatch(SOURCE, /SET status = 'packed'/);
});
