import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  captureUploadKey,
  distinctFailureReasons,
  humanizeUploadError,
  summarizeCaptureUploads,
  type CaptureUploadEntry,
} from './capture-upload-model';

const entry = (over: Partial<CaptureUploadEntry> = {}): CaptureUploadEntry => ({
  id: '1',
  domain: 'receiving',
  state: 'uploading',
  previewUrl: 'blob:x',
  error: null,
  createdAt: 0,
  ...over,
});

test('idle when there is nothing to report', () => {
  const s = summarizeCaptureUploads([]);
  assert.equal(s.tone, 'idle');
  assert.equal(s.headline, '');
  assert.equal(s.total, 0);
});

test('queued and uploading both count as in flight', () => {
  const s = summarizeCaptureUploads([
    entry({ id: 'a', state: 'queued' }),
    entry({ id: 'b', state: 'uploading' }),
  ]);
  assert.equal(s.tone, 'active');
  assert.equal(s.inFlight, 2);
  assert.equal(s.headline, 'Uploading 2 photos…');
});

test('a single photo is not pluralized', () => {
  assert.equal(summarizeCaptureUploads([entry()]).headline, 'Uploading 1 photo…');
  assert.equal(
    summarizeCaptureUploads([entry({ state: 'committed' })]).headline,
    '1 photo saved',
  );
  assert.equal(
    summarizeCaptureUploads([entry({ state: 'failed', error: 'boom' })]).headline,
    '1 photo failed',
  );
});

/**
 * The load-bearing rule. A burst where one photo 403s must NOT read as
 * "Uploading 5…" — a failure hidden behind concurrent success is the exact
 * defect this program exists to close.
 */
test('failed outranks in-flight and committed', () => {
  const s = summarizeCaptureUploads([
    entry({ id: 'a', state: 'uploading' }),
    entry({ id: 'b', state: 'uploading' }),
    entry({ id: 'c', state: 'committed' }),
    entry({ id: 'd', state: 'failed', error: 'forbidden' }),
  ]);
  assert.equal(s.tone, 'failed');
  assert.equal(s.headline, '1 photo failed');
  // …but the in-flight work is still reported, not erased by the failure.
  assert.equal(s.inFlight, 2);
  assert.equal(s.committed, 1);
  assert.equal(s.total, 4);
});

test('in-flight outranks committed', () => {
  const s = summarizeCaptureUploads([
    entry({ id: 'a', state: 'committed' }),
    entry({ id: 'b', state: 'uploading' }),
  ]);
  assert.equal(s.tone, 'active');
});

test('committed is the resting state once nothing is moving', () => {
  const s = summarizeCaptureUploads([
    entry({ id: 'a', state: 'committed' }),
    entry({ id: 'b', state: 'committed' }),
  ]);
  assert.equal(s.tone, 'committed');
  assert.equal(s.headline, '2 photos saved');
});

/** Two domains can each mint entry "3"; a bare id key would cross-reconcile. */
test('keys are namespaced by domain', () => {
  assert.equal(captureUploadKey({ domain: 'receiving', id: '3' }), 'receiving:3');
  assert.notEqual(
    captureUploadKey({ domain: 'pack', id: '3' }),
    captureUploadKey({ domain: 'receiving', id: '3' }),
  );
});

test('identical failure reasons collapse to one line, in first-seen order', () => {
  const reasons = distinctFailureReasons([
    entry({ id: 'a', state: 'failed', error: 'network dropped' }),
    entry({ id: 'b', state: 'failed', error: 'network dropped' }),
    entry({ id: 'c', state: 'failed', error: 'forbidden' }),
    entry({ id: 'd', state: 'uploading' }),
  ]);
  assert.deepEqual(reasons, [
    'Network dropped — retry from the gallery.',
    "You don't have permission to add photos here.",
  ]);
});

test('non-failed entries contribute no reasons', () => {
  assert.deepEqual(distinctFailureReasons([entry({ state: 'committed' })]), []);
});

test('raw errors humanize into actionable lines', () => {
  assert.match(humanizeUploadError('Forbidden'), /permission/i);
  assert.match(humanizeUploadError('upload failed (401)'), /Signed out/i);
  assert.match(humanizeUploadError('bucket does not exist'), /bucket missing/i);
  assert.match(humanizeUploadError('Failed to fetch'), /Network dropped/i);
  // Unknown text passes through rather than being swallowed by a generic line.
  assert.equal(humanizeUploadError('weird backend thing'), 'weird backend thing');
  assert.equal(humanizeUploadError('   '), 'Upload failed');
});
