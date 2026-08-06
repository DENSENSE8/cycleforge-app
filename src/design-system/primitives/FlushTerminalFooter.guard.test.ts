/**
 * FlushTerminalFooter Macro SoT — panel-terminal column floor.
 *
 * Run: node --test --import tsx \
 *        src/design-system/primitives/FlushTerminalFooter.guard.test.ts
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

const SRC = 'src/design-system/primitives/FlushTerminalFooter.tsx';

describe('FlushTerminalFooter Macro SoT', () => {
  const src = stripComments(readFileSync(join(process.cwd(), SRC), 'utf8'));

  it('locks Claim golden shell — hairline + canvas + p-0 + shrink-0', () => {
    assert.match(
      src,
      /shrink-0 border-t border-border-hairline bg-surface-canvas p-0/,
      'shell must match Claim sticky File footer',
    );
  });

  it('offers bleed and cluster layouts', () => {
    assert.match(src, /layout === 'bleed'/);
    assert.match(src, /data-flush-terminal-layout="bleed"/);
    assert.match(src, /data-flush-terminal-layout="cluster"/);
    assert.match(src, /leading/);
  });

  it('forbids soft radius, shell pad, and CSS sticky/absolute on the floor', () => {
    assert.doesNotMatch(
      src,
      /\brounded-(?:lg|xl|2xl|full)\b/,
      'Macro floor is flush squares — no soft radius on the shell',
    );
    assert.doesNotMatch(
      src,
      /shrink-0 border-t border-border-hairline bg-surface-canvas p-0[\s\S]{0,40}\b(?:px|py)-/,
      'no px/py air on the shell token',
    );
    assert.doesNotMatch(
      src,
      /\bsticky\b|\babsolute\b/,
      'pinned = in-flow flex sibling, not CSS sticky/absolute',
    );
    assert.doesNotMatch(
      src,
      /shadow-/,
      'no soft upward shadow on the Macro floor',
    );
  });
});
