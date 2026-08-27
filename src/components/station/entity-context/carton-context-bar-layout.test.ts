import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLASSIFY_EXPAND_HYSTERESIS_PX,
  CLASSIFY_TOUCH_SLACK_PX,
  resolveClassifyCompact,
} from './carton-context-bar-layout';

test('classify stays labels when identity + labels + actions fit the bar', () => {
  // Typical Displays-open 720 column: leftover air in the middle must not
  // collapse LOW / GOODWILL / PO to dots.
  const compact = resolveClassifyCompact({
    barWidth: 720,
    identityWidth: 220,
    classifyContentWidth: 180,
    actionsWidth: 210,
    currentlyCompact: false,
    labelClassifyWidth: 180,
  });
  assert.equal(compact, false);
  assert.ok(220 + 180 + 210 < 720 - CLASSIFY_TOUCH_SLACK_PX);
});

test('classify compact only when labels would touch identity or actions', () => {
  const compact = resolveClassifyCompact({
    barWidth: 720,
    identityWidth: 280,
    classifyContentWidth: 240,
    actionsWidth: 220,
    currentlyCompact: false,
    labelClassifyWidth: 240,
  });
  assert.equal(compact, true);
  assert.ok(280 + 240 + 220 > 720 - CLASSIFY_TOUCH_SLACK_PX);
});

test('compact stays until labels would fit with hysteresis slack', () => {
  const labels = 200;
  const identity = 240;
  const actions = 240;
  const needed = identity + labels + actions;
  const barWidth = needed + CLASSIFY_TOUCH_SLACK_PX + CLASSIFY_EXPAND_HYSTERESIS_PX - 4;
  assert.equal(
    resolveClassifyCompact({
      barWidth,
      identityWidth: identity,
      classifyContentWidth: 36,
      actionsWidth: actions,
      currentlyCompact: true,
      labelClassifyWidth: labels,
    }),
    true,
  );
  assert.equal(
    resolveClassifyCompact({
      barWidth: needed + CLASSIFY_TOUCH_SLACK_PX + CLASSIFY_EXPAND_HYSTERESIS_PX + 8,
      identityWidth: identity,
      classifyContentWidth: 36,
      actionsWidth: actions,
      currentlyCompact: true,
      labelClassifyWidth: labels,
    }),
    false,
  );
});
