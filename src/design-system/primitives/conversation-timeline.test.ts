import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationMessageCard } from './ConversationMessageCard';
import { CONVERSATION_MARK_BOX, CONVERSATION_STREAM } from './conversation-chrome';

/** The rendered thread — a connected activity timeline (GitHub / Jira / Linear), not a stack of bubbles. */
const mark = (label: string) =>
  React.createElement(
    'div',
    { className: CONVERSATION_MARK_BOX },
    React.createElement('span', { 'data-node': label }, label),
  );

function stream(...rows: React.ReactNode[]) {
  return renderToStaticMarkup(
    React.createElement('div', { className: CONVERSATION_STREAM }, ...rows),
  );
}

const row = (key: string, author: string, internal = false) =>
  React.createElement(
    ConversationMessageCard,
    { key, mark: mark(author), author, at: null, internal },
    React.createElement('p', null, `${author} body`),
  );

describe('conversation timeline structure', () => {
  it('threads a spine behind every node, without the caller asking', () => {
    // The caller passes a mark and nothing else — no connector, no index.
    const html = stream(row('a', 'R'), row('b', 'MA'));
    assert.equal(
      (html.match(/w-px/g) ?? []).length,
      2,
      'one spine segment per row — the thread is continuous, not per-card chrome',
    );
  });

  it('puts the spine BEFORE the node in the same track', () => {
    const html = stream(row('a', 'R'));
    const spine = html.indexOf('w-px');
    const node = html.indexOf('data-node');
    assert.ok(spine >= 0 && node > spine, 'node paints over the line, not under it');
  });

  it('anchors the node and the body header on one row', () => {
    // items-start on the row is what stops the node drifting to the middle of
    // a long body.
    const html = stream(row('a', 'R'));
    assert.match(html, /items-start/);
  });

  it('gives a public row its gray card and an internal row the amber one', () => {
    const html = stream(row('a', 'R'), row('b', 'MA', true));
    assert.equal(
      (html.match(/bg-amber-50/g) ?? []).length,
      1,
      'exactly one amber row — the internal note',
    );
    assert.equal(
      (html.match(/bg-surface-canvas/g) ?? []).length,
      1,
      'and exactly one gray row — the public reply',
    );
  });

  it('caps every card so a wide centre column never stretches a line', () => {
    const html = stream(row('a', 'R'), row('b', 'MA', true));
    assert.equal((html.match(/max-w-2xl/g) ?? []).length, 2);
  });

  it('still renders a row with no mark at all', () => {
    // A markless row must not emit an orphan spine segment floating at x=0.
    const html = renderToStaticMarkup(
      React.createElement(
        ConversationMessageCard,
        { author: 'System', at: null },
        React.createElement('p', null, 'body'),
      ),
    );
    assert.match(html, /System/);
    assert.doesNotMatch(html, /w-px/);
  });

  it('puts clock time inside the message card, not beside the author', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ConversationMessageCard,
        { author: 'Kai', at: '2026-08-28T23:53:38.000Z' },
        React.createElement('p', null, 'claim body'),
      ),
    );
    const canvas = html.indexOf('bg-surface-canvas');
    const clock = html.indexOf('data-conversation-clock');
    const pad = html.indexOf('invisible');
    const author = html.indexOf('Kai');
    assert.ok(canvas >= 0 && clock > canvas, 'clock is inside the gray card');
    assert.ok(pad > canvas, 'last-line spacer is inside the card');
    assert.ok(author >= 0 && author < clock, 'author still leads; clock follows copy');
  });
});
