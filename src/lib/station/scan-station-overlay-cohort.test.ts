/**
 * Tripwire — scan-station idle↔overlay contract across the **whole cohort**.
 *
 * SoT is {@link SCAN_STATION_OVERLAY_COHORT}: every listed workspace must satisfy
 * the same predicates. Pack/Unbox are peers, not templates. A new scan station
 * that ships the overlay shell without joining the registry fails the
 * “registry is complete” intent when operators add it here and the predicates
 * catch drift; a member that drops visibility-hide / zIndex.panel fails now.
 *
 * Run: node --import tsx --test src/lib/station/scan-station-overlay-cohort.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  IDLE_OVERLAY_HELPER,
  SCAN_STATION_OVERLAY_COHORT,
  SCAN_STATION_OVERLAY_CONTRACT,
  overlayCohortWorkspacePaths,
  stationEvalManifest,
} from './scan-station-overlay-cohort';

const ROOT = join(process.cwd());

function readWorkspace(rel: string): string {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `missing cohort workspace: ${rel}`);
  return readFileSync(abs, 'utf8');
}

describe('scan-station overlay cohort (SoT = all stations)', () => {
  it('registers every floor scan station that owns idle↔overlay (non-empty, unique ids)', () => {
    assert.ok(
      SCAN_STATION_OVERLAY_COHORT.length >= 6,
      'cohort must list the floor scan stations (unbox · triage · pack · testing · shipping · scan-out)',
    );
    const ids = SCAN_STATION_OVERLAY_COHORT.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, 'cohort ids must be unique');
    const paths = SCAN_STATION_OVERLAY_COHORT.map((m) => m.workspace);
    assert.equal(new Set(paths).size, paths.length, 'cohort workspaces must be unique');
  });

  it('idle-overlay helper owns visibility / inert / pointer-events / zIndex.panel', () => {
    const src = readWorkspace(IDLE_OVERLAY_HELPER);
    assert.match(src, /visibility/);
    assert.match(src, /'hidden'/);
    assert.match(src, /\binert\b/);
    assert.match(src, /pointerEvents/);
    assert.match(src, /zIndex\.panel/);
  });

  it('design-mcp router.json overlayWorkspaces stays in sync with the cohort SoT', () => {
    const doc = JSON.parse(readFileSync(join(ROOT, 'tools/design-mcp/router.json'), 'utf8')) as {
      overlayWorkspaces?: string[];
    };
    const fromJson = new Set(doc.overlayWorkspaces ?? []);
    for (const p of overlayCohortWorkspacePaths()) {
      assert.ok(fromJson.has(p), `tools/design-mcp/router.json missing cohort workspace ${p}`);
    }
  });

  for (const member of SCAN_STATION_OVERLAY_COHORT) {
    it(`${member.id} (${member.route}) satisfies the cohort overlay contract`, () => {
      const src = readWorkspace(member.workspace);
      for (const [name, re] of Object.entries(SCAN_STATION_OVERLAY_CONTRACT)) {
        assert.match(
          src,
          re,
          `${member.id}: missing overlay contract "${name}" in ${member.workspace}`,
        );
      }
    });
  }

  it('qty face is cohort-wide. Every station eval impacts ItemRecordQtyBadge', () => {
    const qtyFile = 'src/design-system/components/item-record/ItemRecordQtyBadge.tsx';
    for (const member of SCAN_STATION_OVERLAY_COHORT) {
      const manifest = stationEvalManifest(member);
      assert.ok(
        manifest.graphSymbols.includes('ItemRecordQtyBadge'),
        `${member.id}: station eval must attack the shared qty face, not a local n/m span`,
      );
      assert.equal(
        manifest.graphExpectedFiles.ItemRecordQtyBadge,
        qtyFile,
        `${member.id} must location-judge the shared qty face, not a station twin`,
      );
    }
  });

  it('no cohort member is privileged — every member is checked with the same predicates', () => {
    const predicateCount = Object.keys(SCAN_STATION_OVERLAY_CONTRACT).length;
    for (const member of SCAN_STATION_OVERLAY_COHORT) {
      const src = readWorkspace(member.workspace);
      let hits = 0;
      for (const re of Object.values(SCAN_STATION_OVERLAY_CONTRACT)) {
        if (re.test(src)) hits += 1;
      }
      assert.equal(
        hits,
        predicateCount,
        `${member.id}: expected all ${predicateCount} predicates (peer parity, not Pack/Unbox-as-golden)`,
      );
    }
  });
});
