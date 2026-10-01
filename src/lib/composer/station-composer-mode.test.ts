/**
 *   npx tsx --test src/lib/composer/station-composer-mode.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTicketThreadActivation,
  parseStationComposerMode,
  resolveStationComposerMode,
  stationComposerModeKeepsTrailingAction,
  stationComposerModePlaceholder,
} from './station-composer-mode';


test('parseStationComposerMode accepts live ids, aliases label→unbox, drops location', () => {
  assert.equal(parseStationComposerMode('unbox'), 'unbox');
  assert.equal(parseStationComposerMode('label'), 'unbox');
  assert.equal(parseStationComposerMode('TICKET'), 'ticket');
  assert.equal(parseStationComposerMode('location'), null);
  assert.equal(parseStationComposerMode(' ask '), null);
  assert.equal(parseStationComposerMode(''), null);
  assert.equal(parseStationComposerMode(null), null);
});

test('resolveStationComposerMode: URL wins, then session, then Unbox', () => {
  assert.equal(resolveStationComposerMode('ticket', 'unbox'), 'ticket');
  assert.equal(resolveStationComposerMode(null, 'ticket'), 'ticket');
  assert.equal(resolveStationComposerMode('nope', 'ticket'), 'ticket');
  assert.equal(resolveStationComposerMode(null, null), 'unbox');
  assert.equal(resolveStationComposerMode('label', null), 'unbox');
});


test('trailing Print·Receive stays on Unbox only', () => {
  assert.equal(stationComposerModeKeepsTrailingAction('unbox'), true);
  assert.equal(stationComposerModeKeepsTrailingAction('ticket'), false);
});

test('placeholder names the destination (I4)', () => {
  assert.match(stationComposerModePlaceholder('unbox'), /sticker/i);
  assert.match(
    stationComposerModePlaceholder('ticket', { hasTicket: true, ticketLabel: '#2231' }),
    /#2231/,
  );
  // Unlinked used to read "Create or link a ticket above" — a pointer at the
  // claim form that mounted over the dock. That form is gone (2026-08-30): the
  // field itself is the claim body now, so the destination it names is filing.
  assert.match(
    stationComposerModePlaceholder('ticket', { hasTicket: false }),
    /file the ticket/i,
  );
});


test('touching the ticket thread hands the composer to Ticket mode AND focus', () => {
  assert.deepEqual(resolveTicketThreadActivation({ mode: 'unbox' }), {
    setTicketMode: true,
    focusComposer: true,
  });
});

test('already on Ticket: no redundant mode write, but STILL focus', () => {
  // The bug this splits apart:
  assert.deepEqual(resolveTicketThreadActivation({ mode: 'ticket' }), {
    setTicketMode: false,
    focusComposer: true,
  });
});

test('a live selection refuses BOTH — reading is not composing', () => {
  for (const mode of ['unbox', 'ticket'] as const) {
    assert.deepEqual(
      resolveTicketThreadActivation({ mode, hasTextSelection: true }),
      { setTicketMode: false, focusComposer: false },
      `${mode}: dragging across a serial must not move the caret`,
    );
  }
});
