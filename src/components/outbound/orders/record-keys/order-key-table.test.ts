import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTION_STATUS_BAR_META } from '@/hooks/useSelectionStatusBarHotkeys';
import { reservedKeyViolations, type KeyBinding } from '@/lib/keyboard/key-registry';
import {
  LABELS_WALK_HOTKEY,
  ORDER_LIST_KEYS,
  ORDER_RECORD_KEYS,
  ORDER_RECORD_PHOTOS_KEY,
  ORDER_VERB_HOTKEYS,
  orderCatalogHotkeys,
} from './order-key-table';

/** The list keys that ARE the reserved verbs: the leaders and help. */
const RESERVED_LIST_VERB: Record<string, string> = { c: 'create', g: 'go', y: 'sync', '?': 'help' };

/** Every key the order record, its strip, the check-set bars and the order lists bind — `verb` is the action it runs. */
function orderBindings(): KeyBinding[] {
  const verbKeys = Object.values(ORDER_VERB_HOTKEYS);
  const catalog = orderCatalogHotkeys(
    Object.entries(SELECTION_STATUS_BAR_META).map(([id, meta]) => ({ id, hotkey: meta.hotkey })),
    verbKeys,
  );
  return [
    ...Object.entries(ORDER_VERB_HOTKEYS).map(([slot, keys]) => ({ surface: 'order strip', keys, verb: slot })),
    ...ORDER_RECORD_KEYS.map((entry) => ({ surface: 'order record', keys: entry.key, verb: entry.slot })),
    ...[...catalog].map(([id, keys]) => ({ surface: 'order strip catalog', keys, verb: `catalog ${id}` })),
    ...Object.entries(ORDER_LIST_KEYS).map(([keys, label]) => ({
      surface: 'order list',
      keys,
      verb: RESERVED_LIST_VERB[keys] ?? `list ${label}`,
    })),
  ];
}

test('no two order bindings share a key for different actions', () => {
  const byKey = new Map<string, Set<string>>();
  for (const { keys, verb } of orderBindings()) {
    const key = keys.toLowerCase();
    const verbs = byKey.get(key) ?? new Set<string>();
    verbs.add(verb);
    byKey.set(key, verbs);
  }
  const clashes = [...byKey].filter(([, verbs]) => verbs.size > 1).map(([key, verbs]) => `${key}: ${[...verbs].join(' vs ')}`);
  assert.deepEqual(clashes, []);
});

test('no order binding takes a reserved letter (C create, G go, Y sync, ?) for another verb', () => {
  assert.deepEqual(reservedKeyViolations(orderBindings()), []);
});

test('T is the customer ticket; Replace tracking is W; the Labels walk leaves bare L to Documents', () => {
  assert.equal(ORDER_VERB_HOTKEYS['customer-ticket'], 't');
  assert.equal(ORDER_RECORD_KEYS.find((entry) => entry.handler === 'onReplaceTracking')?.key, 'w');
  assert.equal(ORDER_VERB_HOTKEYS.documents, 'l');
  assert.notEqual(LABELS_WALK_HOTKEY, 'l');
});

test('P views the open order photos; Print (product labels) is keyless on the order strip', () => {
  assert.equal(ORDER_RECORD_PHOTOS_KEY, 'p');
  assert.equal(ORDER_RECORD_KEYS.find((entry) => entry.handler === 'onViewPhotos')?.key, 'p');
  assert.equal('print' in ORDER_VERB_HOTKEYS, false);
  const catalog = orderCatalogHotkeys([{ id: 'print', hotkey: SELECTION_STATUS_BAR_META.print?.hotkey }], []);
  assert.equal(catalog.has('print'), false);
});

test('a catalog verb whose letter an order key holds goes keyless', () => {
  const keys = orderCatalogHotkeys(
    [
      { id: 'flag', hotkey: 'f' },
      { id: 'link-label', hotkey: 'j' },
      { id: 'print-paperwork', hotkey: 'w' },
      { id: 'ship-by', hotkey: 'b' },
      { id: 'qty', hotkey: 'b' },
    ],
    ['u'],
  );
  assert.deepEqual([...keys], [['ship-by', 'b']]);
});
