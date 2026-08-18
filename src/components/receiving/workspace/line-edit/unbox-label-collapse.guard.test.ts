/**
 * Unbox centre label preview: full-width Show CTA always under PO lines when
 * collapsed; dock notes (`itemNote`) rising edge slowly reveals the sticker;
 * expanded Hide is a micro bottom-right control.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/unbox-label-collapse.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const PREVIEW = code(sourceOf('./UnboxLabelPreview.tsx'));
const TABS = code(sourceOf('./terminal/unbox-tabs.tsx'));

test('label starts collapsed (useState false)', () => {
  assert.match(
    PREVIEW,
    /useState\(false\)/,
    'labelOpen must default closed so the sticker is not the floor',
  );
});

test('Show CTA always mounts under PO lines when collapsed', () => {
  assert.match(PREVIEW, /unbox-label-show/, 'Show CTA test id');
  assert.match(PREVIEW, /w-full/, 'collapsed Show CTA is full width');
  assert.doesNotMatch(
    PREVIEW,
    /if\s*\(\s*!hasNotes\s*\)\s*return\s*null/,
    'empty notes must not suppress the Show CTA',
  );
  assert.match(
    TABS,
    /POUnboxingSection[\s\S]*UnboxLabelPreview/,
    'preview must sit under the PO items section in overview',
  );
  // One hairline per seam: last PoLineRow owns border-b into Show label —
  // preview host must not also paint border-t.
  assert.doesNotMatch(
    PREVIEW,
    /border-t border-border-hairline/,
    'UnboxLabelPreview must not hand-roll a top hairline above Show label',
  );
});

test('notes rising edge opens the sticker via collapseHeight', () => {
  assert.match(PREVIEW, /c\.itemNote/, 'must read the dock draft, not a fork');
  assert.match(PREVIEW, /hasNotes && !hadNotesRef/, 'auto-open only on empty→non-empty');
  assert.match(PREVIEW, /framerPresence\.collapseHeight/, 'height reveal SoT');
  assert.match(
    PREVIEW,
    /framerTransition\.detailStackOverlayMount/,
    'slow soft reveal — not a snap',
  );
});

test('procedure face has no hover Carton label / Edit overlays', () => {
  assert.match(PREVIEW, /showHoverChrome=\{false\}/, 'Unbox centre strips hover chrome');
  assert.match(PREVIEW, /labelEditorRequestId/, 'dock Edit label opens via controller request');
});

test('expanded Hide is a micro bottom-right control', () => {
  assert.match(PREVIEW, /unbox-label-hide/, 'Hide CTA test id');
  assert.match(PREVIEW, /absolute bottom-1 right-1/, 'Hide sits bottom-right over the sticker');
  assert.match(
    PREVIEW,
    /WorkspaceLabelPreviewCard/,
    'expanded path still mounts the shared face card',
  );
});
