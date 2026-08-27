import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  SEARCH_INLINE_HYSTERESIS_PX,
  SEARCH_INLINE_MIN_WELL_PX,
  SEARCH_INLINE_SLACK_PX,
  resolveSearchInlineCompact,
  resolveSearchTrailingCompact,
} from './search-field-inline-collapse';

test('resolveSearchInlineCompact collapses a well too narrow for any label', () => {
  assert.equal(
    resolveSearchInlineCompact({
      wellWidth: SEARCH_INLINE_MIN_WELL_PX - 1,
      contentWidth: 40,
      currentlyCompact: false,
    }),
    true,
  );
});

test('resolveSearchInlineCompact collapses when the label would overflow the well', () => {
  const contentWidth = 120;
  assert.equal(
    resolveSearchInlineCompact({
      wellWidth: contentWidth + SEARCH_INLINE_SLACK_PX - 1,
      contentWidth,
      currentlyCompact: false,
    }),
    true,
  );
  assert.equal(
    resolveSearchInlineCompact({
      wellWidth: contentWidth + SEARCH_INLINE_SLACK_PX,
      contentWidth,
      currentlyCompact: false,
    }),
    false,
  );
});

test('resolveSearchInlineCompact needs hysteresis before expanding', () => {
  const contentWidth = 120;
  const compactFloor = contentWidth + SEARCH_INLINE_SLACK_PX + SEARCH_INLINE_HYSTERESIS_PX;
  assert.equal(
    resolveSearchInlineCompact({
      wellWidth: compactFloor - 1,
      contentWidth,
      currentlyCompact: true,
    }),
    true,
  );
  assert.equal(
    resolveSearchInlineCompact({
      wellWidth: compactFloor,
      contentWidth,
      currentlyCompact: true,
    }),
    false,
  );
});

test('resolveSearchTrailingCompact stays compact after hiding in-flow chips', () => {
  const chipsWidth = 180;
  const leftoverWell = 50;
  const hostWidth = leftoverWell + chipsWidth;
  assert.equal(
    resolveSearchTrailingCompact({
      hostWidth,
      chipsWidth,
      currentlyCompact: false,
    }),
    true,
  );
  assert.equal(
    resolveSearchTrailingCompact({
      hostWidth,
      chipsWidth,
      currentlyCompact: true,
    }),
    true,
  );
  const expandHost =
    chipsWidth + SEARCH_INLINE_MIN_WELL_PX + SEARCH_INLINE_SLACK_PX + SEARCH_INLINE_HYSTERESIS_PX;
  assert.equal(
    resolveSearchTrailingCompact({
      hostWidth: expandHost,
      chipsWidth,
      currentlyCompact: true,
    }),
    false,
  );
});
