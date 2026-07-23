/**
 * Guard + unit tests for the station terminal registry.
 *
 *   node --import tsx --test src/lib/station-terminal/station-terminal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACE_MODES, type WorkspaceMode } from '@/components/station/entity-context';
import { STATION_TERMINAL_REGISTRY, getTerminalSlice } from './registry';
import { resolveTerminalKind } from './resolve-terminal-action';
import type { TerminalWorkspaceMode } from './types';

const TERMINAL_MODES = Object.keys(STATION_TERMINAL_REGISTRY) as TerminalWorkspaceMode[];

test('registry: every TerminalWorkspaceMode has a structurally complete entry', () => {
  for (const mode of TERMINAL_MODES) {
    const slice = getTerminalSlice(mode);
    assert.ok(slice, `${mode} must have a registry entry`);
    assert.equal(typeof slice.hasSectionTabs, 'boolean', `${mode}: hasSectionTabs required`);
    assert.ok(slice.tabs && typeof slice.tabs === 'object', `${mode}: tabs map required`);
    if (!slice.hasSectionTabs) {
      assert.ok(slice.defaultKind, `${mode}: modes without section tabs need defaultKind`);
    }
  }
});

test('registry: every WorkspaceMode with hasSectionTabs (mode-registry) has a terminal slice', () => {
  for (const mode of Object.keys(WORKSPACE_MODES) as WorkspaceMode[]) {
    const def = WORKSPACE_MODES[mode];
    assert.ok(mode in STATION_TERMINAL_REGISTRY, `${mode}: must exist in STATION_TERMINAL_REGISTRY`);
    const slice = getTerminalSlice(mode);
    assert.equal(
      slice.hasSectionTabs,
      def.hasSectionTabs,
      `${mode}: mode-registry.hasSectionTabs must match terminal registry`,
    );
    assert.equal(def.terminalSlice, mode, `${mode}: terminalSlice should key the same mode`);
  }
});

test('registry: every registered tab id maps to a non-empty kind string', () => {
  for (const mode of TERMINAL_MODES) {
    const slice = getTerminalSlice(mode);
    for (const [tabId, kind] of Object.entries(slice.tabs)) {
      assert.ok(tabId.length > 0, `${mode}: empty tab id`);
      assert.ok(typeof kind === 'string' && kind.length > 0, `${mode}.${tabId}: kind required`);
    }
  }
});

test('resolveTerminalKind: unbox overview → mode-default', () => {
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'overview' }), 'mode-default');
});

test('resolveTerminalKind: unbox po-note → po-note', () => {
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'po-note' }), 'po-note');
});

test('resolveTerminalKind: unbox tabs each resolve to a distinct kind', () => {
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'checklist' }), 'checklist');
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'units' }), 'units');
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'tracking' }), null);
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'listings' }), null);
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'classify' }), null);
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'timeline' }), 'timeline');
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'ticket' }), 'ticket');
  assert.equal(resolveTerminalKind({ mode: 'unbox', tabId: 'support' }), 'support');
});

test('resolveTerminalKind: triage tabs → mode-default', () => {
  assert.equal(resolveTerminalKind({ mode: 'triage', tabId: null }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'triage' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'triage', tabId: 'overview' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'triage', tabId: 'staging' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'triage', tabId: 'pairing' }), 'mode-default');
});

test('resolveTerminalKind: testing tabs → mode-default / ticket; timeline hides dock', () => {
  assert.equal(resolveTerminalKind({ mode: 'testing', tabId: 'testing' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'testing', tabId: 'ticket' }), 'ticket');
  assert.equal(resolveTerminalKind({ mode: 'testing', tabId: 'timeline' }), null);
});

test('resolveTerminalKind: shipping preview (null tab) → start; active tabs → null', () => {
  assert.equal(resolveTerminalKind({ mode: 'shipping', tabId: null }), 'start');
  assert.equal(resolveTerminalKind({ mode: 'shipping', tabId: 'ship' }), null);
  assert.equal(resolveTerminalKind({ mode: 'shipping', tabId: 'units' }), null);
  assert.equal(resolveTerminalKind({ mode: 'shipping', tabId: 'timeline' }), null);
});

test('resolveTerminalKind: pickup item → mode-default; add → add-item', () => {
  assert.equal(resolveTerminalKind({ mode: 'pickup', tabId: 'item' }), 'mode-default');
  assert.equal(resolveTerminalKind({ mode: 'pickup', tabId: 'add' }), 'add-item');
});
