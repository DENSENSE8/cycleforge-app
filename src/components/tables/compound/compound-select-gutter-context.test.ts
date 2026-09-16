import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOUND_TRACKS } from './compound-columns';
import { renderCompoundGridCell } from './CompoundGridCell';
import { SlotTableGroupFold, SlotTableGroupParentRow } from './SlotTableGroupParentRow';
import type { CompoundRowView } from './compound-row-model';

/**
 * The CONTEXTUAL select gutter (operator 2026-09-15), asserted on the mounted
 * cell rather than on the source:
 *
 * 1. at rest the box carries the row's triage glyph, and reaching for the row
 *    hands it back to the checkbox,
 * 2. the detail chevron is a reach affordance (closed ⇒ transparent, open ⇒
 *    standing) while the BUTTON keeps its hit plane either way,
 * 3. the edge rail hangs off the gutter CELL at full height — the failure this
 *    pins is the rail living inside the check, where a detail row clipped it to
 *    the top half of the box and the traveler bobbed out of view.
 *
 * Class strings are the subject on purpose: the swap is CSS (`group-hover/row`),
 * so "does the glyph yield to the square" is a question about emitted classes,
 * and nothing else in the stack can answer it.
 */

const VIEW: CompoundRowView = {
  id: '1',
  thumbUrl: null,
  title: 'A thing',
  note: null,
  orderId: 'ORD-1',
  tracking: '1Z999',
  platformValue: null,
  carrier: null,
  stateLabel: 'PENDING',
  stateTone: 'neutral',
  delay: null,
  amount: null,
};

const URGENT: CompoundRowView = {
  ...VIEW,
  edgeMark: {
    label: 'Urgent',
    kind: 'urgent',
    barClass: 'bg-yellow-400',
    pulse: true,
    tickClass: 'bg-yellow-100',
  },
};

const SHORT: CompoundRowView = {
  ...VIEW,
  edgeMark: {
    label: 'Out of stock',
    kind: 'attention',
    barClass: 'bg-rose-500',
    pulse: true,
    tickClass: 'bg-rose-100',
  },
};

/** Urgent AND short — the row that used to report only its expedite. */
const URGENT_AND_SHORT: CompoundRowView = {
  ...URGENT,
  itemStatus: { label: 'Out of stock', tip: 'Out of stock · SKU-1' },
};


function paintSelect(
  view: CompoundRowView,
  select: Parameters<typeof renderCompoundGridCell>[0]['select'],
): string {
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderCompoundGridCell({
        col: COMPOUND_TRACKS.find((c) => c.key === 'select')!,
        columns: COMPOUND_TRACKS,
        rule: true,
        view,
        select,
      }) as React.ReactElement,
    ),
  );
}

const LEAF = { checked: false as const, onToggle: () => {}, label: 'Select row' };
const CLOSED_DETAIL = { open: false, onToggle: () => {}, label: 'A thing' };

describe('the select gutter reports status at rest and selection on reach', () => {
  it('paints the urgent mark, and yields the box to the square on row hover', () => {
    const html = paintSelect(URGENT, LEAF);
    assert.match(html, /data-select-status-face="urgent"/);
    // The glyph steps aside for exactly the three conditions the square
    // steps INTO — hover, keyboard focus, no-hover pointer.
    assert.match(html, /group-hover\/row:opacity-0/);
    assert.match(html, /group-focus-visible\/select:opacity-0/);
    assert.match(html, /\[@media\(hover:none\)\]:opacity-0/);
    // It never eats a click: the whole cell stays the checkbox's hit plane.
    assert.match(html, /pointer-events-none/);
  });

  it('paints a shortage as the attention mark, not as urgent', () => {
    const html = paintSelect(SHORT, LEAF);
    assert.match(html, /data-select-status-face="attention"/);
    assert.doesNotMatch(html, /data-select-status-face="urgent"/);
  });

  it('carries BOTH marks in one box when a rush order is also short', () => {
    // Operator 2026-09-15: the box alternates between the bolt and the
    // triangle. Two LAYERS in one 16px square — not two glyphs side by side,
    // and not a single worst-mark that hides the other fact.
    const html = paintSelect(URGENT_AND_SHORT, LEAF);
    assert.match(html, /data-select-status-marks="2"/);
    assert.match(html, /data-select-status-face="urgent"/);
    assert.match(html, /data-select-status-face="attention"/);
    // Stacked: both layers claim the same box, so the glyph never shifts as
    // the rotation hands over.
    assert.equal((html.match(/absolute inset-0 flex items-center justify-center/g) ?? []).length, 2);
  });

  it('reports one mark as one layer', () => {
    assert.match(paintSelect(SHORT, LEAF), /data-select-status-marks="1"/);
  });

  it('says nothing at rest on an ordinary row', () => {
    // The 2026-09-04 ruling stands for rows with no mark: no resting glyph,
    // ever, on forty ordinary rows.
    assert.doesNotMatch(paintSelect(VIEW, LEAF), /data-select-status-face/);
  });

  it('drops the status glyph once the row is ticked', () => {
    // Membership must read straight down the column, so the accent square
    // stands alone rather than sharing the box.
    const html = paintSelect(URGENT, { ...LEAF, checked: true });
    assert.match(html, /data-select-square-face="on"/);
    assert.doesNotMatch(html, /data-select-status-face/);
  });
});

