/**
 * Station Displays carton Macro floor.
 *
 * Pins:
 *   - `StationDisplaysActionFloor` is h-11 + FlushTerminalFooter; full-width
 *     justify-between icon row; Delete far-right
 *   - PushColumn mounts `actionFloor` ABOVE chrome `footer` (close hairline last)
 *   - Unbox: More · Print · Edit · Delete — overflow holds Resolve when unfound
 *   - Never desk `InspectorActionFloor`
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

const FLOOR = 'src/components/station/displays/StationDisplaysActionFloor.tsx';
const COLUMN = 'src/components/station/displays/StationDisplaysPushColumn.tsx';
const STACK = 'src/components/station/displays/StationDisplaysPushStack.tsx';
const UNBOX_FLOOR =
  'src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx';
const LINE_EDIT = 'src/components/receiving/workspace/LineEditPanel.tsx';
const SOT = '.claude/rules/source-of-truth.md';

describe('StationDisplaysActionFloor shell', () => {
  it('composes FlushTerminalFooter at h-11 with spread fill-width peers', () => {
    const src = read(FLOOR);
    assert.match(src, /FlushTerminalFooter/);
    assert.match(src, /layout="spread"/);
    assert.match(src, /\bh-11\b/);
    assert.match(src, /bg-surface-card/);
    assert.match(src, /testId = 'station-displays-action-floor'/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });
});

describe('PushColumn / PushStack mount order', () => {
  it('PushColumn renders actionFloor above close-chrome footer', () => {
    const src = read(COLUMN);
    assert.match(src, /actionFloor/);
    const floorPos = src.indexOf('{actionFloor}');
    const footerPos = src.indexOf('{footer}');
    assert.ok(floorPos > 0, 'actionFloor must render in the column');
    assert.ok(footerPos > floorPos, 'close chrome footer must sit below the Macro floor');
  });

  it('PushStack plumbs actionFloor; Filter stays on close-chrome footer', () => {
    const src = read(STACK);
    assert.match(src, /actionFloor=\{actionFloor\}/);
    assert.match(src, /Filter displays…/);
    assert.doesNotMatch(src, /macroFloorOwnsBottom/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });
});

describe('Unbox golden wiring', () => {
  it('UnboxDisplaysActionFloor exposes More · Sync · Print · Edit · far-right Delete', () => {
    const src = read(UNBOX_FLOOR);
    assert.match(src, /StationDisplaysActionFloor/);
    assert.match(src, /InspectorFlushDelete/);
    assert.match(src, /stationDisplaysFloorMoreItems/);
    assert.match(src, /MoreHorizontal/);
    assert.match(src, /RefreshCw/);
    assert.match(src, /Loader2/);
    assert.match(src, /Printer/);
    assert.match(src, /Pencil/);
    assert.match(src, /size="fill"/);
    assert.match(src, /FLUSH_TERMINAL_SPREAD_PEER_CLASS/);
    assert.match(src, /FLUSH_TERMINAL_SPREAD_GLYPH_CLASS/);
    assert.match(src, /FLOOR_ICON_ACTIVE/);
    assert.doesNotMatch(src, /SECTION_TAB_ICON_CELL/);
    assert.doesNotMatch(src, /size="touch"/);
    assert.doesNotMatch(src, /\bw-11\b/);
    assert.doesNotMatch(src, /className="h-4 w-4"/);
    assert.match(src, /data-testid="unbox-displays-floor-more"/);
    assert.match(src, /data-testid="unbox-displays-floor-inventory-sync"/);
    assert.match(src, /data-testid="unbox-displays-floor-primary"/);
    assert.match(src, /data-testid="unbox-displays-floor-edit"/);
    assert.match(src, /data-testid="unbox-displays-floor-delete"/);
    // Order in source: More → Sync → Print → Edit → Delete
    const morePos = src.indexOf('unbox-displays-floor-more');
    const syncPos = src.indexOf('unbox-displays-floor-inventory-sync');
    const printPos = src.indexOf('unbox-displays-floor-primary');
    const editPos = src.indexOf('unbox-displays-floor-edit');
    const deletePos = src.indexOf('unbox-displays-floor-delete');
    assert.ok(
      morePos > 0 &&
        syncPos > morePos &&
        printPos > syncPos &&
        editPos > printPos &&
        deletePos > editPos,
    );
    assert.doesNotMatch(src, /InspectorActionFloor/);
    assert.doesNotMatch(src, /Open in Unbox/);
    assert.doesNotMatch(src, /variant="primary"/);
  });

  it('LineEditPanel passes UnboxDisplaysActionFloor as actionFloor', () => {
    const src = read(LINE_EDIT);
    assert.match(src, /UnboxDisplaysActionFloor/);
    assert.match(src, /actionFloor=\{/);
    assert.doesNotMatch(src, /InspectorActionFloor/);
  });
});

describe('SoT fork', () => {
  it('documents station carton Macro floor vs desk InspectorActionFloor', () => {
    const sot = read(SOT);
    assert.match(sot, /StationDisplaysActionFloor/);
    assert.match(
      sot,
      /never mount desk `InspectorActionFloor` on Displays|Still never mount desk/,
    );
  });
});
