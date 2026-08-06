/**
 * Button corner SoT — solid CTAs are flush industrial squares.
 * Soft workbench chrome pills opt in via WORKBENCH_CHROME_PILL_CLASS.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const SRC = 'src/design-system/primitives/Button.tsx';

describe('Button flush corner SoT', () => {
  it('consumes cornerClass(flush) — not hardcoded rounded-lg/xl pills', () => {
    const src = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'));
    assert.match(src, /cornerClass\('flush'\)/);
    assert.doesNotMatch(
      src,
      /\brounded-(?:lg|xl|2xl|full)\b/,
      'size ladders must not hardcode soft radius — use cornerClass(flush)',
    );
  });
});
