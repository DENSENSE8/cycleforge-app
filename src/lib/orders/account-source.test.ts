import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalAccountSource, QA_ACCOUNT_SOURCE } from './account-source';

test('every spelling of one platform or account stores one key', () => {
  for (const raw of ['eBay', 'ebay', ' EBAY ']) assert.equal(canonicalAccountSource(raw), 'ebay');
  assert.equal(canonicalAccountSource('USAV'), 'usav');
  assert.equal(canonicalAccountSource('Ebay   Purchasing'), 'ebay purchasing');
});

test('QA / demo / test seed sources collapse to one filterable key', () => {
  for (const raw of ['QA-DEMO', 'QA_SANDBOX', 'QA-TEST', 'QA', 'TEST']) assert.equal(canonicalAccountSource(raw), QA_ACCOUNT_SOURCE);
  assert.equal(canonicalAccountSource('Qantas'), 'qantas', 'a word starting with "qa" is not QA');
});

test('a blank source takes the platform the order number proves, and only that', () => {
  assert.equal(canonicalAccountSource('', '111-2155094-3973057'), 'amazon');
  assert.equal(canonicalAccountSource(null, '24-15103-03339'), 'ebay');
  assert.equal(canonicalAccountSource('  ', 'FBA19HWXH7X1'), 'fba');
  assert.equal(canonicalAccountSource('', '108123456789012'), 'walmart');
  assert.equal(canonicalAccountSource('', 'ZD 9061'), '', 'no channel in the number → blank, never a guess');
  assert.equal(canonicalAccountSource('ecwid', '111-2155094-3973057'), 'ecwid', 'a stated source wins over the number shape');
});
