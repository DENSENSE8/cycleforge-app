import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SOURCE_PLATFORMS,
  sourcePlatformMark,
  sourcePlatformMeta,
} from './source-platform';

test('every platform has a fixed 1–2 char lettermark', () => {
  for (const p of SOURCE_PLATFORMS) {
    assert.ok(p.mark.length >= 1 && p.mark.length <= 2, `${p.value} mark length`);
  }
});

test('sourcePlatformMark is stable width for known platforms', () => {
  assert.equal(sourcePlatformMark('goodwill'), 'Gw');
  assert.equal(sourcePlatformMark('amazon'), 'az');
  assert.equal(sourcePlatformMark('aliexpress'), 'AE');
  assert.equal(sourcePlatformMeta('goodwill').label, 'Goodwill');
});

test('unknown platform falls back to ? mark', () => {
  assert.equal(sourcePlatformMark('not-a-platform'), '?');
});
