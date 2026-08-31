import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'LabelFaceSlotOverlay.tsx'),
  'utf8',
);

describe('LabelFaceSlotOverlay', () => {
  it('is flush to the sticker box — no wrap pad, no row gap', () => {
    assert.match(src, /absolute inset-0/);
    assert.doesNotMatch(src, /padding:/);
    assert.doesNotMatch(src, /4\.17%/);
    assert.match(src, /w-\[43%\]/);
    assert.match(src, /h-\[13%\]/);
    assert.doesNotMatch(src, /h-\[16%\]/);
    assert.doesNotMatch(src, /h-\[22%\]/);
  });

  it('notes are only the middle row between the two edge rows', () => {
    assert.match(src, /slot="center"/);
    const centerBlock = src.slice(src.indexOf('slot="center"'), src.indexOf('slot="bottom-left"'));
    assert.match(centerBlock, /flex-1/);
    assert.doesNotMatch(centerBlock, /h-\[38%\]/);
  });

  it('gives each corner its own slot', () => {
    assert.match(src, /slot="top-left"/);
    assert.match(src, /slot="top-right"/);
    assert.match(src, /slot="bottom-left"/);
    assert.match(src, /slot="bottom-right"/);
  });
});
