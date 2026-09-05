/**
 * Surface index is derived from the cohorts — no per-page markdown.
 *
 * Run: node --import tsx --test src/lib/eval/surface-index.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCAN_STATION_OVERLAY_COHORT } from '@/lib/station/scan-station-overlay-cohort';
import { surfaceForPath, surfaceForRoute, surfaceIndex } from './surface-index';

describe('surface index', () => {
  it('lists every overlay cohort station with its eval command', () => {
    const rows = surfaceIndex().filter((s) => s.kind === 'station');
    assert.equal(rows.length, SCAN_STATION_OVERLAY_COHORT.length);
    for (const member of SCAN_STATION_OVERLAY_COHORT) {
      const row = rows.find((s) => s.id === member.id);
      assert.ok(row, member.id);
      assert.equal(row?.route, member.route);
      assert.equal(row?.workspace, member.workspace);
      assert.equal(row?.evalCommand, `pnpm run eval:station ${member.id}`);
      assert.ok(row?.graphSymbols.includes('idleBrowseLayerProps'), member.id);
      assert.ok(row?.graphSymbols.includes('ItemRecordQtyBadge'), member.id);
    }
  });

  it('route /shipping/scan-out is the scan-out station', () => {
    const row = surfaceForRoute('/shipping/scan-out');
    assert.equal(row?.id, 'scan-out');
    assert.equal(row?.evalCommand, 'pnpm run eval:station scan-out');
  });

  it('Pack workspace path is the pack station', () => {
    const hits = surfaceForPath('src/components/packer/PackOrderWorkspace.tsx');
    assert.equal(hits[0]?.id, 'pack');
  });

  it('KeyboardKey path is the shortcuts engine', () => {
    const hits = surfaceForPath('src/design-system/primitives/KeyboardKey.tsx');
    assert.ok(hits.some((h) => h.id === 'shortcuts'));
  });

  it('unknown path is empty — not a made-up page spec', () => {
    assert.deepEqual(surfaceForPath('src/components/dashboard/DashboardOrdersView.tsx'), []);
  });
});
