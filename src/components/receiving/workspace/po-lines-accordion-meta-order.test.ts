import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Guards scan-stable PO line meta chip order in the PO-line row.
 *
 * Price is variable-width and always present (filled amount or Receipt + `—`)
 * — it must render last so qty · SKU · condition · serial columns align
 * vertically across rows when operators down-scan a multi-item PO.
 *
 * Serial preview is a hover button (opens Units display) — not a
 * {@link SerialChip} on the collapsed meta row. The chip render sites live in
 * PoLineRow.tsx; this guard reads that file.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PoLineRow.tsx'),
  'utf8',
);

/** First render-site index for an exact JSX opening tag. */
function firstRenderIndex(tag: string): number {
  const re = new RegExp(`<${tag}(?:\\s|>|/)`);
  const importEnd = SRC.indexOf('export function') || SRC.indexOf('export default');
  const from = importEnd > -1 ? importEnd : 0;
  const slice = SRC.slice(from);
  const match = slice.match(re);
  assert.ok(match?.index != null, `${tag} render site missing`);
  return from + match.index;
}

/** First index of a serial-column marker in the meta grid props. */
function serialColumnIndex(): number {
  // Collapsed meta uses SerialChipSkeleton while loading, else last-8 text /
  // NoSerialControl / Edit units — never a bare <SerialChip>.
  const markers = ['SerialChipSkeleton', 'NoSerialControl', 'getLast8(sn)', 'Edit units'];
  let best = -1;
  for (const m of markers) {
    const i = SRC.indexOf(m);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  assert.ok(best >= 0, 'serial column render site missing');
  return best;
}

test('PO line meta chips: condition and serial precede price', () => {
  const conditionIdx = firstRenderIndex('ConditionGradeChip');
  const serialIdx = serialColumnIndex();
  const priceIdx = firstRenderIndex('UnitPriceChip');

  assert.ok(conditionIdx < priceIdx, 'UnitPriceChip must follow ConditionGradeChip');
  assert.ok(serialIdx < priceIdx, 'serial column must precede UnitPriceChip');
});

test('PO line meta chips: SKU precedes condition (price no longer mid-row)', () => {
  const skuIdx = firstRenderIndex('SkuScanRefChip');
  const conditionIdx = firstRenderIndex('ConditionGradeChip');
  const priceIdx = firstRenderIndex('UnitPriceChip');

  assert.ok(skuIdx < conditionIdx, 'ConditionGradeChip must follow SkuScanRefChip');
  assert.ok(conditionIdx < priceIdx, 'UnitPriceChip must be last among identity chips');
});

test('PO line meta: SKU uses last-8 lock (displayWidth last8)', () => {
  assert.ok(
    /displayWidth=["']last8["']/.test(SRC),
    'PoLineRow SkuScanRefChip must lock last-8 width (Arrival/Unbox SKU face parity)',
  );
});

test('PO line meta: empty SKU uses EmptySkuChipFace (not a bare em-dash)', () => {
  assert.ok(
    /EmptySkuChipFace/.test(SRC),
    'PoLineRow must render EmptySkuChipFace when line.sku is blank',
  );
});

test('PO line meta: Arrival unitsChrome=false still paints condition (read-only)', () => {
  // unitsChrome gates editors only — condition chip must not be omitted when false.
  assert.ok(
    /ConditionGradeChip/.test(SRC),
    'PoLineRow must always render ConditionGradeChip in meta',
  );
  assert.doesNotMatch(
    SRC,
    /condition=\{\s*unitsChrome\s*\?/,
    'must not gate the condition column on unitsChrome (layout collapse fork)',
  );
});

test('PO line meta: price always renders UnitPriceChip (empty unfound keeps Receipt + —)', () => {
  assert.ok(
    /price=\{<\s*UnitPriceChip\s+amount=\{line\.unit_price\}/.test(SRC) ||
      /<UnitPriceChip\s+amount=\{line\.unit_price\}/.test(SRC),
    'PoLineRow must always pass UnitPriceChip — never gate the price column on unit_price > 0',
  );
  assert.doesNotMatch(
    SRC,
    /unit_price\s*!=\s*null\s*&&\s*Number\(line\.unit_price\)\s*>\s*0/,
    'must not hide UnitPriceChip when unit_price is missing (unfound / unpriced lines)',
  );
});
