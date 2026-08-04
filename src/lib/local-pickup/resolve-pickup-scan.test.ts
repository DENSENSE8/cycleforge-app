import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePickupScan } from './resolve-pickup-scan';

const ORDERS = [
  { orderId: 10, poNumber: 'LCPU-HANH-070726', customer: 'HANH', referenceNumber: null },
  { orderId: 20, poNumber: 'LCPU-KEN-012626', customer: 'KEN', referenceNumber: 'REF-20' },
  { orderId: 30, poNumber: 'LCPU-OTHER-1', customer: 'HANH', referenceNumber: null },
] as const;

describe('resolvePickupScan', () => {
  it('matches numeric order id', () => {
    assert.equal(resolvePickupScan('20', ORDERS), 20);
  });

  it('matches exact PO number', () => {
    assert.equal(resolvePickupScan('LCPU-KEN-012626', ORDERS), 20);
  });

  it('matches reference number', () => {
    assert.equal(resolvePickupScan('REF-20', ORDERS), 20);
  });

  it('returns null on ambiguous customer', () => {
    assert.equal(resolvePickupScan('HANH', ORDERS), null);
  });

  it('matches unique customer', () => {
    assert.equal(resolvePickupScan('KEN', ORDERS), 20);
  });

  it('returns null on empty / no match', () => {
    assert.equal(resolvePickupScan('', ORDERS), null);
    assert.equal(resolvePickupScan('NOPE', ORDERS), null);
  });
});
