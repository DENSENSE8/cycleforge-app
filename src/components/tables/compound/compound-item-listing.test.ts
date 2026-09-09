/**
 * To-ship listing join: title is a black/blue-on-hover hyperlink. Under the
 * title, qty · condition · notes sit LEFT — the item-number listing actions
 * live on the product-title hover surface.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOUND_TRACKS } from './compound-columns';
import { renderCompoundGridCell } from './CompoundGridCell';
import type { CompoundRowView, CompoundSubtitleEdit } from './compound-row-model';

const VIEW: CompoundRowView = {
  id: '1',
  thumbUrl: null,
  title: 'Bose Companion 2',
  note: null,
  orderId: '111-2222222-3333333',
  tracking: null,
  platformValue: null,
  carrier: null,
  stateLabel: 'PENDING',
  stateTone: 'neutral',
  delay: null,
  amount: null,
  subtitleParts: [
    { text: '1', key: 'orders.qty', widthCh: 2 },
    { text: 'Used', key: 'orders.condition' },
    { text: '123456789012', key: 'orders.item_number' },
  ],
};

function paintItem(
  view: CompoundRowView,
  extras?: {
    subtitleNoteKey?: string;
    noteText?: string | null;
    subtitleEdits?: readonly CompoundSubtitleEdit[];
  },
) {
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderCompoundGridCell({
        col: COMPOUND_TRACKS.find((c) => c.key === 'item')!,
        columns: COMPOUND_TRACKS,
        rule: true,
        view,
        subtitleEdits: extras?.subtitleEdits,
        subtitleNoteKey: extras?.subtitleNoteKey,
        noteText: extras?.noteText,
      }) as React.ReactElement,
    ),
  );
}

describe('compound item listing join', () => {
  it('keeps a plain title when there is no listing href', () => {
    const html = paintItem(VIEW);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /Bose Companion 2/);
  });

  it('paints the title black, blue only on hover', () => {
    const html = paintItem({
      ...VIEW,
      titleHref: 'https://www.ebay.com/itm/123456789012',
    });
    assert.match(html, /href="https:\/\/www\.ebay\.com\/itm\/123456789012"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /Bose Companion 2/);
    assert.match(html, /text-text-default hover:text-text-info/);
  });

  it('removes the listing icon from under the title and keeps the item number hidden', () => {
    const html = paintItem(
      { ...VIEW, titleHref: 'https://www.ebay.com/itm/123456789012' },
      {
        subtitleEdits: [{
          partKey: 'orders.item_number',
          label: 'Item number',
          value: '123456789012',
          onCommit: () => undefined,
        }],
      },
    );
    assert.doesNotMatch(html, /aria-label="Open listing"/);
    assert.doesNotMatch(html, />56789012</);
    assert.match(html, />1</);
    assert.match(html, /Used/);
    assert.match(html, /justify-start/);
  });

  it('paints a Figma-style scrub host on an editable price', () => {
    const html = paintItem(
      {
        ...VIEW,
        subtitleParts: [
          { text: '$49.99', key: 'orders.amount', toneClass: 'font-semibold text-text-success', widthCh: 8 },
        ],
      },
      {
        subtitleEdits: [{
          partKey: 'orders.amount',
          label: 'Amount',
          value: '49.99',
          kind: 'numeric',
          scrub: { step: 1, coarseStep: 10, fineStep: 0.01, min: 0, decimals: 2, money: true },
          onCommit: () => undefined,
        }],
      },
    );
    assert.match(html, /data-subtitle-scrub=""/);
    assert.match(html, /data-cursor="resize-x"/);
    assert.match(html, /data-slot="input-group"/);
    assert.match(html, /data-money-prefix=""/);
    assert.match(html, /role="spinbutton"/);
    assert.match(html, />\$</);
    assert.match(html, /49\.99/);
    assert.doesNotMatch(html, /border-border-success/);
  });

  it('paints the price in the house money tone', () => {
    const html = paintItem({
      ...VIEW,
      subtitleParts: [
        { text: '$49.99', key: 'orders.amount', toneClass: 'font-semibold text-text-success', widthCh: 8 },
      ],
    });
    assert.match(html, /text-text-success/);
    assert.match(html, /\$49\.99/);
  });

  it('paints qty left-most even when subtitleParts arrive reversed', () => {
    const html = paintItem({
      ...VIEW,
      subtitleParts: [
        { text: 'Used', key: 'orders.condition' },
        { text: '4', key: 'orders.qty', widthCh: 2 },
      ],
    });
    const qtyAt = html.indexOf('>4<');
    const condAt = html.indexOf('Used');
    assert.ok(qtyAt >= 0 && condAt >= 0 && qtyAt < condAt);
  });

  it('keeps the row note when the only bound part is qty', () => {
    const html = paintItem(
      {
        ...VIEW,
        note: 'leave at dock',
        subtitleParts: [{ text: '1', key: 'orders.qty', widthCh: 2 }],
      },
    );
    assert.match(html, />1</);
    assert.match(html, /leave at dock/);
  });

  it('does not invent middle-dot separators between under-title facts', () => {
    const html = paintItem(VIEW);
    assert.doesNotMatch(html, />·</);
    assert.match(html, />1</);
    assert.match(html, /Used/);
  });

  it('does not paint a listing glyph when the item number is missing', () => {
    const html = paintItem({
      ...VIEW,
      subtitleParts: [
        { text: '1', key: 'orders.qty', widthCh: 2 },
        { text: 'Used', key: 'orders.condition' },
        { text: '', key: 'orders.item_number' },
      ],
    });
    assert.doesNotMatch(html, /aria-label="No listing"/);
  });

  it('paints written notes as muted subtitle text, not the glyph', () => {
    const html = paintItem(
      {
        ...VIEW,
        subtitleParts: [
          ...VIEW.subtitleParts,
          { text: 'leave at dock', key: 'orders.notes' },
        ],
      },
      { subtitleNoteKey: 'orders.notes', noteText: 'leave at dock' },
    );
    assert.match(html, /leave at dock/);
    assert.match(html, /text-text-muted/);
    assert.doesNotMatch(html, /Add a note/);
  });

  it('paints the notes glyph when the note is empty', () => {
    const html = paintItem(
      {
        ...VIEW,
        subtitleParts: [...VIEW.subtitleParts, { text: '--', key: 'orders.notes' }],
      },
      { subtitleNoteKey: 'orders.notes', noteText: '' },
    );
    assert.doesNotMatch(html, /leave at dock/);
    // `--` is the empty-editable placeholder, not a written note.
    assert.doesNotMatch(html, />--</);
  });

  it('marks under-title facts as pointer-reorder targets when a reorder handler is present', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderCompoundGridCell({
          col: COMPOUND_TRACKS.find((c) => c.key === 'item')!,
          columns: COMPOUND_TRACKS,
          rule: true,
          view: VIEW,
          onReorderSubtitle: () => undefined,
        }) as React.ReactElement,
      ),
    );
    assert.match(html, /data-subtitle-reorder="true"/);
    assert.match(html, /data-subtitle-part="orders.qty"/);
    assert.match(html, /data-subtitle-part="orders.condition"/);
    assert.doesNotMatch(html, /data-subtitle-part="orders.item_number"/);
    assert.match(html, /justify-start/);
    assert.doesNotMatch(html, /draggable="true"/);
  });
});
