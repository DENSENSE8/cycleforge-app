import test from 'node:test';
import assert from 'node:assert/strict';
import { fnskuBrowserPrintCss } from './fnskuLabel';
import { buildLabelHtml } from './printLabel';

test('QC/product browser print is one horizontal 2×1 page', () => {
  const html = buildLabelHtml({
    infoHtml: '<strong>00326-BK</strong>',
    dataMatrix: { value: 'U-00326-BK-1', symbology: 'datamatrix' },
  });

  assert.match(html, /@page\{size:2in 1in;margin:0\}/);
  assert.match(html, /\.wrap\{width:2in;height:1in/);
  assert.match(html, /overflow:hidden;break-inside:avoid;page-break-inside:avoid/);
});

test('FBA browser print is one horizontal 2×1 page without viewport rotation', () => {
  const css = fnskuBrowserPrintCss();

  assert.match(css, /@page\{size:2in 1in;margin:0\}/);
  assert.match(css, /\.page\{position:relative;width:2in;height:1in/);
  assert.match(css, /\.label\{[^}]*width:2in;height:1in/);
  assert.doesNotMatch(css, /100v[wh]|orientation:portrait|rotate\(/);
});
