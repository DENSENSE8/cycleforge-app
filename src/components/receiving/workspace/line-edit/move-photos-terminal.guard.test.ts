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

  it('Photos verb tabs twin Units · Linkage — underline + icons, Move · Send only', () => {
    assert.match(photos, /appearance="underline"/);
    assert.match(photos, /density="nested"/);
    assert.match(photos, /fit="fill"/);
    assert.doesNotMatch(
      photos,
      /appearance="segment"/,
      'Photos verbs match Units/Linkage underline, not Ticket segment',
    );
    assert.doesNotMatch(
      photos,
      /DISPLAYS_BODY_INSET/,
      'Photos bodies mount flush — no shared host inset pad',
    );
    assert.match(
      photos,
      /icon:\s*ArrowLeftRight/,
      'Move keeps the ArrowLeftRight glyph like sibling display hosts',
    );
    assert.match(
      photos,
      /icon:\s*Send/,
      'Send keeps the Send glyph like sibling display hosts',
    );
    assert.doesNotMatch(
      photos,
      /id:\s*'browse'|label:\s*'Browse'|icon:\s*Images/,
      'Browse tab removed — gallery is the default Photos body',
    );
    assert.match(
      photos,
      /mode="view"/,
      'gallery uses ClaimPhotoPicker view mode (no attach chrome)',
    );
    assert.match(
      photos,
      /action === next \? 'browse'/,
      're-click active Move/Send returns to gallery',
    );
  });

  it('Move photos auto-selects a sole search hit (PO / tracking paste)', () => {
    assert.match(
      move,
      /rows\.length === 1/,
      'sole-match gate must stay — paste of a unique PO/tracking should pick the carton',
    );
    assert.match(
      move,
      /dismissedNeedleRef/,
      'deselecting the blue row must not instantly re-select the same sole hit',
    );
    assert.match(
      move,
      /pendingSelectAllPhotosRef/,
      'sole-match auto-pick should arm select-all so Move CTA can enable',
    );
    assert.match(
      move,
      /matchedExcludedSelf|selfOnly/,
      'self-match recent browse must not auto-select',
    );
    assert.match(
      move,
      /bg-blue-50.*ring-blue-400|ring-blue-400[\s\S]*bg-blue-50/,
      'selected carton keeps the same row face with a blue highlight',
    );
    assert.doesNotMatch(
      move,
      /Change carton/,
      'selected state is the blue row, not a Change carton text link',
    );
    assert.doesNotMatch(
      move,
      /Photos on this carton|Photos on source carton/,
      'no Photos on this carton header above the picker',
    );
    assert.match(
      move,
      /DenseComposeSearchInput/,
      'search stays mounted whether or not a carton is selected',
    );
    assert.doesNotMatch(
      move,
      /!otherRow\s*\?/,
      'must not hide search behind an unselected-only branch',
    );
    assert.match(
      move,
      /ariaLabel="Clear carton search"/,
      'X clear control deselects and resets the search',
    );
    assert.match(
      move,
      /clearPicker/,
      'shared clear path for X (search + selection + dismissed needle)',
    );
  });
});
