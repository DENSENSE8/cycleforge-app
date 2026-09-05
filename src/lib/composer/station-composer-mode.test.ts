/**
 *   npx tsx --test src/lib/composer/station-composer-mode.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTicketThreadActivation,
  classifyStationComposerModeKey,
  cycleStationComposerMode,
  parseStationComposerMode,
  resolveStationComposerMode,
  stationComposerModeKeepsTrailingAction,
  stationComposerModePlaceholder,
} from './station-composer-mode';

function key(
  partial: Partial<
    Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>
  >,
) {
  return {
    key: 'a',
    code: 'KeyA',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...partial,
  };
}

test('parseStationComposerMode accepts live ids, aliases label→unbox, drops location', () => {
  assert.equal(parseStationComposerMode('unbox'), 'unbox');
  assert.equal(parseStationComposerMode('label'), 'unbox');
  assert.equal(parseStationComposerMode('TICKET'), 'ticket');
  assert.equal(parseStationComposerMode('location'), null);
  assert.equal(parseStationComposerMode(' ask '), 'ask');
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

test('cycleStationComposerMode is Unbox → Ticket → Ask', () => {
  assert.equal(cycleStationComposerMode('unbox'), 'ticket');
  assert.equal(cycleStationComposerMode('ticket'), 'ask');
  assert.equal(cycleStationComposerMode('ask'), 'unbox');
});

test('trailing Print·Receive stays on Unbox only', () => {
  assert.equal(stationComposerModeKeepsTrailingAction('unbox'), true);
  assert.equal(stationComposerModeKeepsTrailingAction('ticket'), false);
  assert.equal(stationComposerModeKeepsTrailingAction('ask'), true);
});

test('placeholder names the destination (I4)', () => {
  assert.match(stationComposerModePlaceholder('ask'), /operation/i);
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

test('Shift+Tab is the ONE toggle; nothing else is a mode hit', () => {
  // A keyboard-wedge scanner terminates with a BARE Tab and has no shift key,
  // so Shift+Tab was never in competition with it — the old refusal protected
  // the chord from a collision that could not happen (ruling 2026-08-31).
  assert.deepEqual(classifyStationComposerModeKey(key({ key: 'Tab', shiftKey: true })), {
    kind: 'cycle',
  });
  // Bare Tab stays the wedge terminator + ghost-autocomplete accept.
  assert.equal(classifyStationComposerModeKey(key({ key: 'Tab' })), null);
  // Ctrl+Tab is not ours: Chrome never dispatches it to the page.
  assert.equal(classifyStationComposerModeKey(key({ key: 'Tab', ctrlKey: true })), null);
  assert.equal(
    classifyStationComposerModeKey(key({ key: 'Tab', shiftKey: true, ctrlKey: true })),
    null,
  );
  // The ⌥1 / ⌥2 jumps were REMOVED — two modes need one key, not three.
  assert.equal(
    classifyStationComposerModeKey(key({ key: '1', code: 'Digit1', altKey: true })),
    null,
  );
  assert.equal(
    classifyStationComposerModeKey(key({ key: '™', code: 'Digit2', altKey: true })),
    null,
  );
});

test('touching the ticket thread hands the composer to Ticket mode AND focus', () => {
  assert.deepEqual(resolveTicketThreadActivation({ mode: 'unbox' }), {
    setTicketMode: true,
    focusComposer: true,
  });
});

test('already on Ticket: no redundant mode write, but STILL focus', () => {
  // The bug this splits apart: one `shouldActivate` boolean returned false
  // here — correctly refusing the redundant `router.replace` — and silently
  // took the focus with it, so clicking a message while already in Ticket mode
  // did nothing at all.
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
