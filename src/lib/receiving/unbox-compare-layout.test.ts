/**
 * Unit coverage for Unbox compare layout URL encode/decode + floor downgrade.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultUnboxComparePanes,
  encodeUnboxComparePane,
  parseUnboxCompareLayout,
  parseUnboxComparePane,
  resolveUnboxCompareLayoutForWidth,
  UNBOX_COMPARE_PANE_MIN_PX,
  UNBOX_COMPARE_QUAD_FLOOR_PX,
  writeUnboxCompareParams,
} from './unbox-compare-layout';

describe('unbox-compare-layout', () => {
  it('parses layout tokens', () => {
    assert.equal(parseUnboxCompareLayout(null), 'single');
    assert.equal(parseUnboxCompareLayout('split'), 'split');
    assert.equal(parseUnboxCompareLayout('quad'), 'quad');
    assert.equal(parseUnboxCompareLayout('nope'), 'single');
  });

  it('encodes and parses pane recipes', () => {
    assert.equal(encodeUnboxComparePane({ tab: 'queue' }), 'queue');
    assert.equal(
      encodeUnboxComparePane({ tab: 'queue', queueStage: 'unstaged', queueLane: 'HOLD' }),
      'queue:unstaged:HOLD',
    );
    const parsed = parseUnboxComparePane('queue:staged:PO_STOCKOUT');
    assert.equal(parsed.tab, 'queue');
    assert.equal(parsed.queueStage, 'staged');
    assert.equal(parsed.queueLane, 'PO_STOCKOUT');
  });

  it('writes clean URL for single and pane params for split', () => {
    const single = new URLSearchParams('clayout=split&c0=queue');
    writeUnboxCompareParams(single, 'single', []);
    assert.equal(single.get('clayout'), null);
    assert.equal(single.get('c0'), null);

    const split = new URLSearchParams();
    writeUnboxCompareParams(split, 'split', defaultUnboxComparePanes('split'));
    assert.equal(split.get('clayout'), 'split');
    assert.equal(split.get('c0'), 'queue');
    assert.equal(split.get('c1'), 'history');
  });

  it('downgrades layout when center floor is too narrow', () => {
    assert.equal(
      resolveUnboxCompareLayoutForWidth('quad', UNBOX_COMPARE_QUAD_FLOOR_PX - 1),
      'split',
    );
    assert.equal(
      resolveUnboxCompareLayoutForWidth('split', UNBOX_COMPARE_PANE_MIN_PX * 2),
      'single',
    );
    assert.equal(
      resolveUnboxCompareLayoutForWidth('quad', UNBOX_COMPARE_QUAD_FLOOR_PX + 100),
      'quad',
    );
  });
});
