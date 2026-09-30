import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  emailRefFromPaste,
  emailRefNumberPatch,
  ingestEmailReference,
  mergeTaskEmailRefPatch,
  normalizeTaskEmailRef,
  taskEmailMailboxes,
} from './task-email-refs';

const MAILBOXES = taskEmailMailboxes('info@usavsolutions.com', []);

test('the vocabulary is the four house channels on the letterhead domain, then what the org already used', () => {
  assert.deepEqual(MAILBOXES, [
    'sales@usavsolutions.com',
    'technical@usavsolutions.com',
    'info@usavsolutions.com',
    'hi@usavsolutions.com',
  ]);
  // No letterhead domain → bare channel names; a used full address that repeats a channel is kept once.
  assert.deepEqual(taskEmailMailboxes('', ['Returns@Shop.com', 'sales', 'hi@']), [
    'sales',
    'technical',
    'info',
    'hi',
    'returns@shop.com',
  ]);
  assert.deepEqual(taskEmailMailboxes('info@usavsolutions.com', ['sales', 'support@usavsolutions.com']).slice(4), [
    'support@usavsolutions.com',
  ]);
});

test('a raw header paste yields the customer and the inbound mailbox, never a staff address', () => {
  const raw = [
    'Delivered-To: michael@usavsolutions.com',
    'From: "Dana Ruiz" <Dana.Ruiz@gmail.com>',
    'To: Technical <technical@usavsolutions.com>',
    'Subject: Re: Order #113-2839-4471 speaker crackles',
  ].join('\n');
  assert.deepEqual(ingestEmailReference(raw, MAILBOXES), {
    customerEmail: 'dana.ruiz@gmail.com',
    mailbox: 'technical@usavsolutions.com',
    subject: 'Order #113-2839-4471 speaker crackles',
    orderNumber: '113-2839-4471',
  });
});

test('a forwarded email names the customer from the inner block and the mailbox the customer wrote to', () => {
  const raw = [
    'From: Michael <michael@usavsolutions.com>',
    'To: kim@usavsolutions.com',
    'Subject: Fwd: Question before I buy',
    '',
    '---------- Forwarded message ---------',
    'From: Lee Park <lee.park@outlook.com>',
    'Date: Mon, Sep 28, 2026 at 4:12 PM',
    'Subject: Question before I buy',
    'To: <hi@usavsolutions.com>',
  ].join('\n');
  const got = ingestEmailReference(raw, MAILBOXES);
  assert.equal(got.customerEmail, 'lee.park@outlook.com');
  assert.equal(got.mailbox, 'hi@usavsolutions.com');
  assert.equal(got.subject, 'Question before I buy');
  // No order yet → no order number; the operator records a reference instead.
  assert.equal(got.orderNumber, null);
});

test('Outlook bold headers and folded lines parse; an unknown org mailbox falls back to the one the customer wrote to', () => {
  const raw = [
    '**From:** Sam Otto <sam@otto-audio.de>',
    '**Sent:** Monday, September 28, 2026 9:02 AM',
    '**To:** Returns Desk',
    '   <returns@usavsolutions.com>',
    '**Subject:** RMA for order no. 55120',
  ].join('\n');
  assert.deepEqual(ingestEmailReference(raw, MAILBOXES), {
    customerEmail: 'sam@otto-audio.de',
    mailbox: 'returns@usavsolutions.com',
    subject: 'RMA for order no. 55120',
    orderNumber: '55120',
  });
});

test('Reply-To names the customer only when no From is from outside the org', () => {
  const raw = ['From: sales@usavsolutions.com', 'Reply-To: buyer@example.com', 'To: sales@usavsolutions.com'].join('\n');
  const got = ingestEmailReference(raw, MAILBOXES);
  assert.equal(got.customerEmail, 'buyer@example.com');
  assert.equal(got.mailbox, 'sales@usavsolutions.com');
});

