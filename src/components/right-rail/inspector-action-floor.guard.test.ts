/**
 * Workbench InspectorActionFloor — desk triage Macro floor SoT.
 *
 * Composes FlushTerminalFooter; flush trailing Delete; not Station docks;
 * Incoming-family footers must not use full-width labelled danger pills.
 *
 * Run: node --test --import tsx \
 *        src/components/right-rail/inspector-action-floor.guard.test.ts
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

function read(rel: string): string {
  return stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));
}

const FLOOR = 'src/components/right-rail/InspectorActionFloor.tsx';
const FLUSH_DELETE = 'src/components/right-rail/InspectorFlushDelete.tsx';

const DESK_FLOOR_CONSUMERS = [
  'src/components/sidebar/receiving/IncomingDetailsPanel.tsx',
  'src/components/receiving/unfound/UnfoundQueueDetailsPanel.tsx',
  'src/components/warehouse/BinDetailFlyout.tsx',
  'src/components/repair/RepairDetailsPanel.tsx',
  'src/components/sku/SkuDetailView.tsx',
  'src/components/shipped/details-panel/OrderUpdateDock.tsx',
] as const;

describe('InspectorActionFloor Macro SoT', () => {
  const floor = read(FLOOR);
  const flushDelete = read(FLUSH_DELETE);

  it('composes FlushTerminalFooter cluster layout', () => {
    assert.match(floor, /FlushTerminalFooter/);
    assert.match(floor, /layout="cluster"/);
  });

  it('forbids soft radius, sticky/absolute, and soft pad on the floor shell', () => {
    assert.doesNotMatch(floor, /\brounded-(?:lg|xl|2xl|full)\b/);
    assert.doesNotMatch(floor, /\bsticky\b|\babsolute\b/);
    assert.doesNotMatch(floor, /\bpx-4\b|\bpy-2\.5\b|\bpy-3\b/);
  });

  it('InspectorFlushDelete is flush trailing icon (transparent + border-l)', () => {
    assert.match(flushDelete, /bg-transparent/);
    assert.match(flushDelete, /border-l border-border-hairline/);
    assert.match(flushDelete, /Trash2/);
    assert.match(flushDelete, /focusRing\('control', 'danger'\)/);
  });

  it('desk triage consumers compose InspectorActionFloor', () => {
    for (const path of DESK_FLOOR_CONSUMERS) {
      const src = read(path);
      assert.match(
        src,
        /InspectorActionFloor/,
        `${path} must compose InspectorActionFloor`,
      );
      assert.doesNotMatch(
        src,
        /StationTerminalDock|SlicedActionDock/,
        `${path} must not import station docks`,
      );
    }
  });

  it('desk consumers ban full-width labelled danger DeleteButton footers', () => {
    for (const path of DESK_FLOOR_CONSUMERS) {
      const src = read(path);
      assert.doesNotMatch(
        src,
        /DeleteButton[\s\S]{0,400}bg-red-600/,
        `${path} must not use full-width red DeleteButton`,
      );
      assert.doesNotMatch(
        src,
        /w-full[\s\S]{0,120}rounded-xl[\s\S]{0,80}bg-red-/,
        `${path} must not use rounded-xl full-bleed danger`,
      );
    }
  });

  it('OrderUpdateDock keeps order-update-delete test id via InspectorFlushDelete', () => {
    const dock = read(
      'src/components/shipped/details-panel/OrderUpdateDock.tsx',
    );
    assert.match(dock, /InspectorFlushDelete/);
    assert.match(dock, /order-update-delete/);
    assert.match(dock, /OrderAssignDisplayHost/);
  });

  it('Incoming keeps Sync on header chrome, not the floor', () => {
    const panel = read(
      'src/components/sidebar/receiving/IncomingDetailsPanel.tsx',
    );
    assert.match(panel, /onSync=\{\(\) => void syncOne\(\)\}/);
    const headerIdx = panel.indexOf('<IncomingDetailsHeader');
    const floorIdx = panel.indexOf('<InspectorActionFloor');
    assert.ok(headerIdx >= 0 && floorIdx > headerIdx);
    const headerChunk = panel.slice(headerIdx, floorIdx);
    assert.match(headerChunk, /\bonSync\b/);
    const floorChunk = panel.slice(floorIdx);
    assert.doesNotMatch(floorChunk, /\bonSync\b|\bsyncOne\b|\bsyncing\b/);
  });
});
