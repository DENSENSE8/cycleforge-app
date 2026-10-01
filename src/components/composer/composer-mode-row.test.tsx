import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerModeRow } from './ComposerModeRow';

test('composer context row keeps the procedure ring and paints no mode faces', () => {
  const html = renderToStaticMarkup(
    <ComposerModeRow
      mode="ticket"
      progressPercent={100}
      progressTone="selected"
      onProgressClick={() => {}}
      leading={<span data-testid="composer-context-leading">Carton</span>}
    />,
  );
  assert.match(html, /data-testid="composer-mode-row"/);
  assert.match(html, /aria-label="Composer context"/);
  assert.match(html, /data-composer-mode="ticket"/);
  assert.match(html, /data-testid="composer-context-leading"/);
  assert.match(html, /data-testid="composer-procedure-ring"/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /data-testid="composer-mode-unbox"/);
  assert.doesNotMatch(html, /data-testid="composer-mode-ticket"/);
  assert.doesNotMatch(html, />Unbox</);
  assert.doesNotMatch(html, />Ticket</);
  const beforeRing = html.slice(0, html.indexOf('data-testid="composer-procedure-ring"'));
  assert.match(beforeRing, /min-w-0 flex-1/);
});
