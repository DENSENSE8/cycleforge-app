/**
 * Caption-dense Ledger body for Unbox / History Sheets — pin receiving cells
 * to `ledgerCell` / dense CopyChips so Order/Tracking cannot regress to raw
 * `text-sm` (monoValue) while Product sits at a quieter role.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const CELLS_DIR = join(ROOT, 'src/components/station/receiving-grid/cells');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Receiving grid caption-dense type (Ledger Sheets)', () => {
  it('presets export ledgerCell as text-role-caption body', () => {
    const src = read('src/design-system/tokens/typography/presets.ts');
    assert.match(
      src,
      /export const ledgerCell = 'min-w-0 truncate text-role-caption text-text-default'/,
      'ledgerCell must be caption-dense Sheets body',
    );
    assert.match(src, /ledgerCell,/, 'typographyPresets must include ledgerCell');
  });

  it('ReceivingTitleCell composes ledgerCell (not text-role-data / text-sm)', () => {
    const raw = read(
      'src/components/station/receiving-grid/cells/ReceivingTitleCell.tsx',
    );
    // Strip comments so docstrings naming banned tokens do not false-positive.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.match(src, /ledgerCell/, 'Title must use ledgerCell SoT');
    assert.doesNotMatch(
      src,
      /text-role-data/,
      'Title must not use text-role-data on caption-dense Sheets',
    );
    assert.doesNotMatch(src, /\btext-sm\b/, 'Title must not use raw text-sm');
  });

  it('ReceivingOrderCell passes dense on OrderNumberMenuChip', () => {
    const src = read(
      'src/components/station/receiving-grid/cells/ReceivingOrderCell.tsx',
    );
    assert.match(
      src,
      /OrderNumberMenuChip/,
      'Order must compose OrderNumberMenuChip (Open · Edit parity with TRACK)',
    );
    assert.match(
      src,
      /<OrderNumberMenuChip[\s\S]*?\bdense\b/,
      'OrderNumberMenuChip must be dense (caption mono, not monoValue text-sm)',
    );
    assert.match(
      src,
      /GridCellDash/,
      'Empty order must compose GridCellDash (inherits start-align — no centered placeholder)',
    );
    assert.match(
      src,
      /BrandIdentityDot/,
      'Order must lead with BrandIdentityDot (platform paint, not lifecycle status)',
    );
    assert.match(
      src,
      /platformMetaBrandDot/,
      'Order brand-dot paint must come from platformMetaBrandDot SoT',
    );
    assert.match(
      src,
      /resolveReceivingOrderOpenUrl/,
      'Order Open must resolve via resolveReceivingOrderOpenUrl SoT',
    );
    assert.match(src, /\bplain\b/, 'Order face stays plain (no # glyph)');
    assert.doesNotMatch(
      src,
      /statusDot|getStatusDotBg/,
      'Order identity must not host lifecycle status dots',
    );
  });

  it('ReceivingTrackingCell passes dense on TrackingNumberMenuChip', () => {
    const src = read(
      'src/components/station/receiving-grid/cells/ReceivingTrackingCell.tsx',
    );
    assert.match(
      src,
      /<TrackingNumberMenuChip[\s\S]*?\bdense\b/,
      'TrackingNumberMenuChip must be dense on Sheets TRACK',
    );
    assert.match(
      src,
      /GridCellDash/,
      'Empty tracking must compose GridCellDash (never blank under TRACK)',
    );
    assert.match(
      src,
      /BrandIdentityDot/,
      'Tracking must lead with BrandIdentityDot (carrier paint)',
    );
    assert.match(
      src,
      /carrierBrandDotPaint/,
      'Tracking brand-dot paint must come from carrierBrandDotPaint SoT',
    );
    assert.match(
      src,
      /showIcon=\{!col\.omitCellIcon\}/,
      'Tracking keeps omitCellIcon MapPin suppression',
    );
    assert.doesNotMatch(
      src,
      /statusDot|getStatusDotBg/,
      'Tracking identity must not host lifecycle status dots',
    );
  });

  it('ReceivingPriceCell honors omitCellIcon for the Receipt mark', () => {
    const src = read(
      'src/components/station/receiving-grid/cells/ReceivingPriceCell.tsx',
    );
    assert.match(
      src,
      /showIcon=\{!col\.omitCellIcon\}/,
      'Price keeps omitCellIcon Receipt suppression on Sheets rows',
    );
  });

  it('TrackingNumberMenuChip and TrackingOrSkuScanChip thread dense', () => {
    const menu = read('src/components/ui/TrackingNumberMenuChip.tsx');
    assert.match(menu, /dense\?: boolean/);
    assert.match(menu, /dense=\{dense\}/);
    const chip = read('src/components/ui/CopyChip.tsx');
    assert.match(
      chip,
      /export function TrackingOrSkuScanChip\([\s\S]*?dense/,
      'TrackingOrSkuScanChip must accept dense',
    );
    assert.match(chip, /<TrackingChip[\s\S]*?dense=\{dense\}/);
  });

  it('receiving-grid cells/ has no bare text-sm or text-[Npx]', () => {
    const files = readdirSync(CELLS_DIR).filter((f) => f.endsWith('.tsx'));
    assert.ok(files.length > 0, 'expected receiving-grid cell files');
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(CELLS_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      if (/\btext-sm\b/.test(src) || /text-\[\d+px\]/.test(src)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Cells must use text-role-* / ledgerCell, not text-sm / text-[Npx]: ${offenders.join(', ')}`,
    );
  });
});
