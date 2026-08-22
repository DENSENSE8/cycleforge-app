/**
 * Ship-desk chrome: Add opens the ingest index (not a split dropdown).
 *
 *   node --import tsx --test src/components/dashboard/outbound-order-chrome-actions.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const ACTIONS = readFileSync(join(ROOT, 'src/components/dashboard/OutboundOrderChromeActions.tsx'), 'utf8');
const HEADER = readFileSync(join(ROOT, 'src/components/dashboard/OutboundWorkspaceHeader.tsx'), 'utf8');
const DESK = readFileSync(join(ROOT, 'src/components/outbound/orders/OutboundOrdersDesk.tsx'), 'utf8');
const RAIL = readFileSync(join(ROOT, 'src/components/outbound/orders/OrderIngestRail.tsx'), 'utf8');
const PANEL = readFileSync(join(ROOT, 'src/components/outbound/orders/OrderIngestPanel.tsx'), 'utf8');

/**
 * Comments explain WHY a component is not used and therefore name it. Assert on
 * code only, or every "deliberately not X" docblock reads as a use of X.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const RAIL_CODE = code(RAIL);
const PANEL_CODE = code(PANEL);

describe('OutboundOrderChromeActions — ship ingest rail', () => {
  it('To-ship Band 1 mounts the ingest layout (not a split dropdown)', () => {
    assert.match(HEADER, /layout="ingest"/);
    assert.doesNotMatch(HEADER, /layout="split"/);
    assert.doesNotMatch(ACTIONS, /SplitButton/);
  });

  it('ingest Add face is sentence case (no uppercase tracking shout)', () => {
    assert.match(ACTIONS, /INGEST_CTA_FACE/);
    const ingestFace = ACTIONS.slice(
      ACTIONS.indexOf('const INGEST_CTA_FACE'),
      ACTIONS.indexOf('export function OutboundOrderChromeActions'),
    );
    assert.doesNotMatch(ingestFace, /uppercase/);
    assert.doesNotMatch(ingestFace, /tracking-widest/);
  });

  it('ship desk mounts OrderIngestRail through the single RightRailHost slot', () => {
    assert.match(DESK, /OrderIngestRail/);
    assert.match(RAIL, /DetailStackRailRegistrar/);
    assert.match(RAIL, /modal=\{false\}/);
    // Pushed inspector, never a floating drawer over the work.
    assert.doesNotMatch(RAIL_CODE, /RightPaneOverlay/);
  });

  it('the rail is the Unbox recipe — index shell, find row, host-owned chrome', () => {
    assert.match(RAIL, /DeskInspectorIndexShell/);
    // ONE band: the shell paints it at both stages, so a DeskRailChromeRow
    // above it would be the stacked second band (audit tier T2, 10 files).
    assert.doesNotMatch(RAIL_CODE, /DeskRailChromeRow/);
    // stance is the enforcement hinge — a rail that never answered "am I
    // routed through the one index?" must not compile.
    assert.match(RAIL, /stance="index"/);
    // `indexFilter` is what carries Unbox's Root Index find row and its
    // ↑↓ / Enter keys; without it the index is a plain list.
    assert.match(RAIL_CODE, /indexFilter/);
    // No page-local index twin, and never the station push stack on a desk rail.
    assert.doesNotMatch(RAIL_CODE, /StationDisplaysPushStack/);
  });

  it('every ingest lane is a leaf on that index', () => {
    for (const label of [
      'Add order manually',
      'Replacement',
      'Add from platform',
      'Import from file',
      'Import latest orders',
      'Backfill',
    ]) {
      assert.match(RAIL, new RegExp(`label: '${label}'`));
    }
  });

  it('hand entry is two leaves, not one leaf with a mode pill row inside it', () => {
    const mounts = RAIL.match(/<ShippedIntakeForm[\s\S]*?\/>/g) ?? [];
    assert.equal(mounts.length, 2, 'expected an Add order leaf and a Replacement leaf');
    for (const mount of mounts) assert.match(mount, /hideModeTabs/);
    assert.doesNotMatch(RAIL_CODE, /HorizontalButtonSlider/);
  });

  it('the leaf bodies paint no chrome of their own', () => {
    assert.doesNotMatch(PANEL_CODE, /aria-label="Close/);
    assert.doesNotMatch(PANEL_CODE, /<header/);
    assert.doesNotMatch(PANEL_CODE, /rounded-(?:sm|md|lg|xl|full|\[)/);
  });


  /**
   * Regression (2026-08-21): starting an import closed the rail it was started
   * from. `OrderSyncDialog` mounts its own DetailStackRailRegistrar, so
   * rendering it from inside this rail registered `detail:order-sync` into the
   * ONE RightRailHost slot and evicted `detail:order-ingest`. The leaf renders
   * the registrar-free body instead.
   */
  it('the sync leaf renders the progress body, never a second rail occupant', () => {
    assert.match(RAIL, /OrderSyncPanelBody/);
    assert.doesNotMatch(RAIL_CODE, /<OrderSyncDialog/);
    const registrars = RAIL_CODE.match(/<DetailStackRailRegistrar/g) ?? [];
    assert.equal(registrars.length, 1, 'exactly one rail occupant per rail');
  });

  /**
   * The operator's ask: Import from file / Import latest orders must be
   * reachable only through the one index, with a Back. A duplicate door that
   * mounts the intake form directly bypasses both.
   */
  it('NewOrderEntryOverlay is gone — hand entry has one door', () => {
    const dead = join(ROOT, 'src/components/orders/NewOrderEntryOverlay.tsx');
    assert.equal(existsSync(dead), false, 'the duplicate intake door must stay deleted');
  });
});
