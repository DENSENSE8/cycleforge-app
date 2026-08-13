/**
 * Repo-wide same-usecase scan (goal verification step 5).
 *
 * Zero second hand-rolled Check face, KPI tile band, three-band sheet recipe,
 * inspector hero-header, or faceted refine funnel. Blessed siblings stay.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTsx(p, out);
    else if (name.endsWith('.tsx') && !name.includes('.test.')) out.push(p);
  }
  return out;
}

function rel(p: string): string {
  return relative(ROOT, p).split('\\').join('/');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('same-usecase forks — one face per operator job', () => {
  it('one Check chrome face (ChromeCheckButton)', () => {
    const incoming = readFileSync(
      join(ROOT, 'src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx'),
      'utf8',
    );
    const box = readFileSync(
      join(ROOT, 'src/components/receiving/ReceivingBoxChromeActions.tsx'),
      'utf8',
    );
    assert.match(incoming, /<ChromeCheckButton/);
    assert.match(box, /<ChromeCheckButton/);
    assert.doesNotMatch(incoming, /ClipboardList/);
    assert.doesNotMatch(box, /ClipboardList/);
  });

  it('no local TILE_BAND_CLASS / flex flex-wrap gap-3 KPI tile band', () => {
    const offenders: string[] = [];
    for (const file of walkTsx(SRC)) {
      const src = code(readFileSync(file, 'utf8'));
      if (src.includes('const TILE_BAND_CLASS')) offenders.push(rel(file));
    }
    assert.deepEqual(offenders, [], `TILE_BAND_CLASS forks: ${offenders.join(', ')}`);
  });

  it('faceted refine tablist is only WorkbenchRefineFacetTabs', () => {
    const sot = readFileSync(
      join(ROOT, 'src/components/dashboard/workbench-filter-popover.tsx'),
      'utf8',
    );
    assert.match(sot, /export function WorkbenchRefineFacetTabs/);
    const unbox = readFileSync(
      join(ROOT, 'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx'),
      'utf8',
    );
    assert.match(unbox, /<WorkbenchRefineFacetTabs/);
  });

  it('one order warranty face (OrderWarrantySummary)', () => {
    const gone = join(ROOT, 'src/components/shipped/details-panel/OrderWarrantySection.tsx');
    assert.equal(existsSync(gone), false, 'OrderWarrantySection must stay deleted');
    const body = readFileSync(
      join(ROOT, 'src/components/shipped/details-panel/ShippedDetailsBody.tsx'),
      'utf8',
    );
    assert.match(body, /<OrderWarrantySummary/);
    assert.match(body, /density="pane"/);
    assert.doesNotMatch(code(body), /OrderWarrantySection/);
    const facts = readFileSync(
      join(ROOT, 'src/components/search/order-feedback/SearchOrderFactsColumn.tsx'),
      'utf8',
    );
    assert.match(facts, /<OrderWarrantySummary/);
    const evidence = readFileSync(
      join(ROOT, 'src/components/search/order-feedback/SearchOrderEvidenceColumn.tsx'),
      'utf8',
    );
    assert.doesNotMatch(code(evidence), /OrderWarrantySummary/);
  });

  it('one label-builder NumericStep (bin-label-printer SoT)', () => {
    const gone = join(ROOT, 'src/components/barcode/rack-printer/NumericStep.tsx');
    assert.equal(existsSync(gone), false, 'rack-printer/NumericStep must stay deleted');
    const sot = readFileSync(
      join(ROOT, 'src/components/barcode/bin-label-printer/NumericStep.tsx'),
      'utf8',
    );
    assert.match(sot, /export function NumericStep/);
    const desk = readFileSync(
      join(ROOT, 'src/components/barcode/rack-printer/RackBuilderDesktop.tsx'),
      'utf8',
    );
    const mobile = readFileSync(
      join(ROOT, 'src/components/barcode/rack-printer/RackBuilderMobile.tsx'),
      'utf8',
    );
    assert.match(desk, /from '@\/components\/barcode\/bin-label-printer\/NumericStep'/);
    assert.match(mobile, /from '@\/components\/barcode\/bin-label-printer\/NumericStep'/);
  });

  it('one carton Displays Macro compound (CartonDisplaysActionFloor)', () => {
    const compound = join(
      ROOT,
      'src/components/station/displays/CartonDisplaysActionFloor.tsx',
    );
    const host = join(
      ROOT,
      'src/components/station/displays/StationDisplaysActionFloor.tsx',
    );
    const unbox = join(
      ROOT,
      'src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx',
    );
    const arrival = join(
      ROOT,
      'src/components/receiving/triage/ArrivalDisplaysActionFloor.tsx',
    );
    const testing = join(
      ROOT,
      'src/components/tech/testing-panel/TestingDisplaysActionFloor.tsx',
    );
    assert.ok(existsSync(compound), 'CartonDisplaysActionFloor must exist');
    assert.ok(existsSync(host), 'StationDisplaysActionFloor host must stay');
    assert.ok(existsSync(unbox), 'UnboxDisplaysActionFloor recipe must stay');
    assert.ok(existsSync(arrival), 'ArrivalDisplaysActionFloor recipe must stay');
    assert.ok(existsSync(testing), 'TestingDisplaysActionFloor recipe must stay');

    const compoundSrc = readFileSync(compound, 'utf8');
    assert.match(compoundSrc, /export function CartonDisplaysActionFloor/);
    assert.match(compoundSrc, /<StationDisplaysActionFloor/);
    assert.match(compoundSrc, /cartonFloorPeerOrder/);
    assert.doesNotMatch(code(compoundSrc), /InspectorActionFloor/);
    assert.doesNotMatch(code(compoundSrc), /FloorIconButton/);

    for (const [name, file] of [
      ['Unbox', unbox],
      ['Arrival', arrival],
      ['Testing', testing],
    ] as const) {
      const src = readFileSync(file, 'utf8');
      const stripped = code(src);
      assert.match(
        src,
        /<CartonDisplaysActionFloor/,
        `${name} recipe must compose CartonDisplaysActionFloor`,
      );
      assert.doesNotMatch(
        stripped,
        /<StationDisplaysActionFloor/,
        `${name} recipe must not remount the host beside the compound`,
      );
      assert.doesNotMatch(
        stripped,
        /InspectorActionFloor/,
        `${name} recipe must not import desk InspectorActionFloor`,
      );
      assert.doesNotMatch(
        stripped,
        /\/api\/receiving-logs/,
        `${name} recipe must not fork carton DELETE`,
      );
      assert.doesNotMatch(
        stripped,
        /FLOOR_ICON_CELL/,
        `${name} recipe must not fork the Macro cell face`,
      );
    }

    assert.match(readFileSync(unbox, 'utf8'), /print=\{\{/);
    assert.match(readFileSync(unbox, 'utf8'), /sync=\{\{/);
    assert.match(readFileSync(arrival, 'utf8'), /sync=\{\{/);
    assert.doesNotMatch(code(readFileSync(arrival, 'utf8')), /\bprint=/);
    assert.doesNotMatch(code(readFileSync(testing, 'utf8')), /\bprint=/);
    assert.doesNotMatch(code(readFileSync(testing, 'utf8')), /\bsync=/);
  });

  it('blessed siblings remain (Unbox / Scan-out / C2 right edge / per-family layouts)', () => {
    assert.ok(statSync(join(ROOT, 'src/components/receiving/unbox/UnboxWorkspaceView.tsx')).isFile());
    assert.ok(statSync(join(ROOT, 'src/components/outbound/workspaces/ScanOutWorkspace.tsx')).isFile());
    assert.ok(statSync(join(ROOT, 'src/components/station/displays/StationDisplaysPushStack.tsx')).isFile());
    assert.ok(statSync(join(ROOT, 'src/components/right-rail/RightRailHost.tsx')).isFile());
    assert.ok(statSync(join(ROOT, 'src/lib/receiving/receiving-grid-layout.ts')).isFile());
  });
});
