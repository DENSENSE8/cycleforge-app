/**
 *   node_modules/.bin/tsx --test src/lib/keyboard/scan-field-letter-key.test.ts
 *
 * The Quality control `P` (pass and print) fires from the focused, empty scan
 * field — and a barcode that begins with `p` still scans whole.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScanFieldLetterKey, type ScanFieldLetterKeyEvent } from './scan-field-letter-key';

type Field = { value: string };

function harness() {
  const scanField: Field = { value: '' };
  const notesField = { notes: true };
  const presses: number[] = [];
  const timers: Array<{ run: () => void; live: boolean }> = [];
  let enabled = true;
  const key = createScanFieldLetterKey<Field>({
    letter: 'p',
    scanField: (target) => (target === (scanField as unknown) ? scanField : null),
    isEditable: (target) => target === (scanField as unknown) || target === (notesField as unknown),
    enabled: () => enabled,
    onPress: () => presses.push(1),
    giveBack: (field, letter) => {
      field.value += letter;
    },
    schedule: (run) => {
      const timer = { run, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
  });
  const press = (k: string, target: EventTarget | null, extra: Partial<ScanFieldLetterKeyEvent> = {}) => {
    const event = {
      key: k,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      repeat: false,
      defaultPrevented: false,
      target,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
      ...extra,
    };
    key.onKeyDown(event);
    return event;
  };
  const elapse = () => {
    for (const t of timers.splice(0)) if (t.live) t.run();
  };
  return { scanField, notesField, presses, press, elapse, setEnabled: (on: boolean) => (enabled = on) };
}

test('a lone p in the empty scan field fires once the wedge gap passes', () => {
  const h = harness();
  const ev = h.press('p', h.scanField as unknown as EventTarget);
  assert.equal(ev.prevented, true);
  assert.deepEqual(h.presses, []);
  h.elapse();
  assert.deepEqual(h.presses, [1]);
  assert.equal(h.scanField.value, '');
});

test('a scan that begins with p hands the letter back and never fires', () => {
  const h = harness();
  h.press('p', h.scanField as unknown as EventTarget);
  const next = h.press('1', h.scanField as unknown as EventTarget);
  assert.equal(next.prevented, false);
  h.elapse();
  assert.deepEqual(h.presses, []);
  assert.equal(h.scanField.value, 'p');
});

test('p is plain typing once the scan field holds text, or in any other field', () => {
  const h = harness();
  h.scanField.value = 'A12';
  assert.equal(h.press('p', h.scanField as unknown as EventTarget).prevented, false);
  assert.equal(h.press('p', h.notesField as unknown as EventTarget).prevented, false);
  h.elapse();
  assert.deepEqual(h.presses, []);
});

test('capital P, modifiers, key repeat and a disabled verb never fire', () => {
  const h = harness();
  const field = h.scanField as unknown as EventTarget;
  assert.equal(h.press('P', field).prevented, false);
  assert.equal(h.press('p', field, { metaKey: true }).prevented, false);
  assert.equal(h.press('p', field, { repeat: true }).prevented, false);
  h.setEnabled(false);
  assert.equal(h.press('p', field).prevented, false);
  h.elapse();
  assert.deepEqual(h.presses, []);
});

test('p on the page (no field focused) fires; a burst there is left to the wedge listener', () => {
  const h = harness();
  h.press('p', null);
  h.elapse();
  assert.deepEqual(h.presses, [1]);
  h.press('p', null);
  h.press('x', null);
  h.elapse();
  assert.deepEqual(h.presses, [1]);
  assert.equal(h.scanField.value, '');
});
