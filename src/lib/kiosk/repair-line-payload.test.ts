/**
 * The REPAIR cart-line payload builder.
 * `KioskRepairReviewCard` — operator 2026-09-15 replaced that surface with the
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialFormData } from '@/components/repair/repair-intake-logic';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import type { RepairPayload } from './cart-line';
import {
  repairLinePayload,
  repairPriceToCents,
  type RepairLinePayloadInput,
} from './repair-line-payload';

const PRODUCT = { type: 'Speaker', model: 'Bose 321', sourceSku: 'RS-321' };

function form(overrides: Partial<RepairFormData> = {}): RepairFormData {
  return buildInitialFormData({
    product: { type: PRODUCT.type, model: PRODUCT.model, sourceSku: PRODUCT.sourceSku },
    repairReasons: ['No power'],
    serialNumber: 'SN-1',
    price: '86.00',
    customer: { name: 'Ada', phone: '5551234567', email: '' },
    ...overrides,
  });
}

const SIGNATURE = { dataUrl: 'data:image/png;base64,AAA', strokes: [{ points: [] }] };

function payload(overrides: Partial<RepairLinePayloadInput> = {}): RepairPayload {
  return repairLinePayload({
    formData: form(),
    product: PRODUCT,
    catalogPrice: '',
    signature: SIGNATURE,
    ...overrides,
  });
}

test('a quote string becomes minor units, and junk becomes zero', () => {
  assert.equal(repairPriceToCents('86'), 8600);
  assert.equal(repairPriceToCents('$86.49'), 8649);
  assert.equal(repairPriceToCents(''), 0);
  assert.equal(repairPriceToCents('abc'), 0);
  // A negative quote is not a credit on a repair line — buyback owns that sign.
  assert.equal(repairPriceToCents('-12'), 1200);
});

test('the form quote wins over the catalog price, and an empty one falls back', () => {
  assert.equal(payload().price, '86.00');
  assert.equal(
    repairLinePayload({
      formData: form({ price: '' }),
      product: PRODUCT,
      catalogPrice: ' 130 ',
      signature: null,
    }).price,
    '130',
  );
});

