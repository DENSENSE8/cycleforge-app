import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceKeypad } from './PriceKeypad';
import { PRICE_KEYPAD_KEYS } from './price-keypad';

describe('PriceKeypad', () => {
  it('paints a square 3×4 pad with a standing $ and no ring on the dollar', () => {
    const html = renderToStaticMarkup(
      React.createElement(PriceKeypad, { draft: '60.00', onKey: () => undefined }),
    );
    assert.match(html, /data-price-keypad=""/);
    assert.match(html, /data-slot="input-group"/);
    assert.match(html, /data-money-prefix=""/);
    assert.match(html, />\$</);
    assert.match(html, /60\.00/);
    assert.doesNotMatch(html, /border-border-success/);
    for (const key of PRICE_KEYPAD_KEYS) {
      assert.match(html, new RegExp(`data-price-key="${key === '.' ? '\\.' : key}"`));
    }
    assert.match(html, /size-9/);
  });
});
