/**
 * Labels flush column + Shipping / Packer-review Displays-push — Phase F pins.
 *
 * Labels keeps Print · Documents · Timeline as centre tabs (flush host only —
 * not Displays push). Shipping / Packer review push reference tools.
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

describe('Labels flush Station column — Print · Documents · Timeline stay centre', () => {
  const panel = read('src/components/outbound/labels/LabelsOrderWorkspace.tsx');

  it('StationPanelRoot + flow identity; Documents · Timeline remain centre tabs', () => {
    assert.match(panel, /StationPanelRoot/);
    assert.match(panel, /placement=["']flow["']/);
    assert.match(panel, /bodyGap=["']none["']/);
    assert.match(panel, /reserveIdentityClearance=\{false\}/);
    assert.match(panel, /SectionTabsSlider/);
    assert.match(panel, /id:\s*['"]documents['"]/);
    assert.match(panel, /id:\s*['"]timeline['"]/);
    assert.match(panel, /OrderDocumentsSection[\s\S]*?\bflush\b/);
    assert.match(panel, /OrderTimelineSection[\s\S]*?\bflush\b/);
    assert.ok(!panel.includes('StationDisplaysPushStack'), 'Documents/Timeline are not Displays push');
    assert.ok(!panel.includes('ReceivingDisplaysPushStack'), 'Documents/Timeline are not Displays push');
    assert.ok(!panel.includes('StationScanPaneHost'), 'no dual-pane host — single flush column');
    assert.ok(!panel.includes('bg-surface-canvas'), 'hand-rolled canvas root deleted');
    assert.doesNotMatch(panel, /pt-3/, 'no soft top air on tab bodies');
  });
});

describe('Shipping Displays push — Phase F', () => {
  const host = read('src/components/tech/ActiveOrderWorkspace.tsx');
  const tabs = read('src/components/tech/shipping/ShippingScanWorkspace.tsx');

  it('host mounts Displays for Condition · Timeline · Listings; centre keeps Ship · Units only', () => {
    assert.match(host, /StationScanPaneHost/);
    assert.match(host, /StationDisplaysPushStack/);
    assert.doesNotMatch(host, /navMode/, 'navMode was deleted — one Root-to-Leaf grammar');
    assert.match(host, /storageKey=["']shipping-displays-push-width["']/);
    assert.match(host, /StationDisplaysEdgeToggle variant=["']pane-open["'] onClick=\{openDisplaysIndex\}/);
    assert.match(host, /id:\s*['"]condition['"]/);
    assert.match(host, /id:\s*['"]timeline['"]/);
    assert.match(host, /id:\s*['"]listings['"]/);
    assert.match(host, /ListingLinksTab/);
    assert.match(host, /indexRows=\{displayIndexRows\}/);
    // CTA always when Displays closed — not gated on timeline data.
    assert.match(
      host,
      /utilityRailBody\s*=\s*!resolvedSideTab\s*\?/,
      'Open displays CTA mounts whenever Displays is closed',
    );
    assert.doesNotMatch(
      host,
      /hasTimelineDisplay\s*&&/,
      'Displays open control must not wait on timeline fields',
    );
    assert.ok(!tabs.includes("'timeline'"), 'timeline tab must leave ShippingScanWorkspace');
    assert.ok(!tabs.includes('"timeline"'), 'timeline tab must leave ShippingScanWorkspace');
    assert.ok(!tabs.includes("'condition'"), 'condition clarifies on Displays, not centre strip');
    assert.ok(!tabs.includes("'listings'"), 'listings clarifies on Displays, not centre strip');
  });

  it('Ship centre is flush — no WorkspaceCard / Condition editor islands', () => {
    const rows = read('src/components/tech/shipping/ShippingSkuSerialRows.tsx');
    const units = read('src/components/tech/shipping/ShippingCapturedUnits.tsx');
    const header = read('src/components/tech/shipping/ShippingEntityContextHeader.tsx');
    assert.doesNotMatch(rows, /WorkspaceCard/, 'pairing rows must not mount WorkspaceCard');
    assert.doesNotMatch(rows, /StationConditionEditor/, 'condition clarifies on Displays');
    assert.doesNotMatch(rows, /space-y-4/, 'no vertical card stack air');
    assert.doesNotMatch(units, /WorkspaceCard/, 'units rollup must not mount WorkspaceCard');
    assert.doesNotMatch(header, /WorkspaceCard/, 'OOS notice must be a flush band, not WorkspaceCard');
  });
});

describe('Packer review Displays push — Phase F', () => {
  const panel = read('src/features/review/packer/PackerReviewMode.tsx');

  it('Note owns centre; Photos · Tracking · Timeline on Displays', () => {
    assert.match(panel, /StationScanPaneHost/);
    assert.match(panel, /StationPanelRoot/);
    assert.match(panel, /StationDisplaysPushStack/);
    assert.doesNotMatch(panel, /navMode/, 'navMode was deleted — one Root-to-Leaf grammar');
    assert.match(panel, /storageKey=["']pack-review-displays-push-width["']/);
    assert.ok(!panel.includes('SectionTabsSlider'), 'mid-canvas review strip deleted');
    assert.ok(!panel.includes('WorkspaceCard'), 'glass WorkspaceCard islands deleted');
    assert.match(panel, /Review note/);
  });
});
