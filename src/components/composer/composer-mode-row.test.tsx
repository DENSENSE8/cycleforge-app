import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerModeRow } from './ComposerModeRow';

test('ComposerModeRow clusters Unbox | Ticket leftmost; Unbox blue; icons left of labels', () => {
  const html = renderToStaticMarkup(
    <ComposerModeRow mode="unbox" onModeChange={() => {}} progressPercent={40} />,
  );
  assert.match(html, /data-testid="composer-mode-row"/);
  assert.match(html, /data-testid="composer-mode-unbox"/);
  assert.match(html, /data-testid="composer-mode-ticket"/);
  assert.match(html, /Unbox/);
  assert.match(html, /Ticket/);
  assert.match(html, /text-blue-600/);
  assert.match(html, /text-orange-500/);
  assert.match(html, /data-testid="composer-procedure-ring"/);
  assert.doesNotMatch(html, /flex-row-reverse/);
  assert.doesNotMatch(html, /composer-mode-trigger/);
  assert.doesNotMatch(html, /composer-mode-menu/);
});

test('procedure ring and Unbox glyph share one toolbar item box', () => {
  const html = renderToStaticMarkup(
    <ComposerModeRow mode="unbox" onModeChange={() => {}} progressPercent={40} />,
  );
  const unbox = html.slice(
    html.indexOf('data-testid="composer-mode-unbox"'),
    html.indexOf('data-testid="composer-mode-ticket"'),
  );
  const ring = html.slice(html.indexOf('data-testid="composer-procedure-ring"'));
  assert.match(unbox, /flex h-5 w-8 shrink-0 items-center justify-center/);
  assert.match(unbox, /block h-3\.5 w-3\.5 shrink-0/);
  assert.match(ring, /flex h-5 w-8 shrink-0 items-center justify-center/);
  assert.match(ring, /block h-3\.5 w-3\.5 shrink-0/);
  assert.doesNotMatch(ring, /h-5 w-5/);
});
