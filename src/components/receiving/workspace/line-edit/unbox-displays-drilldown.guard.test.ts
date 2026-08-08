/**
 * Unbox Displays Root-to-Leaf drill-down — primary nav is the station SoT
 * index, not an icon plate. Checklist stays ring-only.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/unbox-displays-drilldown.guard.test.ts
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

const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const PANEL = 'src/components/receiving/workspace/LineEditPanel.tsx';
const TABS = 'src/components/receiving/workspace/line-edit/unbox-side-tabs.ts';
const INDEX = 'src/components/receiving/workspace/line-edit/unbox-display-index.ts';
const SOT_INDEX = 'src/components/station/displays/display-index.ts';
const DISPLAY_VIEW = 'src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts';

describe('Unbox Displays Root-to-Leaf drill-down', () => {
  it('URL vocabulary includes display=index', () => {
    const tabs = read(TABS);
    const sot = read(SOT_INDEX);
    // Unbox re-exports the station SoT constant — never a second local 'index' literal.
    assert.match(tabs, /UNBOX_DISPLAY_INDEX\s*=\s*STATION_DISPLAY_INDEX/);
    assert.match(sot, /STATION_DISPLAY_INDEX\s*=\s*'index'/);
    assert.match(tabs, /parseUnboxDisplayNav/);
    assert.match(tabs, /resolveUnboxDisplayNav/);
  });

  it('index builder never emits checklist', () => {
    const index = read(INDEX);
    assert.match(index, /buildUnboxDisplayIndexRows/);
    assert.match(index, /id === 'checklist'/);
    assert.match(index, /group:/, 'Unbox builder emits DisplayIndexRow.group');
  });

  it('push stack uses index + leaf chrome; Esc pops via onEscape', () => {
    const stack = read(STACK);
    const column = read(COLUMN);
    assert.match(stack, /StationDisplayIndexList/);
    assert.match(stack, /StationDisplayLeafHeader/);
    assert.match(stack, /onEscape=\{onEscape\}/);
    assert.match(column, /onEscape \?\? onClose/);
    assert.match(column, /headerRightSlot/);
    assert.doesNotMatch(stack, /UnboxSectionTabs/);
  });

  it('LineEditPanel opens Displays on index; contextual opens keep leaf ids', () => {
    const panel = read(PANEL);
    assert.match(
      panel,
      /StationDisplaysPushStack/,
      'Unbox mounts the station Displays SoT stack',
    );
    assert.match(
      panel,
      /openDisplaysIndex|UNBOX_DISPLAY_INDEX/,
      '←| must open Root Index',
    );
    assert.match(
      panel,
      /UnboxDisplaysUtilityRailBody[\s\S]*onOpenDisplays=\{openDisplaysIndex\}/,
      'bottom-seated open toggle lands on index, not Ticket',
    );
    assert.match(
      panel,
      /openDisplays\('units'\)/,
      'serials View All still skips index',
    );
    assert.match(
      panel,
      /openDisplays\('timeline'\)/,
      'return history still skips index',
    );
    assert.match(
      panel,
      /openDisplays\('inventory'/,
      'order Details / inventory dossier skips index',
    );
    assert.match(
      panel,
      /indexRows=\{displayIndexRows\}/,
      'enriched status rows are passed into the push stack',
    );
    assert.doesNotMatch(panel, /navMode/, 'navMode was deleted — one Root-to-Leaf grammar');
  });

  it('Inventory is a Displays leaf (not RightRailHost) with shared dossier host', () => {
    const tabs = read(TABS);
    const builders = read('src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx');
    const host = read('src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx');
    assert.match(tabs, /\| 'inventory'/);
    assert.match(builders, /id: 'inventory'/);
    assert.match(builders, /InventoryDisplayHost/);
    assert.match(host, /useInventoryPoDossier/);
    assert.match(host, /data-testid="unbox-inventory-display"/);
    assert.match(
      host,
      /StationActionDossierShell/,
      'Inventory composes station Action dossier shell',
    );
    assert.match(host, /StationActionKeyLegend/);
    assert.doesNotMatch(host, /RightRailHost|DetailStackRailRegistrar/);
    assert.doesNotMatch(host, /CartonMatchHub/, 'Change PO opens Linkage — no second match hub');
    assert.doesNotMatch(host, /InspectorActionFloor/);
    assert.doesNotMatch(
      host,
      /TabDisplay/,
      'Inventory stacks PO · lines · notes · activity — no nested Items/Notes/Activity tabs',
    );
  });

  it('Open displays paints from the shared optimistic URL SoT — not a local twin', () => {
    const view = read(DISPLAY_VIEW);
    assert.match(
      view,
      /from '@\/lib\/routing\/optimistic-url-param'/,
      'Unbox composes the paint-pending SoT — never a feature-local resolve/clear fork',
    );
    assert.match(
      view,
      /setPending\(snapshot\)/,
      'setDisplay must flip pending before router.replace so the column mounts in the click commit',
    );
    assert.match(
      view,
      /resolveOptimisticParam\(urlDisplay,\s*pending\?\.display\)/,
      'requestedDisplay prefers pending over lagged useSearchParams',
    );
    assert.match(
      view,
      /shouldClearOptimisticParam\(urlDisplay,\s*pending\?\.display\)/,
      'pending clears only when the URL catches the write (index→leaf race safe)',
    );
    assert.match(
      view,
      /readLiveSearchParams/,
      'param edits seed from the live address bar',
    );
  });
});

