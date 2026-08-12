/**
 * Guard — Action-plane scan sink waist.
 *
 * Pins: (1) the global wedge dispatches to the active sink before URL
 * redirect; (2) Unbox dock + serial register under `po-line:`; (3) sibling
 * ↑/↓ publishes from PoLinesAccordion; (4) no GridNavigationProvider twin.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('station-scan-sink guard', () => {
  it('useGlobalWedgeScanner dispatches to the active sink before redirect', () => {
    const src = read('hooks/useGlobalWedgeScanner.ts');
    assert.match(src, /dispatchScanToActiveSink/);
    const sinkIdx = src.indexOf('dispatchScanToActiveSink');
    const redirectIdx = src.indexOf('route?.redirect');
    assert.ok(sinkIdx > 0 && redirectIdx > sinkIdx, 'sink dispatch must precede route.redirect');
  });

  it('Unbox centre capture + Arrival waist register scan sinks (dock waist parked)', () => {
    // UnboxDockScanEntry / UnboxSerialStepSurface live on unbox-work with the
    // procedure floor. Main: centre capture + Arrival Staging waist own sinks.
    const arrival = read('components/receiving/triage/ArrivalDockScanEntry.tsx');
    assert.match(arrival, /useRegisterScanSink/);
    assert.match(arrival, /data-arrival-dock-scan/);
    const adder = read('components/receiving/workspace/InlineSerialAdder.tsx');
    assert.match(adder, /useRegisterScanSink/);
    const capture = read(
      'components/receiving/workspace/line-edit/PoLineCaptureRow.tsx',
    );
    assert.match(capture, /SerialScanField/, 'centre capture still mounts serial');
  });

  it('PoLinesAccordion publishes sibling cursor + ambient ↑/↓', () => {
    const src = read('components/receiving/workspace/PoLinesAccordion.tsx');
    assert.match(src, /usePublishRecordCursor/);
    assert.match(src, /scope:\s*'sibling'/);
    assert.match(src, /useRecordCursorKeyboard/);
    assert.match(src, /setActiveSinkId/);
    // Sibling open focuses the capture-row serial — not the dock wedge.
    assert.match(src, /scheduleFocusUnboxCaptureSerialInLine/);
    assert.doesNotMatch(
      src,
      /receiving-focus-scan/,
      'sibling open must not steal focus back to the dock wedge',
    );
  });

  it('PoLineRow mouse/focus arms the sink; capture serial outranks dock when mounted', () => {
    const src = read('components/receiving/workspace/PoLineRow.tsx');
    assert.match(src, /setActiveSinkId/);
    assert.match(src, /onFocus/);
    assert.match(src, /scheduleFocusUnboxCaptureSerialInLine/);
    assert.match(src, /receiving-focus-scan/);
    assert.match(src, /data-po-line-units/);
  });

  it('never introduces a GridNavigationProvider Context twin', () => {
    const store = read('lib/station-scan-sink/store.ts');
    assert.doesNotMatch(store, /createContext|GridNavigationProvider/);
    assert.match(store, /dispatchScanToActiveSink/);
  });

  it('Floor stations register Action sinks (Testing · Pack · scan-out)', () => {
    const testing = read('components/sidebar/TestingSidebarPanel.tsx');
    const pack = read('components/station/PackScanColumn.tsx');
    const scanOut = read('components/outbound/scan-out/ScanOutStationBar.tsx');
    const adder = read('components/receiving/workspace/InlineSerialAdder.tsx');
    assert.match(testing, /useRegisterScanSink/);
    assert.match(pack, /useRegisterScanSink/);
    assert.match(scanOut, /useRegisterScanSink/);
    assert.match(adder, /useRegisterScanSink/);
    assert.match(adder, /po-line:\$\{lineId\}/);
  });
});
