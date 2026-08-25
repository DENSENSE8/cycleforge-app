/**
 * Label text fitting.
 *
 * pretext measures with the browser's font engine as ground truth, and Node has
 * no canvas, so these tests install a DETERMINISTIC stand-in font engine: a
 * table of Arial-like advance ratios, scaled by the px size in the font
 * shorthand. That is deliberate. The claims under test are about the LAYOUT
 * decisions — does a wide string wrap where a narrow one of the same character
 * count does not, does a spaceless CJK title break at all, does an over-long
 * string report the text it dropped — none of which should depend on the exact
 * advance of Arial's 'W' in a particular browser build. The stand-in makes
 * those decisions reproducible; the real engine supplies real numbers in the
 * browser, where the raster label is actually drawn.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

/** Arial-ish advance ratios (fraction of the em). Enough spread to be honest. */
const ADVANCE: Record<string, number> = {
  ' ': 0.278,
  i: 0.222,
  j: 0.222,
  l: 0.222,
  t: 0.278,
  f: 0.278,
  r: 0.333,
  W: 0.944,
  M: 0.833,
  m: 0.833,
  '，': 1,
};

function advanceRatio(ch: string): number {
  const known = ADVANCE[ch];
  if (known !== undefined) return known;
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x2e80) return 1; // CJK & kana are full-width
  if (ch >= 'A' && ch <= 'Z') return 0.667;
  if (ch >= '0' && ch <= '9') return 0.556;
  return 0.5;
}

function sizeOf(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]!) : 16;
}

/** Ground truth for these tests: what the stand-in engine says a string costs. */
function widthOf(text: string, font: string): number {
  const size = sizeOf(font);
  let total = 0;
  for (const ch of text) total += advanceRatio(ch) * size;
  return total;
}

class StandInContext {
  font = '10px sans-serif';
  measureText(text: string) {
    return { width: widthOf(text, this.font) };
  }
}

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return new StandInContext();
  }
};

// Static import is safe despite the stand-in above: pretext resolves its
// measurement context lazily, on the first measurement, not at module load.
import {
  cellsForDots,
  fitFontSize,
  labelFont,
  TSPL_FONT_CELL_WIDTH,
  wrapMonospace,
  wrapToWidth,
  zplCellsForDots,
} from '@/lib/print/labelText';

// The real 2"x1" receiving label at 203 DPI: 406 dots wide, a 164-dot
// DataMatrix on the right, 10 dots of padding and an 8-dot gutter.
const INFO_WIDTH = 214;
const NOTE_FONT = labelFont(600, 16);
const TITLE_FONT = labelFont(700, 19);

test('width wrapping separates strings the 22-character rule could not tell apart', () => {
  const wide = wrapToWidth('W'.repeat(22), { font: TITLE_FONT, maxWidth: INFO_WIDTH, maxLines: 4 });
  const narrow = wrapToWidth('i'.repeat(22), { font: TITLE_FONT, maxWidth: INFO_WIDTH, maxLines: 4 });

  // Same character count, ~4x the printed width. The old rule gave both one
  // line and let the wide one run off the edge of the label.
  assert.ok(widthOf('W'.repeat(22), TITLE_FONT) > INFO_WIDTH);
  assert.ok(wide.lines.length > 1, 'all-W title must wrap');
  assert.deepEqual(narrow.lines, ['i'.repeat(22)], 'all-i title fits one line');

  for (const line of [...wide.lines, ...narrow.lines]) {
    assert.ok(
      widthOf(line, TITLE_FONT) <= INFO_WIDTH,
      `line "${line}" is ${widthOf(line, TITLE_FONT)} wide, over ${INFO_WIDTH}`,
    );
  }
  assert.equal(wide.truncated, false);
  assert.equal(narrow.truncated, false);
});

test('spaceless CJK titles break instead of running off the label', () => {
  const title = '联想笔记本电脑，全新未拆封，含原装电源适配器与保修卡';
  // The old `text.split(/\s+/)` saw one unbreakable "word" here.
  assert.deepEqual(title.split(/\s+/).filter(Boolean).length, 1);

  const wrapped = wrapToWidth(title, { font: TITLE_FONT, maxWidth: INFO_WIDTH, maxLines: 4 });

  assert.ok(wrapped.lines.length >= 3, 'CJK title must wrap onto several lines');
  assert.equal(wrapped.lines.join(''), title, 'no characters lost while wrapping');
  for (const line of wrapped.lines) {
    assert.ok(widthOf(line, TITLE_FONT) <= INFO_WIDTH, `CJK line "${line}" overflows`);
  }
});

