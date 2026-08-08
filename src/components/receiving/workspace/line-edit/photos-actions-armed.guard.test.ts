/**
 * Unbox Photos → Actions is a Station Action-plane armed list — not hover
 * toolbar chrome. Keyboard: useArmedCursorList; Esc stays on the Displays stack.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/line-edit/photos-actions-armed.guard.test.ts
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

const ACTIONS =
  'src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx';
const HOST = 'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx';
const PILL =
  'src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx';
const PANEL = 'src/components/receiving/workspace/LineEditPanel.tsx';

describe('Photos Actions keyboard-armed Displays SoT', () => {
  const actions = stripComments(readFileSync(join(process.cwd(), ACTIONS), 'utf8'));
  const host = stripComments(readFileSync(join(process.cwd(), HOST), 'utf8'));
  const pill = stripComments(readFileSync(join(process.cwd(), PILL), 'utf8'));
  const panel = stripComments(readFileSync(join(process.cwd(), PANEL), 'utf8'));

  it('Actions list composes useArmedCursorList + list-key owner + dossier stamp', () => {
    assert.match(actions, /useArmedCursorList/);
    assert.match(actions, /regionActive:\s*rightOwnsKeyboard/);
    assert.match(actions, /LIST_KEY_OWNER_ATTR/);
    assert.match(actions, /data-station-action-dossier/);
    assert.match(actions, /ARMED_CURSOR_CHEVRON_CLASS/);
    assert.match(actions, /ARMED_CURSOR_TRACK_CLASS/);
    assert.match(actions, /data-photos-armed-track/);
    assert.match(actions, /data-photos-armed-chevron/);
    assert.doesNotMatch(
      actions,
      /ARMED_CURSOR_CHEVRON_SLOT|CHEVRON_SLOT_CLASS/,
      'idle rows stay flush leftmost — no reserved chevron gutter',
    );
    assert.doesNotMatch(
      actions,
      /bg-amber-400/,
      'selection track uses accent-bg — never local amber',
    );
    assert.doesNotMatch(actions, /border-l-accent-bg/);
    assert.doesNotMatch(actions, /from ['"]lucide-react['"]/);
    assert.doesNotMatch(actions, /CopyChipHoverMenuPanel/);
    assert.doesNotMatch(
      actions,
      /onKeyDown[\s\S]{0,200}Escape/,
      'Esc stays on Displays push stack — list must not bind Escape',
    );
  });

  it('PhotosDisplayHost mounts the armed list — no nested TabDisplay', () => {
    assert.match(host, /PhotosActionsArmedList/);
    assert.match(
      host,
      /useDisplaysLeafChrome/,
      'drill Back / Esc must pop via leaf chrome trail (Compare·Move·Send → Actions)',
    );
    assert.doesNotMatch(host, /launcherLayout="toolbar"/);
    assert.doesNotMatch(
      host,
      /\bTabDisplay\b/,
      'Actions·Move·Send·Compare underline strip removed',
    );
  });

  it('armed drill verbs are Move · Send · Compare (tools → evidence)', () => {
    const move = actions.indexOf("id: 'move'");
    const send = actions.indexOf("id: 'send'");
    const compare = actions.indexOf("id: 'compare'");
    assert.ok(move > 0 && send > move && compare > send);
  });

  it('Unbox identity Photos pill stays send-to-phone (hover strip suppressed)', () => {
    assert.match(panel, /suppressPhotoHoverGallery/);
    assert.doesNotMatch(panel, /onOpenPhotosDisplay/);
    assert.match(pill, /suppressHoverGallery/);
    assert.match(
      pill,
      /void handleRequestOnPhone\(\)/,
      'pill click always send-to-phone',
    );
    assert.match(
      pill,
      /if \(suppressHoverGallery\)/,
      'suppressHoverGallery skips AnchoredLayer hover strip',
    );
  });
});
