import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import {
  SKU_VELOCITY_COMPOUND_COLUMNS,
  skuVelocityCompoundColumnsFor,
} from '@/lib/reports/sku-velocity-grid-layout';
import { SKU_VELOCITY_FIELD_CATALOG, SKU_VELOCITY_PRODUCT_LAYOUT } from './sku-velocity';
import { resolveSkuVelocitySlotValue, skuVelocitySlotValuesFor } from './sku-velocity-resolve';
import { parseSlotLayout } from '../slot-layout';
import type { SkuVelocityRow } from '@/features/reports/metrics/report-rows';

function row(overrides: Partial<SkuVelocityRow> = {}): SkuVelocityRow {
  return {
    sku: 'BOSE-WAVE-IV',
    product_title: 'Bose Wave Radio IV',
    velocity_tier: 'B',
    out_qty: 12,
    in_qty: 4,
    current_stock: 7,
    ...overrides,
  };
}

describe('sku-velocity catalog', () => {
  it('has unique ids, all sku-velocity-family, each bindable', () => {
    const ids = SKU_VELOCITY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of SKU_VELOCITY_FIELD_CATALOG) {
      assert.equal(field.family, 'sku-velocity', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('sku-velocity.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses — compound morph, ranking facts bound', () => {
    const parsed = parseSlotLayout(SKU_VELOCITY_PRODUCT_LAYOUT, SKU_VELOCITY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'sku-velocity.sku');
    assert.equal(parsed.amountFieldId, null);
    assert.deepEqual(parsed.subtitleBindings, [{ fieldId: 'sku-velocity.stock' }]);
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['sku-velocity.tier', 'sku-velocity.out', 'sku-velocity.in'],
    );
  });
});

describe('skuVelocityCompoundColumnsFor', () => {
  it('the product default opens ranking status tracks on the shared skeleton', () => {
    const keys = SKU_VELOCITY_COMPOUND_COLUMNS.map((c) => c.key);
    for (const chrome of COMPOUND_COLUMN_KEYS) {
      assert.ok(keys.includes(chrome), `missing chrome ${chrome}`);
    }
    assert.ok(keys.includes('status:1'));
    assert.ok(keys.includes('status:2'));
    assert.ok(keys.includes('status:3'));
  });
});

describe('resolveSkuVelocitySlotValue', () => {
  it('resolves catalog fields off the ranking row', () => {
    const r = row();
    assert.deepEqual(resolveSkuVelocitySlotValue(r, 'sku-velocity.sku'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolveSkuVelocitySlotValue(r, 'sku-velocity.tier'), {
      kind: 'value',
      text: 'B',
    });
    assert.deepEqual(resolveSkuVelocitySlotValue(r, 'sku-velocity.out'), {
      kind: 'value',
      text: '12',
    });
    assert.equal(resolveSkuVelocitySlotValue(r, 'sku-velocity.ghost'), null);
  });
});

describe('skuVelocitySlotValuesFor', () => {
  it('keys bound values by track', () => {
    const columns = skuVelocityCompoundColumnsFor(SKU_VELOCITY_PRODUCT_LAYOUT);
    const slots = skuVelocitySlotValuesFor(row(), columns);
    assert.equal(slots?.['status:1']?.kind, 'value');
  });
});
