import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComposerModeRow } from './ComposerModeRow';

test('ComposerModeRow clusters Unbox | Ticket leftmost; only the SELECTED glyph carries colour', () => {
  const html = renderToStaticMarkup(
    <ComposerModeRow mode="unbox" onModeChange={() => {}} progressPercent={40} />,
  );
  assert.match(html, /data-testid="composer-mode-row"/);
  assert.match(html, /bg-surface-card/);
  assert.match(html, /rounded-2xl/);
  assert.match(html, /z-base/);
  assert.doesNotMatch(html, /shadow-elev/);
  assert.match(html, /data-testid="composer-mode-unbox"/);
  assert.match(html, /data-testid="composer-mode-ticket"/);
  assert.match(html, /data-testid="composer-mode-ask"/);
  assert.match(html, /Unbox/);
  assert.match(html, /Ticket/);
  assert.match(html, /Ask/);
  // Colour marks the SELECTION, not the mode (ruling 2026-08-31): on Unbox the
  // blue glyph is lit and the Ticket glyph is dimmed, so the row has one loud
  // thing on it instead of two.
  assert.match(html, /text-blue-600/);
  assert.doesNotMatch(html, /text-orange-500/);

  const onTicket = renderToStaticMarkup(
    <ComposerModeRow mode="ticket" onModeChange={() => {}} progressPercent={40} />,
  );
  assert.match(onTicket, /text-orange-500/);
  assert.doesNotMatch(onTicket, /text-blue-600/);

  // No hover wash on the unselected face — it competed with the selection.
  assert.doesNotMatch(html, /hover:bg-surface-sunken/);
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
  assert.match(unbox, /flex h-5 w-3\.5 shrink-0 items-center justify-center/);
  assert.match(unbox, /block h-3\.5 w-3\.5 shrink-0/);
  assert.match(unbox, /gap-0\.5/);
  assert.match(ring, /flex h-5 w-8 shrink-0 items-center justify-center/);
  assert.match(ring, /block h-3\.5 w-3\.5 shrink-0/);
  assert.doesNotMatch(ring, /h-5 w-5/);
});

test('showModeFaces=false keeps Ask plus the bottom-right context ring', () => {
  const html = renderToStaticMarkup(
    <ComposerModeRow
      mode="unbox"
      onModeChange={() => {}}
      showModeFaces={false}
      progressPercent={100}
      progressTone="selected"
      onProgressClick={() => {}}
    />,
  );
  assert.match(html, /data-composer-mode-faces="false"/);
  assert.match(html, /aria-label="Composer context"/);
  assert.doesNotMatch(html, /data-testid="composer-mode-unbox"/);
  assert.doesNotMatch(html, /data-testid="composer-mode-ticket"/);
  assert.doesNotMatch(html, />Unbox</);
  assert.doesNotMatch(html, />Ticket</);
  assert.match(html, /data-testid="composer-mode-ask"/);
  assert.match(html, />Ask</);
  assert.match(html, /data-testid="composer-procedure-ring"/);
  assert.match(html, /aria-pressed="true"/);
  const beforeRing = html.slice(0, html.indexOf('data-testid="composer-procedure-ring"'));
  assert.match(beforeRing, /min-w-0 flex-1/);
});