test('truncation is reported and marked, not silently sliced', () => {
  const notes =
    'Cracked bezel, missing charger, battery swollen, screen has burn-in, sold as-is for parts only, do not restock';
  const wrapped = wrapToWidth(notes, { font: NOTE_FONT, maxWidth: INFO_WIDTH, maxLines: 3 });

  assert.equal(wrapped.lines.length, 3);
  assert.equal(wrapped.truncated, true);
  assert.ok(wrapped.overflow.length > 0, 'dropped text is handed back to the caller');
  assert.ok(wrapped.lines[2]!.endsWith('…'), 'the operator can see the label was cut');
  assert.ok(
    widthOf(wrapped.lines[2]!, NOTE_FONT) <= INFO_WIDTH,
    'the ellipsis is fitted, not appended past the edge',
  );
});

test('text that fits reports no truncation and keeps every word', () => {
  const wrapped = wrapToWidth('Silent print geometry', {
    font: NOTE_FONT,
    maxWidth: INFO_WIDTH,
    maxLines: 3,
  });

  assert.equal(wrapped.truncated, false);
  assert.equal(wrapped.overflow, '');
  assert.equal(wrapped.lines.join(' '), 'Silent print geometry');
});

test('monospace wrapping counts cells and finds CJK break opportunities', () => {
  // TSPL font "2" is 12 dots wide; the receiving label leaves ~207 dots for
  // notes, which is 17 cells — not the 22 the old constant claimed.
  const cells = cellsForDots(207, TSPL_FONT_CELL_WIDTH['2']);
  assert.equal(cells, 17);

  const latin = wrapMonospace('Cracked bezel and a missing charger', {
    maxCells: cells,
    maxLines: 3,
  });
  for (const line of latin.lines) assert.ok([...line].length <= cells, `"${line}" over ${cells}`);
  assert.equal(latin.lines.join(' '), 'Cracked bezel and a missing charger');

  const cjk = wrapMonospace('联想笔记本电脑全新未拆封含原装电源适配器', {
    maxCells: cells,
    maxLines: 3,
  });
  assert.ok(cjk.lines.length > 1, 'CJK must break across cells');
  for (const line of cjk.lines) assert.ok([...line].length <= cells, `"${line}" over ${cells}`);
});

test('monospace truncation marks the cut in ASCII the printer codepage can render', () => {
  const wrapped = wrapMonospace('one two three four five six seven eight nine ten eleven', {
    maxCells: 17,
    maxLines: 2,
  });

  assert.equal(wrapped.lines.length, 2);
  assert.equal(wrapped.truncated, true);
  assert.ok(wrapped.overflow.includes('eleven'));
  assert.ok(wrapped.lines[1]!.endsWith('...'));
  assert.ok([...wrapped.lines[1]!].length <= 17);
  // U+2026 would be encoded as three UTF-8 bytes into a CODEPAGE 1252 stream.
  assert.ok(!wrapped.lines[1]!.includes('…'));
});

test('a unit wider than the whole line is split rather than dropped', () => {
  const wrapped = wrapMonospace('SKU-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {
    maxCells: 10,
    maxLines: 6,
  });

  assert.equal(wrapped.truncated, false);
  assert.equal(wrapped.lines.join(''), 'SKU-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  for (const line of wrapped.lines) assert.ok([...line].length <= 10);
});

test('zpl budgets a proportional cell, not the declared one', () => {
  // 216 dots at a declared 22-dot cell: 9 characters if every glyph filled its
  // cell, ~16 at Helvetica's average advance.
  assert.equal(zplCellsForDots(216, 22), 16);
  assert.equal(cellsForDots(216, 22), 9);
});

/** The 1px-at-a-time search `fitFontSize` replaces. */
function linearSearchSize(text: string, maxWidth: number, initialSize: number): number {
  let size = initialSize;
  do {
    if (widthOf(text, labelFont(700, size)) <= maxWidth || size <= 8) break;
    size -= 1;
  } while (size > 8);
  return size;
}

test('shrink-to-fit solves for the size the linear search would have walked to', () => {
  const fontAt = (size: number) => labelFont(700, size);
  const cases: Array<[string, number]> = [
    ['MacBook Pro 16" 2021 M1 Max', 214],
    ['WWWWWWWWWWWW', 214],
    ['iiii', 214],
    ['R-1234', 164],
    ['联想笔记本电脑全新未拆封', 214],
    ['a very long condition string that will bottom out', 60],
  ];

  for (const [text, maxWidth] of cases) {
    const solved = fitFontSize(text, { fontAt, maxWidth, initialSize: 19 });
    assert.equal(solved, linearSearchSize(text, maxWidth, 19), `size for "${text}"`);
    assert.ok(solved >= 8 && solved <= 19);
  }
});

test('shrink-to-fit leaves text that already fits at its initial size', () => {
  const fontAt = (size: number) => labelFont(700, size);
  assert.equal(fitFontSize('NEW', { fontAt, maxWidth: 214, initialSize: 19 }), 19);
  assert.equal(fitFontSize('', { fontAt, maxWidth: 4, initialSize: 19 }), 19);
});
