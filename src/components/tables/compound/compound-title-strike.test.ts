/** The struck title — a compound line whose work is done (Daily's tick). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOUND_TRACKS } from './compound-columns';
import { renderCompoundGridCell } from './CompoundGridCell';
import type { CompoundRowView } from './compound-row-model';

const CHECK: CompoundRowView = {
  id: '7',
  thumbUrl: null,
  title: 'Front door locked',
  note: '3/5 done',
  orderId: null,
  tracking: null,
  platformValue: null,
  carrier: null,
  stateLabel: 'OPEN',
  stateTone: 'neutral',
  delay: null,
  amount: null,
};

function paintItem(view: CompoundRowView) {
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderCompoundGridCell({
        col: COMPOUND_TRACKS.find((c) => c.key === 'item')!,
        columns: COMPOUND_TRACKS,
        rule: true,
        view,
      }) as React.ReactElement,
    ),
  );
}

function paintIdentity(view: CompoundRowView) {
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      renderCompoundGridCell({
        col: COMPOUND_TRACKS.find((c) => c.key === 'fulfillment')!,
        columns: COMPOUND_TRACKS,
        rule: true,
        view,
      }) as React.ReactElement,
    ),
  );
}

describe('compound title strike', () => {
  it('is absent entirely for a family that does not declare it', () => {
    const html = paintItem(CHECK);
    assert.match(html, /Front door locked/);
    assert.doesNotMatch(html, /data-struck/);
    assert.doesNotMatch(html, /text-text-muted"[^>]*>Front door locked/);
  });

  it('mounts the strike invisible for an unchecked row', () => {
    const html = paintItem({ ...CHECK, titleStruck: false });
    assert.match(html, /data-struck="false"[^>]*decoration-transparent[^>]*text-decoration-thickness:0px/);
    assert.doesNotMatch(html, /text-text-muted"[^>]*>Front door locked/);
  });

  it('strikes and mutes a checked row', () => {
    const html = paintItem({ ...CHECK, titleStruck: true, stateLabel: 'DONE', stateTone: 'done' });
    assert.match(html, /data-struck="true"[^>]*text-text-muted[^>]*text-decoration-thickness:1px/);
  });
});

describe('compound identity face', () => {
  it('paints a local handle plainly — no brand dot, no marketplace menu', () => {
    const html = paintIdentity({
      ...CHECK,
      identityFace: { value: '7', label: 'Checklist item id' },
    });
    assert.match(html, />7</);
    assert.doesNotMatch(html, /Copy order number/i);
    assert.doesNotMatch(html, /data-brand-identity-dot/);
  });

  it('leaves the ORDER paint untouched for a family with an order', () => {
    const html = paintIdentity({ ...CHECK, orderId: '111-2222222-3333333' });
    assert.match(html, /111-2222222-3333333/);
  });

  it('dashes when a family has neither', () => {
    const html = paintIdentity(CHECK);
    assert.doesNotMatch(html, />7</);
  });
});
