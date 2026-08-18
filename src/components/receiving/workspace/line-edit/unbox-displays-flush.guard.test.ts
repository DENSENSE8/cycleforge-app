/**
 * Unbox Displays bodies — flush plane (no WorkspaceCard glass island).
 * Same recipe as Testing / Classify / Package Pairing bare chrome.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/unbox-displays-flush.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const read = (rel: string) => code(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Unbox Displays bodies — flush', () => {
  const note = read('src/components/receiving/workspace/line-edit/LinePoNoteCard.tsx');
  const tracking = read('src/components/receiving/workspace/line-edit/TrackingNumbersTab.tsx');
  const listings = read('src/components/receiving/workspace/line-edit/ListingLinksTab.tsx');
  const tabs = read('src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx');

  it('LinePoNoteCard is a flush Displays body — no WorkspaceCard', () => {
    assert.match(note, /FLUSH_HOST_CLASS/);
    assert.match(note, /cornerClass\('flush'\)/);
    assert.doesNotMatch(note, /WorkspaceCard/);
    assert.doesNotMatch(note, /variant=["']glass["']/);
  });

  it('TrackingNumbersTab is flush — no glass, no redundant Tracking numbers eyebrow', () => {
    assert.match(tracking, /FLUSH_HOST_CLASS/);
    assert.doesNotMatch(tracking, /WorkspaceCard/);
    assert.doesNotMatch(tracking, /variant=["']glass["']/);
    assert.doesNotMatch(
      tracking,
      /Tracking numbers/,
      'Displays tab already names Tracking — Primary / Extra box labels only',
    );
  });

  it('ListingLinksTab is a flush Displays body — no WorkspaceCard', () => {
    assert.match(listings, /FLUSH_HOST_CLASS/);
    assert.doesNotMatch(listings, /WorkspaceCard/);
    assert.doesNotMatch(listings, /variant=["']glass["']/);
  });

  it('Checklist Displays body is bare UnboxProcedureChecklist — no glass wrap', () => {
    assert.match(tabs, /content:\s*<UnboxProcedureChecklist\s+row=\{row\}\s*\/>/);
    assert.doesNotMatch(
      tabs,
      /WorkspaceCard\s+variant=["']glass["'][\s\S]{0,120}UnboxProcedureChecklist/,
      'checklist must not reintroduce a glass island around UnboxProcedureChecklist',
    );
  });
});
