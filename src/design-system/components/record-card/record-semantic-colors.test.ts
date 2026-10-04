import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LifecycleCode } from '../record-ledger/LifecycleCode';
import { RecordFactPaint } from './record-fact';

function renderFact(face: React.ComponentProps<typeof RecordFactPaint>['face']): string {
  return renderToStaticMarkup(React.createElement(RecordFactPaint, { face }));
}

test('dense record facts preserve the established semantic colors', () => {
  assert.match(renderFact({ kind: 'qty', value: 2, multiplier: 'multiple' }), /text-text-warning/);
  assert.match(renderFact({ kind: 'grade', label: 'New', code: 'BRAND_NEW' }), /text-text-warning/);
  assert.match(renderFact({ kind: 'grade', label: 'Used A', code: 'USED_A' }), /text-emerald-700/);
  assert.match(renderFact({ kind: 'money', text: '$42.00' }), /text-text-success/);
});

test('a one-unit quantity keeps the compact number face without a multiplier', () => {
  const html = renderFact({ kind: 'qty', value: 1, multiplier: 'multiple' });
  assert.match(html, /text-text-muted/);
  assert.match(html, />1<\/span>/);
  assert.doesNotMatch(html, /×1/);
});

test('Picked keeps its blue information-state badge', () => {
  const html = renderToStaticMarkup(React.createElement(LifecycleCode, { state: 'picked' }));
  assert.match(html, /state-badge-info/);
  assert.match(html, />Picked<\/span>/);
});
