import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTicketIdQuery,
  resolveTicketIdForLink,
  type TicketLinkCandidate,
} from '@/lib/support/ticket-link-query';

describe('parseTicketIdQuery', () => {
  it('parses bare and hashed ticket ids', () => {
    assert.equal(parseTicketIdQuery('4821'), 4821);
    assert.equal(parseTicketIdQuery('#4821'), 4821);
    assert.equal(parseTicketIdQuery('  #99  '), 99);
  });

  it('rejects non-id queries', () => {
    assert.equal(parseTicketIdQuery(''), null);
    assert.equal(parseTicketIdQuery('buyer@example.com'), null);
    assert.equal(parseTicketIdQuery('#abc'), null);
    assert.equal(parseTicketIdQuery('order 4821'), null);
  });
});

describe('resolveTicketIdForLink', () => {
  const rows: TicketLinkCandidate[] = [
    { id: 100, subject: 'A', status: 'open', linkedToThis: false },
    { id: 200, subject: 'B', status: 'open', linkedToThis: true },
    { id: 4821, subject: 'Exact', status: 'open', linkedToThis: false },
  ];

  it('prefers exact unlinked match', () => {
    assert.equal(resolveTicketIdForLink('#4821', rows), 4821);
  });

  it('links bare id when candidates empty (paste-before-search)', () => {
    assert.equal(resolveTicketIdForLink('9395', []), 9395);
  });

  it('uses sole unlinked candidate when id search returns one', () => {
    assert.equal(
      resolveTicketIdForLink('100', [
        { id: 100, subject: 'Only', status: 'open', linkedToThis: false },
      ]),
      100,
    );
  });

  it('returns null for non-id query', () => {
    assert.equal(resolveTicketIdForLink('buyer email', rows), null);
  });
});
