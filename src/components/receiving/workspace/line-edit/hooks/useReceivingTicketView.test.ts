import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldClearTicketViewOnLineChange } from './useReceivingTicketView';

test('clears on a genuine sibling-line switch (both ids known, different)', () => {
  assert.equal(shouldClearTicketViewOnLineChange(11, 22, true), true);
});

test('does not clear when the ticket editor is closed', () => {
  assert.equal(shouldClearTicketViewOnLineChange(11, 22, false), false);
});

test('does not self-clear on initial open (prev null — mount or deep-link resolve)', () => {
  // ?openReceivingId=&ticketView=1 resolves the line: prev null → keep the editor.
  assert.equal(shouldClearTicketViewOnLineChange(null, 22, true), false);
});

test('does not clear when the line id is unchanged', () => {
  assert.equal(shouldClearTicketViewOnLineChange(22, 22, true), false);
});

test('does not clear when the current line id becomes null', () => {
  assert.equal(shouldClearTicketViewOnLineChange(22, null, true), false);
});
