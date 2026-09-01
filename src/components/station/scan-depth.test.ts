import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STATION_SCAN_ACTIVE_WELL_CLASS,
  STATION_SCAN_BENCH_CLASS,
  STATION_SCAN_FIELD_WELL_CLASS,
  STATION_SCAN_GRAIN_CLASS,
  STATION_SCAN_INSET_BEVEL_CLASS,
  STATION_SCAN_RAISED_BEVEL_CLASS,
  STATION_SCAN_WELL_CLASS,
} from './scan-depth';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_STATION_SKIN,
  STATION_SKINS,
  stationSkinCssText,
} from '@/design-system/themes/station-skins';

/**
 * Unified scan-station depth lives in this module. Fills remap through
 * `--ds-station-*` so a skin restyles every station that imports these classes.
 */
describe('scan-station depth tokens', () => {
  it('the well uses station tokens — not a hardcoded wood or sunken fill', () => {
    assert.match(STATION_SCAN_WELL_CLASS, /bg-surface-station-well/);
    assert.ok(STATION_SCAN_WELL_CLASS.includes(STATION_SCAN_GRAIN_CLASS));
    assert.doesNotMatch(STATION_SCAN_WELL_CLASS, /bg-surface-sunken/);
    assert.doesNotMatch(STATION_SCAN_WELL_CLASS, /bg-surface-trough/);
    assert.ok(STATION_SCAN_WELL_CLASS.includes(STATION_SCAN_INSET_BEVEL_CLASS));
    assert.match(STATION_SCAN_INSET_BEVEL_CLASS, /border-2/);
    assert.match(STATION_SCAN_INSET_BEVEL_CLASS, /border-t-border-station-shadow/);
    assert.match(STATION_SCAN_INSET_BEVEL_CLASS, /border-b-border-station-highlight/);
    assert.doesNotMatch(STATION_SCAN_WELL_CLASS, /shadow-/);
  });

  it('headers sit on the station-header token', () => {
    assert.match(STATION_SCAN_BENCH_CLASS, /bg-surface-station-header/);
    assert.ok(STATION_SCAN_BENCH_CLASS.includes(STATION_SCAN_GRAIN_CLASS));
  });

  it('the capture field is the station slot', () => {
    assert.match(STATION_SCAN_FIELD_WELL_CLASS, /bg-surface-station-slot/);
    assert.ok(STATION_SCAN_FIELD_WELL_CLASS.includes(STATION_SCAN_GRAIN_CLASS));
    assert.doesNotMatch(STATION_SCAN_FIELD_WELL_CLASS, /bg-surface-sunken/);
    assert.ok(STATION_SCAN_FIELD_WELL_CLASS.includes(STATION_SCAN_INSET_BEVEL_CLASS));
  });

  it('the working plate uses the station plate — raised bevel, no grain', () => {
    assert.match(STATION_SCAN_ACTIVE_WELL_CLASS, /bg-surface-station-plate/);
    assert.ok(STATION_SCAN_ACTIVE_WELL_CLASS.includes(STATION_SCAN_RAISED_BEVEL_CLASS));
    assert.doesNotMatch(STATION_SCAN_ACTIVE_WELL_CLASS, /station-scan-grain/);
    assert.doesNotMatch(STATION_SCAN_ACTIVE_WELL_CLASS, /shadow-/);
  });

  it('industrial is the default mill — strong well, no grain', () => {
    assert.equal(DEFAULT_STATION_SKIN, 'industrial');
    assert.equal(STATION_SKINS.industrial.grain, false);
    assert.match(STATION_SKINS.industrial.vars.well, /surface-strong/);
    assert.match(STATION_SKINS.industrial.vars.plate, /surface-accent/);
    assert.match(STATION_SKINS.industrial.vars['bevel-highlight'], /background-canvas/);
  });

  it('packing bench keeps the wood tokens as a skin, not the default', () => {
    assert.equal(STATION_SKINS.bench.grain, true);
    assert.match(STATION_SKINS.bench.vars.well, /surface-trough/);
    assert.match(STATION_SKINS.bench.vars['bevel-shadow'], /border-stain/);
    const css = stationSkinCssText();
    assert.match(css, /html\[data-station-skin='bench'\]/);
    assert.match(css, /html\[data-station-skin='bench'\] \.station-scan-grain/);
    assert.doesNotMatch(css, /url\(.*wood/i);
  });

  it('StationBandStack aliases the well — it does not retype it', () => {
    const src = readFileSync(
      'src/components/station/collapse/StationBandStack.tsx',
      'utf8',
    );
    assert.match(src, /STATION_SCAN_WELL_CLASS/);
    assert.match(src, /STATION_SCAN_BENCH_CLASS/);
    assert.match(src, /STATION_BAND_BODY_WELL_CLASS = STATION_SCAN_WELL_CLASS/);
    assert.doesNotMatch(src, /STATION_BAND_BODY_WELL_CLASS = 'bg-surface-sunken'/);
  });

  it('the working station row uses the shared plate', () => {
    const src = readFileSync('src/components/ui/queue-row-chrome.ts', 'utf8');
    assert.match(src, /STATION_SCAN_ACTIVE_WELL_CLASS/);
    assert.doesNotMatch(src, /selectedStationClass: 'bg-surface-card'/);
  });

  it('flush Serial uses the shared field well', () => {
    const src = readFileSync(
      'src/components/receiving/workspace/SerialScanField.tsx',
      'utf8',
    );
    assert.match(src, /STATION_SCAN_FIELD_WELL_CLASS/);
  });

  it('stations without a band stack wrap their centre in the same well', () => {
    const hosts: Array<[string, string]> = [
      ['src/components/receiving/triage/TriagePanel.tsx', 'Arrival'],
      ['src/components/packer/PackOrderPanel.tsx', 'Pack'],
      ['src/components/outbound/scan-out/ScanOutActivePanel.tsx', 'Scan-out'],
      ['src/components/tech/ActiveOrderWorkspace.tsx', 'Ready-to-pack'],
      ['src/components/station/entity/EntityStationPane.tsx', 'Search/Support host'],
      ['src/features/review/packer/PackerReviewMode.tsx', 'Packer review'],
    ];
    for (const [path, label] of hosts) {
      const src = readFileSync(path, 'utf8');
      assert.match(
        src,
        /STATION_SCAN_WELL_CLASS/,
        `${label} (${path}) must import the shared well, not retype a fill`,
      );
    }
  });

  it('Appearance lists every registry skin so a new skin is pickable', () => {
    const src = readFileSync(
      'src/components/settings/sections/AppearanceSection.tsx',
      'utf8',
    );
    assert.match(src, /STATION_SKIN_NAMES/);
    assert.match(src, /STATION_SKIN_GROUP_ORDER/);
    assert.match(src, /updateStationSkin/);
    assert.match(src, /stationSkin/);
  });

  it('identity chrome seam is border-subtle, not hairline', () => {
    const src = readFileSync(
      'src/components/station/entity-context/station-identity-chrome.ts',
      'utf8',
    );
    assert.match(src, /after:bg-border-subtle/);
    assert.doesNotMatch(src, /after:bg-border-hairline/);
  });
});
