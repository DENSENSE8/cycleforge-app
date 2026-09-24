import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTicketThreadHandoff,
  TICKET_HANDOFF_MAX_PHOTOS,
  ticketThreadHandoffQuery,
} from './ticket-thread-handoff';

const parse = (query: string) => parseTicketThreadHandoff(new URLSearchParams(query));

test('a built handoff parses back to the same draft, photos and channel', () => {
  const query = ticketThreadHandoffQuery({
    draft: 'Hi Ana, photos attached — 50% done & on track',
    photoIds: [12, 34],
    visibility: 'internal',
  });
  assert.deepEqual(parse(query.slice(1)), {
    draft: 'Hi Ana, photos attached — 50% done & on track',
    photoIds: [12, 34],
    visibility: 'internal',
  });
});

test('nothing to hand over builds no query at all', () => {
  assert.equal(ticketThreadHandoffQuery({}), '');
  assert.equal(ticketThreadHandoffQuery({ photoIds: [0, -3] }), '');
});

test('bad, duplicate and non-integer photo ids are dropped, order kept', () => {
  assert.deepEqual(parse('photos=7,abc,,7,-1,0,3.5,9').photoIds, [7, 9]);
});

test('photo ids are capped so a URL cannot stage an unbounded batch', () => {
  const ids = Array.from({ length: TICKET_HANDOFF_MAX_PHOTOS + 5 }, (_, i) => i + 1);
  const parsed = parse(`photos=${ids.join(',')}`);
  assert.equal(parsed.photoIds.length, TICKET_HANDOFF_MAX_PHOTOS);
  assert.equal(parsed.photoIds[0], 1);
});

test('an unknown visibility leaves the composer on its own default', () => {
  assert.equal(parse('visibility=PUBLIC').visibility, undefined);
  assert.equal(parse('visibility=public').visibility, 'public');
});

test('no params (thread opened directly) is an empty handoff', () => {
  assert.deepEqual(parseTicketThreadHandoff(null), { draft: undefined, photoIds: [], visibility: undefined });
});
