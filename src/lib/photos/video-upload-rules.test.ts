import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VIDEO_MAX_BYTES,
  formatMegabytes,
  resolveVideoMaxBytes,
  validateStoredVideo,
  validateVideoUpload,
} from './video-upload-rules';

const MB = 1024 * 1024;
const CAP = 100 * MB;

describe('validateVideoUpload', () => {
  it('accepts the three phone containers and maps each to its object extension', () => {
    assert.deepEqual(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: MB, fileName: 'a.mp4' }, CAP), {
      ok: true,
      contentType: 'video/mp4',
      extension: 'mp4',
    });
    assert.deepEqual(
      validateVideoUpload({ contentType: 'video/quicktime', sizeBytes: MB, fileName: 'IMG_0001.MOV' }, CAP),
      { ok: true, contentType: 'video/quicktime', extension: 'mov' },
    );
    assert.deepEqual(validateVideoUpload({ contentType: 'video/webm', sizeBytes: MB }, CAP), {
      ok: true,
      contentType: 'video/webm',
      extension: 'webm',
    });
  });

  it('normalizes case and codec parameters on the declared type', () => {
    const verdict = validateVideoUpload({ contentType: 'Video/MP4; codecs="avc1"', sizeBytes: MB, fileName: 'x.m4v' }, CAP);
    assert.deepEqual(verdict, { ok: true, contentType: 'video/mp4', extension: 'mp4' });
  });

  it('falls back to the extension when the picker reports no type', () => {
    assert.deepEqual(validateVideoUpload({ contentType: '', sizeBytes: MB, fileName: 'clip.mov' }, CAP), {
      ok: true,
      contentType: 'video/quicktime',
      extension: 'mov',
    });
  });

  it('refuses non-video and unlisted video types', () => {
    for (const contentType of ['image/jpeg', 'video/x-msvideo', 'application/octet-stream']) {
      const verdict = validateVideoUpload({ contentType, sizeBytes: MB }, CAP);
      assert.equal(verdict.ok, false, contentType);
    }
    assert.equal(validateVideoUpload({ contentType: '', sizeBytes: MB, fileName: 'clip.avi' }, CAP).ok, false);
    assert.equal(validateVideoUpload({ contentType: '', sizeBytes: MB, fileName: 'noext' }, CAP).ok, false);
  });

  it('refuses an extension that names a different container than the type', () => {
    const verdict = validateVideoUpload({ contentType: 'video/mp4', sizeBytes: MB, fileName: 'clip.webm' }, CAP);
    assert.equal(verdict.ok, false);
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: MB, fileName: 'clip.jpg' }, CAP).ok, false);
  });

  it('enforces the size bounds inclusively at the cap', () => {
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: CAP }, CAP).ok, true);
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: CAP + 1 }, CAP).ok, false);
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: 0 }, CAP).ok, false);
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: 1.5 }, CAP).ok, false);
    assert.equal(validateVideoUpload({ contentType: 'video/mp4', sizeBytes: Number.NaN }, CAP).ok, false);
  });
});

describe('validateStoredVideo', () => {
  it('trusts GCS metadata over the claim', () => {
    assert.deepEqual(
      validateStoredVideo({ exists: true, sizeBytes: 5 * MB, contentType: 'video/mp4' }, 'video/mp4', CAP),
      { ok: true, sizeBytes: 5 * MB },
    );
  });

  it('refuses a missing, empty, oversized or retyped object', () => {
    assert.equal(validateStoredVideo({ exists: false, sizeBytes: null, contentType: null }, 'video/mp4', CAP).ok, false);
    assert.equal(validateStoredVideo({ exists: true, sizeBytes: 0, contentType: 'video/mp4' }, 'video/mp4', CAP).ok, false);
    assert.equal(
      validateStoredVideo({ exists: true, sizeBytes: CAP + 1, contentType: 'video/mp4' }, 'video/mp4', CAP).ok,
      false,
    );
    assert.equal(
      validateStoredVideo({ exists: true, sizeBytes: MB, contentType: 'video/webm' }, 'video/mp4', CAP).ok,
      false,
    );
  });
});

describe('resolveVideoMaxBytes', () => {
  it('uses a positive integer override and ignores junk', () => {
    assert.equal(resolveVideoMaxBytes('1048576'), MB);
    for (const raw of [undefined, null, '', '0', '-5', 'abc', '1.5']) {
      assert.equal(resolveVideoMaxBytes(raw), DEFAULT_VIDEO_MAX_BYTES, String(raw));
    }
  });
});

describe('formatMegabytes', () => {
  it('keeps one decimal under 10 MB so a short clip never reads as zero, whole MB above', () => {
    assert.equal(formatMegabytes(400 * 1024), '0.4 MB');
    assert.equal(formatMegabytes(9.94 * MB), '9.9 MB');
    assert.equal(formatMegabytes(10 * MB), '10 MB');
    assert.equal(formatMegabytes(DEFAULT_VIDEO_MAX_BYTES), '500 MB');
  });
});
