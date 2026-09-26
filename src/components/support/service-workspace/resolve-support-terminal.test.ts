/**
 * Support ticket terminal — Reply / Send / Add note / Copy tracking dock VM.
 *
 *   node --import tsx --test src/components/support/service-workspace/resolve-support-terminal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { resolveSupportTerminal } from './resolve-support-terminal';

function composerBridge(overrides: Partial<ThreadComposerBridge> = {}): ThreadComposerBridge {
  return {
    hasDraft: false,
    isPublic: false,
    submitting: false,
    canPost: true,
    focus: () => undefined,
    submit: () => undefined,
    ...overrides,
  };
}

test('resolveSupportTerminal: connections (and unknown) hide the dock', () => {
  assert.equal(
    resolveSupportTerminal({ tabId: 'summary', ticketBridge: composerBridge() }),
    null,
  );
  assert.equal(
    resolveSupportTerminal({ tabId: 'connections', ticketBridge: composerBridge() }),
    null,
  );
});

/** The empty-composer label follows the VISIBILITY MODE (2026-08-02). */
test('resolveSupportTerminal: ticket tab label follows the mode with no draft', () => {
  const internal = resolveSupportTerminal({
    tabId: 'ticket',
    ticketBridge: composerBridge({ isPublic: false }),
  });
  assert.ok(internal);
  assert.equal(internal.label, 'Note');
  assert.equal(internal.disabled, false);

  const pub = resolveSupportTerminal({
    tabId: 'ticket',
    ticketBridge: composerBridge({ isPublic: true }),
  });
  assert.equal(pub?.label, 'Reply');
  assert.equal(pub?.disabled, false);
});

test('resolveSupportTerminal: ticket tab Add note / Send from draft mode', () => {
  const internal = resolveSupportTerminal({
    tabId: 'ticket',
    ticketBridge: composerBridge({ hasDraft: true, isPublic: false }),
  });
  assert.equal(internal?.label, 'Add note');

  const pub = resolveSupportTerminal({
    tabId: 'ticket',
    ticketBridge: composerBridge({ hasDraft: true, isPublic: true }),
  });
  assert.equal(pub?.label, 'Send');
});

test('resolveSupportTerminal: missing ticket bridge disables with reason', () => {
  const vm = resolveSupportTerminal({ tabId: 'ticket', ticketBridge: null });
  assert.ok(vm);
  assert.equal(vm.disabled, true);
  assert.match(String(vm.disabledReason), /unavailable/i);
});

test('resolveSupportTerminal: conversations tab Add note / Post via warehouse bridge', () => {
  const empty = resolveSupportTerminal({
    tabId: 'conversations',
    ticketBridge: null,
    conversationBridge: composerBridge(),
  });
  assert.ok(empty);
  assert.equal(empty.label, 'Add note');
  assert.equal(empty.disabled, false);

  const onRecord = resolveSupportTerminal({
    tabId: 'conversations',
    ticketBridge: null,
    conversationBridge: composerBridge({ hasDraft: true, isPublic: true }),
  });
  assert.equal(onRecord?.label, 'Post');

  const missing = resolveSupportTerminal({
    tabId: 'conversations',
    ticketBridge: null,
    conversationBridge: null,
  });
  assert.ok(missing);
  assert.equal(missing.disabled, true);
});

test('resolveSupportTerminal: timeline tab Copy tracking when present', () => {
  const withTracking = resolveSupportTerminal({
    tabId: 'timeline',
    ticketBridge: null,
    tracking: '1Z999',
  });
  assert.ok(withTracking);
  assert.equal(withTracking.label, 'Copy tracking');
  assert.equal(withTracking.disabled, false);

  const without = resolveSupportTerminal({
    tabId: 'timeline',
    ticketBridge: null,
    tracking: null,
  });
  assert.ok(without);
  assert.equal(without.label, 'Timeline');
  assert.equal(without.disabled, true);
});
