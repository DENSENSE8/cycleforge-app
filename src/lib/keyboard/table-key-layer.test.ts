import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

// `isEditableKeyTarget` — the house predicate this module deliberately does NOT re-implement — reads `instanceof HTMLElement`, so the…
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;

import {
  isModifiedKey,
  isSingleCharKey,
  layerWins,
  suppressTableKey,
  type TableKeyContext,
  type TableKeyEvent,
} from './table-key-layer';

/** Explicit context on both stores — the predicate stays pure under test. */
function ctx(over: Partial<TableKeyContext> = {}): TableKeyContext {
  return {
    layer: 'table',
    ownsFocus: true,
    overlayOpen: false,
    scannerArmed: false,
    ...over,
  };
}

function key(k: string, over: Partial<TableKeyEvent> = {}): TableKeyEvent {
  return { key: k, target: null, ...over };
}

describe('suppressTableKey — the order the plan draws', () => {
  it('runs an ordinary key when nothing suppresses it', () => {
    assert.equal(suppressTableKey(key('x'), ctx()), null);
  });

  it('yields to a key already handled upstream', () => {
    assert.equal(
      suppressTableKey(key('x', { defaultPrevented: true }), ctx()),
      'already-handled',
    );
  });

  it('yields while an overlay is open', () => {
    assert.equal(suppressTableKey(key('x'), ctx({ overlayOpen: true })), 'overlay-open');
  });

  it("does NOT yield to an overlay when it IS the overlay's binding", () => {
    assert.equal(
      suppressTableKey(key('Escape'), ctx({ overlayOpen: true, layer: 'overlay' })),
      null,
    );
  });

  it('yields when the table does not own focus — WCAG 2.1.4', () => {
    assert.equal(suppressTableKey(key('x'), ctx({ ownsFocus: false })), 'not-focused');
  });
});

describe('the scanner suppressor', () => {
  it('makes single-key verbs INERT while a scanner is armed', () => {
    assert.equal(
      suppressTableKey(key('x'), ctx({ scannerArmed: true })),
      'scanner-armed',
    );
  });

  it('drops every character of a wedge payload — the whole point', () => {
    // `SKU-1129` + Enter is what a wedge types. Without this guard those are
    // ship-by, print, cursor moves and then whatever Enter does.
    const payload = [...'SKU-1129'];
    for (const ch of payload) {
      assert.equal(
        suppressTableKey(key(ch), ctx({ scannerArmed: true })),
        'scanner-armed',
        `${ch} must not run a verb during a scan`,
      );
    }
  });

  it('does NOT treat Shift as protection — a scanner shifts for uppercase', () => {
    assert.equal(
      suppressTableKey(key('S', { shiftKey: true }), ctx({ scannerArmed: true })),
      'scanner-armed',
    );
  });

  it('lets a CHORD through — a wedge cannot type ⌘', () => {
    assert.equal(
      suppressTableKey(key('a', { metaKey: true }), ctx({ scannerArmed: true })),
      null,
    );
  });

  it('lets an ARROW through — a wedge cannot type ArrowDown', () => {
    assert.equal(
      suppressTableKey(key('ArrowDown'), ctx({ scannerArmed: true })),
      null,
    );
    assert.equal(
      suppressTableKey(key('ArrowUp', { shiftKey: true }), ctx({ scannerArmed: true })),
      null,
    );
  });

  it('still yields Enter to the scanner, because a scan ENDS with Enter', () => {
    // Enter is not a single character, so the char guard does not catch it —
    // this is the reason the plan forbids a destructive verb on Enter rather
    // than relying on suppression. Pinned so the reasoning is not lost.
    assert.equal(suppressTableKey(key('Enter'), ctx({ scannerArmed: true })), null);
  });
});

describe('key shape helpers', () => {
  it('counts ⌘ / Ctrl / Alt as modifiers and Shift as not', () => {
    assert.equal(isModifiedKey(key('a', { metaKey: true })), true);
    assert.equal(isModifiedKey(key('a', { ctrlKey: true })), true);
    assert.equal(isModifiedKey(key('a', { altKey: true })), true);
    assert.equal(isModifiedKey(key('a', { shiftKey: true })), false);
  });

  it('treats one printable character with no modifier as scanner-impersonable', () => {
    assert.equal(isSingleCharKey(key('a')), true);
    assert.equal(isSingleCharKey(key('a', { metaKey: true })), false);
    assert.equal(isSingleCharKey(key('ArrowDown')), false);
    assert.equal(isSingleCharKey(key('Enter')), false);
  });
});

describe('layerWins', () => {
  it('ranks innermost first', () => {
    assert.equal(layerWins('overlay', 'table'), true);
    assert.equal(layerWins('table', 'overlay'), false);
    assert.equal(layerWins('editor', 'form'), true);
    assert.equal(layerWins('table', 'global'), true);
    assert.equal(layerWins('table', 'table'), true);
  });
});
