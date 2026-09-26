/**
 * The number every repair paperwork mount states (Review & sign sheets and the
 * Paperwork panel). A LINKED ticket is a fact — `ATTACH_TICKET` stamps it onto
 * `repair_service.ticket_number` — so it must outrank the projection, or the
 * sheet the customer signs disagrees with the paper that prints.
 *
 *   npx tsx --test src/lib/kiosk/use-next-ticket-preview.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { paperworkTicketNumber } from './use-next-ticket-preview';

test('an attached ticket outranks the projection', () => {
  const attach = { mode: 'attach' as const, ticketId: 9998, ticketLabel: '#9998' };
  assert.equal(paperworkTicketNumber(attach, 10066), 9998);
});

test('a new ticket (or no choice yet) states the projection, or nothing', () => {
  assert.equal(paperworkTicketNumber({ mode: 'create' }, 10066), 10066);
  assert.equal(paperworkTicketNumber(null, 10066), 10066);
  assert.equal(paperworkTicketNumber(null, null), null);
});
