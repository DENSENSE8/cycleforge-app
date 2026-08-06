import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestingTerminal } from './testing-terminal';
import type { TestingTerminalInput } from './types';

const baseInput: TestingTerminalInput = {
  primaryLabel: 'Pass + Print',
  primaryTitle: 'Pass testing and print',
  primaryDisabled: false,
  isPrinting: false,
  onPrimary: () => {},
};

test('mode-default returns Pass · Print carton terminal', () => {
  const vm = resolveTestingTerminal('mode-default', baseInput);
  assert.equal(vm?.label, 'Pass + Print');
  assert.equal(vm?.disabled, false);
});

test('unknown / ticket kinds return null — replies stay in Ticket Displays', () => {
  assert.equal(resolveTestingTerminal('ticket', baseInput), null);
  assert.equal(resolveTestingTerminal('checklist', baseInput), null);
});
