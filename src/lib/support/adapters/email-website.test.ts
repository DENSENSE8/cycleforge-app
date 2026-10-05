import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import { mapSupportEmail, normalizeEmailMessageId, stripQuotedReply } from './email-message';
import { mapWebsiteContact } from './website-contact';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const MAILBOXES = ['Support@USAV.com'];

test('email: a customer reply threads on the root message and drops quoted history', () => {
  const draft = mapSupportEmail({
    orgId: ORG,
    mailboxes: MAILBOXES,
    email: {
      messageId: '<Reply-2@mail.example.com>',
      inReplyTo: '<reply-1@usav.com>',
      references: ['<Root@mail.example.com>', '<reply-1@usav.com>'],
      from: { email: 'Jo@Example.com', name: 'Jo Smith' },
      to: ['support@usav.com'],
      subject: 'Re: Broken remote',
      text: 'Still broken.\n\nOn Tue, Oct 1, 2026 at 9:00 AM Support <support@usav.com> wrote:\n> Try new batteries',
      receivedAt: '2026-10-02T09:00:00Z',
    },
  });
  assert.ok(draft);
  assert.equal(draft.direction, 'inbound');
  assert.equal(draft.channel, 'email');
  assert.equal(draft.body, 'Still broken.');
  assert.equal(draft.externalConversationId, 'email:root@mail.example.com');
  assert.equal(draft.externalMessageId, 'email:reply-2@mail.example.com');
  assert.deepEqual(draft.requester, { email: 'jo@example.com', name: 'Jo Smith' });
  assert.equal(draft.accountLabel, 'support@usav.com');
});

test('email: mail from our mailbox is outbound sent to the customer', () => {
  const draft = mapSupportEmail({
    orgId: ORG,
    mailboxes: MAILBOXES,
    email: {
      messageId: 'reply-1@usav.com',
      inReplyTo: 'root@mail.example.com',
      from: { email: 'support@usav.com' },
      to: ['support@usav.com', 'jo@example.com'],
      text: 'Try new batteries',
      receivedAt: '2026-10-01T09:00:00Z',
    },
  });
  assert.ok(draft);
  assert.equal(draft.direction, 'outbound');
  assert.equal(draft.delivery, 'sent');
  assert.equal(draft.externalConversationId, 'email:root@mail.example.com');
  assert.deepEqual(draft.requester, { email: 'jo@example.com', name: null });
});

test('email: empty body or missing id maps to nothing', () => {
  const base = { from: { email: 'a@b.co' }, to: ['support@usav.com'], receivedAt: '2026-10-01T00:00:00Z' };
  assert.equal(mapSupportEmail({ orgId: ORG, mailboxes: MAILBOXES, email: { ...base, messageId: 'x@y', text: '> only quote' } }), null);
  assert.equal(mapSupportEmail({ orgId: ORG, mailboxes: MAILBOXES, email: { ...base, messageId: ' <> ', text: 'hi' } }), null);
  assert.equal(normalizeEmailMessageId('<A@B>'), 'a@b');
  assert.equal(stripQuotedReply('a\n-----Original Message-----\nb'), 'a');
});

test('website: a submission is one inbound message on its own conversation, typed facts kept', () => {
  const draft = mapWebsiteContact({
    orgId: ORG,
    accountLabel: 'usav.com',
    submission: {
      submissionId: 'f-981',
      name: 'Jo',
      email: 'JO@example.com',
      phone: '555-123-4567',
      orderNumber: '#5043',
      message: 'Where is my order?',
      submittedAt: '2026-10-03T12:00:00Z',
    },
  });
  assert.ok(draft);
  assert.equal(draft.direction, 'inbound');
  assert.equal(draft.channel, 'website');
  assert.equal(draft.externalConversationId, 'website:f-981');
  assert.equal(draft.externalMessageId, 'website:f-981');
  assert.equal(draft.body, 'Where is my order?\n\nOrder number: #5043\nPhone: 555-123-4567');
  assert.deepEqual(draft.requester, { name: 'Jo', email: 'jo@example.com' });
  assert.equal(mapWebsiteContact({ orgId: ORG, submission: { submissionId: 'x', message: '  ', submittedAt: '' } }), null);
});
