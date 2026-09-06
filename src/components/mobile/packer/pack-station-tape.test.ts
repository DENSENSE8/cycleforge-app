/**
 * pack-station-tape tests — the vocabulary, not the write.
 *
 *   npx tsx --test src/components/mobile/packer/pack-station-tape.test.ts
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { PACK_TAPE_LABEL, PACK_DEDUPE_KIND, packTapeEntry } from './pack-station-tape';

const AT = '2026-09-06T19:00:00.000Z';

test('a packed box is one ok row, keyed by shipment when the write resolved one', () => {
  const e = packTapeEntry(
    { scan: '9400111899223197428490', status: 'packed', shipmentId: 77, packerLogId: 512, message: null },
    AT,
  );
  assert.equal(e.verb, 'Packed');
  assert.equal(e.tone, 'ok');
  assert.equal(e.identifier, '9400111899223197428490');
  assert.equal(e.recordId, 'Shipment 77');
  assert.equal(e.dedupeKey, 'shipment:77');
  assert.equal(e.at, AT);
});

test('an unresolved scan dedupes on the scan bytes — the row stands alone', () => {
  const e = packTapeEntry(
    { scan: '1Z999AA10123456999', status: 'error', shipmentId: null, packerLogId: null, message: 'Offline — nothing is recorded' },
    AT,
  );
  assert.equal(e.verb, 'Not recorded');
  assert.equal(e.tone, 'bad');
  assert.equal(e.dedupeKey, 'scan:1Z999AA10123456999');
  assert.equal(e.message, 'Offline — nothing is recorded');
  assert.equal(e.recordId, null);
});

test('no duplicate verdict exists — the station never invents one the server did not give', () => {
  assert.deepEqual(Object.keys(PACK_TAPE_LABEL).sort(), ['error', 'packed']);
  assert.equal(PACK_DEDUPE_KIND, 'shipment');
});
