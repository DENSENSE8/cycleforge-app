/**
 *   npx tsx --test src/lib/composer/station-composer-mode.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('cycleStationComposerMode is a two-step ring', () => {
  assert.equal(cycleStationComposerMode('unbox'), 'ticket');
  assert.equal(cycleStationComposerMode('ticket'), 'unbox');
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
  assert.match(
    stationComposerModePlaceholder('ticket', { hasTicket: false }),
    /Create or link/i,
  );
});

test('Ctrl+Tab cycles; ⌥1/⌥2 jump; Shift+Tab is refused; bare Tab is not a mode hit', () => {
  assert.deepEqual(classifyStationComposerModeKey(key({ key: 'Tab', ctrlKey: true })), {
    kind: 'cycle',
  });
  assert.deepEqual(
    classifyStationComposerModeKey(key({ key: '1', code: 'Digit1', altKey: true })),
    { kind: 'jump', mode: 'unbox' },
  );
  assert.deepEqual(
    classifyStationComposerModeKey(key({ key: '™', code: 'Digit2', altKey: true })),
    { kind: 'jump', mode: 'ticket' },
  );
  assert.equal(
    classifyStationComposerModeKey(key({ key: '£', code: 'Digit3', altKey: true })),
    null,
  );
  assert.deepEqual(
    classifyStationComposerModeKey(key({ key: 'Tab', shiftKey: true })),
    { kind: 'refuse-shift-tab' },
  );
  assert.equal(classifyStationComposerModeKey(key({ key: 'Tab' })), null);
  assert.equal(
    classifyStationComposerModeKey(key({ key: 'Tab', shiftKey: true, ctrlKey: true })),
    null,
  );
});
