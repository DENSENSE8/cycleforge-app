/**
 * Station command 2×1 label face.
 *
 * Run: `npx tsx --test src/lib/print/printStationCommandLabel.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stationCommandPayloadToFace } from '@/lib/print/printStationCommandLabel';
import { ARRIVAL_CMD_BATCH_SORT } from '@/lib/stations/station-command-codes';
import { parseStationCommand } from '@/lib/stations/station-command-codes';

describe('stationCommandPayloadToFace', () => {
  it('puts DataMatrix on the right with the exact CMD code as HRI', () => {
    const face = stationCommandPayloadToFace({
      code: ARRIVAL_CMD_BATCH_SORT,
      label: 'Batch sort',
    });
    assert.equal(face.topLeft, 'CMD');
    assert.equal(face.topRight, 'CMD');
    assert.equal(face.center, 'Batch sort');
    assert.equal(face.bottomLeft, 'Station');
    assert.equal(face.matrix.value, 'CMD-BATCH-SORT');
    assert.equal(face.matrix.symbology, 'datamatrix');
    assert.equal(face.hri, 'CMD-BATCH-SORT');
  });

  it('uppercases the code and falls back center from the code', () => {
    const face = stationCommandPayloadToFace({ code: 'cmd-default' });
    assert.equal(face.matrix.value, 'CMD-DEFAULT');
    assert.equal(face.hri, 'CMD-DEFAULT');
    assert.equal(face.center, 'DEFAULT');
  });

  it('printed matrix value parses as a station command', () => {
    const face = stationCommandPayloadToFace({
      code: ARRIVAL_CMD_BATCH_SORT,
      label: 'Batch sort',
    });
    assert.equal(parseStationCommand(face.matrix.value), 'batch_sort');
  });
});
