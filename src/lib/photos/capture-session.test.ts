import assert from 'node:assert/strict';
import test from 'node:test';
import { captureFileName, captureFrameDimensions } from './capture-session';

test('continuous camera preserves the actual video frame dimensions', () => {
  assert.deepEqual(captureFrameDimensions(1920, 1080), { width: 1920, height: 1080 });
});

test('continuous camera has a safe frame before video metadata arrives', () => {
  assert.deepEqual(captureFrameDimensions(0, 0), { width: 1280, height: 720 });
});

test('capture filename is stable for a shutter instant', () => {
  assert.equal(captureFileName(1_750_000_000_999.8), 'cycleforge-1750000000999.jpg');
});
