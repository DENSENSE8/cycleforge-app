import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flattenDrillParents,
  HISTORY_DRILL_LAYOUT_PARAM,
  HISTORY_DRILL_PO_PARAM,
  parseHistoryDrillLayout,
  parseHistoryDrillPo,
  writeHistoryDrillParams,
} from './history-drill-layout';
import type { ReceivingPoGroup } from '@/components/station/receiving-lines-table-helpers';

describe('history-drill-layout', () => {
  it('defaults omitted / unknown to list', () => {
    assert.equal(parseHistoryDrillLayout(null), 'list');
    assert.equal(parseHistoryDrillLayout(''), 'list');
    assert.equal(parseHistoryDrillLayout('nope'), 'list');
    assert.equal(parseHistoryDrillLayout('list'), 'list');
    assert.equal(parseHistoryDrillLayout('drill'), 'drill');
  });

  it('parses drillPo', () => {
    assert.equal(parseHistoryDrillPo(null), null);
    assert.equal(parseHistoryDrillPo('  '), null);
    assert.equal(parseHistoryDrillPo('po:ABC'), 'po:ABC');
  });

  it('writeHistoryDrillParams keeps list URL clean', () => {
    const params = new URLSearchParams();
    writeHistoryDrillParams(params, 'list', null);
    assert.equal(params.has(HISTORY_DRILL_LAYOUT_PARAM), false);
    assert.equal(params.has(HISTORY_DRILL_PO_PARAM), false);

    writeHistoryDrillParams(params, 'drill', 'po:1');
    assert.equal(params.get(HISTORY_DRILL_LAYOUT_PARAM), 'drill');
    assert.equal(params.get(HISTORY_DRILL_PO_PARAM), 'po:1');
  });

  it('flattenDrillParents newest day first', () => {
    const g = (key: string, id: number): ReceivingPoGroup => ({
      key,
      rows: [{ id } as ReceivingPoGroup['rows'][number]],
      anchorTs: null,
    });
    const flat = flattenDrillParents({
      '2026-07-01': [g('po:A', 1)],
      '2026-08-01': [g('po:B', 2), g('po:C', 3)],
    });
    assert.deepEqual(
      flat.map((e) => `${e.day}:${e.group.key}`),
      ['2026-08-01:po:B', '2026-08-01:po:C', '2026-07-01:po:A'],
    );
  });
});

