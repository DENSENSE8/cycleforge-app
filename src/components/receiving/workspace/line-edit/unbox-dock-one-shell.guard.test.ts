/**
 * Hard law (main Unbox): bottom dock is notes + Print · Receive via
 * WorkspaceNotesCard + StationTerminalDock. Guided step-dock / UnboxDockHost
 * continue on the `unbox-work` lane (`../cycleforge-unbox`).
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/receiving/workspace');
const LINE_EDIT = join(ROOT, 'LineEditPanel.tsx');

function src(path: string): string {
  return readFileSync(path, 'utf8');
}

test('LineEditPanel mounts WorkspaceNotesCard + StationTerminalDock — not UnboxDockHost', () => {
  const panel = src(LINE_EDIT);
  assert.match(panel, /WorkspaceNotesCard/, 'dock uses WorkspaceNotesCard');
  assert.match(panel, /StationTerminalDock/, 'Print · Receive rides in the notes trailing');
  assert.doesNotMatch(
    panel,
    /UnboxDockHost/,
    'UnboxDockHost / step dock is parked on unbox-work, not main',
  );
  assert.doesNotMatch(
    panel,
    /UnboxStepDock|buildUnboxStepDock|UnboxProcedurePager/,
    'procedure step dock / pager must not mount on main',
  );
});

test('LineEditPanel mounts scan-progress near the dock, not in the pane cursor row', () => {
  const panel = src(LINE_EDIT);
  assert.match(panel, /scanProgressControl/, 'ring stays reachable for Displays');
  assert.match(
    panel,
    /paneUtilityRow = showCartonCursor/,
    'pane utility is cursor-only',
  );
});

test('LineEditPanel does not pin UnboxItemsPanel or ProcedureDeck in the centre', () => {
  const panel = src(LINE_EDIT);
  assert.doesNotMatch(panel, /UnboxItemsPanel/, 'items pin is parked with the deck');
  assert.doesNotMatch(panel, /UnboxProcedureDeck/, 'centre ProcedureDeck is parked');
  assert.match(panel, /buildUnboxOverview/, 'centre comes from buildUnboxOverview');
});

test('ReceiveFeedbackRegion rides in the dock float stack above WorkspaceNotesCard', () => {
  const panel = src(LINE_EDIT);
  assert.match(
    panel,
    /slicedActionDockWrapperClass[\s\S]*ReceiveFeedbackRegion[\s\S]*WorkspaceNotesCard/,
    'confirmation must paint above the notes + Print · Receive shell in the absolute float',
  );
  assert.doesNotMatch(
    panel,
    /footer=\{[\s\S]*ReceiveFeedbackRegion/,
    'in-flow footer would sit under the absolute z-fab dock',
  );
});
