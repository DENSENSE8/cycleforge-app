import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  flattenSectionedParents,
  parseLedgerDrillLayout,
  parseLedgerDrillParentKey,
  writeLedgerDrillParams,
  type LedgerDrillUrlContract,
} from './ledger-drill-layout';

const CONTRACT: LedgerDrillUrlContract = {
  layoutParam: 'hlayout',
  parentParam: 'drillPo',
  defaultLayout: 'drill',
};

describe('ledger-drill-layout', () => {
  it('defaults omitted / unknown to contract.defaultLayout', () => {
    assert.equal(parseLedgerDrillLayout(null, CONTRACT), 'drill');
    assert.equal(parseLedgerDrillLayout('', CONTRACT), 'drill');
    assert.equal(parseLedgerDrillLayout('nope', CONTRACT), 'drill');
    assert.equal(parseLedgerDrillLayout('list', CONTRACT), 'list');
    assert.equal(parseLedgerDrillLayout('drill', CONTRACT), 'drill');
  });

  it('honors alternate defaultLayout', () => {
    assert.equal(
      parseLedgerDrillLayout(null, { defaultLayout: 'list' }),
      'list',
    );
  });

  it('parses parent key', () => {
    assert.equal(parseLedgerDrillParentKey(null), null);
    assert.equal(parseLedgerDrillParentKey('  '), null);
    assert.equal(parseLedgerDrillParentKey('po:ABC'), 'po:ABC');
  });

  it('writeLedgerDrillParams keeps default layout URL clean', () => {
    const params = new URLSearchParams();
    writeLedgerDrillParams(params, CONTRACT, 'drill', 'po:1');
    assert.equal(params.has('hlayout'), false);
    assert.equal(params.get('drillPo'), 'po:1');

    writeLedgerDrillParams(params, CONTRACT, 'list', null);
    assert.equal(params.get('hlayout'), 'list');
    assert.equal(params.has('drillPo'), false);
  });

  it('flattenSectionedParents newest section first', () => {
    const flat = flattenSectionedParents({
      '2026-07-01': [{ key: 'po:A' }],
      '2026-08-01': [{ key: 'po:B' }, { key: 'po:C' }],
    });
    assert.deepEqual(
      flat.map((e) => `${e.section}:${e.group.key}`),
      ['2026-08-01:po:B', '2026-08-01:po:C', '2026-07-01:po:A'],
    );
  });
});
