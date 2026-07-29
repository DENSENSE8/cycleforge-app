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
 *   • Outbound spreadsheet rows use Age column (days-late) on OrdersQueueTableRow —
 *     not a stage stamp under a two-line title stack.
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

  it('OrdersQueue ship-by column stays on SoT tracks', () => {
    const ordersQueue = readSibling('../dashboard/orders-queue/OrdersQueueTableRow.tsx');

    assert.ok(
      ordersQueue.includes('ordersQueueGridTemplate'),
      'OrdersQueueTableRow must use the fixed orders-queue column grid',
    );
    // The separate Date + Age pair fused into one `sla` track. The invariant
    // the old assertion protected — the row still shows days-late urgency —
    // is unchanged; it just lives in the fused cell now. Pin BOTH halves so a
    // future edit can't quietly drop the urgency half and keep the date.
    assert.ok(
      ordersQueue.includes('data-col="sla"'),
      'OrdersQueueTableRow must render the fused ship-by (sla) column',
    );
    assert.ok(
      ordersQueue.includes('GridSlaCellValue'),
      'the sla cell must compose the shared SoT presenter, not a local date+age',
    );
    assert.ok(
      readSibling('./grid-cells.tsx').includes('getDaysLateTone'),
      'GridSlaCellValue must keep resolving lateness tone through the date SoT',
    );
  });
});
