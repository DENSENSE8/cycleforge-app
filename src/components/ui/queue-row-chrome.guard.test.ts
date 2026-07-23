import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  QUEUE_ROW,
  QUEUE_ROW_META_INDENT,
  metaIndentFor,
  queueGroupNestClass,
} from '@/components/ui/queue-row-chrome';

/**
 * Queue-row left-edge SoT:
 *   • Ops/station rows use QUEUE_ROW.px + metaIndentFor (never page-local px-4
 *     or hand-rolled select-gutter calcs).
 *   • CollapsibleGroupRow nest padding is tokenized; no always-on pl-5.
 */

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('queue-row left-edge chrome', () => {
  it('metaIndentFor pairs default/wide tracks with select gutter', () => {
    assert.equal(metaIndentFor('default', false), QUEUE_ROW_META_INDENT.default);
    assert.equal(metaIndentFor('wide', false), QUEUE_ROW_META_INDENT.wide);
    assert.equal(
      metaIndentFor('default', true),
      `calc(${QUEUE_ROW_META_INDENT.default} + ${QUEUE_ROW.selectGutter})`,
    );
    assert.equal(
      metaIndentFor('wide', true),
      `calc(${QUEUE_ROW_META_INDENT.wide} + ${QUEUE_ROW.selectGutter})`,
    );
  });

  it('queueGroupNestClass pads only when chevron is shown', () => {
    assert.equal(queueGroupNestClass(true), QUEUE_ROW.nestWithChevron);
    assert.equal(queueGroupNestClass(false), QUEUE_ROW.nestNoChevron);
  });

  it('core queue rows compose QUEUE_ROW.px and metaIndentFor', () => {
    const files = [
      ['ReceivingLineOrderRow', '../station/ReceivingLineOrderRow.tsx'],
      ['ReceivingPoSummary', '../station/ReceivingPoSummary.tsx'],
      ['OrdersQueueTableRow', '../dashboard/orders-queue/OrdersQueueTableRow.tsx'],
      ['StationRecordShell', '../station/StationRecordShell.tsx'],
    ] as const;

    for (const [name, path] of files) {
      const src = readSibling(path);
      assert.ok(
        src.includes('QUEUE_ROW') || src.includes('metaIndentFor'),
        `${name} must import QUEUE_ROW and/or metaIndentFor`,
      );
      if (name === 'OrdersQueueTableRow') {
        assert.ok(src.includes('QUEUE_ROW.px'), `${name} must apply QUEUE_ROW.px`);
        assert.ok(
          src.includes('ordersQueueGridTemplate') || src.includes('ordersQueueRowShellClass'),
          `${name} must use the orders-queue columnar shell`,
        );
        assert.ok(src.includes('metaIndentFor('), `${name} must keep metaIndentFor for mobile`);
      } else if (name !== 'ReceivingPoSummary' && name !== 'StationRecordShell') {
        assert.ok(src.includes('QUEUE_ROW.px'), `${name} must apply QUEUE_ROW.px`);
        assert.ok(src.includes('metaIndentFor('), `${name} must call metaIndentFor(`);
      }
      if (name === 'ReceivingPoSummary') {
        assert.ok(src.includes("metaIndentFor('wide'"), `${name} must use wide metaIndentFor`);
      }
      if (name === 'StationRecordShell') {
        assert.ok(src.includes('QUEUE_ROW.px'), `${name} must apply QUEUE_ROW.px`);
      }
      assert.doesNotMatch(
        src,
        /\bpx-4\b/,
        `${name} must not use page-local px-4 for row chrome`,
      );
      assert.doesNotMatch(
        src,
        /calc\(\$\{META_COL\.indent/,
        `${name} must not hand-roll select-gutter meta indent`,
      );
    }
  });

  it('CollapsibleGroupRow uses QUEUE_ROW nest tokens', () => {
    const src = readSibling('./CollapsibleGroupRow.tsx');
    assert.ok(src.includes('queueGroupNestClass'), 'CollapsibleGroupRow must call queueGroupNestClass');
    assert.ok(src.includes('QUEUE_ROW.px'), 'CollapsibleGroupRow header must use QUEUE_ROW.px');
    assert.doesNotMatch(src, /\bpl-5\b/, 'CollapsibleGroupRow must not hardcode pl-5');
  });

  it('OrdersGridView outer shell has no list-body px-2 inset', () => {
    const src = readSibling('../dashboard/orders-queue/OrdersGridView.tsx');
    assert.ok(src.includes('LedgerGrid'), 'OrdersGridView must compose LedgerGrid');
    assert.doesNotMatch(
      src,
      /flex w-full flex-col px-2/,
      'OrdersGridView must not add list-body px-2',
    );
  });
});
