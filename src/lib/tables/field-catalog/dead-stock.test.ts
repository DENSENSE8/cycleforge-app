import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import {
  DEAD_STOCK_COMPOUND_COLUMNS,
  deadStockCompoundColumnsFor,
} from '@/lib/reports/dead-stock-grid-layout';
import { DEAD_STOCK_FIELD_CATALOG, DEAD_STOCK_PRODUCT_LAYOUT } from './dead-stock';
import { resolveDeadStockSlotValue, deadStockSlotValuesFor } from './dead-stock-resolve';
import { parseSlotLayout } from '../slot-layout';
import type { DeadStockRow } from '@/features/reports/metrics/report-rows';

function row(overrides: Partial<DeadStockRow> = {}): DeadStockRow {
  return {
    sku: 'BOSE-WAVE-IV',
    product_title: 'Bose Wave Radio IV',
    stock: 3,
    days_dormant: 120,
    ...overrides,
  };
}

describe('dead-stock catalog', () => {
  it('has unique ids, all dead-stock-family, each bindable', () => {
    const ids = DEAD_STOCK_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of DEAD_STOCK_FIELD_CATALOG) {
      assert.equal(field.family, 'dead-stock', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('dead-stock.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses — compound morph, dormancy facts bound', () => {
    const parsed = parseSlotLayout(DEAD_STOCK_PRODUCT_LAYOUT, DEAD_STOCK_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'dead-stock.sku');
    assert.equal(parsed.amountFieldId, null);
    assert.deepEqual(parsed.subtitleBindings, [{ fieldId: 'dead-stock.stock' }]);
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['dead-stock.product', 'dead-stock.days'],
    );
  });
});

describe('deadStockCompoundColumnsFor', () => {
  it('the product default opens dormancy tracks on the shared skeleton', () => {
    const keys = DEAD_STOCK_COMPOUND_COLUMNS.map((c) => c.key);
    for (const chrome of COMPOUND_COLUMN_KEYS) {
      assert.ok(keys.includes(chrome), `missing chrome ${chrome}`);
    }
    assert.ok(keys.includes('status:1'));
    assert.ok(keys.includes('status:2'));
  });
});

describe('resolveDeadStockSlotValue', () => {
  it('resolves catalog fields off the ranking row', () => {
    const r = row();
    assert.deepEqual(resolveDeadStockSlotValue(r, 'dead-stock.sku'), {
      kind: 'value',
      text: 'BOSE-WAVE-IV',
    });
    assert.deepEqual(resolveDeadStockSlotValue(r, 'dead-stock.days'), {
      kind: 'value',
      text: '120',
    });
    assert.equal(resolveDeadStockSlotValue(r, 'dead-stock.ghost'), null);
  });
});

describe('deadStockSlotValuesFor', () => {
  it('keys bound values by track', () => {
    const columns = deadStockCompoundColumnsFor(DEAD_STOCK_PRODUCT_LAYOUT);
    const slots = deadStockSlotValuesFor(row(), columns);
    assert.equal(slots?.['status:1']?.kind, 'value');
  });
});
