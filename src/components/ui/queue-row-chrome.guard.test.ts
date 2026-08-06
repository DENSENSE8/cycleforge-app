import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  NAV_ROW,
  QUEUE_ROW,
  QUEUE_ROW_META_INDENT,
  ledgerRowFillClass,
  ledgerRowStateClass,
  metaIndentFor,
} from '@/components/ui/queue-row-chrome';

/**
 * Queue-row left-edge SoT:
 *   • Ops/station rows use QUEUE_ROW.px + metaIndentFor (never page-local px-4
 *     or hand-rolled select-gutter calcs).
 *   • Navigator rails (facet / saved-view / day-tree) use NAV_ROW — never the
 *     queue blue selectedClass.
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

  it('core queue rows compose QUEUE_ROW.px and metaIndentFor', () => {
    const files = [
      ['ReceivingLineOrderRow', '../station/ReceivingLineOrderRow.tsx'],
      ['OrdersQueueTableRow', '../dashboard/orders-queue/OrdersQueueTableRow.tsx'],
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
      } else {
        assert.ok(src.includes('QUEUE_ROW.px'), `${name} must apply QUEUE_ROW.px`);
        assert.ok(src.includes('metaIndentFor('), `${name} must call metaIndentFor(`);
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

  it('OrdersGridView outer shell has no list-body px-2 inset', () => {
    const src = readSibling('../dashboard/orders-queue/OrdersGridView.tsx');
    assert.ok(src.includes('LedgerGrid'), 'OrdersGridView must compose LedgerGrid');
    assert.doesNotMatch(
      src,
      /flex w-full flex-col px-2/,
      'OrdersGridView must not add list-body px-2',
    );
  });

  it('ledgerRowStateClass is fill-only (no inset ring under airtable)', () => {
    const selected = ledgerRowStateClass(true);
    assert.ok(selected.includes('bg-blue-50'), 'selected ledger row must wash blue');
    assert.ok(
      !selected.includes('ring-inset'),
      'selected ledger row must not use ring-inset (airtable L-glow)',
    );
    assert.equal(QUEUE_ROW.selectedLedgerClass, 'bg-blue-50');
    assert.ok(
      QUEUE_ROW.selectedClass.includes('ring-inset'),
      'list selectedClass keeps the inset ring',
    );
  });

  it('ledgerRowFillClass ignores triage wash when capability is off', () => {
    const catalog = ledgerRowFillClass({
      selected: false,
      flagClass: 'bg-violet-50',
      capabilities: { rowTriageFlags: false },
    });
    assert.ok(catalog.includes('bg-surface-card'), 'Catalog must stay on card ground');
    assert.ok(!catalog.includes('bg-violet-50'), 'Catalog must not paint staff triage wash');

    const orders = ledgerRowFillClass({
      selected: false,
      flagClass: 'bg-violet-50',
      capabilities: { rowTriageFlags: true },
    });
    assert.ok(orders.includes('bg-violet-50'), 'Orders may paint triage wash when capability is on');

    const selectedWins = ledgerRowFillClass({
      selected: true,
      flagClass: 'bg-violet-50',
      capabilities: { rowTriageFlags: true },
    });
    assert.ok(selectedWins.includes('bg-blue-50'), 'selection outranks triage wash');
    assert.ok(!selectedWins.includes('bg-violet-50'), 'selection must not keep the flag fill');
  });

  it('ledgerRowFillClass linked wash is quieter than selection and outranked by it', () => {
    assert.equal(QUEUE_ROW.linkedLedgerClass, 'bg-surface-sunken');
    assert.ok(
      !QUEUE_ROW.linkedLedgerClass.includes('blue-'),
      'linked peer wash must not reuse selection blue',
    );

    const linked = ledgerRowFillClass({
      selected: false,
      linked: true,
      capabilities: { rowTriageFlags: false },
    });
    assert.ok(linked.includes('bg-surface-sunken'), 'linked peer paints sunken wash');
    assert.ok(!linked.includes('bg-blue-50'), 'linked peer is not selection');

    const selectedBeatsLinked = ledgerRowFillClass({
      selected: true,
      linked: true,
      capabilities: { rowTriageFlags: false },
    });
    assert.ok(selectedBeatsLinked.includes('bg-blue-50'), 'selection outranks linked');
    assert.ok(
      !selectedBeatsLinked.includes('bg-surface-sunken'),
      'selection must not keep the linked fill',
    );

    const linkedBeatsFlag = ledgerRowFillClass({
      selected: false,
      linked: true,
      flagClass: 'bg-violet-50',
      capabilities: { rowTriageFlags: true },
    });
    assert.ok(linkedBeatsFlag.includes('bg-surface-sunken'), 'linked outranks triage flag');
    assert.ok(!linkedBeatsFlag.includes('bg-violet-50'), 'linked must not keep flag fill');
  });

  it('UnboxCompareHost wires crosshair props into panes', () => {
    const src = readSibling('../receiving/unbox/compare/UnboxCompareHost.tsx');
    assert.ok(src.includes('linkedReceivingId'), 'host must pass linkedReceivingId');
    assert.ok(src.includes('stickyReceivingId'), 'host must pass stickyReceivingId');
    assert.ok(src.includes('onCrosshairHover'), 'host must pass onCrosshairHover');
    assert.ok(src.includes('onCrosshairSelect'), 'host must pass onCrosshairSelect');
    assert.ok(
      src.includes('resolveUnboxCompareCrosshair'),
      'host must resolve hover ?? sticky via SoT helper',
    );
  });

  it('OrdersQueueTableRow gridSkin uses capability-gated ledgerRowFillClass', () => {
    const src = readSibling('../dashboard/orders-queue/OrdersQueueTableRow.tsx');
    assert.ok(
      src.includes('ledgerRowFillClass'),
      'Pending gridSkin must compose ledgerRowFillClass (selection + triage via capabilities)',
    );
    assert.ok(
      src.includes('ORDERS_GRID_CAPABILITIES'),
      'Pending gridSkin must pass ORDERS_GRID_CAPABILITIES so triage wash stays opt-in',
    );
  });

  it('NAV_ROW.selectedClass stays quiet (no blue hue)', () => {
    assert.equal(NAV_ROW.selectedClass, 'bg-surface-sunken font-semibold text-text-default');
    assert.doesNotMatch(
      NAV_ROW.selectedClass,
      /blue-/,
      'NAV_ROW must not carry a blue selected wash — that is QUEUE_ROW',
    );
  });

  it('ops navigators compose NAV_ROW, not QUEUE_ROW.selectedClass', () => {
    const files = [
      ['SidebarSectionList', '../sidebar/SidebarSectionList.tsx'],
      ['SavedViewsList', '../saved-views/SavedViewsList.tsx'],
      ['PhotoLibrarySidebarPanel', '../photos/PhotoLibrarySidebarPanel.tsx'],
      ['OutboundSidebarFilterMap', '../unshipped/OutboundSidebarFilterMap.tsx'],
    ] as const;

    for (const [name, path] of files) {
      const src = readSibling(path);
      assert.ok(src.includes('NAV_ROW'), `${name} must import/use NAV_ROW`);
      assert.ok(
        !src.includes('QUEUE_ROW.selectedClass'),
        `${name} must not use QUEUE_ROW.selectedClass (navigator ≠ record pick)`,
      );
      assert.doesNotMatch(
        src,
        /bg-blue-50[^'"]*ring-1 ring-inset ring-blue-400/,
        `${name} must not hand-roll the queue blue selected ring`,
      );
    }
  });
});
