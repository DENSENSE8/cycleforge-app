import test from 'node:test';
import assert from 'node:assert/strict';
import { KIOSK_SHELL_PREVIEW_PATH, resolveKioskShellPreviewUrl } from './preview-url';

test('resolveKioskShellPreviewUrl falls back to path when slug missing', () => {
  assert.equal(resolveKioskShellPreviewUrl(null), KIOSK_SHELL_PREVIEW_PATH);
  assert.equal(resolveKioskShellPreviewUrl(''), KIOSK_SHELL_PREVIEW_PATH);
});

test('resolveKioskShellPreviewUrl builds tenant kiosk host for a valid slug', () => {
  const prev = process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX;
  process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX = 'kiosk.app.cycleforge.ai';
  try {
    assert.equal(
      resolveKioskShellPreviewUrl('usav'),
      'https://usav.kiosk.app.cycleforge.ai/kiosk/v2',
    );
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX;
    else process.env.NEXT_PUBLIC_KIOSK_HOST_SUFFIX = prev;
  }
});
