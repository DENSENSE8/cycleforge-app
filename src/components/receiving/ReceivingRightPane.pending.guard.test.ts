/**
 * Guard: Unbox empty-pane-first — rail pending stub + optimistic unmatched pane
 * open at scan t=0; no Opening / Triage skeleton / keep-prior policy.
 * Unbox browse+overlay shell lives in UnboxLineWorkspace.
 *
 * Run: `tsx --test src/components/receiving/ReceivingRightPane.pending.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./ReceivingRightPane.tsx', import.meta.url)), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const UNBOX_SRC = readFileSync(
  fileURLToPath(new URL('./unbox/UnboxLineWorkspace.tsx', import.meta.url)),
  'utf8',
);
const UNBOX_CODE = UNBOX_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const SCAN_SRC = readFileSync(
  fileURLToPath(new URL('../sidebar/receiving/useTrackingScan.ts', import.meta.url)),
  'utf8',
);
const SCAN_CODE = SCAN_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const BRIDGE_SRC = readFileSync(
  fileURLToPath(new URL('../sidebar/receiving/useReceivingWorkspaceBridge.ts', import.meta.url)),
  'utf8',
);
const BRIDGE_CODE = BRIDGE_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('ReceivingRightPane does not import UnboxPendingWorkspace', () => {
  assert.equal(CODE.includes('UnboxPendingWorkspace'), false);
});

test('ReceivingRightPane does not import ReceivingWorkspaceSkeleton', () => {
  assert.equal(CODE.includes('ReceivingWorkspaceSkeleton'), false);
});

test('ReceivingRightPane routes Unbox to UnboxLineWorkspace', () => {
  assert.equal(CODE.includes('UnboxLineWorkspace'), true);
  assert.match(CODE, /mode === 'receive'/);
});

test('UnboxLineWorkspace remounts workspace shell on scan-driven open', () => {
  assert.match(UNBOX_CODE, /scanDriven/);
  assert.match(UNBOX_CODE, /scan-\$/);
});

test('useTrackingScan opens optimistic unmatched pane at Unbox t=0', () => {
  assert.equal(SCAN_CODE.includes('buildOptimisticUnmatchedPaneStub'), true);
  assert.equal(SCAN_CODE.includes('buildPendingScanStubRow'), true);
  assert.equal(SCAN_CODE.includes('setSelectedLine(paneStub)'), true);
  assert.equal(SCAN_CODE.includes('setScanDriven(true)'), true);
});

test('useTrackingScan clears optimistic pane on not_found', () => {
  assert.equal(SCAN_CODE.includes('clearUnboxOptimisticOpen'), true);
  assert.match(SCAN_SRC, /resolution\.kind === 'not_found'[\s\S]*?clearUnboxOptimisticOpen/);
});

test('useTrackingScan re-enables resolveLocalTracking for Unbox', () => {
  // Must not gate local-tracking behind intakeSurface !== 'unbox'
  assert.equal(SCAN_CODE.includes("intakeSurfaceRef.current !== 'unbox'"), false);
  assert.equal(SCAN_CODE.includes('resolveLocalTracking'), true);
});

test('bridge still blocks pending rail stubs but not optimistic unmatched pane', () => {
  assert.equal(BRIDGE_CODE.includes('isPendingTriageScanRow'), true);
  assert.equal(BRIDGE_SRC.includes('Optimistic unmatched pane stubs are openable'), true);
});
