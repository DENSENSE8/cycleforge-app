/**
 * Session window + expiry resolution — DB-free.
 *
 * Pins the two halves of "Keep me signed in":
 *
 *   1. resolveSessionWindow — checking the box resolves the PERSISTENT window,
 *      whose idleMs is INFINITE. That infinity is load-bearing: loadSession
 *      only auto-revokes when `Number.isFinite(window.idleMs)`, so a finite
 *      idleMs here is the bug (session revoked overnight) coming back.
 *   2. resolveSessionExpiry — a persistent session ignores shift-end expiry.
 *      A shift-bound expiry would silently defeat the checkbox: the promise is
 *      "signed in no matter what", not "signed in until your shift ends".
 *
 * The per-staff `session_policy` and the per-session flag are an OR, never a
 * replacement — both directions are asserted below.
 */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { resolveSessionWindow, resolveSessionExpiry } from '@/lib/auth/session';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0); // fixed clock — no wall-clock flake

// ── resolveSessionWindow ────────────────────────────────────────────────────

test('default policy, box unchecked: device-kind windows are unchanged', () => {
  strictEqual(resolveSessionWindow('station', 'default').idleMs, 8 * HOUR);
  strictEqual(resolveSessionWindow('station', 'default').absoluteMs, 24 * HOUR);
  strictEqual(resolveSessionWindow('personal', 'default').idleMs, 12 * HOUR);
  strictEqual(resolveSessionWindow('personal', 'default').absoluteMs, 30 * DAY);
  strictEqual(resolveSessionWindow('phone', 'default').idleMs, 4 * HOUR);
});

test('box checked: no idle timeout, 1-year absolute — for every device kind', () => {
  for (const kind of ['station', 'personal', 'phone'] as const) {
    const w = resolveSessionWindow(kind, 'default', true);
    strictEqual(Number.isFinite(w.idleMs), false, `${kind}: idle must be infinite`);
    strictEqual(w.absoluteMs, 365 * DAY, `${kind}: absolute must be a year`);
  }
});

test('the reported bug: unchecked personal still idles out at 12 h', () => {
  // 13 h idle is the exact case from the handoff — sign in during the day,
  // come back the next morning. Unchecked, that must still expire.
  const w = resolveSessionWindow('personal', 'default');
  ok(Number.isFinite(w.idleMs));
  ok(13 * HOUR > w.idleMs, 'a 13 h gap must exceed the personal idle window');
});

test('per-staff persistent policy still wins with the box unchecked', () => {
  const w = resolveSessionWindow('station', 'persistent', false);
  strictEqual(Number.isFinite(w.idleMs), false);
  strictEqual(w.absoluteMs, 365 * DAY);
});

test('the session flag and the staff policy are an OR, not a replacement', () => {
  strictEqual(Number.isFinite(resolveSessionWindow('personal', 'default', true).idleMs), false);
  strictEqual(Number.isFinite(resolveSessionWindow('personal', 'persistent', false).idleMs), false);
  strictEqual(Number.isFinite(resolveSessionWindow('personal', 'persistent', true).idleMs), false);
});

test('extended policy is untouched by the new flag', () => {
  const w = resolveSessionWindow('personal', 'extended');
  strictEqual(w.idleMs, 7 * DAY);
  strictEqual(w.absoluteMs, 90 * DAY);
  // …but checking the box still upgrades it.
  strictEqual(Number.isFinite(resolveSessionWindow('personal', 'extended', true).idleMs), false);
});

// ── resolveSessionExpiry ────────────────────────────────────────────────────

test('unchecked, no shift: the device-kind absolute window', () => {
  const r = resolveSessionExpiry({ deviceKind: 'personal', policy: 'default', persistent: false, now: NOW });
  strictEqual(r.expiresAt.getTime(), NOW + 30 * DAY);
  strictEqual(r.honorsShift, false);
});

test('unchecked, active shift: expiry clamps to shift end', () => {
  const shiftEndsAt = new Date(NOW + 3 * HOUR);
  const r = resolveSessionExpiry({
    deviceKind: 'station', policy: 'default', persistent: false, shiftEndsAt, now: NOW,
  });
  strictEqual(r.honorsShift, true);
  strictEqual(r.expiresAt.getTime(), shiftEndsAt.getTime());
});

test('checked, no shift: a year out — not 30 days', () => {
  const r = resolveSessionExpiry({ deviceKind: 'personal', policy: 'default', persistent: true, now: NOW });
  strictEqual(r.expiresAt.getTime(), NOW + 365 * DAY);
  ok(r.expiresAt.getTime() > NOW + 30 * DAY, 'must outlive the old 30-day ceiling');
});

test('checked + active shift: shift end is IGNORED', () => {
  const shiftEndsAt = new Date(NOW + 1 * HOUR);
  const r = resolveSessionExpiry({
    deviceKind: 'station', policy: 'default', persistent: true, shiftEndsAt, now: NOW,
  });
  strictEqual(r.honorsShift, false, 'a shift-bound expiry would defeat the checkbox');
  strictEqual(r.expiresAt.getTime(), NOW + 365 * DAY);
});

test('per-staff persistent policy also ignores shift end (pre-existing behaviour)', () => {
  const r = resolveSessionExpiry({
    deviceKind: 'station', policy: 'persistent', persistent: false,
    shiftEndsAt: new Date(NOW + 1 * HOUR), now: NOW,
  });
  strictEqual(r.honorsShift, false);
  strictEqual(r.expiresAt.getTime(), NOW + 365 * DAY);
});

test('a shift that already ended is not honored', () => {
  const r = resolveSessionExpiry({
    deviceKind: 'station', policy: 'default', persistent: false,
    shiftEndsAt: new Date(NOW - 1 * HOUR), now: NOW,
  });
  strictEqual(r.honorsShift, false);
  strictEqual(r.expiresAt.getTime(), NOW + 24 * HOUR);
});

test('a shift ending after the absolute window does not extend it', () => {
  const r = resolveSessionExpiry({
    deviceKind: 'station', policy: 'default', persistent: false,
    shiftEndsAt: new Date(NOW + 40 * DAY), now: NOW,
  });
  strictEqual(r.honorsShift, true);
  strictEqual(r.expiresAt.getTime(), NOW + 24 * HOUR, 'min() of shift end and the device window');
});
