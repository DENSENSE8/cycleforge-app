import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportFollowUpDueNote } from './conversation/follow-up-due-core';
import { inboxContactFace, inboxContactsLine } from '@/lib/notifications/inbox-contacts';
import { taskAlertContacts } from '@/lib/tasks/task-alerts';

const RELAY = 'a1b2c3d4e5f6@members.ebay.com';

test('a relay requester: the follow-up-due note and the inbox contact chip print the label, never the address', () => {
  const note = supportFollowUpDueNote({
    supportItemId: 595,
    subject: `Speaker dead — reply to ${RELAY}`,
    requester: { name: null, email: RELAY, handle: 'buyer_jo' },
  });
  assert.ok(!note.includes('@members.ebay.com'), note);
  assert.ok(!/Ticket/.test(note), note);
  assert.equal(note, 'Follow-up due · Speaker dead — reply to eBay relay email · buyer_jo · eBay relay email');

  const contacts = taskAlertContacts({
    anchorTicketNumber: null,
    links: [],
    emailRefs: [],
    supportItem: { id: 595, requesterEmail: RELAY, mailbox: 'MEKONG', orders: [] },
  });
  assert.equal(contacts[0]?.kind === 'email' ? contacts[0].address : null, RELAY, 'the payload keeps the routing address');
  const chip = inboxContactFace(contacts[0]!, 'desk');
  assert.ok(!chip.text.includes('@members.ebay.com'), chip.text);
  assert.ok(chip.text.startsWith('eBay relay email'), chip.text);
  assert.equal(chip.href, null);
  assert.ok(!inboxContactsLine(contacts)!.includes('@members.ebay.com'));
});
