/**
 * Unit tests for the unbox terminal VM builders.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/terminal/unbox-terminal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTerminalKind } from '@/lib/station-terminal';
import {
  resolveUnboxChecklistTerminal,
  resolveUnboxConversationTerminal,
  resolveUnboxPoNoteTerminal,
  resolveUnboxReceiveTerminal,
  resolveUnboxTerminal,
  resolveUnboxUnitsTerminal,
} from './unbox-terminal';
import type { UnboxTerminalContext } from './types';
import type { PoNoteTabState } from './usePoNoteTabState';

function mockPoNote(overrides: Partial<PoNoteTabState> = {}): PoNoteTabState {
  return {
    draft: '',
    setDraft: () => {},
    dirty: false,
    loading: false,
    saving: false,
    save: async () => {},
    syncFromInventory: async () => {},
    ...overrides,
  };
}

function mockCtx(overrides: Partial<UnboxTerminalContext> = {}): UnboxTerminalContext {
  return {
    row: { id: 1, tracking_number: '1Z999' } as UnboxTerminalContext['row'],
    poNote: mockPoNote(),
    bridges: { checklist: null, units: null, conversation: null },
    focusSerialScan: () => {},
    setUnboxView: () => {},
    focusTicketReply: () => {},
    receive: {
      printReceivePrimaryLabel: 'Receive',
      printThenReceiveTitle: 'Print then receive',
      combinedReviewDisabled: false,
      combinedReviewDisabledReason: null,
      splitMenuAriaLabel: 'Receive options',
      splitMenuHoverTitle: 'More receive options',
      canPrintReview: true,
      canReceiveReview: true,
      canZohoReceive: true,
      isUnfound: false,
      receiveMenuLabel: 'Receive',
      receiveMenuTitle: 'Receive into inventory',
      handlePrintAndReceive: () => {},
      runPrintLabel: () => {},
      handleReceive: () => {},
    },
    ...overrides,
  };
}

test('registry kind: overview → mode-default; po-note → po-note', () => {
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'overview' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'po-note' }), 'po-note');
});

test('registry kind: every unbox tab has a non-none kind', () => {
  for (const tab of [
    'overview',
    'po-note',
    'checklist',
    'units',
    'tracking',
    'ticket',
    'conversation',
  ]) {
    assert.ok(
      resolveTerminalKind({ mode: 'unbox', tabId: tab }),
      `${tab} must resolve to a terminal kind`,
    );
  }
});

test('resolveUnboxReceiveTerminal: primary label from controller', () => {
  const vm = resolveUnboxReceiveTerminal(mockCtx());
  assert.equal(vm.label, 'Receive');
  assert.equal(vm.docked, true);
  assert.ok(vm.menu && vm.menu.some((m) => m.label === 'Print only'));
  assert.ok(vm.menu && vm.menu.some((m) => m.label === 'Save all to inventory'));
});

test('resolveUnboxReceiveTerminal: unfound hides Save all to inventory', () => {
  const vm = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        isUnfound: true,
        printReceivePrimaryLabel: 'Receive locally',
      },
    }),
  );
  assert.equal(vm.label, 'Receive locally');
  assert.ok(vm.menu && !vm.menu.some((m) => m.label === 'Save all to inventory'));
});

test('resolveUnboxPoNoteTerminal: dirty draft enables Save', () => {
  const vm = resolveUnboxPoNoteTerminal(
    mockCtx({ poNote: mockPoNote({ dirty: true, draft: 'hello' }) }),
  );
  assert.equal(vm.label, 'Save to inventory');
  assert.equal(vm.disabled, false);
  assert.ok(vm.menu && vm.menu[0]?.label === 'Sync from inventory');
  assert.equal(vm.menu?.[0]?.disabled, true); // dirty → sync disabled
});

test('resolveUnboxPoNoteTerminal: clean draft disables Save', () => {
  const vm = resolveUnboxPoNoteTerminal(mockCtx({ poNote: mockPoNote({ dirty: false }) }));
  assert.equal(vm.disabled, true);
  assert.equal(vm.menu?.[0]?.disabled, false);
});

test('resolveUnboxChecklistTerminal: Check all / Uncheck all toggle', () => {
  let checked = false;
  const vmCheck = resolveUnboxChecklistTerminal(
    mockCtx({
      bridges: {
        checklist: {
          allDone: false,
          itemCount: 3,
          checkAll: () => {
            checked = true;
          },
          uncheckAll: () => {
            checked = false;
          },
        },
        units: null,
        conversation: null,
      },
    }),
  );
  assert.equal(vmCheck.label, 'Check all');
  assert.equal(vmCheck.disabled, false);
  void vmCheck.onClick();
  assert.equal(checked, true);

  const vmUncheck = resolveUnboxChecklistTerminal(
    mockCtx({
      bridges: {
        checklist: {
          allDone: true,
          itemCount: 3,
          checkAll: () => {},
          uncheckAll: () => {
            checked = false;
          },
        },
        units: null,
        conversation: null,
      },
    }),
  );
  assert.equal(vmUncheck.label, 'Uncheck all');
});

test('resolveUnboxUnitsTerminal: Add serial switches to overview and focuses scan', async () => {
  let view: string | null = null;
  let focused = false;
  const vm = resolveUnboxUnitsTerminal(
    mockCtx({
      setUnboxView: (v) => {
        view = v;
      },
      focusSerialScan: () => {
        focused = true;
      },
    }),
  );
  void vm.onClick();
  assert.equal(view, 'overview');
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 5));
  assert.equal(focused, true);
});

test('resolveUnboxUnitsTerminal: Add serial + Prebox menu', () => {
  const vm = resolveUnboxUnitsTerminal(
    mockCtx({
      bridges: {
        checklist: null,
        units: { serialCount: 2, openPrebox: () => {} },
        conversation: null,
      },
    }),
  );
  assert.equal(vm.label, 'Add serial');
  assert.ok(vm.menu?.some((m) => m.label === 'Prebox'));
  assert.ok(vm.menu?.some((m) => m.label === 'Edit serials' && m.disabled));
});

test('resolveUnboxConversationTerminal: Add note when empty draft', () => {
  let focused = false;
  const vm = resolveUnboxConversationTerminal(
    mockCtx({
      bridges: {
        checklist: null,
        units: null,
        conversation: {
          hasDraft: false,
          isPublic: false,
          submitting: false,
          canPost: true,
          focus: () => {
            focused = true;
          },
          submit: () => {},
        },
      },
    }),
  );
  assert.equal(vm.label, 'Add note');
  void vm.onClick();
  assert.equal(focused, true);
});

test('resolveUnboxTerminal dispatches kind', () => {
  const ctx = mockCtx({ poNote: mockPoNote({ dirty: true }) });
  assert.equal(resolveUnboxTerminal('mode-default', ctx)?.label, 'Receive');
  assert.equal(resolveUnboxTerminal('po-note', ctx)?.label, 'Save to inventory');
  assert.equal(resolveUnboxTerminal('checklist', ctx)?.label, 'Check all');
  assert.equal(resolveUnboxTerminal('units', ctx)?.label, 'Add serial');
  assert.equal(resolveUnboxTerminal('tracking', ctx)?.label, 'Copy tracking');
  assert.equal(resolveUnboxTerminal('tracking', ctx)?.tone, 'accent');
  assert.equal(resolveUnboxTerminal('ticket', ctx)?.label, 'Reply');
  assert.equal(resolveUnboxTerminal('ticket', ctx)?.tone, 'accent');
  assert.equal(resolveUnboxTerminal('conversation', ctx)?.label, 'Add note');
  assert.equal(resolveUnboxTerminal('conversation', ctx)?.tone, 'accent');
  assert.equal(resolveUnboxTerminal('none', ctx), null);
});
