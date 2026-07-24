import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const WORKSPACE = source('./TestingLineWorkspace.tsx');
const PANEL = source('./TestingPanel.tsx');
const PO_SECTION = source('./testing-panel/TestingPoUnboxingSection.tsx');
const HEADER = source('./testing/TestingWorkspaceHeader.tsx');
const HISTORY_LIST = source('./TestingHistoryList.tsx');

test('open Testing detail hides the mounted browse chrome and layers above headers', () => {
  assert.match(WORKSPACE, /visibility:\s*row\s*\?\s*'hidden'\s*:\s*'visible'/);
  assert.match(WORKSPACE, /zIndex:\s*zIndex\.panel/);
  assert.match(WORKSPACE, /inert=\{row\s*\?\s*true\s*:\s*undefined\}/);
});

test('Testing photo peek is anchored to the full-pane overlay shell', () => {
  // Panel root composes the station SoT (StationPanelRoot → isolate stacking
  // context + ambient wash), not a hand-rolled `relative isolate flex …` div.
  assert.match(PANEL, /<StationPanelRoot className="isolate">/);
  assert.match(PANEL, /<UnitPackPhotoPeek[\s\S]*?showEmptyState=\{false\}/);
  assert.equal(PO_SECTION.includes('UnitPackPhotoPeek'), false);
});

test('Testing workbench presents Returns before Pending and History', () => {
  assert.match(HEADER, /const TABS[^=]*=\s*\['returns', 'pending', 'history'\]/);
});

test('Testing History suppresses received and failed workflow icons', () => {
  assert.match(HISTORY_LIST, /isHistory=\{mode === 'history'\}/);
});
