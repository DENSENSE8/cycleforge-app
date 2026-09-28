import assert from 'node:assert/strict';
import test from 'node:test';
import { matchSlipFile, type SlipCandidate } from './slip-matching';

const candidate = (orderId: number, orderRef: string, refs: string[] = []): SlipCandidate => ({
  orderId,
  orderRef,
  accountSource: null,
  refs,
});

const candidates = [
  candidate(1, '#1234'),
  candidate(2, '113-1234567-7654321'),
  candidate(3, '12-34567-89012', ['EB-5555']),
  candidate(4, '98765'),
];

test('filename naming one order matches it, ignoring # and leading zeros', () => {
  assert.deepEqual(matchSlipFile({ filename: 'packing-slip-001234.pdf', text: '' }, candidates), { orderId: 1 });
  assert.deepEqual(matchSlipFile({ filename: 'slip_1134_#1234.PDF', text: '' }, candidates), { orderId: 1 });
});

test('a hyphenated marketplace number matches with or without its separators', () => {
  assert.deepEqual(matchSlipFile({ filename: '11312345677654321.pdf', text: '' }, candidates), { orderId: 2 });
  assert.deepEqual(matchSlipFile({ filename: 'Amazon 113-1234567-7654321.pdf', text: '' }, candidates), { orderId: 2 });
});

test('an extra ref on the candidate matches too', () => {
  assert.deepEqual(matchSlipFile({ filename: 'ebay EB-5555.pdf', text: '' }, candidates), { orderId: 3 });
});

test('page text is read when the filename names no order', () => {
  const text = 'Packing Slip  Ship to: Jane Doe  Order # 12-34567-89012  Qty 1';
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text }, candidates), { orderId: 3 });
});

test('the filename wins over the text', () => {
  assert.deepEqual(matchSlipFile({ filename: 'order-98765.pdf', text: 'Order #1234' }, candidates), { orderId: 4 });
});

test('several orders named is ambiguous — never an auto-pick', () => {
  assert.deepEqual(matchSlipFile({ filename: 'slips 1234 and 98765.pdf', text: '' }, candidates), { ambiguous: [1, 4] });
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text: 'Orders 1234, 98765' }, candidates), { ambiguous: [1, 4] });
});

test('nothing named is null', () => {
  assert.equal(matchSlipFile({ filename: 'scan.pdf', text: 'Thank you for your order!' }, candidates), null);
  assert.equal(matchSlipFile({ filename: 'scan.pdf', text: '' }, []), null);
});

test('a short numeric ref never matches inside a longer number', () => {
  const text = 'Tracking 9400123456 Phone 555-912345 Zip 12345';
  assert.equal(matchSlipFile({ filename: 'slip-12345.pdf', text }, [candidate(1, '1234')]), null);
  assert.equal(matchSlipFile({ filename: '91234.pdf', text: '' }, [candidate(1, '1234')]), null);
});

test('a ref shorter than four characters never matches', () => {
  assert.equal(matchSlipFile({ filename: 'slip-123.pdf', text: 'Order 123' }, [candidate(1, '#123')]), null);
});

test('a number inside another candidate’s longer number is that longer order only', () => {
  const pool = [candidate(1, '1234567'), candidate(2, '113-1234567-7654321')];
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text: 'Order ID: 113-1234567-7654321' }, pool), { orderId: 2 });
});
