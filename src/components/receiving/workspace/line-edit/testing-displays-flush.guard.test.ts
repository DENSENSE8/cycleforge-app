/**
 * Testing Displays bodies — flush plane (no WorkspaceCard glass island).
 * Mirrors Classify / Package Pairing bare chrome.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/testing-displays-flush.guard.test.ts`
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

describe('Testing Displays bodies — flush', () => {
  const panels = read('src/components/receiving/workspace/line-edit/LineTestingTabbedCard.tsx');
  const timeline = read('src/components/station/workbench/WorkspaceTimelineTab.tsx');
  const displays = read('src/components/tech/testing-panel/build-testing-displays.tsx');

  it('LineTestingTabbedCard mounts flush hosts — no WorkspaceCard', () => {
    assert.match(panels, /FLUSH_HOST_CLASS/);
    assert.match(panels, /cornerClass\('flush'\)/);
    assert.doesNotMatch(panels, /WorkspaceCard/);
    assert.doesNotMatch(panels, /variant=["']glass["']/);
    assert.doesNotMatch(panels, /bodyDensity=["']nested["']/);
    assert.doesNotMatch(panels, /rounded-(?:3xl|2xl|xl|lg)\b/);
  });

  it('WorkspaceTimelineTab is a flush Displays body — no WorkspaceCard', () => {
    assert.match(timeline, /TIMELINE_FLUSH_HOST_CLASS/);
    assert.doesNotMatch(timeline, /WorkspaceCard/);
    assert.doesNotMatch(timeline, /variant=["']glass["']/);
  });

  it('Testing Displays mount the flushed panels', () => {
    assert.match(displays, /TestingSkuPairingPanel/);
    assert.match(displays, /TestingSkuChecklistPanel/);
    assert.match(displays, /TestingSkuManualsPanel/);
    assert.match(displays, /WorkspaceTimelineTab/);
  });
});
