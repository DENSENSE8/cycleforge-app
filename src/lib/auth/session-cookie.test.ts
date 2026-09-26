/** Session-cookie dual-read (cf_sid ↔ legacy usav_sid). */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  readSessionCookie,
  readSessionSid,
  SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
} from '@/lib/auth/session';

function store(map: Record<string, string>) {
  return { get: (name: string) => (name in map ? { value: map[name]! } : undefined) };
}

test('cookie names are the expected canonical + legacy values', () => {
  strictEqual(SESSION_COOKIE_NAME, 'cf_sid');
  strictEqual(LEGACY_SESSION_COOKIE_NAME, 'usav_sid');
});

test('prefers cf_sid when both present; reports legacy=false', () => {
  const r = readSessionCookie(store({ cf_sid: 'NEW', usav_sid: 'OLD' }));
  strictEqual(r.sid, 'NEW');
  strictEqual(r.legacy, false);
  strictEqual(readSessionSid(store({ cf_sid: 'NEW', usav_sid: 'OLD' })), 'NEW');
});

test('falls back to legacy usav_sid; reports legacy=true', () => {
  const r = readSessionCookie(store({ usav_sid: 'OLD' }));
  strictEqual(r.sid, 'OLD');
  strictEqual(r.legacy, true);
});

test('cf_sid alone → legacy=false', () => {
  const r = readSessionCookie(store({ cf_sid: 'NEW' }));
  strictEqual(r.sid, 'NEW');
  strictEqual(r.legacy, false);
});

test('neither cookie → null sid, legacy=false', () => {
  const r = readSessionCookie(store({}));
  strictEqual(r.sid, null);
  strictEqual(r.legacy, false);
  strictEqual(readSessionSid(store({})), null);
});
