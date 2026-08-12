/**
 * Unbox dock keyboard entry — parked with the flush procedure floor on
 * `unbox-work`. Main Unbox uses the notes bubble; Arrival keeps its twin
 * `ArrivalDockScanEntry`. This guard locks that split.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-dock-scan-entry.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('Main Unbox does not mount the parked procedure waist / step dock', () => {
  const panel = src('components/receiving/workspace/LineEditPanel.tsx');
  assert.doesNotMatch(
    panel,
    /UnboxDockScanEntry|UnboxStepDock|buildUnboxStepDock/,
    'procedure waist / step studio stay off main bubble dock',
  );
  assert.match(panel, /WorkspaceNotesCard/, 'bubble notes dock is the golden');
});

test('Parked UnboxDockScanEntry file is absent on main (lives on unbox-work)', () => {
  assert.equal(
    existsSync(
      join(ROOT, 'components/receiving/workspace/line-edit/UnboxDockScanEntry.tsx'),
    ),
    false,
    'UnboxDockScanEntry deleted from main — restore from unbox-work when remounting procedure floor',
  );
  assert.equal(
    existsSync(join(ROOT, 'components/receiving/workspace/line-edit/UnboxStepDock.tsx')),
    false,
    'UnboxStepDock deleted from main — restore from unbox-work when remounting',
  );
});

test('Sidebar focus-scan still yields to a dock scan owner when present', () => {
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

test('Arrival keeps its own compact Staging waist twin', () => {
  const arrival = src('components/receiving/triage/ArrivalDockScanEntry.tsx');
  assert.match(arrival, /w-8/, 'compact waist width');
  assert.match(arrival, /data-arrival-dock-scan/, 'Arrival dock scan marker');
  assert.match(arrival, /useRegisterScanSink/, 'wedge sink registered');
});
