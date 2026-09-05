/**
 *   node --import tsx --test src/design-system/components/item-record/item-record-row-paint.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemRecordRow } from './ItemRecordRow';
import {
  ITEM_RECORD_IDLE_CLASS,
  ITEM_RECORD_RECEIVE_PAINT,
  itemRecordRowPaintClass,
} from './item-record-row-paint';
import type { ItemRecord, ItemRecordReceiveState } from './item-record-types';

const BASE: ItemRecord = {
  id: 1,
  title: 'ThinkPad X1',
  quantity: { counted: 0, expected: 1, receive: true },
};

function render(receiveState?: ItemRecordReceiveState, active = false) {
  return renderToStaticMarkup(
    React.createElement(ItemRecordRow, {
      item: receiveState ? { ...BASE, receiveState } : BASE,
      active,
    }),
  );
}

function rowClass(html: string): string {
  const match = html.match(/data-item-record-row[^>]*class="([^"]*)"/);
  assert.ok(match, 'row class');
  return match[1];
}

describe('itemRecordRowPaintClass', () => {
  it('idles transparent when receiveState is absent', () => {
    assert.equal(itemRecordRowPaintClass({ active: false }), ITEM_RECORD_IDLE_CLASS);
    assert.equal(itemRecordRowPaintClass({ active: true }), '');
  });

  it('heats Open and Partial, recedes Received', () => {
    assert.match(ITEM_RECORD_RECEIVE_PAINT.open.idle, /bg-surface-warning/);
    assert.match(ITEM_RECORD_RECEIVE_PAINT.partial.idle, /bg-surface-warning/);
    assert.match(ITEM_RECORD_RECEIVE_PAINT.received.idle, /opacity-55/);
    assert.equal(ITEM_RECORD_RECEIVE_PAINT.received.active, '');
  });

  it('heats exception states on danger, OVER on warning', () => {
    assert.match(ITEM_RECORD_RECEIVE_PAINT.short.idle, /bg-surface-danger/);
    assert.match(ITEM_RECORD_RECEIVE_PAINT.damaged.idle, /bg-surface-danger/);
    assert.match(ITEM_RECORD_RECEIVE_PAINT.wrong_item.idle, /bg-surface-danger/);
    assert.match(ITEM_RECORD_RECEIVE_PAINT.over.idle, /bg-surface-warning/);
  });

  it('never uses box-shadow', () => {
    for (const state of Object.values(ITEM_RECORD_RECEIVE_PAINT)) {
      assert.doesNotMatch(state.idle, /shadow-/);
      assert.doesNotMatch(state.active, /shadow-/);
    }
  });
});

describe('ItemRecordRow receiveState paint', () => {
  it('Open idle heats; Received idle recedes; active Open keeps the plate', () => {
    const openHtml = render('open');
    assert.match(openHtml, /data-receive-state="open"/);
    assert.match(rowClass(openHtml), /bg-surface-warning/);
    const receivedHtml = render('received');
    assert.match(receivedHtml, /data-receive-state="received"/);
    assert.match(rowClass(receivedHtml), /opacity-55/);
    assert.doesNotMatch(rowClass(receivedHtml), /bg-surface-warning/);
    const activeOpen = rowClass(render('open', true));
    assert.match(activeOpen, /bg-surface-station-plate/);
    assert.match(activeOpen, /outline-border-warning/);
  });

  it('SHORT idle is danger heat, not Received recede', () => {
    const html = render('short');
    assert.match(html, /data-receive-state="short"/);
    assert.match(rowClass(html), /bg-surface-danger/);
  });

  it('search/pack rows without receiveState stay idle transparent', () => {
    const html = render();
    assert.doesNotMatch(html, /data-receive-state=/);
    assert.match(rowClass(html), /bg-transparent/);
    assert.doesNotMatch(rowClass(html), /bg-surface-warning/);
  });
});
