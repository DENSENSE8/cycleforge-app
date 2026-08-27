import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyClaimPhotosArchiving } from './claim-archive-feedback';

test('notifyClaimPhotosArchiving is a no-op without window (unit runner)', () => {
  assert.equal(typeof window, 'undefined');
  notifyClaimPhotosArchiving(4821);
  notifyClaimPhotosArchiving(null);
  notifyClaimPhotosArchiving(0);
});
