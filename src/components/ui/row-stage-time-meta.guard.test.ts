import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Stage-clock alignment SoT:
 *   • Receiving PO accordion headers MUST mirror child `condCol={META_COL.poCondCol}`
 *     so PARTS / L-NEW grades do not shift the stage clock vs single-line rows.
 *   • Ops tables that show a stage stamp under the title go through RowStageTimeMeta
 *     (fixed META_REST_COL.stageTime track) — not a bare tabular-nums span.
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('row stage-time meta alignment', () => {
  it('Receiving PO header and line row share poCondCol', () => {
    const poSummary = readSibling('../station/ReceivingPoSummary.tsx');
    const lineRow = readSibling('../station/ReceivingLineOrderRow.tsx');
    const mobile = readSibling('../mobile/receiving/MobileReceivingRow.tsx');

    for (const [name, src] of [
      ['ReceivingPoSummary', poSummary],
      ['ReceivingLineOrderRow', lineRow],
      ['MobileReceivingRow', mobile],
    ] as const) {
      assert.match(
        src,
        /condCol=\{META_COL\.poCondCol\}/,
        `${name} must pass condCol={META_COL.poCondCol} so stage clocks column-align`,
      );
    }
  });

  it('Receiving PO header reserves the stage-clock track like line rows', () => {
    const poSummary = readSibling('../station/ReceivingPoSummary.tsx');
    assert.match(
      poSummary,
      /RowStageTimeMeta[\s\S]*?reserve/,
      'ReceivingPoSummary must reserve RowStageTimeMeta so missing stamps do not shift rest',
    );
  });

  it('OrdersQueue age column and Shipped stage clocks stay on SoT tracks', () => {
    const ordersQueue = readSibling('../dashboard/orders-queue/OrdersQueueTableRow.tsx');
    const shipped = readSibling('../shipped/ShippedRecordRow.tsx');

    // Pending WMS table uses a fixed Age column (days-late / lane age) — not a
    // stage stamp under a two-line title stack.
    assert.ok(
      ordersQueue.includes('ordersQueueGridTemplate'),
      'OrdersQueueTableRow must use the fixed orders-queue column grid',
    );
    assert.ok(
      ordersQueue.includes('data-col="age"') || ordersQueue.includes('getDaysLateTone'),
      'OrdersQueueTableRow must render age / days-late in the Age column',
    );

    assert.ok(
      shipped.includes("from '@/components/ui/RowStageTimeMeta'"),
      'ShippedRecordRow must import RowStageTimeMeta',
    );
    assert.ok(shipped.includes('<RowStageTimeMeta'), 'ShippedRecordRow must render RowStageTimeMeta');
  });
});
