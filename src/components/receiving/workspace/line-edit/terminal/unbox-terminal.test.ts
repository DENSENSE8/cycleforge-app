/**
 * Unit tests for the unbox terminal VM builder.
 *
 *   node --import tsx --test src/components/receiving/workspace/line-edit/terminal/unbox-terminal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTerminalKind } from '@/lib/station-terminal';
import { resolveUnboxReceiveTerminal, resolveUnboxTerminal } from './unbox-terminal';
import type { UnboxTerminalContext } from './types';

function mockCtx(overrides: Partial<UnboxTerminalContext> = {}): UnboxTerminalContext {
  return {
    row: { id: 1, tracking_number: '1Z999' } as UnboxTerminalContext['row'],
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

test('the unbox dock is carton-terminal — no tab changes it', () => {
  // The whole point of Lane E: the displays moved to the right-edge Displays
  // push column, so a selection there must NOT re-label the bottom primary.
  // Every tab id (and none at all) resolves to the same kind.
  for (const tabId of [
    null,
    'overview',
    'classify',
    'listings',
    'units',
    'po-note',
    'checklist',
    'support',
    'tracking',
    'timeline',
    // even an id the registry never knew about
    'not-a-tab',
  ]) {
    assert.equal(
      resolveTerminalKind({ mode: 'unbox', tabId }),
      'mode-default',
      `unbox tabId=${String(tabId)} must stay on the carton terminal`,
    );
  }
});

test('resolveUnboxReceiveTerminal: primary label from controller', () => {
  const vm = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        labelSelectOptions: [
          { key: 'carton', name: 'Carton label' },
          { key: 'unit', name: 'Unit label' },
        ],
        activeLabelKind: 'carton',
        selectedLabelKind: 'carton',
      },
    }),
  );
  assert.equal(vm.label, 'Receive');
  assert.equal(vm.docked, true);
  assert.equal(vm.fullWidth, false);
  assert.equal(vm.align, 'end');
  assert.ok(vm.menu && vm.menu.some((m) => m.label.startsWith('Print only')));
  assert.ok(vm.menu && vm.menu.some((m) => m.label === 'Save all to inventory'));
  const carton = vm.menu?.find((m) => m.label === 'Carton label');
  const printOnly = vm.menu?.find((m) => m.label.startsWith('Print only'));
  assert.equal(carton?.selected, true);
  assert.equal(carton?.keepOpen, true);
  assert.equal(printOnly?.separatorBefore, true);

  let edited = 0;
  const withEdit = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        labelSelectOptions: [
          { key: 'carton', name: 'Carton label' },
          { key: 'unit', name: 'Unit label' },
        ],
        activeLabelKind: 'carton',
        requestLabelEditor: () => {
          edited += 1;
        },
      },
    }),
  );
  const editItem = withEdit.menu?.find((m) => m.label === 'Edit label');
  assert.ok(editItem, 'dock split menu must offer Edit label');
  editItem?.onClick();
  assert.equal(edited, 1);

  let selected: string | null = null;
  let printed: string | null = null;
  const selectOnly = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        labelSelectOptions: [
          { key: 'carton', name: 'Carton label' },
          { key: 'unit', name: 'Unit label' },
        ],
        activeLabelKind: 'carton',
        setSelectedLabelKind: (key) => {
          selected = key;
        },
        printKind: (kind) => {
          printed = kind;
          return true;
        },
      },
    }),
  );
  selectOnly.menu?.find((m) => m.label === 'Unit label')?.onClick();
  assert.equal(selected, 'unit');
  assert.equal(printed, null);
});

test('resolveUnboxReceiveTerminal: received line prints instead of receiving', () => {
  let printed = 0;
  let printAndReceived = 0;
  const vm = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        isReceived: true,
        // Controller copy for a received line.
        printReceivePrimaryLabel: 'Print label',
        receiveMenuLabel: 'Receive again',
        runPrintLabel: () => {
          printed += 1;
        },
        handlePrintAndReceive: () => {
          printAndReceived += 1;
        },
      },
    }),
  );

  assert.equal(vm.label, 'Print label');
  vm.onClick();
  // The whole point: pressing the primary must NOT re-receive the line.
  assert.equal(printed, 1);
  assert.equal(printAndReceived, 0);

  // Re-receive stays reachable — a bounce-back is a supported flow.
  assert.ok(vm.menu && vm.menu.some((m) => m.label === 'Receive again'));
  // Unreceive appears when canUnreceive is set (received line).
  assert.ok(
    !vm.menu?.some((m) => String(m.label).startsWith('Unreceive')),
    'without canUnreceive, Unreceive stays hidden',
  );
});

test('resolveUnboxReceiveTerminal: Unreceive all appears when canUnreceive', () => {
  let unreceived = 0;
  const vm = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        isReceived: true,
        canUnreceive: true,
        printReceivePrimaryLabel: 'Print label',
        receiveMenuLabel: 'Receive again',
        unreceiveMenuLabel: 'Unreceive all',
        handleReceive: (mode) => {
          if (mode === 'unreceive') unreceived += 1;
        },
      },
    }),
  );
  const item = vm.menu?.find((m) => m.label === 'Unreceive all');
  assert.ok(item, 'Unreceive all must appear when canUnreceive');
  item?.onClick();
  assert.equal(unreceived, 1);
});

test('resolveUnboxReceiveTerminal: un-received line still prints AND receives', () => {
  let printed = 0;
  let printAndReceived = 0;
  const vm = resolveUnboxReceiveTerminal(
    mockCtx({
      receive: {
        ...mockCtx().receive,
        runPrintLabel: () => {
          printed += 1;
        },
        handlePrintAndReceive: () => {
          printAndReceived += 1;
        },
      },
    }),
  );

  vm.onClick();
  assert.equal(printAndReceived, 1);
  assert.equal(printed, 0);
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

test('resolveUnboxTerminal dispatches only the carton terminal', () => {
  const ctx = mockCtx();
  assert.equal(resolveUnboxTerminal('mode-default', ctx)?.label, 'Receive');
  // The retired tab kinds must not resurrect a second dock meaning.
  for (const kind of ['po-note', 'checklist', 'units', 'timeline', 'support', 'ticket', 'none']) {
    assert.equal(resolveUnboxTerminal(kind, ctx), null, `${kind} must not build a VM`);
  }
});
