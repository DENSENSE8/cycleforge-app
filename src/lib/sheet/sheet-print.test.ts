import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSheetPrintDocument } from './sheet-print';

const BASE = {
  title: 'To-ship',
  columns: ['Order', 'Item', 'Amount'],
  rows: [
    ['09-69683', 'Bose Wave Music System', '$0.00'],
    ['97-37260', 'Bose UFS-20 Floor Stands', '$12.50'],
  ],
};

test('prints EVERY row, not the virtualized window', () => {
  const html = buildSheetPrintDocument(BASE);
  assert.ok(html.includes('09-69683'));
  assert.ok(html.includes('97-37260'));
  assert.equal((html.match(/<tr>/g) ?? []).length, 3, 'header row + two body rows');
});

test('the header repeats across pages and rows do not split', () => {
  const html = buildSheetPrintDocument(BASE);
  assert.ok(html.includes('display: table-header-group'));
  assert.ok(html.includes('page-break-inside: avoid'));
});

test('borders are bottom-only — the same hierarchy as the airtable skin', () => {
  const html = buildSheetPrintDocument(BASE);
  assert.ok(html.includes('border-bottom: 1px solid #999'), 'header rule');
  assert.ok(html.includes('border-bottom: 1px solid #ddd'), 'row rule');
  assert.ok(!/border-left|border-right/.test(html), 'no vertical column cage');
});

test('a value cannot inject markup into the document', () => {
  const html = buildSheetPrintDocument({
    ...BASE,
    title: '<script>alert(1)</script>',
    rows: [['<img onerror=x>', '"quoted"', '&amp;']],
  });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot;quoted&quot;'));
  assert.ok(html.includes('&amp;amp;'), 'a literal &amp; is escaped, not decoded');
});

test('a short row is padded to the column count rather than shifting cells', () => {
  const html = buildSheetPrintDocument({ ...BASE, rows: [['only-one']] });
  const body = html.split('<tbody>')[1] ?? '';
  assert.equal((body.match(/<td>/g) ?? []).length, 3);
});

test('the row count is stated so a truncated print is visible', () => {
  assert.ok(buildSheetPrintDocument(BASE).includes('2 rows'));
  assert.ok(buildSheetPrintDocument({ ...BASE, rows: [BASE.rows[0]!] }).includes('1 row'));
});

test('subtitle carries the filter state the rows resulted from', () => {
  const html = buildSheetPrintDocument({ ...BASE, subtitle: 'Must ship · Urgent' });
  assert.ok(html.includes('Must ship · Urgent · 2 rows'));
});

test('no rows still produces a valid document with its header', () => {
  const html = buildSheetPrintDocument({ ...BASE, rows: [] });
  assert.ok(html.includes('<th>Order</th>'));
  assert.ok(html.includes('0 rows'));
});
