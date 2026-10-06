import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMobileScanOutCommit, isScanOutTrackingCommit } from '@/components/outbound/scan-out/scan-out-commit';

test('UPS 1Z and long alnum blobs are tracking commits', () => {
  assert.equal(isScanOutTrackingCommit('1Z999AA10123456784'), true);
  assert.equal(isScanOutTrackingCommit('9400111899223197428490'), true);
  assert.equal(isScanOutTrackingCommit('  4201234567890123456789012  '), true);
  // USPS IMpb (420 + ZIP + service) — floor gun fixture
  assert.equal(isScanOutTrackingCommit('420928059300110990513567668182'), true);
});

test('prose and multi-line are notes, not scans', () => {
  assert.equal(isScanOutTrackingCommit('corner dent on left speaker'), false);
  assert.equal(isScanOutTrackingCommit('damaged\nbox wet'), false);
  assert.equal(isScanOutTrackingCommit('ok'), false);
  assert.equal(isScanOutTrackingCommit('5006'), false);
});

test('marketplace order shapes are never treated as carrier tracking', () => {
  assert.equal(isScanOutTrackingCommit('12-34567-89012'), false);
  assert.equal(isScanOutTrackingCommit('123-1234567-1234567'), false);
});

test('phone Out scans out a carrier label or any desk-station label', () => {
  assert.equal(isMobileScanOutCommit('1Z999AA10123456784', 'carrier-tracking'), true);
  assert.equal(isMobileScanOutCommit('FBA15ABCDEFGH', 'bin'), true);
  assert.equal(isMobileScanOutCommit('corner dent on left speaker', 'sku'), false);
  assert.equal(isMobileScanOutCommit('123456789', 'carrier-tracking'), true);
});
