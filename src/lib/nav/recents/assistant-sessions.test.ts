import test from 'node:test';
import assert from 'node:assert/strict';
import { NavRecentRowSchema } from '@/lib/nav/context/schema';
import { assistantSessionRecentRow } from './assistant-sessions';

test('a chat thread maps to a valid recents row that reopens it', () => {
  const row = assistantSessionRecentRow({ id: 'a1b2', title: 'Fix label printer', updatedAt: '2026-09-27T10:00:00.000Z' });
  assert.deepEqual(NavRecentRowSchema.parse(row), {
    id: 'assistant_session:a1b2',
    entityType: 'assistant_session',
    entityId: 'a1b2',
    title: 'Fix label printer',
    subtitle: null,
    status: null,
    at: '2026-09-27T10:00:00.000Z',
    href: '/ai-chat?session=a1b2',
  });
});

test('an untitled thread reads "New conversation", and an odd id cannot break out of its param', () => {
  const row = assistantSessionRecentRow({ id: 'a&b=c', title: null, updatedAt: '2026-09-27T10:00:00.000Z' });
  assert.equal(row.title, 'New conversation');
  assert.equal(new URL(row.href, 'http://t').searchParams.get('session'), 'a&b=c');
  assert.equal(NavRecentRowSchema.safeParse(row).success, true);
});
