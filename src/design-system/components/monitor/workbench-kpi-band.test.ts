/**
 * Workbench Band 2 KPI densify — flush instrument tiles, not Monitor cards.
 * To-ship OutboundKpiStrip is the golden; Testing / Shipping / Pack / Labels follow.
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

const SHELL = 'src/design-system/components/monitor/shell.ts';
const TILE = 'src/design-system/components/monitor/KpiTile.tsx';
const OPS = 'src/design-system/components/monitor/OpsKpiBand.tsx';

const STRIPS = [
  'src/components/dashboard/OutboundKpiStrip.tsx',
  'src/components/tech/testing/TestingKpiStrip.tsx',
  'src/components/tech/shipping/ShippingKpiStrip.tsx',
  'src/components/packer/PackKpiStrip.tsx',
  'src/components/outbound/labels/LabelsKpiStrip.tsx',
] as const;

describe('Workbench Band 2 KPI densify (flush instrument)', () => {
  it('exports MONITOR_KPI_BAND_* and keeps MONITOR_KPI_TILE_CLASS for analytics cards', () => {
    const shell = read(SHELL);
    assert.match(shell, /export const MONITOR_KPI_TILE_CLASS/);
    assert.match(shell, /export const MONITOR_KPI_BAND_CLASS/);
    assert.match(shell, /export const MONITOR_KPI_BAND_STRIP_CLASS/);
    assert.match(shell, /export const MONITOR_KPI_BAND_CELL_CLASS/);
    assert.match(shell, /rounded-2xl/, 'tile class stays carded for Monitor dashboards');
    assert.match(shell, /cornerClass\('flush'\)/, 'band class is flush square');
  });

  it('KpiTile supports density=band without changing default monitor shell', () => {
    const tile = read(TILE);
    assert.match(tile, /density\s*=\s*'monitor'/);
    assert.match(tile, /density === 'band'/);
    assert.match(tile, /MONITOR_KPI_BAND_CLASS/);
    assert.match(tile, /MONITOR_KPI_TILE_CLASS/);
  });

  it('OpsKpiBand density=band uses MONITOR_KPI_BAND_STRIP_CLASS', () => {
    const ops = read(OPS);
    assert.match(ops, /density === 'band'/);
    assert.match(ops, /MONITOR_KPI_BAND_STRIP_CLASS/);
    assert.match(ops, /OpsKpiBandSkeletonTile/);
  });

  it('Band strip paints light vertical hairlines between visible cells', () => {
    const shell = read(SHELL);
    assert.match(
      shell,
      /MONITOR_KPI_BAND_STRIP_CLASS[\s\S]{0,200}?border-border-hairline/,
      'band strip must seam siblings with border-border-hairline',
    );
    assert.match(
      shell,
      /\[&>\*:not\(:last-child\)\]:border-r/,
      'last cell must not paint a trailing hairline',
    );
  });

  for (const file of STRIPS) {
    it(`${file} uses band density — no MONITOR_KPI_TILE_CLASS / rounded-2xl islands`, () => {
      const src = read(file);
      assert.match(src, /density="band"/, `${file} must opt into band density`);
      assert.doesNotMatch(
        src,
        /MONITOR_KPI_TILE_CLASS/,
        `${file} must not use Monitor card tile class in Band 2`,
      );
      assert.doesNotMatch(
        src,
        /rounded-2xl/,
        `${file} must not reintroduce rounded-2xl KPI cards`,
      );
      assert.doesNotMatch(
        src,
        /flex flex-wrap gap-3/,
        `${file} must not keep card-strip gap-3 (use OpsKpiBand density=band)`,
      );
    });
  }
});

// Card-altitude strips keep the default (gap-3) density rather than the flush
// Band-2 look, but must still compose the OpsKpiBand SoT container — never a
// per-strip `const TILE_BAND_CLASS = 'flex flex-wrap gap-3'` fork.
const DEFAULT_DENSITY_STRIPS = [
  'src/components/walk-in/SalesKpiStrip.tsx',
  'src/components/outbound/ready/ReadyKpiStrip.tsx',
  'src/components/fba/FbaKpiStrip.tsx',
] as const;

describe('KPI band container SoT — default-density strips compose OpsKpiBand', () => {
  for (const file of DEFAULT_DENSITY_STRIPS) {
    it(`${file} composes OpsKpiBand — no hand-rolled TILE_BAND_CLASS fork`, () => {
      const src = read(file);
      assert.match(src, /OpsKpiBand/, `${file} must compose the OpsKpiBand SoT`);
      assert.doesNotMatch(
        src,
        /const TILE_BAND_CLASS/,
        `${file} must not re-declare a local band class`,
      );
      assert.doesNotMatch(
        src,
        /flex flex-wrap gap-3/,
        `${file} band container is the SoT, not a hand-rolled 'flex flex-wrap gap-3'`,
      );
    });
  }
});
