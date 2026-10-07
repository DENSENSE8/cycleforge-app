import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestingTerminal } from './testing-terminal';
import type { TestingTerminalInput } from './types';

const baseInput: TestingTerminalInput = {
  primaryTitle: 'Pass this unit and print its label',
  onPrimary: () => {},
};

test('mode-default is the one Pass CTA: never disabled, P painted in it', () => {
  const vm = resolveTestingTerminal('mode-default', baseInput);
  assert.equal(vm?.label, 'Pass');
  assert.ok(!vm?.disabled && !vm?.loading, 'the Pass CTA is never greyed out');
  assert.equal(vm?.hotkey, 'P');
});

test('unknown kinds return null — Ticket is not a dock terminal', () => {
  assert.equal(resolveTestingTerminal('ticket', baseInput), null);
  assert.equal(resolveTestingTerminal('checklist', baseInput), null);
});
