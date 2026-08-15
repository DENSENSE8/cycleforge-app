import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SOURCE_PLATFORMS,
  UNKNOWN_PLATFORM,
  formatPlatformTooltipLabel,
  platformMetaBrandDot,
  platformMetaIconTone,
  sourcePlatformMark,
  sourcePlatformMeta,
  type SourcePlatformMeta,
} from './source-platform';

test('every platform has a fixed 1–2 char lettermark', () => {
  for (const p of SOURCE_PLATFORMS) {
    assert.ok(p.mark.length >= 1 && p.mark.length <= 2, `${p.value} mark length`);
  }
});

test('every platform has an explicit brand-dot fill class', () => {
  for (const p of SOURCE_PLATFORMS) {
    assert.match(p.dot, /^bg-/, `${p.value} dot must be a bg-* class`);
  }
  assert.equal(UNKNOWN_PLATFORM.dot, 'bg-border-emphasis');
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

test('platformMetaIconTone uses builtin text class', () => {
  const tone = platformMetaIconTone(sourcePlatformMeta('amazon'));
  assert.equal(tone.className, 'text-orange-600');
  assert.equal(tone.style, undefined);
});

test('platformMetaIconTone prefers accentHex style over text', () => {
  const meta: SourcePlatformMeta = {
    ...sourcePlatformMeta('ebay'),
    text: '',
    accentHex: '#FF9900',
  };
  const tone = platformMetaIconTone(meta);
  assert.equal(tone.className, undefined);
  assert.equal(tone.style?.color, '#ff9900');
});

test('platformMetaIconTone returns empty when no text and no valid hex', () => {
  const meta: SourcePlatformMeta = {
    ...sourcePlatformMeta('other'),
    text: '',
    accentHex: 'nope',
  };
  assert.deepEqual(platformMetaIconTone(meta), {});
});

test('platformMetaBrandDot uses registry dot class', () => {
  const paint = platformMetaBrandDot(sourcePlatformMeta('ebay'));
  assert.equal(paint.className, 'bg-yellow-500');
  assert.equal(paint.style, undefined);
});

test('platformMetaBrandDot prefers accentHex fill over registry dot', () => {
  const meta: SourcePlatformMeta = {
    ...sourcePlatformMeta('ebay'),
    accentHex: '#FF9900',
  };
  const paint = platformMetaBrandDot(meta);
  assert.equal(paint.className, undefined);
  assert.equal(paint.style?.backgroundColor, '#ff9900');
});

test('platformMetaBrandDot falls back to unknown neutral', () => {
  assert.deepEqual(platformMetaBrandDot(UNKNOWN_PLATFORM), {
    className: 'bg-border-emphasis',
  });
});

test('formatPlatformTooltipLabel prefixes the platform display name', () => {
  assert.equal(
    formatPlatformTooltipLabel('08-14924-82211', 'eBay'),
    'eBay 08-14924-82211',
  );
  assert.equal(
    formatPlatformTooltipLabel('86-32124', 'Amazon'),
    'Amazon 86-32124',
  );
  assert.equal(formatPlatformTooltipLabel('86-32124', null), '86-32124');
  assert.equal(formatPlatformTooltipLabel('86-32124', 'Unknown'), '86-32124');
  assert.equal(formatPlatformTooltipLabel('', 'eBay'), 'eBay');
  assert.equal(formatPlatformTooltipLabel('', 'Unknown'), '');
  assert.equal(formatPlatformTooltipLabel('', null), '');
});
