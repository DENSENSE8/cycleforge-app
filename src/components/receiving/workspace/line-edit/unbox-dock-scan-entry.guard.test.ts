/**
 * Unbox dock keyboard entry — always mounted (except serial), wedge-owned,
 * step-routed Enter. Sidebar must not steal while `[data-unbox-dock-scan]` lives.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-dock-scan-entry.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('UnboxDockScanEntry routes Enter by activeKey — photos advance when ready', () => {
  const entry = src(
    'components/receiving/workspace/line-edit/UnboxDockScanEntry.tsx',
  );
  assert.match(entry, /PHOTO_KEYS/, 'photo steps are a named set');
  assert.match(entry, /ADVANCE_KEYS/, 'actionless arrival/classify advance');
  assert.match(entry, /activeKey === 'condition'/, 'condition accepts grade');
  assert.match(entry, /activeKey === 'contents'/, 'contents ack via Enter');
  assert.match(entry, /activeKey === 'label'/, 'label ack via Enter');
  assert.match(
    entry,
    /active\.state !== 'done'/,
    'empty Enter on pending photos no-ops',
  );
  assert.doesNotMatch(
    entry,
    /ProcedureDeck|UnboxProcedureDeck/,
    'centre deck stays parked',
  );
});

test('Sidebar focus-scan skips when dock scan owner is mounted', () => {
  const sidebar = src('components/sidebar/ReceivingSidebarPanel.tsx');
  assert.match(
    sidebar,
    /\[data-unbox-dock-scan\]/,
    'generalized dock scan marker blocks sidebar steal',
  );
  assert.match(
    sidebar,
    /\[data-unbox-serial-dock\]/,
    'legacy serial marker still honored',
  );
});

test('No UnboxDockScanEntry / UnboxDockHost under Testing', () => {
  const tech = src('components/tech/TestingPanel.tsx');
  assert.doesNotMatch(tech, /UnboxDockScanEntry|UnboxDockHost|UnboxStepDock/);
});
