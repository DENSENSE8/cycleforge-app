import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/ui');

/**
 * Replace tracking must open the order inspector — never steal the OS clipboard.
 * Pins the SoT chip and the OrderIdentityChips adapter against regressing to
 * `navigator.clipboard.readText` on the replace menu path.
 */
describe('TrackingNumberMenuChip — no clipboard replace', () => {
  it('TrackingNumberMenuChip does not read the OS clipboard', () => {
    const src = readFileSync(join(ROOT, 'TrackingNumberMenuChip.tsx'), 'utf8');
    assert.equal(
      src.includes('clipboard.readText'),
      false,
      'TrackingNumberMenuChip must not clipboard-steal on Replace tracking',
    );
    assert.match(src, /onReplaceTracking\(\)/, 'Edit must call the host callback with no args');
    assert.match(src, /label: 'Open'/);
    assert.match(src, /label: 'Edit'/);
    assert.match(src, /denseLabel/);
    assert.match(src, /Pencil/);
  });

  it('OrderIdentityChips delegates filled tracking to TrackingNumberMenuChip', () => {
    const src = readFileSync(join(ROOT, 'OrderIdentityChips.tsx'), 'utf8');
    assert.match(src, /TrackingNumberMenuChip/);
    assert.equal(
      src.includes('clipboard.readText'),
      false,
      'OrderIdentityChips must not clipboard-steal for Replace tracking',
    );
  });
});
