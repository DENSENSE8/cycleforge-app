/**
 * Phase 2g + 2h structural pins.
 *
 * Incoming cells live on the ReceivingLineRow registry. Station history All
 * mounts NonlinearTableHost. incoming-grid-layout.ts and the incoming cell
 * family are gone. useIsColumnHidden is 3.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';


const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('Incoming↔History one ReceivingLineRow cell registry (2g)', () => {
  it('incoming-grid-layout.ts and incoming-grid/cells are gone', () => {
    assert.equal(existsSync(join(ROOT, 'src/lib/receiving/incoming-grid-layout.ts')), false);
    assert.equal(existsSync(join(ROOT, 'src/components/station/incoming-grid/cells')), false);
  });

  it('Incoming row resolves cells through renderReceivingGridCell', () => {
    const row = read('src/components/station/incoming-grid/IncomingGridRow.tsx');
    assert.match(row, /renderReceivingGridCell/);
    assert.match(row, /linePhase:\s*'expected'/);
    assert.doesNotMatch(row, /renderIncomingGridCell/);
  });

  it('INCOMING_GRID_COLUMNS live on receiving-grid-layout; tableId stays incoming', () => {
    const layout = read('src/lib/receiving/receiving-grid-layout.ts');
    assert.match(layout, /export const INCOMING_GRID_COLUMNS/);
    const def = read('src/components/station/incoming-grid/incoming-table-definition.ts');
    assert.match(def, /tableId: 'incoming'/);
    assert.match(def, /cellMapKey: 'receiving'/);
  });
});

describe('Station bench mounts the table-definition host (2h)', () => {
  it('station-history.browse is registered', () => {
    const registry = read('src/components/tables/registered-bindings.ts');
    assert.match(registry, /STATION_HISTORY_TABLE_BINDING/);
    const def = read(
      'src/components/station/station-history-grid/station-history-table-definition.ts',
    );
    assert.match(def, /id: 'station-history.browse'/);
  });

  it('StationHistoryTable All path mounts NonlinearTableHost', () => {
    const src = read('src/components/station/StationHistoryTable.tsx');
    assert.match(src, /<NonlinearTableHost/);
    assert.match(src, /STATION_HISTORY_TABLE_BINDING/);
    assert.doesNotMatch(src, /import \{ StationListTable /);
    assert.doesNotMatch(src, /role="grid"/);
    assert.doesNotMatch(src, /import \{ StationRowColumnHeader /);
  });

  it('StationListTable has no dense fallback and no StationRowColumnHeader', () => {
    const src = read('src/components/station/StationListTable.tsx');
    assert.match(src, /LedgerGrid/);
    assert.doesNotMatch(src, /function DenseDaySection/);
    assert.doesNotMatch(src, /import \{ StationRowColumnHeader /);
    assert.doesNotMatch(src, /role=\{"grid"\}/);
  });
});
