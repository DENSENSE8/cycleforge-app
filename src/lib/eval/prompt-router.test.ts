/**
 * Tripwire — prompt router is derived from the cohorts, not a sixth hand list.
 *
 * Run: node --import tsx --test src/lib/eval/prompt-router.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SHORTCUT_DISPLAY_ENGINE } from '@/lib/keyboard/shortcut-display-cohort';
import {
  overlayCohortWorkspacePaths,
  OVERLAY_SHELL_GRAPH_SYMBOLS,
  SCAN_STATION_OVERLAY_COHORT,
} from '@/lib/station/scan-station-overlay-cohort';
import { SLOT_TABLE_ENGINE } from '@/lib/tables/slot-table-cohort';
import {
  allRouteRules,
  emitRouterDocument,
  evalCommandScriptName,
  readPackageScripts,
  routeDirtyPaths,
  routePrompt,
  ROUTER_DOCUMENT_VERSION,
} from './prompt-router';

const COHORT_SYMBOLS = new Set<string>([
  ...SLOT_TABLE_ENGINE.graphSymbols,
  ...SHORTCUT_DISPLAY_ENGINE.graphSymbols,
  'StationComposerHost',
  'ComposerModeRow',
  'UnshippedTable',
  'useOrdersSpreadsheet',
  'OrdersQueueTableRow',
  'DataTable',
  ...SCAN_STATION_OVERLAY_COHORT.flatMap((m) => [m.exportName, ...m.graphSymbolsExtra]),
  ...OVERLAY_SHELL_GRAPH_SYMBOLS,
  'ItemRecordQtyBadge',
]);

describe('prompt router (D7 item 4)', () => {
  it('sync google sheet / triage board → slot-table, UnshippedTable, no GridRow fork', () => {
    for (const text of ['sync google sheet', 'google sheets triage board', 'sheet import staging grid']) {
      const r = routePrompt(text);
      assert.equal(r.unrouted, false, text);
      assert.equal(r.routes[0]?.cohort, 'slot-table', text);
      for (const sym of ['UnshippedTable', 'useOrdersSpreadsheet', 'OrdersQueueTableRow']) {
        assert.ok(r.routes[0]?.graphSymbols.includes(sym), `${text} missing ${sym}`);
      }
      assert.ok(r.refusals.some((x) => x.id === 'slot-table.new-grid-row'), text);
      assert.ok(r.refusals.some((x) => x.id === 'slot-table.new-grid-columns-array'), text);
      assert.ok(r.refusals.some((x) => x.id === 'slot-table.new-sheet-columns'), text);
    }
  });

  it('sort the image column → slot-table engine, sortable-false refuse', () => {
    const r = routePrompt('sort the image column');
    assert.equal(r.unrouted, false);
    assert.equal(r.routes[0]?.cohort, 'slot-table');
    assert.equal(r.routes[0]?.evalCommand, 'pnpm run eval:cohort slot-table');
    for (const sym of [
      'isSlotTableChromeTrack',
      'queueSortForColumnKey',
      'LedgerGridColumnHeader',
      'CompoundItem',
    ]) {
      assert.ok(r.routes[0]?.graphSymbols.includes(sym), `missing ${sym}`);
    }
    assert.equal(r.routes[0]?.mounts.length, 0);
    assert.ok(r.routes[0]?.refuse.some((x) => x.id === 'slot-table.sortable-false-on-fact'));
    assert.ok(r.routes[0]?.refuse.some((x) => x.id === 'slot-table.new-grid-columns-array'));
    assert.ok(r.routes[0]?.refuse.some((x) => x.id === 'slot-table.orders-row-dots-menu'));
  });

  it('three dots / row menu on orders → ordersCompoundColumnsFor, no copy-menu refuse', () => {
    for (const text of ['three dots on the orders table', 'row ellipsis menu on to-ship']) {
      const r = routePrompt(text);
      assert.equal(r.unrouted, false, text);
      assert.equal(r.routes[0]?.cohort, 'slot-table', text);
      assert.ok(r.routes[0]?.graphSymbols.includes('ordersCompoundColumnsFor'), text);
      assert.ok(r.routes[0]?.graphSymbols.includes('COMPOUND_COLUMN_KEYS'), text);
      assert.ok(r.routes[0]?.graphSymbols.includes('OrdersQueueTableRow'), text);
      assert.ok(r.refusals.some((x) => x.id === 'slot-table.orders-row-dots-menu'), text);
    }
  });

  it('date in the cell / ship by → compact DateRangePickerField mount', () => {
    for (const text of ['date in the cell', 'ship by']) {
      const r = routePrompt(text);
      assert.equal(r.routes[0]?.cohort, 'slot-table', text);
      assert.ok(
        r.routes[0]?.mounts.includes('<DateRangePickerField variant="compact" />'),
        text,
      );
      for (const sym of ['DateRangePickerField', 'CompoundState', 'useOptimisticMutation']) {
        assert.ok(r.routes[0]?.graphSymbols.includes(sym), `${text} missing ${sym}`);
      }
      assert.ok(r.refusals.some((x) => x.id === 'slot-table.native-date-input'), text);
    }
  });

  it('show keys on the buttons → standing-keycaps refuse, zero edit routes', () => {
    const r = routePrompt('show keys on the buttons');
    assert.equal(r.routes.length, 0);
    assert.equal(r.refusals[0]?.id, 'shortcuts.standing-keycaps');
    assert.equal(r.unrouted, false);
  });

  it('no modes / dumb station → composer refuse showModeRow={false}', () => {
    for (const text of ['no modes', 'dumb station']) {
      const r = routePrompt(text);
      assert.ok(
        r.routes.some((x) => x.cohort === 'composer' || x.cohort.startsWith('station:')),
        text,
      );
      assert.ok(r.refusals.some((x) => x.id === 'composer.show-mode-row-false'), text);
    }
  });

  it('KeyboardKey.tsx only → dirty-path shortcuts cohort', () => {
    const hits = routeDirtyPaths(['src/design-system/primitives/KeyboardKey.tsx']);
    assert.deepEqual(
      hits.map((h) => `${h.kind}:${h.name}`),
      ['cohort:shortcuts'],
    );
    assert.equal(hits[0]?.evalCommand, 'pnpm run eval:cohort shortcuts');
  });

  it('every route evalCommand is a package.json script; symbols live in a cohort', () => {
    const scripts = readPackageScripts();
    for (const route of allRouteRules()) {
      const name = evalCommandScriptName(route.evalCommand);
      assert.ok(name && scripts[name], `${route.cohort} evalCommand missing script ${name}`);
      for (const sym of route.graphSymbols) {
        assert.ok(COHORT_SYMBOLS.has(sym), `${route.cohort} graphSymbols ${sym} not in a cohort`);
      }
      for (const file of route.engineFiles) {
        assert.match(file, /^src\//, `${route.cohort} engine file should be repo-relative src/: ${file}`);
      }
    }
  });

  it('router.json equals a fresh emit (overlay workspaces from the cohort)', () => {
    const doc = emitRouterDocument();
    assert.equal(doc.v, ROUTER_DOCUMENT_VERSION);
    assert.deepEqual(doc.overlayWorkspaces, [...overlayCohortWorkspacePaths()].sort());
    const onDisk = JSON.parse(
      readFileSync(join(process.cwd(), 'tools/design-mcp/router.json'), 'utf8'),
    ) as unknown;
    assert.deepEqual(onDisk, doc);
  });
});
