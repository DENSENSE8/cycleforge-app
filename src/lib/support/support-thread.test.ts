import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSupportThread, type SupportThreadComment } from './support-thread';

const CUSTOMER = 501;
const AGENT = 900;

function comment(over: Partial<SupportThreadComment>): SupportThreadComment {
  return { author_id: CUSTOMER, body: '', public: true, ...over };
}

test('answers the LATEST customer message, never our own reply or an internal note', () => {
  const read = readSupportThread({
    comments: [
      comment({ body: 'My Wave radio says No Disc.' }),
      comment({ author_id: AGENT, body: 'Try a cleaning disc.', author_is_agent: true }),
      comment({ body: 'Did that, still No Disc.' }),
      comment({ author_id: AGENT, body: 'laser looks weak, offer repair', public: false }),
      comment({ author_id: AGENT, body: 'Looking into it.', author_staff_id: 3 }),
    ],
    agentIds: [AGENT],
    requesterEmail: 'pat@example.com',
    tags: [],
  });
  assert.equal(read.supportOriented, true);
  if (!read.supportOriented) return;
  assert.equal(read.source, 'customer');
  assert.equal(read.customerMessage, 'Did that, still No Disc.');
  assert.deepEqual(
    read.thread.map((m) => m.role),
    ['customer', 'agent', 'customer', 'agent'],
  );
  assert.equal(read.thread.some((m) => m.text.includes('laser looks weak')), false);
});

/** The common shape in the mirror: staff open the case after a call / walk-in and log it publicly. */
test('a staff-logged case under a support tag drafts from the log', () => {
  const read = readSupportThread({
    comments: [
      comment({ author_id: AGENT, body: 'Companion 3 Series II - Stopped working $168' }),
      comment({ author_id: AGENT, body: 'title standardized', public: false }),
      comment({ author_id: AGENT, body: 'Sang repaired it today' }),
    ],
    agentIds: [AGENT],
    requesterEmail: 'shop@example.com',
    tags: ['customer_support', 'designated_michael'],
  });
  assert.equal(read.supportOriented, true);
  if (!read.supportOriented) return;
  assert.equal(read.source, 'staff_log');
  assert.equal(read.customerMessage, '');
  assert.deepEqual(read.thread.map((m) => m.text), ['Companion 3 Series II - Stopped working $168', 'Sang repaired it today']);
});

test('staff-only comments with no support tag are not a customer conversation', () => {
  const read = readSupportThread({
    comments: [comment({ author_id: AGENT, body: 'Moved to shelf B4.' })],
    agentIds: [AGENT],
    requesterEmail: null,
    tags: ['designated_lien'],
  });
  assert.equal(read.supportOriented, false);
  if (read.supportOriented) return;
  assert.equal(read.reason, 'no_customer_message');
});

test('operations tickets are refused even when an outside party wrote in', () => {
  for (const tags of [['receiving_claim', 'claim_vendor_defect'], ['claim_return'], ['trade_in']]) {
    const read = readSupportThread({
      comments: [comment({ body: 'Vendor here — we approved the return.' })],
      agentIds: [AGENT],
      requesterEmail: 'vendor@example.com',
      tags,
    });
    assert.equal(read.supportOriented, false, tags.join());
    if (read.supportOriented) continue;
    assert.equal(read.reason, 'operations_ticket');
  }
});

test('an automated sender is not a customer, whatever it wrote', () => {
  for (const email of ['noreply@ebay.com', 'no-reply@amazon.com', 'MAILER-DAEMON@mx.example', 'notifications@shop.example']) {
    const read = readSupportThread({
      comments: [comment({ body: 'Your item has shipped.' })],
      agentIds: [],
      requesterEmail: email,
      tags: ['customer_support'],
    });
    assert.equal(read.supportOriented, false, email);
  }
  // A human whose address merely starts like one is still a customer.
  const human = readSupportThread({
    comments: [comment({ body: 'Where is my order?' })],
    agentIds: [],
    requesterEmail: 'noreen.replyford@example.com',
    tags: [],
  });
  assert.equal(human.supportOriented, true);
});

test('plain_body wins over body; empty public comments are not turns', () => {
  const read = readSupportThread({
    comments: [
      comment({ body: '<p>Hi</p>', plain_body: 'Hi, is it covered?' }),
      comment({ body: '   ' }),
    ],
    agentIds: [],
    requesterEmail: 'pat@example.com',
    tags: [],
  });
  assert.equal(read.supportOriented, true);
  if (!read.supportOriented) return;
  assert.equal(read.customerMessage, 'Hi, is it covered?');
  assert.equal(read.thread.length, 1);
});
