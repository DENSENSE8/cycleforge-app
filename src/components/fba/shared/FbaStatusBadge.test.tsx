import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FbaStatusBadge } from './FbaStatusBadge';

test('FBA workflow states use semantic status roles, not raw palette utilities', () => {
  const html = ['TESTED', 'PACKED', 'LABEL_ASSIGNED', 'SHIPPED']
    .map((status) => renderToStaticMarkup(<FbaStatusBadge status={status} />))
    .join('\n');
  assert.match(html, /bg-surface-success/);
  assert.match(html, /bg-surface-accent/);
  assert.doesNotMatch(html, /(?:emerald|amber|blue|purple)-\d{2,3}/);
  assert.doesNotMatch(html, /rounded-(?:sm|md|lg|xl|2xl|3xl)/);
});
