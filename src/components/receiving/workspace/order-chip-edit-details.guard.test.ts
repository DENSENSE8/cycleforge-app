/**
 * Unbox/Triage order-chip: Edit always wired (even when a Zoho PO is linked);
 * Details opens Incoming connection panel via shared event.
 *
 * Run: `tsx --test src/components/receiving/workspace/order-chip-edit-details.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

const PANEL = read('src/components/receiving/workspace/LineEditPanel.tsx');
const TRIAGE = read('src/components/receiving/triage/TriagePanel.tsx');
const CHIP = read('src/components/receiving/workspace/line-edit/IdentityLinkChip.tsx');
const OVERLAYS = read('src/components/receiving/useReceivingDetailOverlays.ts');
const RIGHT = read('src/components/receiving/ReceivingRightPane.tsx');
const EVENTS = read('src/utils/events.ts');
const PO_TAB = read('src/components/sidebar/receiving/incoming-details/PoTab.tsx');
const DETAILS_ROUTE = read('src/app/api/receiving-lines/incoming/details/route.ts');

test('LineEditPanel always wires onEditPo to openPoPairing (not gated on hasRealZohoPoId)', () => {
  assert.match(PANEL, /onEditPo=\{openPoPairing\}/);
  assert.doesNotMatch(
    PANEL,
    /onEditPo=\{!hasRealZohoPoId/,
    'linked POs must keep Edit — do not re-gate on hasRealZohoPoId',
  );
  assert.match(PANEL, /poEditOpen=\{activeSideTab === 'linkage' && linkageAction === 'link'\}/);
  assert.match(PANEL, /onOrderDetails=\{openOrderConnectionDetails\}/);
  assert.match(PANEL, /dispatchReceivingOpenIncomingDetails/);
  assert.match(PANEL, /receivingId: row\.receiving_id/);
  assert.match(PANEL, /receivingLineId: row\.id/);
});

test('TriagePanel always wires onEditPo + onOrderDetails', () => {
  assert.match(TRIAGE, /onEditPo=\{openPoPairing\}/);
  assert.doesNotMatch(TRIAGE, /onEditPo=\{!hasRealZohoPoId/);
  assert.match(TRIAGE, /onOrderDetails=\{openOrderConnectionDetails\}/);
  assert.match(TRIAGE, /dispatchReceivingOpenIncomingDetails/);
  assert.match(TRIAGE, /receivingId: row\.receiving_id/);
});

test('IdentityLinkChip exposes Details menuitem below Edit when onDetails is set', () => {
  assert.match(CHIP, /onDetails\?:/);
  assert.match(CHIP, /detailsLabel/);
  // Order: Edit block then Details block (Open → Edit → Details).
  const editIdx = CHIP.indexOf('{onEdit && editInMenu ? (');
  const detailsIdx = CHIP.indexOf('{onDetails ? (');
  assert.ok(editIdx > 0 && detailsIdx > editIdx, 'Details must render after Edit');
});

test('Incoming details event + Unbox/Triage mount via IncomingDetailsMount', () => {
  assert.match(EVENTS, /RECEIVING_OPEN_INCOMING_DETAILS_EVENT/);
  assert.match(EVENTS, /dispatchReceivingOpenIncomingDetails/);
  assert.match(EVENTS, /receivingId\?:/);
  assert.match(OVERLAYS, /RECEIVING_OPEN_INCOMING_DETAILS_EVENT/);
  assert.match(OVERLAYS, /receivingId/);
  // Shared helper mounts on Unbox, Triage, and History/Incoming — not Early-return dead.
  assert.match(RIGHT, /function IncomingDetailsMount/);
  const mountCallCount = (RIGHT.match(/<IncomingDetailsMount /g) ?? []).length;
  assert.ok(mountCallCount >= 3, `IncomingDetailsMount must appear ≥3 times (got ${mountCallCount})`);
  assert.match(RIGHT, /focusReceivingId=\{target\.receivingId\}/);
});

test('PoTab surfaces line items + Change PO; details API honors receiving_id', () => {
  assert.match(PO_TAB, /dispatchReceivingOpenPairingPo/);
  assert.match(PO_TAB, /Change PO/);
  assert.match(PO_TAB, /line_items/);
  assert.match(PO_TAB, /focusReceivingLineId/);
  assert.match(DETAILS_ROUTE, /focusReceivingId/);
  assert.match(DETAILS_ROUTE, /receiving_id/);
});
