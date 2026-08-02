/**
 * The location label must actually ENCODE in both of its forms.
 *
 * `locationLabelPayload` decides a symbology; this asserts bwip-js accepts
 * what it produces in each case. That is not a formality — the two symbologies
 * have different payload grammars, and `gs1datamatrix` REJECTS a string with
 * no Application Identifiers. So the bare-code fallback introduced when the
 * borrowed `DEFAULT_GLN` was removed only works because it also switches to
 * plain `datamatrix`. If a future edit keeps the bare payload but forgets the
 * symbology switch, the preview and every printed sticker silently render
 * blank — a failure nobody notices until a label comes off the printer empty.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/barcode/location-label-encoding.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  locationLabelPayload,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { renderDataMatrixSvg } from '@/lib/barcode/dataMatrixSvg';

const BIN: LocationSegments = { zone: 'A', aisle: 1, bay: 1, level: 1, position: 1 };
const LICENSED_GLN = '0812345000009';

/** An SVG with real matrix geometry, not an empty shell. */
function assertRealSymbol(svg: string, label: string): void {
  assert.ok(svg.startsWith('<svg'), `${label}: not an SVG`);
  assert.ok(svg.length > 200, `${label}: suspiciously small SVG (${svg.length} bytes)`);
  assert.match(svg, /<(path|rect)/, `${label}: SVG has no drawn modules`);
}

test('the no-GLN label encodes as a plain DataMatrix', () => {
  const payload: ReturnType<typeof locationLabelPayload> = locationLabelPayload(BIN);
  assert.equal(payload.symbology, 'datamatrix');
  assertRealSymbol(
    renderDataMatrixSvg({ value: payload.value, symbology: payload.symbology }),
    'bare code',
  );
});

test('the licensed-GLN label encodes as a GS1 DataMatrix', () => {
  const payload: ReturnType<typeof locationLabelPayload> = locationLabelPayload(BIN, { gln: LICENSED_GLN });
  assert.equal(payload.symbology, 'gs1datamatrix');
  assertRealSymbol(
    renderDataMatrixSvg({ value: payload.value, symbology: payload.symbology }),
    'GS1 AI',
  );
});

test('regression: the bare code under gs1datamatrix does NOT silently succeed', () => {
  // The exact mistake this guard exists to catch — bare payload, wrong
  // symbology. bwip-js must refuse it rather than emit an empty symbol.
  const payload = locationLabelPayload(BIN);
  assert.throws(
    () => renderDataMatrixSvg({ value: payload.value, symbology: 'gs1datamatrix' }),
    'a payload with no AIs must not encode as GS1 DataMatrix',
  );
});
