/** The phone task list's ticket-status filter: the task match the chip counts share. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { taskMatchesTicketStatuses, ticketStatusCounts, type TicketStatusSource } from './ticket-status-filter';

const anchoredPending: TicketStatusSource = { ticket: { status: 'Pending' }, links: [] };
const linkedOpen: TicketStatusSource = {
  ticket: null,
  links: [
    { kind: 'order', label: '112-1' },
    { kind: 'ticket', label: '48120', status: 'open' },
  ],
};
const twoTickets: TicketStatusSource = { ticket: { status: 'new' }, links: [{ kind: 'ticket', label: '5', status: 'solved' }] };
const noTicket: TicketStatusSource = { ticket: null, links: [{ kind: 'tracking', label: '1Z' }] };

test('a task matches through its anchor ticket OR any linked ticket; several statuses OR together', () => {
  assert.equal(taskMatchesTicketStatuses(anchoredPending, ['pending']), true);
  assert.equal(taskMatchesTicketStatuses(linkedOpen, ['open']), true, 'a linked ticket carries the status too');
  assert.equal(taskMatchesTicketStatuses(linkedOpen, ['pending']), false);
  assert.equal(taskMatchesTicketStatuses(linkedOpen, ['pending', 'open']), true);
  assert.equal(taskMatchesTicketStatuses(twoTickets, ['solved']), true);
  assert.equal(taskMatchesTicketStatuses(noTicket, ['open']), false, 'no ticket, no status');
  assert.equal(taskMatchesTicketStatuses(noTicket, []), true, 'an empty filter keeps everything');
});

test('each chip counts the tasks tapping it alone keeps — a two-ticket task counts under both', () => {
  const counts = ticketStatusCounts([anchoredPending, linkedOpen, twoTickets, noTicket]);
  assert.deepEqual(counts, { new: 1, open: 1, pending: 1, hold: 0, solved: 1, closed: 0 });
});
