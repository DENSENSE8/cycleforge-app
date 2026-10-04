/**
 * "Product sent to customer" token grammar — parse / serialize / email HTML /
 * the mirrored-comment round trip.
 *
 *   node --import tsx --test src/lib/support/product-token.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  appendProductTokens,
  parseProductToken,
  parseProductTokens,
  productTokenReadable,
  serializeProductToken,
  stripSentProductLines,
} from './product-token';
import { markdownToHtml, renderBlockMarkdown } from './markdown';
import { ticketItemsForComment, type SupportTicketItem } from './ticket-items-shared';
import { buildComposerReplyVars } from '../composer/ticket-reply-payload';

describe('serialize / parse', () => {
  it('round-trips a ref', () => {
    const token = serializeProductToken({ skuCatalogId: 42, role: 'replacement', qty: 2 });
    assert.equal(token, '[[product:42|replacement|2]]');
    assert.deepEqual(parseProductToken(token), { skuCatalogId: 42, role: 'replacement', qty: 2 });
  });

  it('rejects unknown roles, zero qty and non-tokens', () => {
    assert.equal(parseProductToken('[[product:42|refund|1]]'), null);
    assert.equal(parseProductToken('[[product:42|return|0]]'), null);
    assert.equal(parseProductToken('[[product:0|return|1]]'), null);
    assert.equal(parseProductToken('product:42|return|1'), null);
    assert.throws(() => serializeProductToken({ skuCatalogId: 1, role: 'sent', qty: 0 }));
  });

  it('finds every token in a body, in order', () => {
    const body = 'Sending these:\n\n[[product:1|replacement|1]]\n\n[[product:2|return|3]] and text';
    assert.deepEqual(parseProductTokens(body), [
      { skuCatalogId: 1, role: 'replacement', qty: 1 },
      { skuCatalogId: 2, role: 'return', qty: 3 },
    ]);
  });

  it('appends picks as their own paragraphs', () => {
    const refs = [
      { skuCatalogId: 1, role: 'replacement' as const, qty: 1 },
      { skuCatalogId: 2, role: 'exchange' as const, qty: 1 },
    ];
    assert.equal(
      appendProductTokens('Hi there  ', refs),
      'Hi there\n\n[[product:1|replacement|1]]\n\n[[product:2|exchange|1]]',
    );
    assert.equal(appendProductTokens('', refs.slice(0, 1)), '[[product:1|replacement|1]]');
    assert.equal(appendProductTokens('unchanged', []), 'unchanged');
  });
});

describe('customer email HTML', () => {
  const face = { title: 'Bose SoundLink Mini II', sku: 'BOSE-SLM2' };

  it('reads as title + SKU, never the raw token', () => {
    const html = markdownToHtml('Your replacement is on the way.\n\n[[product:7|replacement|1]]', {
      productFace: (id) => (id === 7 ? face : null),
    });
    assert.equal(
      html,
      '<p>Your replacement is on the way.</p><p>Replacement × 1 — Bose SoundLink Mini II (SKU BOSE-SLM2)</p>',
    );
    assert.doesNotMatch(html, /\[\[product/);
  });

  it('escapes a hostile title', () => {
    const html = markdownToHtml('[[product:7|sent|1]]', {
      productFace: () => ({ title: '<img src=x onerror=alert(1)>', sku: 'A&B' }),
    });
    assert.equal(html, '<p>Sent × 1 — &lt;img src=x onerror=alert(1)&gt; (SKU A&amp;B)</p>');
  });

  it('without a face it still never leaks the token', () => {
    assert.equal(markdownToHtml('[[product:7|return|2]]'), '<p>Return × 2</p>');
  });

  it('the composer payload appends tokens to the body and names them in the HTML', () => {
    const vars = buildComposerReplyVars({
      ticketId: 10092,
      body: 'Shipping today.',
      isPublic: true,
      products: [{ skuCatalogId: 7, role: 'replacement', qty: 1, ...face }],
    });
    assert.ok(vars);
    assert.equal(vars.body, 'Shipping today.\n\n[[product:7|replacement|1]]');
    assert.equal(
      vars.htmlBody,
      '<p>Shipping today.</p><p>Replacement × 1 — Bose SoundLink Mini II (SKU BOSE-SLM2)</p>',
    );
  });

  it('a pick alone is something to send', () => {
    const vars = buildComposerReplyVars({
      ticketId: 1,
      body: '   ',
      isPublic: false,
      products: [{ skuCatalogId: 7, role: 'sent', qty: 1, ...face }],
    });
    assert.equal(vars?.body, '[[product:7|sent|1]]');
  });
});

describe('thread render', () => {
  it('hands the token to the surface card renderer', () => {
    const out = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderBlockMarkdown('Hi\n\n[[product:7|exchange|2]]', {
          renderProduct: (ref, key) =>
            React.createElement('span', { key, 'data-card': `${ref.skuCatalogId}:${ref.role}:${ref.qty}` }),
        }),
      ),
    );
    assert.match(out, /data-card="7:exchange:2"/);
    assert.doesNotMatch(out, /\[\[product/);
  });

  it('without a renderer the token reads as its role line', () => {
    const out = renderToStaticMarkup(
      React.createElement(React.Fragment, null, renderBlockMarkdown('[[product:7|exchange|2]]')),
    );
    assert.match(out, /Exchange × 2/);
  });
});

describe('mirrored comment round trip', () => {
  const item = (over: Partial<SupportTicketItem> = {}): SupportTicketItem => ({
    id: 1,
    ticketId: 10092,
    role: 'replacement',
    qty: 1,
    note: null,
    zendeskCommentId: 555,
    orderId: null,
    shippingLabelPurchaseId: null,
    staffId: 3,
    staffName: 'Kai',
    createdAt: '2026-10-03T00:00:00.000Z',
    product: { skuCatalogId: 7, sku: 'BOSE_SLM2', title: 'Bose SoundLink Mini II', imageUrl: null, onHand: 2, bin: 'A1' },
    ...over,
  });

  it('strips the readable line the email carried, even with an escaped SKU', () => {
    const mirrored = 'Shipping today.\n\nReplacement × 1 — Bose SoundLink Mini II (SKU BOSE\\_SLM2)';
    assert.equal(
      stripSentProductLines(mirrored, [{ role: 'replacement', qty: 1, sku: 'BOSE_SLM2' }]),
      'Shipping today.',
    );
  });

  it('keeps a look-alike line with a different qty or SKU', () => {
    const body = 'Replacement × 2 — Bose SoundLink Mini II (SKU BOSE_SLM2)';
    assert.equal(stripSentProductLines(body, [{ role: 'replacement', qty: 1, sku: 'BOSE_SLM2' }]), body);
  });

  it('binds items to their comment: card from the row, readable line removed', () => {
    const line = productTokenReadable({ role: 'replacement', qty: 1 }, { title: 'Bose SoundLink Mini II', sku: 'BOSE_SLM2' });
    const out = ticketItemsForComment(`Shipping today.\n\n${line}`, 555, [item(), item({ id: 2, zendeskCommentId: 999 })]);
    assert.equal(out.body, 'Shipping today.');
    assert.deepEqual(out.items.map((i) => i.id), [1]);
  });

  it('an echo that still carries the token paints the token, not a second card', () => {
    const out = ticketItemsForComment('[[product:7|replacement|1]]', 555, [item()]);
    assert.equal(out.body, '[[product:7|replacement|1]]');
    assert.deepEqual(out.items, []);
  });

  it('a comment with no bound items is untouched', () => {
    assert.deepEqual(ticketItemsForComment('hello', 1, [item()]), { body: 'hello', items: [] });
    assert.deepEqual(ticketItemsForComment('hello', null, [item()]), { body: 'hello', items: [] });
  });
});
