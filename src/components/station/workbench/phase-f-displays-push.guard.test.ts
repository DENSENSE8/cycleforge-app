/**
 * Labels / Shipping / Packer-review Displays-push — Phase F pins (CODE).
 *
 * Mid-canvas reference tabs deleted; tools live on ReceivingDisplaysPushStack.
 * Pack golden: pack-displays-push.guard.test.ts.
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

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Labels Displays push — Phase F', () => {
  const panel = read('src/components/outbound/labels/LabelsOrderWorkspace.tsx');

  it('composes StationScanPaneHost + StationPanelRoot; no centre SectionTabsSlider', () => {
    assert.match(panel, /StationScanPaneHost/);
    assert.match(panel, /StationPanelRoot/);
    assert.match(panel, /ReceivingDisplaysPushStack/);
    assert.match(panel, /storageKey=["']labels-displays-push-width["']/);
    assert.ok(!panel.includes('SectionTabsSlider'), 'Print owns centre — delete the strip');
    assert.ok(!panel.includes('bg-surface-canvas'), 'hand-rolled canvas root deleted');
  });
});

describe('Shipping Displays push — Phase F', () => {
  const host = read('src/components/tech/ActiveOrderWorkspace.tsx');
  const tabs = read('src/components/tech/shipping/ShippingScanWorkspace.tsx');

  it('host mounts Displays for Timeline; centre keeps Ship · Units only', () => {
    assert.match(host, /StationScanPaneHost/);
    assert.match(host, /ReceivingDisplaysPushStack/);
    assert.match(host, /storageKey=["']shipping-displays-push-width["']/);
    assert.ok(!tabs.includes("'timeline'"), 'timeline tab must leave ShippingScanWorkspace');
    assert.ok(!tabs.includes('"timeline"'), 'timeline tab must leave ShippingScanWorkspace');
  });
});

describe('Packer review Displays push — Phase F', () => {
  const panel = read('src/features/review/packer/PackerReviewMode.tsx');

  it('Note owns centre; Photos · Tracking · Timeline on Displays', () => {
    assert.match(panel, /StationScanPaneHost/);
    assert.match(panel, /StationPanelRoot/);
    assert.match(panel, /ReceivingDisplaysPushStack/);
    assert.match(panel, /storageKey=["']pack-review-displays-push-width["']/);
    assert.ok(!panel.includes('SectionTabsSlider'), 'mid-canvas review strip deleted');
    assert.ok(!panel.includes('WorkspaceCard'), 'glass WorkspaceCard islands deleted');
    assert.match(panel, /Review note/);
  });
});
