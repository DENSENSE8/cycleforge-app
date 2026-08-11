/**
 * Unbox Photos → Actions is a Station Action-plane armed list. Identity hover
 * PhotoLauncher remains a mouse shortcut; Move / Send from that dropdown open
 * Displays drills. Keyboard: useArmedCursorList; Esc stays on the Displays stack.
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
const TOOLS =
  'src/components/receiving/workspace/line-edit/PhotosActionsToolRuntime.tsx';
const HOST = 'src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx';
const PILL =
  'src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx';
const PANEL = 'src/components/receiving/workspace/LineEditPanel.tsx';

describe('Photos Actions keyboard-armed Displays SoT', () => {
  const actions = stripComments(readFileSync(join(process.cwd(), ACTIONS), 'utf8'));
  const tools = stripComments(readFileSync(join(process.cwd(), TOOLS), 'utf8'));
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
    // Default face stays in the Photos host chunk; drills are separate chunks.
    assert.match(
      host,
      /import \{ PhotosActionsArmedList \}/,
      'Actions list is eager with the host (default face)',
    );
    assert.match(host, /dynamic\(/, 'Move·Send·Compare must be dynamic()');
    assert.doesNotMatch(
      host,
      /import \{ MovePhotosBetweenPoPanel \}/,
      'Move must not ride the Actions chunk',
    );
    assert.doesNotMatch(
      host,
      /import \{ SendPhotoNotePanel \}/,
      'Send must not ride the Actions chunk',
    );
    assert.doesNotMatch(
      host,
      /import \{ ListingPhotoCompareHost \}/,
      'Compare must not ride the Actions chunk',
    );
  });

  it('armed drill verbs are Move · Send · Compare (tools → evidence)', () => {
    const move = actions.indexOf("id: 'move'");
    const send = actions.indexOf("id: 'send'");
    const compare = actions.indexOf("id: 'compare'");
    assert.ok(move > 0 && send > move && compare > send);
  });

  it('Upload opens the native file picker immediately — no PhotoUploadOverlay', () => {
    // Gallery / dropzone / phone ride a deferred runtime chunk so the Actions
    // list paints without pulling usePhotoGallery on Index→Photos.
    assert.match(actions, /PhotosActionsToolRuntime/);
    assert.match(actions, /dynamic\(/);
    assert.doesNotMatch(
      actions,
      /import \{ usePhotoGallery \}/,
      'usePhotoGallery must not ride the Actions list chunk',
    );
    assert.doesNotMatch(
      actions,
      /import \{ usePhotoDropzone \}/,
      'usePhotoDropzone must not ride the Actions list chunk',
    );
    assert.match(tools, /usePhotoDropzone/);
    assert.match(tools, /openPicker/);
    assert.doesNotMatch(
      tools,
      /PhotoUploadOverlay/,
      'Displays Upload must not mount the dropzone overlay',
    );
    assert.doesNotMatch(
      tools,
      /openUploadOverlay/,
      'Upload verb opens Finder/Explorer via openPicker — never the overlay',
    );
  });

  it('Media library navigates same-tab — never window.open / target=_blank', () => {
    assert.match(actions, /router\.push\(libraryHref\)/);
    assert.doesNotMatch(
      actions,
      /window\.open/,
      'Media library must not open a new browser tab',
    );
    assert.doesNotMatch(actions, /target=["']_blank["']/);
    assert.doesNotMatch(
      actions,
      /ExternalLink/,
      'ExternalLink implies new-tab — Media library is in-app navigation',
    );
  });

  it('Unbox identity Photos pill: hover dropdown · click phone · double-click Displays', () => {
    assert.doesNotMatch(
      panel,
      /suppressPhotoHoverGallery/,
      'Unbox must keep the PhotoLauncher hover dropdown on the identity pill',
    );
    assert.match(
      panel,
      /onOpenPhotosDisplay=\{openPhotosDisplay\}/,
      'double-click must open Displays → Photos Actions',
    );
    assert.match(
      panel,
      /onOpenMovePhotosExternal=\{openMovePhotosDisplay\}/,
      'hover Move must open Displays → photos?photoAction=move',
    );
    assert.match(
      panel,
      /onSendToTicketExternal=\{openSendPhotoNoteDisplay\}/,
      'hover Ticket/Send must open Displays → photos?photoAction=send',
    );
    assert.match(
      panel,
      /openDisplays\('photos'\)/,
      'openPhotosDisplay lands on Actions (no photoAction nest)',
    );
    assert.match(
      panel,
      /openDisplays\('photos',\s*\{\s*photoAction:\s*'move'\s*\}\)/,
      'Move drill lands on photoAction=move',
    );
    assert.match(
      panel,
      /openDisplays\('photos',\s*\{\s*photoAction:\s*'send'\s*\}\)/,
      'Send drill lands on photoAction=send',
    );
    assert.match(pill, /suppressHoverGallery/, 'pill retains opt-out for non-Unbox');
    assert.match(
      pill,
      /onOpenPhotosDisplay/,
      'pill accepts Displays open callback',
    );
    assert.match(
      pill,
      /onDoubleClick/,
      'double-click opens Displays when callback is wired',
    );
    assert.match(
      pill,
      /PHONE_CLICK_DEFER_MS|phoneClickTimer/,
      'single-click phone is deferred so dblclick does not also send',
    );
    assert.match(
      pill,
      /GALLERY_OPEN_DELAY_MS|galleryOpenTimer/,
      'hover strip dwells so teaching HoverTooltip can paint first',
    );
    assert.match(
      pill,
      /Phone · dbl-click details/,
      'compact tooltip: phone + dbl-click details',
    );
    assert.match(
      pill,
      /placement=["']right["']/,
      'teaching tip sits to the right of the Photos pill',
    );
    assert.match(
      pill,
      /void handleRequestOnPhone\(\)/,
      'pill click still send-to-phone',
    );
    assert.match(
      pill,
      /launcherLayout="toolbar"/,
      'hover peek mounts PhotoLauncher toolbar dropdown',
    );
    assert.match(
      pill,
      /AnchoredLayer/,
      'hover dropdown portals via AnchoredLayer',
    );
  });
});
