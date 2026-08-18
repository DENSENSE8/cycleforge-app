import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Stage-clock alignment SoT:
 *   • Receiving list/mobile line rows use `condCol={META_COL.poCondCol}` so
 *     PARTS / L-NEW grades do not shift the stage clock.
 *   • Ops tables that show a stage stamp under the title go through RowStageTimeMeta
 *     (fixed META_REST_COL.stageTime track) — not a bare tabular-nums span.
 *   • Outbound spreadsheet rows use Age column (days-late) on OrdersQueueTableRow —
 *     not a stage stamp under a two-line title stack.
 *   • Collapsed PO summary folds are retired on Receiving Sheets (flat leaves).
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('row stage-time meta alignment', () => {
  it('Receiving list/mobile line rows share poCondCol', () => {
    const lineRow = readSibling('../station/ReceivingLineOrderRow.tsx');
    const mobile = readSibling('../mobile/receiving/MobileReceivingRow.tsx');

    for (const [name, src] of [
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

  it('OrdersQueue Late column stays on SoT tracks', () => {
    const ordersQueue = readSibling('../dashboard/orders-queue/OrdersQueueTableRow.tsx');

    assert.ok(
      ordersQueue.includes('ordersQueueGridTemplate'),
      'OrdersQueueTableRow must use the fixed orders-queue column grid',
    );
    // Compact derived days-late track — face is `Nd`, civil ship-by stays in
    // the tooltip. Pin the shared age presenter so a future edit can't quietly
    // reintroduce a local date face in this urgency column.
    assert.ok(
      ordersQueue.includes('data-col="age"'),
      'OrdersQueueTableRow must render the Late (age) column',
    );
    assert.ok(
      ordersQueue.includes('GridAgeCellValue'),
      'the age cell must compose the shared SoT presenter, not a local days-late span',
    );
    assert.ok(
      !ordersQueue.includes('GridSlaCellValue'),
      'fused Ship-by SLA presenter is retired on the orders queue',
    );
    assert.ok(
      readSibling('./grid-cells.tsx').includes('getDaysLateTone'),
      'GridAgeCellValue must keep resolving lateness tone through the date SoT',
    );
  });
});
