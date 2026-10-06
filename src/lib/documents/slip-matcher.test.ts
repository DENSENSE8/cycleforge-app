import assert from 'node:assert/strict';
import test from 'node:test';
import { matchSlipFile, normalizeSlipRef, type SlipCandidate } from './slip-matcher';

const candidate = (orderId: number, ...refs: string[]): SlipCandidate => ({ orderId, refs });

const candidates = [
  candidate(1, '#1234'),
  candidate(2, '113-1234567-7654321'),
  candidate(3, '12-34567-89012', 'EB-5555'),
  candidate(4, '98765'),
];

test('normalization: upper-case, punctuation out, leading zeros out', () => {
  assert.equal(normalizeSlipRef('#001234'), '1234');
  assert.equal(normalizeSlipRef('00-1234'), '1234');
  assert.equal(normalizeSlipRef('eb-5555'), 'EB5555');
});

test('exact: the filename naming one order matches it, ignoring # and leading zeros', () => {
  assert.deepEqual(matchSlipFile({ filename: 'packing-slip-001234.pdf', text: '' }, candidates), { orderId: 1 });
  assert.deepEqual(matchSlipFile({ filename: 'slip_1134_#1234.PDF', text: '' }, candidates), { orderId: 1 });
});

test('a hyphenated marketplace number matches with or without its separators', () => {
  assert.deepEqual(matchSlipFile({ filename: '11312345677654321.pdf', text: '' }, candidates), { orderId: 2 });
  assert.deepEqual(matchSlipFile({ filename: 'Amazon 113-1234567-7654321.pdf', text: '' }, candidates), { orderId: 2 });
});

test('any ref of the candidate matches', () => {
  assert.deepEqual(matchSlipFile({ filename: 'ebay EB-5555.pdf', text: '' }, candidates), { orderId: 3 });
});

test('page text is read when the filename names no order', () => {
  const text = 'Packing Slip  Ship to: Jane Doe  Order # 12-34567-89012  Qty 1';
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text }, candidates), { orderId: 3 });
});

test('filename precedence: the filename wins over the text', () => {
  assert.deepEqual(matchSlipFile({ filename: 'order-98765.pdf', text: 'Order #1234' }, candidates), { orderId: 4 });
});

test('ambiguous: several orders named is never an auto-pick', () => {
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

test('leading zeros on the page still match the order', () => {
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text: 'Order No. 0001234' }, [candidate(1, '1234')]), { orderId: 1 });
});

test('a ref shorter than four characters, or without a digit, never matches', () => {
  assert.equal(matchSlipFile({ filename: 'slip-123.pdf', text: 'Order 123' }, [candidate(1, '#123')]), null);
  assert.equal(matchSlipFile({ filename: 'ABCDE.pdf', text: 'ABCDE' }, [candidate(1, 'ABCDE')]), null);
});

test('nested suppression: a number inside another candidate’s longer number is that longer order only', () => {
  const pool = [candidate(1, '1234567'), candidate(2, '113-1234567-7654321')];
  assert.deepEqual(matchSlipFile({ filename: 'scan.pdf', text: 'Order ID: 113-1234567-7654321' }, pool), { orderId: 2 });
});
