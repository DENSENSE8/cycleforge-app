/**
 * The visit's ticket decision — what the step gate counts and what the submit
 * posts.
 *
 * Three invariants are worth a test here and the rest is plumbing:
 *
 * 1. **COMPLETE vs SETTLED.** The slider auto-selects Create, so an untouched
 *    choice must not block a signed drop-off — while a half-finished link
 *    (slid to Link, nothing picked) must.
 * 2. **A signed drop-off never loses its conversation.** Whatever the UI does,
 *    a service visit posts `create` unless a real ticket id was picked — the
 *    fallback exists so this decision can never become a way to file a repair
 *    with no helpdesk row behind it.
 * 3. **A retail-only visit asks for no ticket work at all.**
 *
 *   npx tsx --test src/lib/kiosk/repair-ticket-choice.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isKioskTicketChoiceComplete,
  isKioskTicketChoiceSettled,
  kioskTicketChoiceLabel,
  kioskTicketWork,
  type KioskTicketChoice,
} from './repair-ticket-choice';

test('nobody has answered yet: not complete, and nothing to state', () => {
  assert.equal(isKioskTicketChoiceComplete(null), false);
  assert.equal(kioskTicketChoiceLabel(null), null);
});

/**
 * SETTLED is the gate's reading and it differs from COMPLETE in exactly one
 * place. Operator 2026-09-15: *"automatically select create new ticket"* — so
 * an untouched slider is an answer (a new ticket), and the only state that may
 * block a signed drop-off is the half-finished one: slid to Link, nothing
 * picked. If `null` blocked, the default position would refuse its own default.
 */
test('an untouched choice is settled; a half-finished link is not', () => {
  assert.equal(isKioskTicketChoiceSettled(null), true);
  assert.equal(isKioskTicketChoiceSettled({ mode: 'create' }), true);
  assert.equal(
    isKioskTicketChoiceSettled({ mode: 'attach', ticketId: 0, ticketLabel: '' }),
    false,
  );
  assert.equal(
    isKioskTicketChoiceSettled({ mode: 'attach', ticketId: 9001, ticketLabel: '#9001' }),
    true,
  );
  // And the two readings agree everywhere except `null`.
  assert.equal(isKioskTicketChoiceComplete(null) === isKioskTicketChoiceSettled(null), false);
});

test('create is an answer on its own; attach needs a real ticket', () => {
  assert.equal(isKioskTicketChoiceComplete({ mode: 'create' }), true);
  assert.equal(
    isKioskTicketChoiceComplete({ mode: 'attach', ticketId: 9001, ticketLabel: '#9001' }),
    true,
  );
  // A half-finished search is not a decision — posting it would fail the
  // route's `ticketId: positive()` zod instead of the step refusing early.
  assert.equal(
    isKioskTicketChoiceComplete({ mode: 'attach', ticketId: 0, ticketLabel: '' }),
    false,
  );
  assert.equal(
    isKioskTicketChoiceComplete({ mode: 'attach', ticketId: -3, ticketLabel: '#-3' }),
    false,
  );
  assert.equal(
    isKioskTicketChoiceComplete({ mode: 'attach', ticketId: 1.5, ticketLabel: '#1.5' }),
    false,
  );
});

test('a retail-only visit asks for no ticket work at all', () => {
  const picked: KioskTicketChoice = { mode: 'attach', ticketId: 9001, ticketLabel: '#9001' };
  assert.deepEqual(kioskTicketWork(picked, false), { mode: 'none' });
  assert.deepEqual(kioskTicketWork({ mode: 'create' }, false), { mode: 'none' });
  assert.deepEqual(kioskTicketWork(null, false), { mode: 'none' });
});

test('a service visit files a ticket even when nobody chose', () => {
  assert.deepEqual(kioskTicketWork(null, true), { mode: 'create' });
  assert.deepEqual(
    kioskTicketWork({ mode: 'attach', ticketId: 0, ticketLabel: '' }, true),
    { mode: 'create' },
    'an unfinished link falls back to create, never to no ticket',
  );
});

test('a picked ticket is attached by id', () => {
  assert.deepEqual(
    kioskTicketWork({ mode: 'attach', ticketId: 9001, ticketLabel: '#9001' }, true),
    { mode: 'attach', ticketId: 9001 },
  );
});

test('the floor sentence names which way the visit went', () => {
  assert.equal(kioskTicketChoiceLabel({ mode: 'create' }), 'A new ticket will be filed');
  assert.equal(
    kioskTicketChoiceLabel({ mode: 'attach', ticketId: 9001, ticketLabel: '#9001 · Loose grille' }),
    'Linking #9001 · Loose grille',
  );
});
