import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/**
 * Edit tracking must open the record inspector — never steal the OS clipboard.
 * Pins the SoT chip and adapters against regressing to
 * `navigator.clipboard.readText` on the edit menu path.
 */
describe('TrackingNumberMenuChip — no clipboard replace', () => {
  it('TrackingNumberMenuChip does not read the OS clipboard', () => {
    const src = read('src/components/ui/TrackingNumberMenuChip.tsx');
    assert.equal(
      src.includes('clipboard.readText'),
      false,
      'TrackingNumberMenuChip must not clipboard-steal on Edit',
    );
    assert.match(src, /onEdit\(\)/, 'Edit must call the host callback with no args');
    assert.match(src, /label: 'Open'/);
    assert.match(src, /label: 'Edit'/);
    assert.match(src, /denseLabel/);
    assert.match(src, /Pencil/);
  });

  it('OrderNumberMenuChip mirrors Open · Edit without clipboard steal', () => {
    const src = read('src/components/ui/OrderNumberMenuChip.tsx');
    assert.equal(
      src.includes('clipboard.readText'),
      false,
      'OrderNumberMenuChip must not clipboard-steal on Edit',
    );
    assert.match(src, /onEdit\(\)/, 'Edit must call the host callback with no args');
    assert.match(src, /label: 'Open'/);
    assert.match(src, /label: 'Edit'/);
    assert.match(src, /denseLabel/);
    assert.match(src, /Pencil/);
  });

  it('OrderIdentityChips delegates filled tracking to TrackingNumberMenuChip', () => {
    const src = read('src/components/ui/OrderIdentityChips.tsx');
    assert.match(src, /TrackingNumberMenuChip/);
    assert.equal(
      src.includes('clipboard.readText'),
      false,
      'OrderIdentityChips must not clipboard-steal for Edit tracking',
    );
  });
});

/**
 * Inbound LedgerGrid TRACK cells must use the SoT menu chip for filled values.
 * Pickup / empty attach / multi-count branches stay exempt.
 */
describe('Inbound TRACK cells use TrackingNumberMenuChip', () => {
  const sites = [
    'src/components/station/incoming-grid/cells/index.tsx',
    'src/components/station/receiving-grid/cells/ReceivingTrackingCell.tsx',
    'src/components/receiving/ReceivingIdentityChips.tsx',
  ] as const;

  for (const rel of sites) {
    it(`${rel} uses TrackingNumberMenuChip, not bare TrackingChip`, () => {
      const src = read(rel);
      assert.match(
        src,
        /TrackingNumberMenuChip/,
        `${rel} must compose TrackingNumberMenuChip for filled TRACK`,
      );
      assert.equal(
        /<TrackingChip[\s>]/.test(src),
        false,
        `${rel} must not render <TrackingChip> for filled TRACK`,
      );
    });
  }
});

describe('Receiving ORDER cell uses OrderNumberMenuChip', () => {
  it('ReceivingOrderCell uses OrderNumberMenuChip, not bare OrderIdChip', () => {
    const src = read(
      'src/components/station/receiving-grid/cells/ReceivingOrderCell.tsx',
    );
    assert.match(src, /OrderNumberMenuChip/);
    assert.equal(
      /<OrderIdChip[\s>]/.test(src),
      false,
      'ReceivingOrderCell must not render bare <OrderIdChip>',
    );
    assert.match(src, /onEdit=\{onEditOrder\}/);
  });
});
