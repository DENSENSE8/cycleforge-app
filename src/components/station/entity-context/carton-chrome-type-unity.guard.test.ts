import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * ONE text face on the carton context header.
 *
 * Every cell on the strip was already `text-role-caption` — 12px — and the row
 * still read as three different sizes, because size is only one of five axes
 * and the other four had drifted per cell:
 *
 * | cell            | family | weight   | tracking          | ink          |
 * | --------------- | ------ | -------- | ----------------- | ------------ |
 * | order # / track | mono   | medium   | `tracking-tight`  | default      |
 * | price           | mono   | 500      | +0.01em           | **muted**    |
 * | Photos / Claim  | sans   | semibold | +0.01em           | tone         |
 * | Listing         | sans   | semibold | +0.01em           | default      |
 * | `+N` counters   | cond.  | 600      | +0.08em (eyebrow) | muted        |
 *
 * Mono-500 at -0.025em beside sans-600 at +0.01em is a visible size difference
 * at the same nominal point size, and the price was the one cell painting a
 * TONE on its label rather than its glyph — which is why the money read gray
 * next to a black `eBay` two cells over.
 *
 * The fix is structural, not a re-tune: cells own geometry and tone, the
 * `chipText` preset owns type. A cell that declares its own `font-*`,
 * `tracking-*`, or `text-role-*` has taken back an axis and the row will drift
 * again the next time a cell is added, so this guard fails on the declaration
 * itself, not on the rendered result.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const CHROME = 'src/components/station/entity-context/station-identity-chrome.ts';
const CARD = 'src/components/station/entity-context/CartonContextCard.tsx';
const ACTION_PILL =
  'src/components/station/entity-context/station-context-action-pill.ts';
const PRESETS = 'src/design-system/tokens/typography/presets.ts';
const COPY_CHIP = 'src/components/ui/CopyChip.tsx';
const INLINE_PILL =
  'src/components/receiving/workspace/line-edit/InlinePillPicker.tsx';

/** Strip block comments — prose documents the old values on purpose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '');

test('the bar type tokens are the house chip presets, not second strings', () => {
  const chrome = code(read(CHROME));
  assert.match(
    chrome,
    /export const STATION_CHROME_CELL_TEXT = chipText;/,
    'STATION_CHROME_CELL_TEXT must alias chipText — re-spelling the utilities here recreates two faces that only agree by luck.',
  );
  assert.match(
    chrome,
    /export const STATION_CHROME_CELL_LABEL = chipLabel;/,
    'Word cells (Claim, platform name, classify) alias chipLabel — the proportional twin.',
  );
  assert.match(
    chrome,
    /export const STATION_CHROME_CELL_INK = 'text-text-default';/,
    'Neutral ink stays split from the type token so tone cells do not collide with a second text-* utility.',
  );
});

test('chipText carries type only — never an ink', () => {
  const preset = code(read(PRESETS));
  const line = preset.match(/export const chipText =\s*'([^']*)'/)?.[1];
  assert.ok(line, 'chipText must stay a single-quoted literal');
  assert.doesNotMatch(
    line,
    /text-text-|text-(?:orange|blue|green|red|amber)-/,
    'Ink in the preset collides with the empty / editing / tone inks callers layer on top.',
  );
  assert.doesNotMatch(
    line,
    /tracking-/,
    'role-caption already carries +0.01em; a tracking override is what made dense chips read a size small.',
  );
  for (const need of ['text-role-caption', 'font-semibold', 'font-mono', 'tabular-nums']) {
    assert.ok(line.includes(need), `chipText must carry ${need}`);
  }
});

test('no carton-bar cell declares its own type', () => {
  for (const rel of [CARD, ACTION_PILL]) {
    const src = code(read(rel));
    assert.doesNotMatch(
      src,
      /font-(?:mono|sans|medium|semibold|bold|normal)/,
      `${rel}: family and weight come from STATION_CHROME_CELL_TEXT.`,
    );
    assert.doesNotMatch(
      src,
      /\btracking-(?:tight|wide|widest|\[)/,
      `${rel}: tracking comes from the role-caption scale.`,
    );
    assert.doesNotMatch(
      src,
      /text-role-(?:eyebrow|micro|body|data|sm)/,
      `${rel}: one size on the strip — the "+N" counters were the last cell running a second scale.`,
    );
  }
});

test('the price paints its tone on the glyph, not the label', () => {
  const card = code(read(CARD));
  const priceFace = card.slice(card.indexOf('const priceFace'), card.indexOf('const oneRowBar'));
  assert.ok(priceFace.length > 0, 'priceFace block not found — update this guard');
  assert.doesNotMatch(
    priceFace,
    /text-text-(?:muted|soft|faint)/,
    'The money reads at full ink like every other fact on the row; green lives on the Receipt glyph via CHIP_TONES.price.iconClass.',
  );
  assert.match(priceFace, /STATION_CHROME_CELL_TEXT/);
  assert.match(priceFace, /CHIP_TONES\.price\.iconClass/);
});

test('the two faces differ in family and NOTHING else', () => {
  const preset = code(read(PRESETS));
  const grab = (name: string) =>
    preset.match(new RegExp(`export const ${name} =\\s*'([^']*)'`))?.[1] ?? '';
  const mono = grab('chipText').split(/\s+/).filter(Boolean);
  const sans = grab('chipLabel').split(/\s+/).filter(Boolean);
  assert.ok(mono.length && sans.length, 'both presets must be single-quoted literals');

  const family = (t: string[]) => t.filter((c) => c.startsWith('font-mono') || c.startsWith('font-sans'));
  assert.deepEqual(family(mono), ['font-mono']);
  assert.deepEqual(family(sans), ['font-sans']);

  // Everything that is not the family must match, or a word cell and a number
  // cell stop being the same optical height — the whole point of the pair.
  const metrics = (t: string[]) => t.filter((c) => !c.startsWith('font-mono') && !c.startsWith('font-sans') && c !== 'tabular-nums').sort();
  assert.deepEqual(
    metrics(mono),
    metrics(sans),
    'Size / weight / leading must be identical across the two faces; only family may differ.',
  );
});

test('chrome labels are sentence case, never shouted', () => {
  const pills = code(read(INLINE_PILL));
  assert.doesNotMatch(
    pills,
    /\buppercase\b/,
    'Classify labels render in the case the catalog authored them (`eBay` keeps its lowercase e). CSS uppercase + 10px condensed is what made these read as a different type system.',
  );
  assert.doesNotMatch(
    pills,
    /text-role-micro/,
    'role-micro is 10px condensed — two steps off the row it sits on.',
  );
  assert.match(pills, /\$\{chipLabel\}/, 'Pill faces compose the word-face preset.');
});

test('dense CopyChips render the same face as the bar', () => {
  const chip = code(read(COPY_CHIP));
  assert.match(
    chip,
    /dense \? chipText :/,
    'The dense branch hand-rolled `text-role-caption font-medium font-mono` — the drift this guard exists to prevent.',
  );
  assert.doesNotMatch(
    chip,
    /\[&_svg\]:h-3 /,
    'Dense glyphs are h-3.5, matching STATION_CHROME_GLYPH_CLASS — a 12px glyph box beside a 14px one is a second scale.',
  );
});
