import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUBTITLE_REORDER_THRESHOLD_PX,
  ignoreRowSelectFromSubtitle,
  subtitleReorderShouldArm,
  swallowNextClick,
} from './useSubtitlePointerReorder';

describe('subtitleReorderShouldArm', () => {
  it('stays idle inside the hold threshold so a click still opens qty / condition', () => {
    assert.equal(subtitleReorderShouldArm(0, 0), false);
    assert.equal(subtitleReorderShouldArm(3, 3), false);
    assert.ok(Math.hypot(3, 3) < SUBTITLE_REORDER_THRESHOLD_PX);
  });

  it('arms once the pointer has moved far enough to be a drag', () => {
    assert.equal(subtitleReorderShouldArm(SUBTITLE_REORDER_THRESHOLD_PX, 0), true);
    assert.equal(subtitleReorderShouldArm(0, 10), true);
    assert.equal(subtitleReorderShouldArm(8, 8), true);
  });
});

describe('swallowNextClick', () => {
  it('cancels the click that fires on the row after a subtitle drag', () => {
    if (typeof window === 'undefined') return;
    const seen: string[] = [];
    const bubble = () => {
      seen.push('bubble');
    };
    window.addEventListener('click', bubble);
    swallowNextClick();
    window.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    assert.deepEqual(seen, []);
    window.removeEventListener('click', bubble);
  });
});

describe('ignoreRowSelectFromSubtitle', () => {
  it('blocks row select while a subtitle drag is in flight', () => {
    if (typeof window === 'undefined') return;
    swallowNextClick();
    assert.equal(ignoreRowSelectFromSubtitle({ target: null }), true);
  });
});
