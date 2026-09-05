import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STATION_DISPLAYS_BAND_CLASS,
  STATION_DISPLAYS_COLUMN_CLASS,
  STATION_DISPLAYS_LEADING_BEVEL_CLASS,
  STATION_DISPLAYS_STRIP_CLASS,
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
import {
  DEFAULT_STATION_DEPTH,
  stationDepthCssText,
} from '@/design-system/themes/station-depths';

/**
 * Unified scan-station depth lives in this module. Fills remap through
 * `--ds-station-*` so a skin restyles every station that imports these classes.
 * Bevel width + grain follow Depth (`station-depths.ts`).
 */
describe('scan-station depth tokens', () => {
  it('the well uses station tokens — not a hardcoded wood or sunken fill', () => {
    assert.match(STATION_SCAN_WELL_CLASS, /bg-surface-station-well/);
    assert.ok(STATION_SCAN_WELL_CLASS.includes(STATION_SCAN_GRAIN_CLASS));
    assert.doesNotMatch(STATION_SCAN_WELL_CLASS, /bg-surface-sunken/);
    assert.doesNotMatch(STATION_SCAN_WELL_CLASS, /bg-surface-trough/);
    assert.ok(STATION_SCAN_WELL_CLASS.includes(STATION_SCAN_INSET_BEVEL_CLASS));
    assert.match(STATION_SCAN_INSET_BEVEL_CLASS, /--ds-station-bevel-width/);
    assert.doesNotMatch(STATION_SCAN_INSET_BEVEL_CLASS, /border-2/);
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

  it('Displays column / strip are station bar — never desk card chrome', () => {
    assert.match(STATION_DISPLAYS_COLUMN_CLASS, /bg-surface-station-bar/);
    assert.ok(STATION_DISPLAYS_COLUMN_CLASS.includes(STATION_SCAN_GRAIN_CLASS));
    assert.ok(STATION_DISPLAYS_COLUMN_CLASS.includes(STATION_DISPLAYS_LEADING_BEVEL_CLASS));
    assert.doesNotMatch(STATION_DISPLAYS_COLUMN_CLASS, /bg-surface-card/);
    assert.doesNotMatch(STATION_DISPLAYS_COLUMN_CLASS, /border-border-soft/);
    assert.match(STATION_DISPLAYS_STRIP_CLASS, /bg-surface-station-bar/);
    assert.doesNotMatch(STATION_DISPLAYS_STRIP_CLASS, /bg-surface-card/);
    assert.equal(STATION_DISPLAYS_BAND_CLASS, STATION_SCAN_BENCH_CLASS);
  });

  it('industrial Color + mill Depth are the defaults', () => {
    assert.equal(DEFAULT_STATION_SKIN, 'industrial');
    assert.equal(DEFAULT_STATION_DEPTH, 'mill');
    assert.match(STATION_SKINS.industrial.vars.well, /surface-strong/);
    assert.match(STATION_SKINS.industrial.vars.plate, /surface-accent/);
    assert.match(STATION_SKINS.industrial.vars['bevel-highlight'], /background-canvas/);
    assert.match(STATION_SKINS.industrial.vars.ink, /text-primary/);
  });

  it('packing bench keeps wood Color tokens; grain is Depth Deep only', () => {
    assert.match(STATION_SKINS.bench.vars.well, /surface-trough/);
    assert.match(STATION_SKINS.bench.vars['bevel-shadow'], /border-stain/);
    const skinCss = stationSkinCssText();
    assert.match(skinCss, /html\[data-station-skin='bench'\]/);
    assert.doesNotMatch(skinCss, /\.station-scan-grain/);
    assert.match(skinCss, /\[data-station-displays\]/);
    const depthCss = stationDepthCssText();
    assert.match(depthCss, /html\[data-station-depth='deep'\] \.station-scan-grain/);
    assert.doesNotMatch(depthCss, /url\(.*wood/i);
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

  it('Scan Out uses a continuous white plane instead of the configurable well', () => {
    for (const path of [
      'src/components/outbound/scan-out/ScanOutIdleAwait.tsx',
      'src/components/outbound/scan-out/ScanOutActivePanel.tsx',
    ]) {
      const src = readFileSync(path, 'utf8');
      assert.match(src, /bg-surface-card/);
      assert.doesNotMatch(src, /STATION_SCAN_WELL_CLASS/);
      assert.doesNotMatch(src, /bg-surface-station-well/);
    }
  });

  it('Appearance lists Color and Depth so both Look methods are pickable', () => {
    const src = readFileSync(
      'src/components/settings/sections/AppearanceSection.tsx',
      'utf8',
    );
    assert.match(src, /STATION_SKIN_NAMES/);
    assert.match(src, /STATION_SKIN_GROUP_ORDER/);
    assert.match(src, /updateStationSkin/);
    assert.match(src, /stationSkin/);
    assert.match(src, /STATION_DEPTH_NAMES/);
    assert.match(src, /updateStationDepth/);
    assert.match(src, /stationDepth/);
  });

  it('Displays push column scopes station chrome and drops desk push class', () => {
    const src = readFileSync(
      'src/components/station/displays/StationDisplaysPushColumn.tsx',
      'utf8',
    );
    assert.match(src, /data-station-displays/);
    assert.match(src, /STATION_DISPLAYS_COLUMN_CLASS/);
    assert.match(src, /STATION_DISPLAYS_STRIP_CLASS/);
    assert.doesNotMatch(src, /DETAIL_STACK_PUSH_COLUMN_CLASS/);
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
