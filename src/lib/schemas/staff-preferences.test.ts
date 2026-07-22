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
