/**
 * Receiving line contents row SoT — shrink-only retirement of local forks.
 *
 * Carton-read ContentsList must compose `ReceivingLineContentsRow`. The Unbox
 * centre on main mounts `POUnboxingSection` (editable accordion); the parked
 * `UnboxItemsPanel` reference host lives on `unbox-work`. Work accordion
 * (`PoLineRow`) stays separate (D6).
 *
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/components/receiving/contents/receiving-line-contents-row.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const CARTON = src('components/receiving/inspector/inspection/CartonInspectionPage.tsx');
const ROW = src('components/receiving/contents/ReceivingLineContentsRow.tsx');

const SOT_IMPORT = 'ReceivingLineContentsRow';

test('carton ContentsList imports the contents-row SoT', () => {
  assert.ok(
    CARTON.includes(SOT_IMPORT),
    'CartonInspectionPage must compose ReceivingLineContentsRow',
  );
  assert.ok(
    CARTON.includes('receivingLineContentsTitle'),
    'carton contents titles must use receivingLineContentsTitle',
  );
  // Local fork smells — a bare Package thumb or inline title→meta without the SoT.
  assert.equal(
    /function ContentsList[\s\S]*?<Package\b/.test(CARTON),
    false,
    'ContentsList must not render a local Package placeholder — the SoT owns the thumb',
  );
});

test('ReceivingLineContentsRow owns Zoho thumb size-20 anatomy', () => {
  assert.ok(ROW.includes('size-20'), 'thumb must be size-20');
  assert.ok(ROW.includes('justify-between'), 'title top / details bottom pin');
  assert.ok(ROW.includes('MoreHorizontal'), 'optional details ⋮ control');
  assert.ok(ROW.includes('onOpenImage'), 'lightbox open callback');
});
