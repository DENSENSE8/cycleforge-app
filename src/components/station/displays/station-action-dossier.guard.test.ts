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

  it('dense fact strip: rows layout is Displays SoT; empty locks as em dash', () => {
    const src = read(STRIP);
    assert.match(src, /StationDenseFactStrip/);
    assert.match(src, /layout\?:\s*'rows'\s*\|\s*'strip'/);
    assert.match(src, /layout = 'rows'/);
    assert.match(src, /data-fact-layout="rows"/);
    assert.match(src, /data-station-dense-fact-row/);
    assert.match(src, /—/);
    assert.match(src, /data-testid/);
    // Dense caption rows — copy is xs + 2.5 glyph, never sm/h-3 toolbar chrome.
    assert.match(src, /size="xs"/);
    assert.match(src, /h-2\.5 w-2\.5/);
    assert.doesNotMatch(
      src,
      /size="sm"/,
      'fact-row copy must stay dense xs — sm IconButton dwarfs caption values',
    );
    // Read facts are coplanar with the card host — never a canvas/sunken wash.
    assert.doesNotMatch(src, /bg-surface-canvas/);
    assert.doesNotMatch(src, /bg-surface-sunken/);
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
    // Instrument panel: edge-to-edge info header + DenseCompose edit bands +
    // FlushTerminalFooter floor. Keyboard bindings stay Action-plane SoT.
    assert.match(host, /data-inventory-instrument/);
    assert.match(host, /data-station-action-dossier/);
    assert.match(host, /data-claim-chrome="display"/);
    assert.match(host, /StationActionKeyLegend/);
    assert.match(host, /useStationActionKeyBindings/);
    assert.match(host, /DenseComposeBodyBand/);
    assert.match(host, /variant="instrument"/);
    assert.match(header, /variant\?:\s*'full'\s*\|\s*'compact'\s*\|\s*'instrument'/);
    assert.match(header, /data-variant="instrument"/);
    assert.match(header, /data-inventory-trust-header/);
    assert.match(host, /InventoryActivityPanel/);
    assert.doesNotMatch(host, /StationActionDossierShell/);
    assert.doesNotMatch(host, /InspectorActionFloor/);
    assert.doesNotMatch(host, /RightRailHost/);
  });

  it('Inventory Information (instrument) is WMS horizontal rows — never a multi-col grid', () => {
    const header = read(PO_HEADER);
    // Isolate the instrument branch — desk full/compact may keep strip grids.
    const instrumentStart = header.indexOf("variant === 'instrument'");
    assert.ok(instrumentStart >= 0, 'instrument variant must exist');
    const compactStart = header.indexOf("variant === 'compact'", instrumentStart);
    const instrument = header.slice(
      instrumentStart,
      compactStart > instrumentStart ? compactStart : undefined,
    );
    assert.match(instrument, /StationDenseFactStrip/);
    assert.match(instrument, /layout="rows"/);
    assert.match(instrument, /data-inventory-trust-header/);
    assert.match(
      instrument,
      /ZohoReceiptChip/,
      'Status uses ZohoReceiptChip — same face as Incoming / Unbox zoho column',
    );
    assert.doesNotMatch(
      instrument,
      /['"]Expected['"]|expected_delivery/,
      'Expected delivery is Incoming planning — not Unbox Information',
    );
    assert.doesNotMatch(
      instrument,
      /bg-surface-canvas/,
      'instrument header must not add a canvas wash twin (strip stays transparent)',
    );
    for (const banned of [
      /grid-cols-2/,
      /grid-cols-3/,
      /grid-cols-4/,
      /grid-cols-5/,
      /layout="strip"/,
      /InstrumentFact/,
      /po\.status \?\? ['"]—['"]/,
    ]) {
      assert.doesNotMatch(
        instrument,
        banned,
        `Inventory Information must stay stacked label|value rows (${banned})`,
      );
    }
  });

  it('Information is facts-only; dossier detail / notes keep DenseCompose sunken rules', () => {
    const host = read(HOST);
    const header = read(PO_HEADER);
    const shell = read(SHELL);
    assert.doesNotMatch(
      host,
      /data-inventory-trust-strip/,
      'Information has no trust strip — StationDenseFactStrip rows only',
    );
    assert.match(
      host,
      /subLeaf !== 'info'/,
      'Floor / Action legend must exclude Information',
    );
    assert.match(
      header,
      /ZohoReceiptChip/,
      'Information Status uses the same zoho grid face as Incoming / Unbox tables',
    );
    // Expanded dossier detail: hairline + pad only.
    assert.match(shell, /data-dossier-detail/);
    assert.doesNotMatch(
      shell,
      /data-dossier-detail[\s\S]{0,120}bg-surface-canvas|bg-surface-canvas[\s\S]{0,80}data-dossier-detail/,
    );
    // Class on the detail div itself must not include canvas/sunken.
    const detailClassMatch = shell.match(
      /className="([^"]*)"[\s\S]{0,40}data-dossier-detail/,
    );
    assert.ok(detailClassMatch, 'dossier detail must declare className before data-dossier-detail');
    assert.doesNotMatch(detailClassMatch[1]!, /bg-surface-canvas|bg-surface-sunken/);
    // Notes / claim compose entry remains the sunken golden.
    assert.match(host, /DenseComposeBodyBand/);
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
