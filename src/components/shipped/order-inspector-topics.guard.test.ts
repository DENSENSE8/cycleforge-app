/**
 * Pins desk order inspector Display-topic grammar + View rail split.
 *
 * - Locked four Displays topics (Order · Documents · Timeline · Conversation).
 * - Assign + order updates on Order leaf bottom dock — never a fifth topic cell
 *   or Assign popover.
 * - Index ⋮ = station handoffs only.
 * - Sheet View chrome stays on `detail:orders-view`.
 * - Unbox grammar: Root Index → leaf via DeskInspectorIndexShell (never
 *   SectionTabsSlider density=icon on the desk inspector).
 *
 * Run: npx tsx --test src/components/shipped/order-inspector-topics.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('order inspector Display topics + View rail split', () => {
  it('ShippedDetailsPanel uses DeskInspectorIndexShell; updates on Order dock', () => {
    const panel = code(read('src/components/shipped/ShippedDetailsPanel.tsx'));
    assert.match(panel, /buildOrderInspectorLeaves/);
    assert.match(panel, /DeskInspectorIndexShell/);
    assert.match(panel, /orderInspectorOrderUpdateActions/);
    assert.match(panel, /orderInspectorMoreItems/);
    assert.match(panel, /DeskRailChromeRow/);
    assert.doesNotMatch(panel, /SectionTabsSlider/);
    assert.doesNotMatch(panel, /density=["']icon["']/);
    assert.doesNotMatch(panel, /OrderAssignDisplayHost/);
    assert.doesNotMatch(panel, /RecordPaneHeader/);
    assert.doesNotMatch(panel, /WorkOrderAssignmentCard/);
    assert.doesNotMatch(panel, /OrdersViewTopicsCluster/);
    assert.doesNotMatch(panel, /viewTopics=/);
  });

  it('build-order-inspector-displays builds leaves without Assign topic', () => {
    const builder = code(
      read('src/components/shipped/details-panel/build-order-inspector-displays.tsx'),
    );
    assert.match(builder, /buildOrderInspectorLeaves/);
    assert.match(builder, /DeskInspectorLeaf/);
    assert.match(builder, /orderInspectorDisplayTopics/);
    assert.doesNotMatch(builder, /buildSectionTabs/);
    assert.doesNotMatch(builder, /SectionTabsSlider/);
    assert.doesNotMatch(builder, /\bUser\b/);
    assert.doesNotMatch(builder, /assign/);
  });

  it('ShippedDetailsBody mounts OrderUpdateDock on Order topic with flush delete', () => {
    const body = code(read('src/components/shipped/details-panel/ShippedDetailsBody.tsx'));
    assert.match(body, /OrderUpdateDock/);
    assert.match(body, /DISPLAYS_FLUSH_HOST/);
    assert.doesNotMatch(body, /orderInspectorOrderChildren/);
    assert.doesNotMatch(body, /TabDisplay/);
    assert.doesNotMatch(body, /DeleteOrderControl/);
  });

  it('OrderUpdateDock puts Delete as flush trailing icon via InspectorActionFloor', () => {
    const dock = code(read('src/components/shipped/details-panel/OrderUpdateDock.tsx'));
    assert.match(dock, /InspectorActionFloor/);
    assert.match(dock, /InspectorFlushDelete/);
    assert.match(dock, /order-update-delete/);
    assert.match(dock, /OrderAssignDisplayHost/);
    assert.doesNotMatch(dock, /WorkOrderAssignmentCard/);
  });

  it('OrdersViewControlsRail remains the desk View-only host', () => {
    const rail = code(read('src/components/outbound/orders/OrdersViewControlsRail.tsx'));
    assert.match(rail, /detail:orders-view/);
    assert.match(rail, /OrdersViewTopicsCluster/);
  });

  it('OrderPipelineSection always mounts Tested · Packed · Scanned Out (no progressive hide)', () => {
    const pipeline = code(
      read('src/components/shipped/details-panel/OrderPipelineSection.tsx'),
    );
    assert.match(pipeline, /label=["']Tested["']/);
    assert.match(pipeline, /label=["']Packed["']/);
    assert.match(pipeline, /label=["']Scanned Out["']/);
    assert.match(pipeline, /emptyFallback=["']Not tested["']/);
    assert.match(pipeline, /emptyFallback=["']Pending pack["']/);
    assert.match(pipeline, /emptyFallback=["']Pending scan-out["']/);
    // Spatial predictability — never gate rows on stamp presence.
    assert.doesNotMatch(pipeline, /testedAt\s*\?\s*\(/);
    assert.doesNotMatch(pipeline, /testedAt\s*\|\|\s*packedAt/);
    assert.doesNotMatch(pipeline, /progressive disclosure/i);
  });
});
