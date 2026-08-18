/**
 * Desk RightRailHost inspectors — Unbox rows index→leaf via DeskInspectorIndexShell
 * → DisplaysIndexLeafStage (shared waist with StationDisplaysPushStack).
 *
 * Run: npx tsx --test src/components/right-rail/desk-inspector-index.guard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const SRC = join(ROOT, 'src');

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

/**
 * Only the shared stage + station/desk hosts may import the index list.
 * Page peeks compose DeskInspectorIndexShell instead.
 */
const INDEX_LIST_IMPORT_ALLOWLIST = new Set([
  'src/components/station/displays/DisplaysIndexLeafStage.tsx',
  'src/components/station/displays/StationDisplayIndexList.tsx',
]);

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsx(full, out);
      continue;
    }
    if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('desk inspector index→leaf (shared Unbox waist)', () => {
  it('DisplaysIndexLeafStage is the shared waist; PushStack + desk shell both compose it', () => {
    const stage = code(read('src/components/station/displays/DisplaysIndexLeafStage.tsx'));
    assert.match(stage, /StationDisplayIndexList/);
    assert.match(stage, /data-displays-index-leaf-stage/);

    const stack = code(read('src/components/station/displays/StationDisplaysPushStack.tsx'));
    assert.match(stack, /DisplaysIndexLeafStage/);
    assert.doesNotMatch(
      stack,
      /StationDisplayIndexList/,
      'PushStack must not mount StationDisplayIndexList directly — use DisplaysIndexLeafStage',
    );

    const shell = code(read('src/components/right-rail/DeskInspectorIndexShell.tsx'));
    assert.match(shell, /DisplaysIndexLeafStage/);
    assert.match(shell, /StationDisplayLeafHeader/);
    assert.doesNotMatch(shell, /StationDisplaysPushStack/);
    assert.doesNotMatch(
      shell,
      /StationDisplayIndexList/,
      'Desk shell must compose DisplaysIndexLeafStage, not fork the index list',
    );
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
        /DisplaysIndexLeafStage/,
        `${rel} must not bypass DeskInspectorIndexShell to DisplaysIndexLeafStage`,
      );
      assert.doesNotMatch(
        src,
        /StationDisplayIndexList/,
        `${rel} must not import StationDisplayIndexList — use DeskInspectorIndexShell`,
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

  it('no page-local StationDisplayIndexList imports outside the SoT waist', () => {
    const offenders: string[] = [];
    for (const full of walkTsx(SRC)) {
      const rel = relative(ROOT, full).split('\\').join('/');
      if (INDEX_LIST_IMPORT_ALLOWLIST.has(rel)) continue;
      if (rel.includes('.guard.test.') || rel.includes('.test.')) continue;
      const src = code(readFileSync(full, 'utf8'));
      if (!/from ['"][^'"]*StationDisplayIndexList['"]/.test(src)) continue;
      if (!/StationDisplayIndexList/.test(src)) continue;
      offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `StationDisplayIndexList is SoT-only via DisplaysIndexLeafStage. Offenders: ${offenders.join(', ') || '(none)'}`,
    );
  });

  it('Orders Order leaf has no nested Shipping · Product TabDisplay', () => {
    const body = code(read('src/components/shipped/details-panel/ShippedDetailsBody.tsx'));
    assert.doesNotMatch(body, /\bTabDisplay\b/);
    assert.doesNotMatch(body, /order-inspector-order-children/);
    assert.doesNotMatch(body, /orderInspectorOrderChildren/);
  });
});
