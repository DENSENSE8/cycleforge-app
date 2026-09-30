import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ZendeskComment } from '@/lib/zendesk';
import {
  agentsFromUsers,
  commentToMirrorRow,
  enrichMirrorComments,
  isTicketMirrorFresh,
  mirrorRowToComment,
  pageMirrorComments,
  TICKET_MIRROR_FRESH_MS,
  type MirrorUserRow,
} from './ticket-mirror-core';
import { staffHitsByEmail, staffHitsByName } from '@/lib/integrations/helpdesk/comment-staff-identity';

function zendeskComment(over: Partial<ZendeskComment> = {}): ZendeskComment {
  return {
    id: 44459189251341,
    type: 'Comment',
    author_id: 401556717732,
    body: 'Box crushed on arrival\n\n— Kai',
    html_body: '<div class="zd-comment"><p>Box crushed on arrival</p></div>',
    plain_body: 'Box crushed on arrival — Kai',
    public: false,
    attachments: [{ id: 9, file_name: 'a.jpg', content_url: 'https://z/a.jpg' }],
    audit_id: 44459189251300,
    via: { channel: 'api', source: { from: {}, to: {}, rel: null } },
    metadata: { system: { client: 'node' }, custom: {} },
    created_at: '2026-09-29T22:14:45Z',
    ...over,
  };
}

test('a provider comment survives the mirror row round trip unchanged (incl. through JSON)', () => {
  const original = zendeskComment({ some_future_key: { nested: true } });
  const row = JSON.parse(JSON.stringify(commentToMirrorRow(original)));
  assert.deepEqual(mirrorRowToComment(row), original);
  assert.deepEqual(row.extra, { some_future_key: { nested: true } });
});

test('a comment missing optional provider fields maps to a storable row', () => {
  const row = commentToMirrorRow({
    id: 5,
    author_id: -1,
    body: 'system note',
    public: true,
    created_at: '2026-09-29T00:00:00Z',
  });
  assert.equal(row.is_public, true);
  assert.deepEqual(row.attachments, []);
  assert.equal(row.html_body, null);
  assert.equal(row.audit_id, null);
  assert.equal(row.author_zendesk_user_id, -1);
});

test('mirror freshness: fresh inside the window, stale at/after it, never-mirrored is stale', () => {
  const at = '2026-09-29T12:00:00.000Z';
  const t0 = Date.parse(at);
  assert.equal(isTicketMirrorFresh(at, t0 + TICKET_MIRROR_FRESH_MS - 1), true);
  assert.equal(isTicketMirrorFresh(at, t0 + TICKET_MIRROR_FRESH_MS), false);
  assert.equal(isTicketMirrorFresh(null, t0), false);
  assert.equal(isTicketMirrorFresh('not a date', t0), false);
});

const users: MirrorUserRow[] = [
  { zendesk_user_id: 7, name: 'Buyer', email: 'buyer@x.example', photo_url: null, role: 'end-user' },
  { zendesk_user_id: 3, name: 'Manager', email: 'mgr@x.example', photo_url: 'https://p', role: 'admin' },
  { zendesk_user_id: 2, name: null, email: null, photo_url: null, role: 'agent' },
];

test('agents come from cached users with an agent/admin role, in id order', () => {
  assert.deepEqual(agentsFromUsers(users), [
    { id: 2, name: 'Agent', email: null, role: 'agent', photo: null },
    { id: 3, name: 'Manager', email: 'mgr@x.example', role: 'admin', photo: 'https://p' },
  ]);
});

test('enrichment: helpdesk identity first, then the recorded staff post wins over it', () => {
  const comments = [
    zendeskComment({ id: 1, author_id: 7, body: 'Where is my refund?' }),
    zendeskComment({ id: 2, author_id: 3, body: 'On it' }),
    zendeskComment({ id: 3, author_id: 999, body: 'unknown author' }),
  ];
  const out = enrichMirrorComments(comments, {
    users,
    byCommentId: new Map([[2, { staffId: 11, name: 'Kai' }]]),
    byEmail: new Map(),
    byName: new Map(),
  });
  assert.equal(out[0].author_name, 'Buyer');
  assert.equal(out[0].author_is_agent, false);
  assert.equal(out[1].author_is_agent, true);
  assert.equal(out[1].author_name, 'Kai');
  assert.equal(out[1].author_staff_id, 11);
  assert.equal(out[1].author_photo, null);
  assert.deepEqual(out[2], comments[2]);
});

test('paging: no params returns the whole thread; pages link forward until the end', () => {
  const thread = [1, 2, 3].map((id) => zendeskComment({ id }));
  assert.deepEqual(pageMirrorComments(thread, { ticketId: 42 }), {
    comments: thread,
    count: 3,
    next_page: null,
  });
  const first = pageMirrorComments(thread, { ticketId: 42, page: 1, perPage: 2 });
  assert.deepEqual(first.comments.map((c) => c.id), [1, 2]);
  assert.equal(first.count, 3);
  assert.equal(first.next_page, '/api/zendesk/tickets/42/comments?page=2&perPage=2');
  const last = pageMirrorComments(thread, { ticketId: 42, page: 2, perPage: 2 });
  assert.deepEqual(last.comments.map((c) => c.id), [3]);
  assert.equal(last.next_page, null);
});

test('staff hits: a sign-off name two staff share is ambiguous and never attributed; first email wins', () => {
  const byName = staffHitsByName([
    { id: 1, name: 'Kai' },
    { id: 2, name: ' kai ' },
    { id: 3, name: 'Mel' },
  ]);
  assert.equal(byName.has('kai'), false);
  assert.deepEqual(byName.get('mel'), { staffId: 3, name: 'Mel' });
  const byEmail = staffHitsByEmail([
    { id: 4, name: 'A', email: 'Ops@X.example ' },
    { id: 5, name: 'B', email: 'ops@x.example' },
    { id: 6, name: 'C', email: null },
  ]);
  assert.deepEqual([...byEmail.entries()], [['ops@x.example', { staffId: 4, name: 'A' }]]);
});
