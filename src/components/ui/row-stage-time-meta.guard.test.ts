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

  it('OrdersQueue and Shipped stage clocks use RowStageTimeMeta', () => {
    const ordersQueue = readSibling('../dashboard/orders-queue/OrdersQueueTableRow.tsx');
    const shipped = readSibling('../shipped/ShippedRecordRow.tsx');

    assert.ok(
      ordersQueue.includes("from '@/components/ui/RowStageTimeMeta'"),
      'OrdersQueueTableRow must import RowStageTimeMeta',
    );
    assert.ok(ordersQueue.includes('<RowStageTimeMeta'), 'OrdersQueueTableRow must render RowStageTimeMeta');

    assert.ok(
      shipped.includes("from '@/components/ui/RowStageTimeMeta'"),
      'ShippedRecordRow must import RowStageTimeMeta',
    );
    assert.ok(shipped.includes('<RowStageTimeMeta'), 'ShippedRecordRow must render RowStageTimeMeta');
  });
});
