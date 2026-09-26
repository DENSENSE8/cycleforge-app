import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_PLATFORMS,
  UNKNOWN_PLATFORM,
  platformMetaBrandDot,
  platformMetaIconTone,
  sourcePlatformHue,
  sourcePlatformMeta,
  sourcePlatformMetaFromLabel,
  type PlatformHue,
  type SourcePlatformMeta,
} from '@/lib/source-platform';

/** These tests pin the ONE definition of platform colour. */

/** Hues that paint from semantic tokens rather than a Tailwind colour ramp. */
const SEMANTIC_HUES: ReadonlySet<PlatformHue> = new Set(['neutral']);

function classesOf(meta: SourcePlatformMeta): Array<[string, string]> {
  return [
    ['text', meta.text],
    ['border', meta.border],
    ['dot', meta.dot],
  ];
}

test('every platform declares a hue', () => {
  for (const meta of SOURCE_PLATFORMS) {
    assert.ok(meta.hue, `${meta.value} must declare a hue`);
  }
  assert.equal(UNKNOWN_PLATFORM.hue, 'neutral');
});

test('every painted class names its row hue — no class may disagree with the definition', () => {
  for (const meta of SOURCE_PLATFORMS) {
    if (SEMANTIC_HUES.has(meta.hue)) continue;
    for (const [field, value] of classesOf(meta)) {
      if (!value) continue;
      // A semantic token (text-text-muted) is an allowed opt-out from the ramp;
      // a ramp class must be THIS row's ramp.
      const isSemantic = /^(text-text-|border-border-|bg-border-|bg-surface-)/.test(value);
      if (isSemantic) continue;
      assert.ok(
        value.includes(`-${meta.hue}-`),
        `${meta.value}.${field} is "${value}" but the pinned hue is "${meta.hue}"`,
      );
    }
  }
});

test('the two channels the operator names out loud are pinned', () => {
  // Named explicitly because these are the two an operator will say aloud, and
  // a silent change to either is the most expensive drift in the registry.
  assert.equal(sourcePlatformHue('ebay'), 'yellow');
  assert.equal(sourcePlatformHue('amazon'), 'orange');
  assert.equal(sourcePlatformHue('fba'), 'orange', 'FBA is Amazon and paints as Amazon');
});

test('platform values are unique — two rows for one channel is two colours', () => {
  const seen = new Set<string>();
  for (const meta of SOURCE_PLATFORMS) {
    assert.ok(!seen.has(meta.value), `duplicate platform row: ${meta.value}`);
    seen.add(meta.value);
  }
});

test('an unknown platform resolves to the neutral row, never to a borrowed colour', () => {
  assert.equal(sourcePlatformMeta('not-a-platform').hue, 'neutral');
  assert.equal(sourcePlatformMeta(null).value, '');
  assert.equal(sourcePlatformHue(undefined), 'neutral');
});

test('label lookup resolves to the same row as value lookup', () => {
  // Order surfaces carry labels, not stored values. Both doors, one room.
  assert.equal(sourcePlatformMetaFromLabel('eBay').hue, sourcePlatformMeta('ebay').hue);
  assert.equal(sourcePlatformMetaFromLabel('Amazon').hue, 'orange');
});

test('Ecwid is the channel face; ECWID-RS is a historic alias, not a second store', () => {
  assert.equal(sourcePlatformMeta('ecwid').label, 'Ecwid');
  assert.equal(sourcePlatformMetaFromLabel('ECWID-RS').value, 'ecwid');
  assert.equal(sourcePlatformMetaFromLabel('ECWID-RS').label, 'Ecwid');
  assert.equal(sourcePlatformMetaFromLabel('Ecwid').value, 'ecwid');
});

test('an org accent overrides the paint but never the pinned hue', () => {
  const meta: SourcePlatformMeta = { ...sourcePlatformMeta('ebay'), accentHex: '#3366ff' };
  assert.equal(meta.hue, 'yellow', 'the channel IS still yellow');
  // …while the ink follows the org's chosen accent.
  assert.ok(platformMetaIconTone(meta).style?.color, 'accent hex paints the mark');
  assert.ok(platformMetaBrandDot(meta).style?.backgroundColor, 'accent hex paints the dot');
});

test('a platform with no accent paints from its own class, not a fallback', () => {
  const ebay = sourcePlatformMeta('ebay');
  assert.equal(platformMetaIconTone(ebay).className, ebay.text);
  assert.equal(platformMetaBrandDot(ebay).className, ebay.dot);
});

test('the slider tone vocabulary derives from the registry, not its own table', async () => {
  const { platformSliderTone } = await import('@/components/ui/HorizontalButtonSlider');
  // The two the operator names out loud must survive the translation.
  assert.equal(platformSliderTone('ebay'), 'yellow');
  assert.equal(platformSliderTone('amazon'), 'orange');
  assert.equal(platformSliderTone('fba'), 'orange');
  // The slider's palette is narrower than the registry's, so near hues are approximated to the closest one it can say — Walmart's amber…
  assert.equal(platformSliderTone('walmart'), 'orange');
  assert.equal(platformSliderTone('square'), 'zinc');
  assert.equal(platformSliderTone('other'), 'zinc');
  assert.equal(platformSliderTone('not-a-platform'), 'zinc');
});