describe('the detail chevron is a reach affordance', () => {
  it('is transparent while closed, and reveals on hover / focus / touch', () => {
    const html = paintSelect(VIEW, { ...LEAF, detail: CLOSED_DETAIL });
    assert.match(html, /data-row-detail/);
    assert.match(html, /opacity-0 group-hover\/row:opacity-100/);
    assert.match(html, /group-focus-visible\/row-detail:opacity-100/);
    // The control itself is never gated — only its glyph. Its hit plane is the
    // whole band (COMPOUND_GUTTER_CHEVRON_BAND_CLASS), pinned under the mark.
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-label="Show more about A thing"/);
    assert.match(html, /absolute inset-x-0 bottom-0 h-6/);
  });

  it('stands once open — then it is state, not an invitation', () => {
    const html = paintSelect(VIEW, {
      ...LEAF,
      detail: { ...CLOSED_DETAIL, open: true },
    });
    assert.match(html, /aria-expanded="true"/);
    assert.doesNotMatch(html, /opacity-0 group-hover\/row:opacity-100/);
  });
});

describe('the edge rail belongs to the gutter cell', () => {
  it('hangs off the cell, full height, above the detail stack', () => {
    const html = paintSelect(URGENT, { ...LEAF, detail: CLOSED_DETAIL });
    // The positioning host is the CELL — without this the rail would resolve
    // against the row and shear under horizontal scroll.
    assert.match(html, /data-edge-mark-host/);
    assert.match(html, /data-edge-mark="Urgent"/);
    assert.match(html, /absolute inset-y-0 left-0/);
    assert.match(html, /w-\[3px\]/, 'the bar width comes from COMPOUND_EDGE_RAIL_CLASS');
    // Painted BEFORE the check and the chevron: the rail is the row's edge, and
    // the two controls are guests inside it.
    assert.ok(
      html.indexOf('data-edge-mark="Urgent"') < html.indexOf('data-row-detail'),
      'the rail is the cell\'s first child, not a sibling of the check',
    );
  });

  it('is the same full-height bar on a row with no detail chevron', () => {
    const html = paintSelect(SHORT, LEAF);
    assert.match(html, /data-edge-mark="Out of stock"/);
    assert.match(html, /absolute inset-y-0 left-0/);
    assert.match(html, /w-\[3px\]/);
  });

  it('is absent from an unmarked row', () => {
    assert.doesNotMatch(paintSelect(VIEW, LEAF), /data-edge-mark=/);
  });
});
/** The fold PARENT band — same gutter, one altitude up. */
function paintParent(
  folded: boolean,
  view: CompoundRowView | null,
  checked: boolean | 'mixed' = false,
): string {
  return renderToStaticMarkup(
    React.createElement(SlotTableGroupParentRow, {
      identity: { kind: 'order', value: 'ORD-1', dot: null, href: null, platformLabel: null },
      carriers: [],
      boxCount: 2,
      trackings: ['1ZAAA', '1ZBBB'],
      columns: COMPOUND_TRACKS,
      identityColumnKey: 'fulfillment',
      checked,
      onToggle: () => {},
      selectCount: 2,
      folded,
      onToggleFold: () => {},
      view,
    } as never),
  );
}

