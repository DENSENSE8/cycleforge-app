/**
 * Testing Displays carton Macro floor (icons-first port, 2026-08-10) — the
 * Testing half of the icons-first action-floor work. Mirrors Unbox's
 * `UnboxDisplaysActionFloor` / Arrival's `ArrivalDisplaysActionFloor` (share the
 * METHOD, fork the HOST — C2 / Scan vs desk right-edge).
 *
 * Testing's verb set is decided by the CODE, not taste: `useTestingLineController`
 * has no inventory dossier (Sync drops) and no clean floor reprint (Print stays
 * on the dock's Pass · Print). So the floor is ⋯ More · Edit(→linkage) ·
 * Delete carton — 3 peers.
 *
 *   node --import tsx --test src/components/tech/testing-panel/testing-displays-action-floor.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

const PANEL = 'src/components/tech/TestingPanel.tsx';
const FLOOR = 'src/components/tech/testing-panel/TestingDisplaysActionFloor.tsx';

describe('Testing Displays carton Macro floor', () => {
  const panel = read(PANEL);
  const floor = read(FLOOR);

  it('TestingPanel passes TestingDisplaysActionFloor as the Displays actionFloor', () => {
    assert.match(
      panel,
      /actionFloor=\{[\s\S]{0,400}TestingDisplaysActionFloor/,
      'the Macro floor mounts via the PushStack actionFloor slot (above the close chrome)',
    );
    assert.match(panel, /onDeleted=\{closeDisplays\}/);
    assert.match(panel, /editSelected=\{activeSideTab === ['"]linkage['"]\}/);
    assert.match(
      panel,
      /isUnfound=\{shouldUseUnmatchedItemsSurface\(row\)\}/,
      'unfound signal is the same helper the panel already uses for its display tabs',
    );
  });

  it('composes the STATION shell + shared waist (not the desk InspectorActionFloor)', () => {
    assert.match(floor, /StationDisplaysActionFloor/);
    assert.match(floor, /InspectorFlushDelete/);
    assert.match(floor, /stationDisplaysFloorMoreItems/);
    assert.match(floor, /size="fill"/);
    assert.match(floor, /FLUSH_TERMINAL_SPREAD_PEER_CLASS/);
    assert.match(floor, /FLUSH_TERMINAL_SPREAD_GLYPH_CLASS/);
  });

  it('C2 — never imports the desk shell / peers', () => {
    assert.doesNotMatch(floor, /InspectorActionFloor/);
    assert.doesNotMatch(floor, /FloorIconButton/);
    assert.doesNotMatch(floor, /FloorOverflowButton/);
  });

  it('drops Sync (no inventory dossier at Testing)', () => {
    assert.doesNotMatch(floor, /\bRefreshCw\b/);
    assert.doesNotMatch(floor, /refreshInventoryDossier|onInventorySync|inventorySyncing/);
    assert.doesNotMatch(
      floor,
      /data-testid="testing-displays-floor-inventory-sync"/,
      'Testing controller has no Zoho inventory dossier — no Sync peer',
    );
  });

  it('omits Print (dock owns Pass · Print — no clean floor reprint)', () => {
    assert.doesNotMatch(floor, /\bPrinter\b/);
    assert.doesNotMatch(floor, /runPrintLabel|canPrint/);
    assert.doesNotMatch(
      floor,
      /data-testid="testing-displays-floor-primary"/,
      'no Print peer at Testing — the floor is ⋯ · Edit · Delete (3 peers)',
    );
  });

  it('verb order is More → Edit → far-right Delete', () => {
    assert.match(floor, /MoreHorizontal/);
    assert.match(floor, /Pencil/);
    const morePos = floor.indexOf('testing-displays-floor-more');
    const editPos = floor.indexOf('testing-displays-floor-edit');
    const deletePos = floor.indexOf('testing-displays-floor-delete');
    assert.ok(
      morePos > 0 && editPos > morePos && deletePos > editPos,
      'peer columns left→right: More · Edit · Delete',
    );
  });

  it('Edit / Resolve open the carton↔PO Linkage leaf (Unbox analog, not SKU pairing)', () => {
    assert.match(floor, /openDisplays\(['"]linkage['"]\)/);
    assert.doesNotMatch(
      floor,
      /openDisplays\(['"]pairing['"]\)/,
      'Edit targets Linkage (carton↔PO), not the SKU catalog pairing tab',
    );
  });

  it('Delete is the carton grain (DELETE /api/receiving-logs), verbatim Unbox handler', () => {
    assert.match(floor, /\/api\/receiving-logs\?id=/);
    assert.match(floor, /removeReceivingRailByCarton/);
    assert.match(floor, /receiving-lines-table/);
    assert.match(floor, /emitReceiving\(['"]receiving-entry-deleted['"]/);
  });

  it('no floating island / touch peers (hit target is the fill column)', () => {
    assert.doesNotMatch(floor, /size="touch"/);
    assert.doesNotMatch(floor, /\bw-11\b/);
  });
});
