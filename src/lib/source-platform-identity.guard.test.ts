/**
 * Platform-aware order / PO identity is one codebase-wide contract:
 * resolved platform paint + label, last-8 face, bare copy payload.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('source-platform identity SoT', () => {
  it('CopyChip behavior formats id tooltips through source-platform', () => {
    const hook = read('src/hooks/useCopyChip.ts');
    assert.match(hook, /historyKind === 'id'[\s\S]{0,100}formatPlatformTooltipLabel/);

    const chip = read('src/components/ui/CopyChip.tsx');
    assert.match(
      chip,
      /export const OrderIdChip[\s\S]{0,900}platformLabel=\{platformLabel\}/,
      'OrderIdChip must forward platformLabel to CopyChip',
    );
    assert.match(
      chip,
      /export const PoChip[\s\S]{0,1100}platformLabel=\{platformLabel\}/,
      'PoChip must forward platformLabel to CopyChip',
    );
  });

  it('shared platform-aware surfaces pass their resolved label', () => {
    const surfaces = [
      ['src/components/station/entity-context/CartonContextCard.tsx', /platformLabel=\{platformValue \? platformMeta\.label : null\}/],
      ['src/components/ui/OrderIdentityChips.tsx', /<OrderIdChip[\s\S]{0,180}platformLabel=\{platformLabel\}/],
      ['src/components/station/incoming-grid/cells/index.tsx', /platformLabel=\{platformMeta\.value \? platformMeta\.label : null\}/],
      ['src/components/station/receiving-grid/cells/ReceivingOrderCell.tsx', /platformLabel=\{platformLabel \|\| null\}/],
    ] as const;

    for (const [file, pattern] of surfaces) {
      assert.match(read(file), pattern, `${file} must use the shared platform identity tooltip`);
    }
  });

  it('views do not own platform tooltip formatting or color maps', () => {
    for (const file of [
      'src/components/station/entity-context/CartonContextCard.tsx',
      'src/components/ui/OrderIdentityChips.tsx',
    ]) {
      const src = read(file);
      assert.doesNotMatch(src, /function\s+formatPlatformTooltip|PLATFORM_COLOR|platformColorMap/);
    }
  });
});
