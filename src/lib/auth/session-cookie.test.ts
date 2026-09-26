/** Session-cookie dual-read (cf_sid ↔ legacy usav_sid). */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  readSessionCookie,
  readSessionSid,
  readV1BearerSid,
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

function headers(authorization?: string) {
  return { get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization ?? null : null) };
}

test('v1 bearer: read on /api/v1/* only — every other route stays cookie-only', () => {
  strictEqual(readV1BearerSid('/api/v1/reminders', headers('Bearer TOKEN')), 'TOKEN');
  strictEqual(readV1BearerSid('/api/staff', headers('Bearer TOKEN')), null);
  strictEqual(readV1BearerSid('/api/v1', headers('Bearer TOKEN')), null);
  strictEqual(readV1BearerSid('/api/v10/x', headers('Bearer TOKEN')), null);
});

test('v1 bearer: only a single well-formed Bearer credential counts', () => {
  strictEqual(readV1BearerSid('/api/v1/session', headers('bearer TOKEN')), 'TOKEN');
  strictEqual(readV1BearerSid('/api/v1/session', headers('Basic TOKEN')), null);
  strictEqual(readV1BearerSid('/api/v1/session', headers('Bearer ')), null);
  strictEqual(readV1BearerSid('/api/v1/session', headers('Bearer A B')), null);
  strictEqual(readV1BearerSid('/api/v1/session', headers()), null);
});
