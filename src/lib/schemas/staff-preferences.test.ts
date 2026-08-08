/**
 * Guard the focus-scan hotkey allowlist: non-typing keys only (global listener
 * must not steal printable text entry). Insert is the barcode-friendly default.
 */

import { test } from 'node:test';
import { ok, equal } from 'node:assert';
import {
  DEFAULT_FOCUS_SCAN_HOTKEY,
  FOCUS_SCAN_HOTKEY_RE,
  StaffPreferencesPutBody,
} from './staff-preferences';

test('default focus-scan hotkey is Insert', () => {
  equal(DEFAULT_FOCUS_SCAN_HOTKEY, 'Insert');
  ok(FOCUS_SCAN_HOTKEY_RE.test(DEFAULT_FOCUS_SCAN_HOTKEY));
});

test('FOCUS_SCAN_HOTKEY_RE accepts Insert, ScrollLock, and F1–F12', () => {
  for (const key of ['Insert', 'ScrollLock', 'F1', 'F2', 'F12']) {
    ok(FOCUS_SCAN_HOTKEY_RE.test(key), `${key} should be allowed`);
  }
});

test('FOCUS_SCAN_HOTKEY_RE rejects printable and out-of-range keys', () => {
  for (const key of ['a', '1', '`', 'Tab', 'Escape', 'Pause', 'F0', 'F13', 'insert', 'scrolllock']) {
    ok(!FOCUS_SCAN_HOTKEY_RE.test(key), `${key} should be rejected`);
  }
});

test('StaffPreferencesPutBody accepts Insert and rejects printable keys', () => {
  ok(StaffPreferencesPutBody.safeParse({ focusScanHotkey: 'Insert' }).success);
  ok(StaffPreferencesPutBody.safeParse({ focusScanHotkey: 'ScrollLock' }).success);
  ok(StaffPreferencesPutBody.safeParse({ focusScanHotkey: 'F8' }).success);
  ok(StaffPreferencesPutBody.safeParse({ focusScanHotkey: null }).success);
  ok(!StaffPreferencesPutBody.safeParse({ focusScanHotkey: 'a' }).success);
  ok(!StaffPreferencesPutBody.safeParse({ focusScanHotkey: 'Pause' }).success);
});

test('unboxPinnedExtraTabs is bounded — a third pin does not persist (D2 · D14)', () => {
  ok(StaffPreferencesPutBody.safeParse({ unboxPinnedExtraTabs: [] }).success);
  ok(StaffPreferencesPutBody.safeParse({ unboxPinnedExtraTabs: ['incoming'] }).success);
  ok(StaffPreferencesPutBody.safeParse({ unboxPinnedExtraTabs: null }).success);
  // ≤ cap (2) passes; a 3-element array is rejected at the write boundary.
  ok(StaffPreferencesPutBody.safeParse({ unboxPinnedExtraTabs: ['incoming', 'incoming'] }).success);
  ok(
    !StaffPreferencesPutBody.safeParse({
      unboxPinnedExtraTabs: ['incoming', 'incoming', 'incoming'],
    }).success,
    'a third pinned extra must be rejected',
  );
  // Only the closed catalog id is accepted — no freeform / custom-table pins.
  ok(
    !StaffPreferencesPutBody.safeParse({ unboxPinnedExtraTabs: ['bogus'] }).success,
    'unknown pin id must be rejected',
  );
});

test('StaffPreferencesPutBody accepts quickAccess pins with label + exact href', () => {
  const pin = {
    id: 'p1',
    label: 'Receiving',
    href: '/unbox?openReceivingId=50297',
    iconKey: 'receiving',
    addedAt: 1,
  };
  ok(
    StaffPreferencesPutBody.safeParse({ quickAccess: { pinned: [pin] } }).success,
    'valid pin bag should pass',
  );
  ok(StaffPreferencesPutBody.safeParse({ quickAccess: null }).success);
  ok(
    !StaffPreferencesPutBody.safeParse({
      quickAccess: { pinned: [{ ...pin, href: 'https://evil.example' }] },
    }).success,
    'external href must be rejected',
  );
  ok(
    !StaffPreferencesPutBody.safeParse({
      quickAccess: { pinned: [{ ...pin, href: 'javascript:void(0)' }] },
    }).success,
    'non-app href must be rejected',
  );
});
