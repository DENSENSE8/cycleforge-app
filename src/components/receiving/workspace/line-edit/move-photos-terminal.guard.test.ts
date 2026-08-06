/**
 * Move photos Macro terminal — FlushTerminalFooter + Photos host fill.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/line-edit/move-photos-terminal.guard.test.ts
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

const MOVE =
  'src/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel.tsx';
const PHOTOS =
  'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx';
const SEND = 'src/components/receiving/workspace/SendPhotoNotePanel.tsx';

describe('Move / Send Macro terminal SoT', () => {
  const move = stripComments(readFileSync(join(process.cwd(), MOVE), 'utf8'));
  const photos = stripComments(
    readFileSync(join(process.cwd(), PHOTOS), 'utf8'),
  );
  const send = stripComments(readFileSync(join(process.cwd(), SEND), 'utf8'));

  it('Move photos composes FlushTerminalFooter bleed + size md', () => {
    assert.match(move, /FlushTerminalFooter/);
    assert.match(move, /layout="bleed"/);
    assert.match(move, /size="md"/);
    assert.doesNotMatch(
      move,
      /border-t border-border-soft/,
      'no hand-rolled soft-border footer twin',
    );
    assert.doesNotMatch(
      move,
      /FlushTerminalFooter[\s\S]{0,400}\brounded-(?:lg|xl|2xl|full)\b/,
      'Macro CTA must not soft-round at the call site',
    );
  });

  it('Send photos composes FlushTerminalFooter bleed', () => {
    assert.match(send, /FlushTerminalFooter/);
    assert.match(send, /layout="bleed"/);
    assert.match(send, /size="md"/);
  });

  it('PhotosDisplayHost fills height and does not pad Move/Send with pt-3', () => {
    assert.match(
      photos,
      /flex h-full min-h-0 flex-col/,
      'Photos host must fill Displays column like Ticket',
    );
    assert.doesNotMatch(
      photos,
      /flex-1 pt-3/,
      'shared host pt-3 lifts the Macro floor off the column bottom',
    );
  });
});