test('a bare paste of addresses still ingests; with no org domain the channel matches by name', () => {
  assert.deepEqual(ingestEmailReference('buyer@example.com wrote to info@usavsolutions.com', MAILBOXES), {
    customerEmail: 'buyer@example.com',
    mailbox: 'info@usavsolutions.com',
    subject: null,
    orderNumber: null,
  });
  const bare = taskEmailMailboxes('', []);
  const got = ingestEmailReference('From: buyer@example.com\nTo: sales@shop.io', bare);
  assert.equal(got.customerEmail, 'buyer@example.com');
  assert.equal(got.mailbox, 'sales@shop.io');
  // Nothing recognisable → every fact null for the operator to fill.
  assert.deepEqual(ingestEmailReference('call me back', MAILBOXES), {
    customerEmail: null,
    mailbox: null,
    subject: null,
    orderNumber: null,
  });
});

test('the normaliser lower-cases addresses, folds blanks to null and refuses both numbers at once', () => {
  assert.deepEqual(
    normalizeTaskEmailRef({ customerEmail: ' <Dana@Gmail.com> ', mailbox: 'Sales@', orderNumber: '  ', referenceNumber: 'REF-12' }),
    {
      ok: true,
      value: { customerEmail: 'dana@gmail.com', mailbox: 'sales', orderNumber: null, referenceNumber: 'REF-12', subject: null },
    },
  );
  assert.deepEqual(normalizeTaskEmailRef({ customerEmail: 'dana', mailbox: 'sales' }), {
    ok: false,
    reason: 'invalid_customer_email',
  });
  assert.deepEqual(normalizeTaskEmailRef({ customerEmail: 'd@x.com', mailbox: 'sales team' }), {
    ok: false,
    reason: 'invalid_mailbox',
  });
  assert.deepEqual(normalizeTaskEmailRef({ customerEmail: 'd@x.com', mailbox: 'hi', orderNumber: '1', referenceNumber: '2' }), {
    ok: false,
    reason: 'both_numbers',
  });
});

test('a patch keeps omitted facts and clears the ones sent as null — switching order → reference in one write', () => {
  const before = { customerEmail: 'd@x.com', mailbox: 'sales', orderNumber: '5512', referenceNumber: null, subject: 'Hi' };
  const merged = mergeTaskEmailRefPatch(before, { orderNumber: null, referenceNumber: 'R-9' });
  assert.deepEqual(normalizeTaskEmailRef(merged), {
    ok: true,
    value: { customerEmail: 'd@x.com', mailbox: 'sales', orderNumber: null, referenceNumber: 'R-9', subject: 'Hi' },
  });
});

test('a Links paste: a bare "Name <address>" makes a reference on the first channel; headers name the mailbox and the order', () => {
  assert.deepEqual(emailRefFromPaste('Customer <customer@example.com>', MAILBOXES), {
    customerEmail: 'customer@example.com',
    mailbox: 'sales@usavsolutions.com',
    orderNumber: null,
    referenceNumber: null,
    subject: null,
  });
  const headers = 'From: Dana <dana@gmail.com>\nTo: technical@usavsolutions.com\nSubject: Re: Order #113-2839 speaker crackles';
  assert.deepEqual(emailRefFromPaste(headers, MAILBOXES), {
    customerEmail: 'dana@gmail.com',
    mailbox: 'technical@usavsolutions.com',
    orderNumber: '113-2839',
    referenceNumber: null,
    subject: 'Order #113-2839 speaker crackles',
  });
  // Only the org's own address, or no address at all: nothing to link.
  assert.equal(emailRefFromPaste('sales@usavsolutions.com', MAILBOXES), null);
  assert.equal(emailRefFromPaste('1Z999AA10123456784', MAILBOXES), null);
});

test('the row number field: "Ref X" is a reference, anything else an order, blank clears — never both', () => {
  assert.deepEqual(emailRefNumberPatch('12345'), { orderNumber: '12345', referenceNumber: null });
  assert.deepEqual(emailRefNumberPatch(' Order #12345 '), { orderNumber: '12345', referenceNumber: null });
  assert.deepEqual(emailRefNumberPatch('Ref A-7'), { orderNumber: null, referenceNumber: 'A-7' });
  assert.deepEqual(emailRefNumberPatch('reference: Q3'), { orderNumber: null, referenceNumber: 'Q3' });
  assert.deepEqual(emailRefNumberPatch('Refurb-12'), { orderNumber: 'Refurb-12', referenceNumber: null });
  assert.deepEqual(emailRefNumberPatch('   '), { orderNumber: null, referenceNumber: null });
});
