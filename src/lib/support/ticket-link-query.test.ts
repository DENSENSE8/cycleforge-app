import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTicketIdQuery,
  resolveTicketIdForLink,
  resolveTicketLinkQueryKind,
  ticketLinkResultsEyebrow,
  type TicketLinkCandidate,
} from '@/lib/support/ticket-link-query';

describe('resolveTicketLinkQueryKind', () => {
  it('empty → recent', () => {
    assert.deepEqual(resolveTicketLinkQueryKind(''), { kind: 'recent' });
    assert.deepEqual(resolveTicketLinkQueryKind('   '), { kind: 'recent' });
  });

  it('#id → id lookup', () => {
    assert.deepEqual(resolveTicketLinkQueryKind('#4821'), { kind: 'id', ticketId: 4821 });
  });

  it('short bare digits (Unknown carrier) → id lookup', () => {
    assert.deepEqual(resolveTicketLinkQueryKind('4821'), { kind: 'id', ticketId: 4821 });
  });

  it('12-digit FedEx-shaped → search (not getTicket)', () => {
    // Documented FedEx Express STN used in TicketLinkPopover / prior regression.
    const fedex = '382803670296';
    assert.deepEqual(resolveTicketLinkQueryKind(fedex), { kind: 'search', query: fedex });
  });

  it('UPS 1Z… → search', () => {
    const ups = '1Z999AA10123456784';
    assert.deepEqual(resolveTicketLinkQueryKind(ups), { kind: 'search', query: ups });
  });

  it('free text → search', () => {
    assert.deepEqual(resolveTicketLinkQueryKind('return claim'), {
      kind: 'search',
      query: 'return claim',
    });
  });
});

describe('parseTicketIdQuery', () => {
  it('parses bare and hashed ticket ids', () => {
    assert.equal(parseTicketIdQuery('4821'), 4821);
    assert.equal(parseTicketIdQuery('#4821'), 4821);
    assert.equal(parseTicketIdQuery('  #99  '), 99);
  });

  it('rejects non-id queries including carrier tracking', () => {
    assert.equal(parseTicketIdQuery(''), null);
    assert.equal(parseTicketIdQuery('buyer@example.com'), null);
    assert.equal(parseTicketIdQuery('#abc'), null);
    assert.equal(parseTicketIdQuery('order 4821'), null);
    assert.equal(parseTicketIdQuery('382803670296'), null);
    assert.equal(parseTicketIdQuery('1Z999AA10123456784'), null);
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

  // Regression: seeded FedEx tracking must never parse as a ticket id (Enter
  // must not link an unrelated search hit / invent getTicket(fedexDigits)).
  it('never treats carrier tracking as a ticket id', () => {
    const unrelated: TicketLinkCandidate[] = [
      { id: 777, subject: 'Unrelated', status: 'open', linkedToThis: false },
    ];
    assert.equal(resolveTicketIdForLink('382803670296', unrelated), null);
    assert.equal(resolveTicketIdForLink('#4821', unrelated), 4821);
  });
});

describe('ticketLinkResultsEyebrow', () => {
  it('empty is Recent tickets', () => {
    assert.equal(ticketLinkResultsEyebrow('', ''), 'Recent tickets');
    assert.equal(ticketLinkResultsEyebrow('  ', '382803670296'), 'Recent tickets');
  });

  it('untouched tracking seed is Suggested from tracking', () => {
    assert.equal(
      ticketLinkResultsEyebrow('382803670296', '382803670296'),
      'Suggested from tracking',
    );
  });

  it('edited query is Results', () => {
    assert.equal(ticketLinkResultsEyebrow('#4821', '382803670296'), 'Results');
    assert.equal(ticketLinkResultsEyebrow('return', ''), 'Results');
  });
});
