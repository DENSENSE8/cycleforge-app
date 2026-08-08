/**
 * Station Action Plane densify SoT — shared Displays primitives + Unbox Inventory proof.
 *
 *   node --import tsx --test src/components/station/displays/station-action-dossier.guard.test.ts
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

const INDEX = 'src/components/station/displays/index.ts';
const STRIP = 'src/components/station/displays/StationDenseFactStrip.tsx';
const SHELL = 'src/components/station/displays/StationActionDossierShell.tsx';
const LEGEND = 'src/components/station/displays/StationActionKeyLegend.tsx';
const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const HOST = 'src/components/receiving/workspace/line-edit/InventoryDisplayHost.tsx';
const PO_HEADER = 'src/components/receiving/inventory/InventoryPoHeader.tsx';

const SIBLING_PANELS = [
  'src/components/receiving/triage/TriagePanel.tsx',
  'src/components/tech/TestingPanel.tsx',
  'src/components/packer/PackOrderPanel.tsx',
  'src/components/tech/ActiveOrderWorkspace.tsx',
  'src/features/review/packer/PackerReviewMode.tsx',
] as const;

describe('Station Action dossier SoT', () => {
  it('exports densify primitives from station/displays', () => {
    const index = read(INDEX);
    assert.match(index, /StationDenseFactStrip/);
    assert.match(index, /StationActionDossierShell/);
    assert.match(index, /StationActionKeyLegend/);
    assert.match(index, /useStationActionKeyBindings/);
  });

  it('dense fact strip locks empty as em dash', () => {
    const src = read(STRIP);
    assert.match(src, /StationDenseFactStrip/);
    assert.match(src, /—/);
    assert.match(src, /data-testid/);
  });

  it('dossier shell is roving + Space/Enter expand; Esc not bound', () => {
    const src = read(SHELL);
    assert.match(src, /data-station-action-dossier/);
    assert.match(src, /ArrowDown/);
    assert.match(src, /ArrowUp/);
    assert.match(src, /ArrowRight/);
    assert.match(src, /tabIndex=\{isFocused \? 0 : -1\}/);
    assert.doesNotMatch(src, /e\.key === ['"]Escape['"]/);
  });

  it('key legend skips editables and does not bind Escape', () => {
    const src = read(LEGEND);
    assert.match(src, /isEditable/);
    assert.match(src, /FlushTerminalFooter/);
    assert.doesNotMatch(src, /code:\s*['"]Escape['"]/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });

  it('push stack restores focus into Action dossier on leaf open', () => {
    const stack = read(STACK);
    assert.match(stack, /data-station-action-dossier/);
    assert.match(stack, /data-station-displays-leaf-body/);
    assert.match(stack, /button\[tabindex="0"\]/);
    assert.match(stack, /requestAnimationFrame/);
  });

  it('Unbox Inventory composes Action primitives; never desk Macro floor', () => {
    const host = read(HOST);
    const header = read(PO_HEADER);
    assert.match(host, /StationActionDossierShell/);
    assert.match(host, /StationActionKeyLegend/);
    assert.match(host, /useStationActionKeyBindings/);
    assert.match(header, /StationDenseFactStrip/);
    assert.doesNotMatch(host, /InspectorActionFloor/);
    assert.doesNotMatch(host, /RightRailHost/);
  });

  it('sibling scan stations mount shared Stack and do not fork Action densify CSS', () => {
    for (const panelPath of SIBLING_PANELS) {
      const panel = read(panelPath);
      assert.match(
        panel,
        /StationDisplaysPushStack/,
        `${panelPath} must mount StationDisplaysPushStack`,
      );
      assert.doesNotMatch(
        panel,
        /StationActionDossierShell|StationDenseFactStrip|StationActionKeyLegend/,
        `${panelPath} must not fork Action densify — compose via leaf hosts`,
      );
    }
  });
});