describe('the fold parent gutter matches its leaves', () => {
  it('hides the fold chevron in EVERY state — it only ever invites', () => {
    // Operator 2026-09-15: "it should not display any collapse state it should
    // only display on hover". Stricter than the leaf detail chevron, which
    // stands once open. The BUTTON stays — only the glyph waits.
    for (const folded of [true, false]) {
      const html = paintParent(folded, null);
      assert.match(html, /data-group-fold/);
      assert.match(html, /opacity-0 group-hover\/row:opacity-100/, `folded=${folded}`);
      assert.match(html, /group-focus-visible\/group-fold:opacity-100/);
    }
  });

  it('still announces the fold state at every opacity', () => {
    assert.match(paintParent(true, null), /aria-expanded="false"/);
    assert.match(paintParent(true, null), /aria-label="Show lines in ORD-1"/);
    assert.match(paintParent(false, null), /aria-expanded="true"/);
    assert.match(paintParent(false, null), /aria-label="Hide lines in ORD-1"/);
  });

  it('reports the group rollup at rest, pinned top and past the rail', () => {
    const html = paintParent(false, SHORT);
    assert.match(html, /data-select-status-face="attention"/);
    assert.match(html, /data-edge-mark="Out of stock"/);
    // Same pin as a leaf: mark at the top, fold chevron in the band under it.
    assert.match(html, /items-start/);
    assert.match(html, /\bpt-1\b/);
    assert.match(html, /pl-\[3px\]/);
    assert.match(html, /absolute inset-x-0 bottom-0 h-6/);
    // …and the gutter itself no longer boxes the control in a two-line stack.
    // Scoped to the gutter cell: the IDENTITY cell beside it is text over text
    // and keeps its own COMPOUND_TWO_LINE_CLASS grid.
    const gutter = html.slice(
      html.indexOf('data-select-gutter'),
      html.indexOf('data-col="fulfillment"'),
    );
    assert.ok(gutter.length > 0, 'the band must paint a select gutter');
    assert.doesNotMatch(gutter, /grid-rows-2/);
  });

  it('declares the row hover group so the swap can fire', () => {
    assert.match(paintParent(true, SHORT), /group\/row/);
  });

  it('washes the band when the whole group is selected', () => {
    // Operator 2026-09-15: the leaves turned blue under a white band, so a
    // fully-picked order looked half-picked. One cascade for both altitudes —
    // `ledgerRowFillClass` → QUEUE_ROW.selectedLedgerClass.
    assert.match(paintParent(false, null, true), /bg-blue-50/);
  });

  it('stays on card ground while idle or PARTLY selected', () => {
    // A full wash on `mixed` would claim a membership the group has not got;
    // the mixed square already says "some". Opaque either way — a see-through
    // band lets h-scrolled cells bleed under the frozen identity columns.
    for (const checked of [false, 'mixed'] as const) {
      const html = paintParent(false, null, checked);
      assert.match(html, /bg-surface-card/, `checked=${checked}`);
      assert.doesNotMatch(html, /bg-blue-50/, `checked=${checked}`);
    }
  });
});

describe('a multi-line fold speaks with two soft marks', () => {
  it('gives a group CHILD a membership rail on the identity track', () => {
    // Operator 2026-09-15: the black rule under the fold is replaced by a soft
    // rail down the children. Mounted on the identity cell, NOT in the select
    // gutter — the first 3px there belong to the triage rail, which is per-row
    // and conditional, so the same slot would mean two different facts.
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'fulfillment')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: { ...VIEW, quietIdentity: true },
        }) as React.ReactElement,
      ),
    );
    assert.match(html, /data-group-child-rail/);
    assert.match(html, /absolute inset-y-0 left-0 w-0\.5 bg-border-default/);
    // The rail hangs off the identity CELL, so the cell has to be the host.
    assert.match(html, /data-col="fulfillment"[^>]*relative/);
  });

  it('leaves a non-child row unmarked on the same track', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'fulfillment')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: VIEW,
        }) as React.ReactElement,
      ),
    );
    assert.doesNotMatch(html, /data-group-child-rail/);
  });

  it('closes the fold in a BORDER token, never in body-text ink', () => {
    // The 2026-09-14 "black and more visible" ruling is superseded: that ink
    // was only load-bearing while the close was the group's only evidence of
    // being a group. The close lives on the FOLD wrapper so it paints in both
    // states — collapsed under the band, expanded under the last leaf.
    const html = renderToStaticMarkup(
      React.createElement(
        SlotTableGroupFold,
        { multi: true },
        React.createElement('div', null, 'leaves'),
      ),
    );
    assert.match(html, /data-slot-table-fold-close/);
    assert.match(html, /bottom-0 z-sticky h-px bg-border-default/);
    assert.doesNotMatch(html, /h-px bg-text-default/);
  });

  it('never wraps a singleton in a fold close', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SlotTableGroupFold,
        { multi: false },
        React.createElement('div', null, 'one leaf'),
      ),
    );
    assert.doesNotMatch(html, /data-slot-table-fold-close/);
  });
});

