/** The task desk's ticket-status filter: the API's strict parser, the board's lenient one, and the task match the chip counts share. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTicketStatusParam,
  parseTicketStatusQuery,
  taskMatchesTicketStatuses,
  ticketStatusCounts,
  ticketStatusParam,
  type TicketStatusSource,
} from './ticket-status-filter';

test('absent or blank ticketStatus means no filter at all', () => {
  assert.deepEqual(parseTicketStatusQuery(undefined), { ok: true, statuses: null });
  assert.deepEqual(parseTicketStatusQuery(''), { ok: true, statuses: null });
  assert.deepEqual(parseTicketStatusQuery(' , '), { ok: true, statuses: null });
});

test('a multi-select is case-insensitive, deduped and in vocabulary order', () => {
  assert.deepEqual(parseTicketStatusQuery('Pending, open,NEW,open'), { ok: true, statuses: ['new', 'open', 'pending'] });
});

test('one unknown value refuses the whole query and names it', () => {
  assert.deepEqual(parseTicketStatusQuery('open,waiting,pendng'), { ok: false, unknown: ['waiting', 'pendng'] });
});

test('the board URL keeps the statuses it spells right and round-trips canonically', () => {
  assert.deepEqual(parseTicketStatusParam('solved,bogus,New'), ['new', 'solved']);
  assert.deepEqual(parseTicketStatusParam(null), []);
  assert.equal(ticketStatusParam(['pending', 'new', 'pending']), 'new,pending');
  assert.equal(ticketStatusParam([]), null, 'an empty set leaves the URL');
});

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
