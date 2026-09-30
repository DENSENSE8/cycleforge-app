import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTION_STATUS_BAR_META } from '@/hooks/useSelectionStatusBarHotkeys';
import { NAV_PAGE_DECLS } from '@/lib/nav/context/pages';
import { NAV_GO_KEYS, NAV_PAGE_GO_KEYS } from '@/lib/nav/go-keys';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyMatches, reservedKeyViolations, type KeyBinding } from './key-registry';

const press = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}, code = '') => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

/** Every page action that declares a hotkey, wherever it sits in the page decls (page, item, or view). */
function pageActionBindings(): KeyBinding[] {
  const out: KeyBinding[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((child, index) => walk(child, `${path}[${index}]`));
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.hotkey === 'string' && typeof record.label === 'string' && typeof record.id === 'string') {
      out.push({ surface: `pages ${record.id}`, keys: record.hotkey, verb: /^(new|add|create)\b/i.test(record.label) ? 'create' : record.id });
    }
    for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
  };
  walk(NAV_PAGE_DECLS, 'NAV_PAGE_DECLS');
  return out;
}

test('no declared key map binds a reserved letter (C create, G go, Y sync, ?) to another verb', () => {
  const bindings: KeyBinding[] = [
    ...Object.entries(NAV_GO_KEYS).flatMap(([lane, letters]) =>
      Object.keys(letters ?? {}).map((letter) => ({ surface: `lane ${lane}`, keys: `g ${letter}`, verb: 'go' })),
    ),
    ...Object.entries(NAV_PAGE_GO_KEYS).flatMap(([page, letters]) =>
      Object.keys(letters).map((letter) => ({ surface: `page ${page}`, keys: `g ${letter}`, verb: 'go' })),
    ),
    ...Object.entries(SELECTION_STATUS_BAR_META).map(([id, meta]) => ({ surface: `selection bar ${id}`, keys: meta.hotkey, verb: id })),
    ...pageActionBindings(),
  ];
  assert.deepEqual(reservedKeyViolations(bindings), []);
});

test('reserved letters: a C that is not a create is a collision, bare or after a leader', () => {
  assert.deepEqual(
    reservedKeyViolations([
      { surface: 'home', keys: 'g c', verb: 'go' },
      { surface: 'orders', keys: 'c', verb: 'copy' },
      { surface: 'desk', keys: 'y', verb: 'yank' },
    ]),
    [
      'home: G C is "go", but C means create app-wide',
      'orders: C is "copy", but C means create app-wide',
      'desk: Y is "yank", but Y means sync app-wide',
    ],
  );
  // Create on C, the leaders' own sequences, and chords (the leaders never arm on a modifier) are fine.
  assert.deepEqual(
    reservedKeyViolations([
      { surface: 'tasks', keys: 'c', verb: 'create' },
      { surface: 'add', keys: 'c s', verb: 'create' },
      { surface: 'home', keys: 'g d', verb: 'go' },
      { surface: 'orders', keys: COPY_HOTKEY, verb: 'copy' },
      { surface: 'ledger', keys: COPY_SHOWN_HOTKEY, verb: 'copy-shown' },
      { surface: 'chat', keys: 'shift+c', verb: 'copy-answer' },
    ]),
    [],
  );
});

test('hotkeys: a letter is bare (any case); a chord needs exactly its modifiers', () => {
  assert.equal(hotkeyMatches('p', press('P', { shiftKey: true })), true);
  assert.equal(hotkeyMatches('p', press('p', { ctrlKey: true })), false);
  assert.equal(hotkeyMatches(COPY_HOTKEY, press('c', { metaKey: true })), true);
  assert.equal(hotkeyMatches(COPY_HOTKEY, press('c', { ctrlKey: true })), true);
  assert.equal(hotkeyMatches(COPY_HOTKEY, press('c')), false, 'bare C is create, never copy');
  assert.equal(hotkeyMatches(COPY_HOTKEY, press('C', { ctrlKey: true, shiftKey: true })), false, 'Ctrl+Shift+C is DevTools');
  assert.equal(hotkeyMatches(COPY_HOTKEY, press('c', { metaKey: true, altKey: true }, 'KeyC')), false);
  // macOS ⌥ rewrites the key (⌘⌥C types `ç`): the chord reads the physical key.
  assert.equal(hotkeyMatches(COPY_SHOWN_HOTKEY, press('ç', { metaKey: true, altKey: true }, 'KeyC')), true);
  assert.equal(hotkeyMatches(undefined, press('c')), false);
});
