/**
 * Guard — Add inbound and Station Displays never both push the right edge.
 *
 * Run: node --import tsx --test src/components/receiving/incoming-add-right-edge.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('Add inbound ↔ Displays mutual exclusion', () => {
  it('Add overlay yields Displays / details / AI before claiming RightRailHost', () => {
    const overlay = read(
      'src/components/sidebar/receiving/incoming/IncomingAddInboundOverlay.tsx',
    );
    assert.match(overlay, /yieldStationRightEdgeForAddInbound/);
    assert.match(overlay, /INCOMING_ADD_INBOUND_CLOSE_EVENT/);
  });

  it('Unbox Displays open closes Add inbound', () => {
    const view = read(
      'src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts',
    );
    assert.match(view, /dispatchIncomingAddInboundClose/);
  });

  it('Arrival Displays open closes Add; Add open closes Arrival Displays', () => {
    const panel = read('src/components/receiving/triage/TriagePanel.tsx');
    assert.match(panel, /dispatchIncomingAddInboundClose/);
    assert.match(panel, /STATION_DISPLAYS_CLOSE_EVENT/);
  });
});
