import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'LabelPlatformTypeMenu.tsx'),
  'utf8',
);

describe('LabelPlatformTypeMenu', () => {
  it('is platform then type, sentence case, and a pick does not dismiss', () => {
    assert.match(src, /SectionHead label="Platform"/);
    assert.match(src, /SectionHead label="Type"/);
    assert.ok(
      src.indexOf('SectionHead label="Platform"') < src.indexOf('SectionHead label="Type"'),
    );
    assert.match(src, /chipLabel/);
    assert.match(src, /sentenceCaseLabel/);
    assert.doesNotMatch(src, /fieldLabel/);
    assert.doesNotMatch(src, /onClose|setSlotMenu|setOpen\(false\)/);
    assert.doesNotMatch(src, /SectionHead label="Platform" checked/);
    assert.match(src, /catalogIdentityDot/);
    assert.match(src, /h-2 w-2 shrink-0 rounded-full/);
  });
});
