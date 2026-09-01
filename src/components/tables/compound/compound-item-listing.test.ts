/**
 * To-ship listing join: title is a black/blue-on-hover hyperlink. Under the
 * title, qty · condition · listing glyph · notes sit LEFT — never the item
 * number, never middle dots. The notes editor opens bottom-right of the glyph.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOUND_TRACKS } from './compound-columns';
import { renderCompoundGridCell } from './CompoundGridCell';
import type { CompoundRowView, CompoundSubtitleCopy } from './compound-row-model';

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
  amount: '$49.99',
  subtitleParts: [
    { text: '1', key: 'orders.qty', widthCh: 2 },
    { text: 'Used', key: 'orders.condition' },
    { text: '123456789012', key: 'orders.item_number' },
  ],
};

function paintItem(
  view: CompoundRowView,
  copies?: readonly CompoundSubtitleCopy[],
  extras?: {
    subtitleNoteKey?: string;
    noteText?: string | null;
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
        subtitleCopies: copies,
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

  it('paints the listing icon under the title and never the item number', () => {
    const html = paintItem(
      { ...VIEW, titleHref: 'https://www.ebay.com/itm/123456789012' },
      [
        {
          partKey: 'orders.item_number',
          value: '123456789012',
          openHref: 'https://www.ebay.com/itm/123456789012',
        },
      ],
    );
    assert.doesNotMatch(html, />Listing</);
    assert.match(html, /aria-label="Open listing"/);
    assert.match(html, /text-text-info/);
    assert.match(html, /h-3 w-3/);
    assert.doesNotMatch(html, />56789012</);
    assert.match(html, />1</);
    assert.match(html, /Used/);
    assert.match(html, /justify-start/);
  });

  it('does not invent middle-dot separators between under-title facts', () => {
    const html = paintItem(VIEW);
    assert.doesNotMatch(html, />·</);
    assert.match(html, />1</);
    assert.match(html, /Used/);
  });

  it('paints a faint listing glyph when the item number is missing', () => {
    const html = paintItem({
      ...VIEW,
      subtitleParts: [
        { text: '1', key: 'orders.qty', widthCh: 2 },
        { text: 'Used', key: 'orders.condition' },
        { text: '', key: 'orders.item_number' },
      ],
    });
    assert.match(html, /aria-label="No listing"/);
    assert.match(html, /text-text-faint/);
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
      undefined,
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
      undefined,
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
    assert.match(html, /data-subtitle-part="orders.item_number"/);
    assert.match(html, /justify-start/);
    assert.doesNotMatch(html, /draggable="true"/);
  });
});
