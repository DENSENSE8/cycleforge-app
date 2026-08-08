/**
 * Store integration — the keydown handler wires the pure machine to real DOM
 * events, including every wedge-safety branch. Runs under a jsdom window.
 *
 *   node --import tsx --test src/lib/keyboard/nav-keys/nav-leader-store.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

type Store = typeof import('./nav-leader-store');

let store: Store;
let unregister: (() => void) | null = null;
let committed: string[] = [];
let input: HTMLInputElement;

/** Dispatch a keydown; `ts` overrides timeStamp so the burst detector is testable. */
function key(
  init: Record<string, unknown>,
  ts: number,
  target?: EventTarget,
): { defaultPrevented: boolean } {
  const KE = (globalThis as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent;
  const ev = new KE('keydown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(ev, 'timeStamp', { value: ts, configurable: true });
  (target ?? (globalThis as unknown as { window: Window }).window).dispatchEvent(ev);
  return { defaultPrevented: ev.defaultPrevented };
}

before(async () => {
  const dom = new JSDOM('<!doctype html><body><input id="inp"/></body>', {
    pretendToBeVisual: true,
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.KeyboardEvent = dom.window.KeyboardEvent;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  input = dom.window.document.getElementById('inp') as HTMLInputElement;

  store = await import('./nav-leader-store');
  unregister = store.registerNavRegion({
    id: 'right',
    getKeymap: () => new Map([['photos', 'p'], ['ticket', 't']]),
    commit: (id) => committed.push(id),
  });
});

after(() => unregister?.());

beforeEach(() => {
  // Return to idle between cases (Escape is a no-op when already idle).
  key({ key: 'Escape' }, 0);
  committed = [];
});

const leader = (ts: number, target?: EventTarget) =>
  key({ key: ';', code: 'Semicolon', metaKey: true }, ts, target);

describe('nav-leader-store — happy path', () => {
  it('⌘; → region key → letter commits the target and returns to idle', () => {
    const l = leader(0);
    assert.equal(store.getNavMode().phase, 'pick');
    assert.equal(l.defaultPrevented, true, 'leader is consumed');

    const r = key({ key: 'r' }, 100);
    assert.deepEqual(store.getNavMode(), { phase: 'armed', region: 'right' });
    assert.equal(r.defaultPrevented, true, 'region key is consumed');

    const p = key({ key: 'p' }, 300);
    assert.equal(p.defaultPrevented, true, 'target letter is consumed');
    assert.deepEqual(committed, ['photos']);
    assert.equal(store.getNavMode().phase, 'idle', 'commit ends the session');
  });
});

describe('nav-leader-store — wedge safety', () => {
  it('refuses to arm while a text input is focused (yields the chord)', () => {
    const l = leader(0, input);
    assert.equal(store.getNavMode().phase, 'idle');
    assert.equal(l.defaultPrevented, false, 'the input keeps the keystroke');
  });

  it('Escape cancels a live session', () => {
    leader(0);
    const esc = key({ key: 'Escape' }, 100);
    assert.equal(store.getNavMode().phase, 'idle');
    assert.equal(esc.defaultPrevented, true, 'Escape is owned while armed');
  });

  it('a scan burst (sub-30ms) after arming commits nothing', () => {
    leader(0);
    key({ key: 'r' }, 100); // human-paced → arms
    const burst = key({ key: 'p' }, 110); // 10ms later → wedge
    assert.deepEqual(committed, [], 'the burst letter does not commit');
    assert.equal(store.getNavMode().phase, 'idle', 'burst disarms');
    assert.equal(burst.defaultPrevented, false, 'the scan char is not swallowed');
  });

  it('an unmapped letter in an armed region exits without swallowing', () => {
    leader(0);
    key({ key: 'r' }, 100);
    const z = key({ key: 'z' }, 300);
    assert.deepEqual(committed, []);
    assert.equal(store.getNavMode().phase, 'idle');
    assert.equal(z.defaultPrevented, false, 'unmapped key passes through');
  });

  it('an unregistered region key exits without swallowing', () => {
    leader(0);
    const left = key({ key: 'l' }, 100); // 'left' is not registered here
    assert.equal(store.getNavMode().phase, 'idle');
    assert.equal(left.defaultPrevented, false);
  });

  it('a modifier combo while armed yields nav (does not swallow ⌘K)', () => {
    leader(0);
    key({ key: 'r' }, 100);
    const chord = key({ key: 'k', metaKey: true }, 300);
    assert.equal(store.getNavMode().phase, 'idle', 'nav yields to the chord');
    assert.equal(chord.defaultPrevented, false, '⌘K still runs');
  });

  it('never binds bare digits', () => {
    leader(0);
    key({ key: 'r' }, 100);
    const one = key({ key: '1' }, 300);
    assert.deepEqual(committed, []);
    assert.equal(one.defaultPrevented, false);
  });
});
