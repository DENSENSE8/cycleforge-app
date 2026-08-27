import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeCartonReceivingId,
  resolveUnboxCompareCrosshair,
  scrollPaneToReceivingId,
} from '@/lib/receiving/unbox-compare-crosshair';

describe('unbox-compare-crosshair', () => {
  it('normalizeCartonReceivingId drops null / non-positive', () => {
    assert.equal(normalizeCartonReceivingId(null), null);
    assert.equal(normalizeCartonReceivingId(undefined), null);
    assert.equal(normalizeCartonReceivingId(0), null);
    assert.equal(normalizeCartonReceivingId(-1), null);
    assert.equal(normalizeCartonReceivingId(42), 42);
  });

  it('resolveUnboxCompareCrosshair: hover overrides sticky', () => {
    assert.equal(resolveUnboxCompareCrosshair(10, null), 10);
    assert.equal(resolveUnboxCompareCrosshair(null, 20), 20);
    assert.equal(resolveUnboxCompareCrosshair(10, 20), 20);
    assert.equal(resolveUnboxCompareCrosshair(null, null), null);
  });

  it('scrollPaneToReceivingId scrolls the first match', () => {
    let scrolled = false;
    const match = {
      scrollIntoView: () => {
        scrolled = true;
      },
    };
    const root = {
      querySelector: (sel: string) => (sel.includes('"99"') ? match : null),
    };
    scrollPaneToReceivingId(root as unknown as ParentNode, 99);
    assert.equal(scrolled, true);
  });

  it('scrollPaneToReceivingId no-ops when missing', () => {
    const root = { querySelector: () => null };
    assert.doesNotThrow(() =>
      scrollPaneToReceivingId(root as unknown as ParentNode, 1),
    );
    assert.doesNotThrow(() => scrollPaneToReceivingId(null, 1));
  });
});
