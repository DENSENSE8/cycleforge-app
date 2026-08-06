import test from 'node:test';
import assert from 'node:assert/strict';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { resolveTestingTerminal } from './testing-terminal';
import type { TestingTerminalInput } from './types';

const baseInput: TestingTerminalInput = {
  primaryLabel: 'Pass + Print',
  primaryTitle: 'Pass testing and print',
  primaryDisabled: false,
  isPrinting: false,
  onPrimary: () => {},
};

function composerBridge(overrides: Partial<ThreadComposerBridge> = {}) {
  const calls = { focus: 0, submit: 0 };
  const bridge: ThreadComposerBridge = {
    hasDraft: false,
    isPublic: false,
    submitting: false,
    canPost: true,
    focus: () => {
      calls.focus += 1;
    },
    submit: () => {
      calls.submit += 1;
    },
    ...overrides,
  };
  return { bridge, calls };
}

test('ticket terminal focuses the shared composer before a draft exists', () => {
  const { bridge, calls } = composerBridge();
  const vm = resolveTestingTerminal('ticket', {
    ...baseInput,
    ticketId: 9395,
    ticketBridge: bridge,
  });

  assert.equal(vm?.label, 'Reply');
  assert.equal(vm?.disabled, false);
  vm?.onClick();
  assert.equal(calls.focus, 1);
  assert.equal(calls.submit, 0);
});

test('ticket terminal submits internal notes and public replies through the bridge', () => {
  const internal = composerBridge({ hasDraft: true });
  const internalVm = resolveTestingTerminal('ticket', {
    ...baseInput,
    ticketId: 9395,
    ticketBridge: internal.bridge,
  });
  assert.equal(internalVm?.label, 'Add note');
  internalVm?.onClick();
  assert.equal(internal.calls.submit, 1);

  const publicReply = composerBridge({ hasDraft: true, isPublic: true });
  const publicVm = resolveTestingTerminal('ticket', {
    ...baseInput,
    ticketId: 9395,
    ticketBridge: publicReply.bridge,
  });
  assert.equal(publicVm?.label, 'Send');
  publicVm?.onClick();
  assert.equal(publicReply.calls.submit, 1);
});

test('ticket terminal keeps File claim for failed testing without a ticket', () => {
  let filed = 0;
  const vm = resolveTestingTerminal('ticket', {
    ...baseInput,
    ticketId: null,
    claimFailedNoTicket: true,
    onFileClaim: () => {
      filed += 1;
    },
  });

  assert.equal(vm?.label, 'File claim');
  vm?.onClick();
  assert.equal(filed, 1);
});
