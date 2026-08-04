import test from 'node:test';
import assert from 'node:assert/strict';
import { KIOSK_SHELL_PREVIEW_PATH, resolveKioskShellPreviewUrl } from './preview-url';

test('resolveKioskShellPreviewUrl returns path-only without window', () => {
  assert.equal(resolveKioskShellPreviewUrl(null), KIOSK_SHELL_PREVIEW_PATH);
  assert.equal(resolveKioskShellPreviewUrl(''), KIOSK_SHELL_PREVIEW_PATH);
  assert.equal(resolveKioskShellPreviewUrl('usav'), KIOSK_SHELL_PREVIEW_PATH);
});

test('resolveKioskShellPreviewUrl ignores slug (same-origin path only)', () => {
  assert.equal(resolveKioskShellPreviewUrl('usav'), '/kiosk/v2');
  assert.equal(KIOSK_SHELL_PREVIEW_PATH, '/kiosk/v2');
});
