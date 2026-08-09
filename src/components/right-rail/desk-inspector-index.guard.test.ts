/**
 * Desk RightRailHost inspectors — Unbox rows index→leaf via DeskInspectorIndexShell.
 * Bans SectionTabsSlider density=icon and PaneHeaderTabs as primary topic nav
 * on DetailStackRailRegistrar occupants.
 *
 * Run: npx tsx --test src/components/right-rail/desk-inspector-index.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Desk peeks that must compose DeskInspectorIndexShell (multi-topic). */
const INDEX_SHELL_HOSTS = [
  'src/components/shipped/ShippedDetailsPanel.tsx',
  'src/components/receiving/history/HistoryCartonTriagePanel.tsx',
  'src/components/support/context/SupportContextDetailPanel.tsx',
  'src/components/sidebar/receiving/IncomingDetailsPanel.tsx',
  'src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx',
  'src/features/my-day/MyDayWatchRail.tsx',
  'src/components/repair/RepairDetailsPanel.tsx',
  'src/components/station/ReceivingDetailsStack.tsx',
] as const;

describe('desk inspector index→leaf (no primary topic tabs)', () => {
  it('DeskInspectorIndexShell exists and never mounts StationDisplaysPushStack', () => {
    const shell = code(read('src/components/right-rail/DeskInspectorIndexShell.tsx'));
    assert.match(shell, /StationDisplayIndexList/);
    assert.match(shell, /StationDisplayLeafHeader/);
    assert.match(shell, /DESK_INSPECTOR_INDEX|STATION_DISPLAY_INDEX/);
    assert.doesNotMatch(shell, /StationDisplaysPushStack/);
    assert.doesNotMatch(shell, /SectionTabsSlider/);
    assert.doesNotMatch(shell, /PaneHeaderTabs/);
  });

  it('multi-topic desk peeks compose DeskInspectorIndexShell; ban icon plate / PaneHeaderTabs', () => {
    for (const rel of INDEX_SHELL_HOSTS) {
      const src = code(read(rel));
      assert.match(
        src,
        /DeskInspectorIndexShell/,
        `${rel} must compose DeskInspectorIndexShell`,
      );
      assert.doesNotMatch(
        src,
        /StationDisplaysPushStack/,
        `${rel} must not mount StationDisplaysPushStack on RightRailHost`,
      );
      assert.doesNotMatch(
        src,
        /density=["']icon["']/,
        `${rel} must not use SectionTabsSlider density=icon as primary nav`,
      );
      assert.doesNotMatch(
        src,
        /\bPaneHeaderTabs\b/,
        `${rel} must not use PaneHeaderTabs as primary topic nav`,
      );
      assert.doesNotMatch(
        src,
        /\bSectionTabsSlider\b/,
        `${rel} must not import SectionTabsSlider for topic nav`,
      );
    }
  });

  it('Orders Order leaf has no nested Shipping · Product TabDisplay', () => {
    const body = code(read('src/components/shipped/details-panel/ShippedDetailsBody.tsx'));
    assert.doesNotMatch(body, /\bTabDisplay\b/);
    assert.doesNotMatch(body, /order-inspector-order-children/);
    assert.doesNotMatch(body, /orderInspectorOrderChildren/);
  });
});
