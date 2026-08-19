/**
 * Station Displays carton Macro verbs — TOP-BAND placement (ruled 2026-08-18).
 *
 * Pins:
 *   - `StationDisplaysHeaderActions` is the top-band cluster host; the retired
 *     bottom `StationDisplaysActionFloor` rung is gone from the column
 *   - PushColumn mounts `headerActions` in the band's trailing cluster, and the
 *     `Filter displays…` is ROW 2 (sub-header, index only) — no footer
 *   - the carton `↑↓` cursor no longer mounts in the band
 *   - verb order is Refresh · Print · Edit · `⋮`, with `⋮` LAST on every station
 *   - Delete is inside `⋮` (tone danger), never an exposed peer
 *   - never desk `InspectorActionFloor`
 *
 *   node --import tsx --test src/components/station/displays/station-displays-action-floor.guard.test.ts
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

const CLUSTER =
  'src/components/station/displays/StationDisplaysHeaderActions.tsx';
const VERBS = 'src/components/station/displays/CartonDisplaysActionFloor.tsx';
const DESCRIPTORS = 'src/lib/receiving/station-displays-carton-floor.ts';
const COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const UNBOX_FLOOR =
  'src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx';
const LINE_EDIT = 'src/components/receiving/workspace/LineEditPanel.tsx';
const TRIAGE = 'src/components/receiving/triage/TriagePanel.tsx';
const TESTING = 'src/components/tech/TestingPanel.tsx';
const SOT = '.claude/rules/source-of-truth.md';

describe('StationDisplaysHeaderActions cluster', () => {
  it('is a band-height trailing cluster, not a FlushTerminalFooter rung', () => {
    const src = read(CLUSTER);
    assert.match(src, /items-stretch/);
    assert.match(src, /pointer-events-auto/);
    assert.match(src, /STATION_DISPLAYS_HEADER_ACTION_CELL/);
    assert.doesNotMatch(src, /FlushTerminalFooter/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });

  it('states why there is no progressive-collapse machinery', () => {
    const raw = readFileSync(join(process.cwd(), CLUSTER), 'utf8');
    assert.match(raw, /ResizeObserver/);
    assert.match(raw, /STATION_DISPLAYS_MIN_WIDTH_PX/);
  });
});

describe('PushColumn / PushStack mount order', () => {
  it('mounts headerActions in the band and keeps the filter footer at the bottom', () => {
    const src = read(COLUMN);
    assert.match(src, /\{headerActions\}/);
    assert.match(src, /\{footer\}/);
    const bandPos = src.indexOf('{headerActions}');
    const bodyPos = src.indexOf('{children}');
    const footerPos = src.indexOf('{footer}');
    assert.ok(bandPos > 0, 'headerActions must render in the column');
    assert.ok(bodyPos > bandPos, 'the band sits above the body');
    assert.ok(footerPos > bodyPos, 'the filter footer stays below the body');
    // The retired bottom rung must not come back beside the new cluster.
    assert.doesNotMatch(src, /\{actionFloor\}/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });

  it('the band no longer hosts the carton cursor', () => {
    const src = read(COLUMN);
    assert.doesNotMatch(src, /headerTrailing/);
    assert.doesNotMatch(src, /ScanStationCartonCursor/);
  });

  it('PushStack plumbs headerActions; Filter is row 2, never in the band', () => {
    const src = read(STACK);
    assert.match(src, /headerActions=\{headerActions\}/);
    // The filter is the column's own sub-header row, below the band and above
    // the index body (2026-08-19). Pin the slot, not the placeholder string.
    assert.match(src, /subHeader=\{/);
    const actionsPos = src.indexOf('headerActions={headerActions}');
    const subHeaderPos = src.indexOf('subHeader={');
    assert.ok(
      subHeaderPos > actionsPos,
      'the filter row renders after the band cluster, not inside it',
    );
    assert.doesNotMatch(
      src,
      /footer=\{/,
      'the column paints no bottom band — the filter row replaced it',
    );
    assert.doesNotMatch(src, /actionFloor/);
    assert.doesNotMatch(src, /headerTrailing/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });
});

describe('carton Macro verbs', () => {
  it('composes the cluster and paints Refresh · Print · Edit · ⋮ in that order', () => {
    const src = read(VERBS);
    assert.match(src, /StationDisplaysHeaderActions/);
    assert.match(src, /stationDisplaysFloorMoreItems/);
    assert.match(src, /MoreVertical/);
    assert.match(src, /RefreshCw/);
    assert.match(src, /Loader2/);
    assert.match(src, /Printer/);
    assert.match(src, /Pencil/);
    assert.match(src, /size="sm"/);
    assert.match(src, /STATION_DISPLAYS_HEADER_ACTION_CELL/);
    assert.match(src, /STATION_DISPLAYS_HEADER_ACTION_ACTIVE/);

    const syncPos = src.indexOf("case 'sync'");
    const printPos = src.indexOf("case 'print'");
    const editPos = src.indexOf("case 'edit'");
    const morePos = src.indexOf("case 'more'");
    assert.ok(
      syncPos > 0 && printPos > syncPos && editPos > printPos && morePos > editPos,
      'source order is Refresh → Print → Edit → ⋮',
    );
  });

  it('⋮ is the vertical kebab, opens trailing-anchored, and is never disabled', () => {
    const src = read(VERBS);
    assert.doesNotMatch(src, /MoreHorizontal/);
    assert.match(src, /align="end"/);
    // Delete always populates the menu, so the trigger must not gate on length.
    assert.doesNotMatch(src, /disabled=\{moreItems\.length === 0\}/);
  });

  it('Delete lives inside ⋮ with danger tone — never an exposed peer', () => {
    const src = read(VERBS);
    assert.match(src, /tone=\{item\.tone === 'danger' \? 'danger' : 'default'\}/);
    assert.doesNotMatch(src, /InspectorFlushDelete/);
    assert.doesNotMatch(src, /data-flush-delete-gap/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
    assert.doesNotMatch(src, /Open in Unbox/);
    assert.doesNotMatch(src, /variant="primary"/);
  });

  it('descriptors put ⋮ last and keep Delete out of the peer union', () => {
    const src = read(DESCRIPTORS);
    assert.match(src, /export type CartonFloorPeer = 'sync' \| 'print' \| 'edit' \| 'more'/);
    assert.match(src, /peers\.push\('edit', 'more'\)/);
    assert.match(src, /key: 'link' \| 'delete'/);
    assert.match(src, /tone\?: 'danger'/);
  });
});

describe('station wiring', () => {
  it('Unbox passes its Macro verbs as headerActions', () => {
    const src = read(LINE_EDIT);
    assert.match(src, /UnboxDisplaysActionFloor/);
    assert.match(src, /headerActions=\{/);
    assert.doesNotMatch(src, /actionFloor=\{/);
    assert.doesNotMatch(src, /displaysCartonCursor/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });

  it('Arrival and Testing follow the Unbox golden', () => {
    for (const rel of [TRIAGE, TESTING]) {
      const src = read(rel);
      assert.match(src, /headerActions=\{/, `${rel} must pass headerActions`);
      assert.doesNotMatch(src, /actionFloor=\{/, `${rel} must not keep the bottom rung`);
      assert.doesNotMatch(src, /displaysCartonCursor/, `${rel} must not keep the band cursor`);
    }
  });

  it('the Unbox wrapper stays a thin recipe over the shared compound', () => {
    const src = read(UNBOX_FLOOR);
    assert.match(src, /CartonDisplaysActionFloor/);
    assert.match(src, /print=\{/);
    assert.match(src, /sync=\{/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });
});

describe('SoT fork', () => {
  it('documents station carton Macro verbs vs desk InspectorActionFloor', () => {
    const sot = read(SOT);
    assert.match(sot, /StationDisplaysHeaderActions/);
    assert.match(
      sot,
      /never mount desk `InspectorActionFloor` on Displays|Still never mount desk/,
    );
  });
});
