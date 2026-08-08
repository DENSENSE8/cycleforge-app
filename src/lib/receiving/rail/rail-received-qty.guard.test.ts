/**
 * Hard law: **Unboxed ≠ Received** on receiving-rail Received meters.
 *
 * Operator "Received" means inventory-confirmed (or local-only done via
 * `isOperatorReceived`) — never floor `quantity_received` alone. Coarse UNBOXED
 * at floor 1/1 must display **0/expected** with an empty bar.
 *
 * SoT: `inventoryReceivedDisplayQty` / `RAIL_QTY` in `./quantity.tsx`
 * Gate: `isOperatorReceived` in `./status.ts`
 * Tip: `../unboxed-sync-tooltip.ts`
 * Detail: `.claude/rules/source-of-truth.md` → Unboxed ≠ Received
 *
 * Why a SOURCE guard: the regression shape is re-wiring the popover or row to
 * `row.quantity_received` (or a cosmetic half-fix: fill cap / blue bar) while
 * the helper still exists — invisible to a behavioral test of the helper alone.
 * Same reasoning as `order-note-grain.guard.test.ts`.
 *
 * Run: `npx tsx --test src/lib/receiving/rail/rail-received-qty.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { inventoryReceivedDisplayQty, RAIL_QTY } from './quantity';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose ABOUT the law can never satisfy the law. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const QUANTITY_SRC = code(sourceOf('./quantity.tsx'));
const FEED_RAIL_SRC = code(
  sourceOf('../../../components/sidebar/receiving/ReceivingFeedRail.tsx'),
);
const RAIL_BASE_SRC = code(
  sourceOf('../../../components/sidebar/receiving/RecentActivityRailBase.tsx'),
);

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 10,
    tracking_number: '1Z999',
    carrier: 'UPS',
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: 'PO-1',
    zoho_purchaseorder_number: 'PO-1',
    item_name: 'Widget',
    sku: 'WDG',
    quantity_received: 0,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'MATCHED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: true,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: 'PO',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    receiving_source: 'po',
    ...overrides,
  };
}

// ── Behavioral: Unboxed at floor 1/1 → Received meter 0/1 ──────────────────

test('UNBOXED with floor qty 1 displays Received 0/1 (empty meter)', () => {
  const r = row({ workflow_status: 'UNBOXED', quantity_received: 1, quantity_expected: 1 });
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 0, total: 1 });
  assert.deepEqual(RAIL_QTY.received.getPreviewQty(r), { current: 0, total: 1 });
});

test('DONE displays actual quantity_received on Received meter', () => {
  const r = row({ workflow_status: 'DONE', quantity_received: 1, quantity_expected: 1 });
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
  assert.deepEqual(RAIL_QTY.received.getPreviewQty(r), { current: 1, total: 1 });
});

test('Zoho-received-like displays actual qty even if workflow lags on UNBOXED', () => {
  const r = row({
    workflow_status: 'UNBOXED',
    quantity_received: 1,
    quantity_expected: 1,
    zoho_status: 'received',
  });
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
});

test('unfound carton unboxed locally displays received qty', () => {
  const r = row({
    receiving_source: 'unmatched',
    workflow_status: 'ARRIVED',
    quantity_received: 1,
    quantity_expected: 1,
    unboxed_at: '2026-01-02T00:00:00Z',
    zoho_purchaseorder_id: null,
  });
  assert.deepEqual(inventoryReceivedDisplayQty(r), { current: 1, total: 1 });
  assert.deepEqual(RAIL_QTY.unfound.getPreviewQty(r), { current: 1, total: 1 });
});

// ── Source wiring: SoT + consumers cannot bypass ───────────────────────────

test('quantity.tsx Received strategy goes through inventoryReceivedDisplayQty', () => {
  assert.match(
    QUANTITY_SRC,
    /function\s+renderReceivedQty[\s\S]*?inventoryReceivedDisplayQty\s*\(\s*row\s*\)/,
    'renderReceivedQty must call inventoryReceivedDisplayQty',
  );
  assert.match(
    QUANTITY_SRC,
    /const\s+receivedPreview\s*=\s*\([\s\S]*?\)\s*:\s*RailPreviewQty\s*=>\s*inventoryReceivedDisplayQty\s*\(\s*row\s*\)/,
    'receivedPreview must be inventoryReceivedDisplayQty',
  );
  assert.match(
    QUANTITY_SRC,
    /received\s*:\s*\{[\s\S]*?getPreviewQty\s*:\s*receivedPreview/,
    'RAIL_QTY.received must use receivedPreview',
  );
  assert.match(
    QUANTITY_SRC,
    /unfound\s*:\s*\{[\s\S]*?getPreviewQty\s*:\s*receivedPreview/,
    'RAIL_QTY.unfound must share the inventory-received gate',
  );
});

test('quantity.tsx bans cosmetic half-fixes (fill caps / pending-fill constants)', () => {
  assert.doesNotMatch(
    QUANTITY_SRC,
    /RAIL_INVENTORY_PENDING_FILL_PCT|railPreviewProgressPct/,
    'fill-cap helpers are banned — Unboxed must zero the Received number, not trim the bar',
  );
});

test('ReceivingFeedRail composes RAIL_QTY for preview qty (no inline Received)', () => {
  assert.match(FEED_RAIL_SRC, /import\s*\{\s*RAIL_QTY\s*\}\s*from\s*'@\/lib\/receiving\/rail\/quantity'/);
  assert.match(FEED_RAIL_SRC, /const\s+qty\s*=\s*RAIL_QTY\s*\[\s*feed\.qty\s*\]/);
  assert.match(FEED_RAIL_SRC, /previewQtyLabel=\{qty\.previewQtyLabel\}/);
  assert.match(FEED_RAIL_SRC, /getPreviewQty=\{qty\.getPreviewQty\}/);
  assert.doesNotMatch(
    FEED_RAIL_SRC,
    /previewQtyLabel\s*=\s*['"]Received['"]/,
    'do not hardcode Received label beside a local quantity_received preview',
  );
});

test('RecentActivityRailBase popover meter uses getQty only (not row.quantity_received)', () => {
  // Progress block must derive from getQty(row), never the floor column.
  assert.match(
    RAIL_BASE_SRC,
    /const\s*\{\s*current:\s*qtyCurrent,\s*total:\s*qtyTotal\s*\}\s*=\s*getQty\s*\(\s*row\s*\)/,
  );
  // Inside ReceivingPopoverContent, quantity_received must not drive the meter.
  const popoverStart = RAIL_BASE_SRC.indexOf('function ReceivingPopoverContent');
  assert.ok(popoverStart >= 0, 'ReceivingPopoverContent must exist');
  const popoverSrc = RAIL_BASE_SRC.slice(popoverStart);
  assert.doesNotMatch(
    popoverSrc,
    /row\.quantity_received/,
    'ReceivingPopoverContent must not read row.quantity_received for the Received meter',
  );
});
