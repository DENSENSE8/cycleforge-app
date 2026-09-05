/**
 *   npx tsx --test src/lib/keyboard/wedge-scan-listener.test.ts
 *
 * Drives the shipped listener factory — the same function useWedgeScanner
 * mounts — with fake key events. Proves the keydown stack never runs onScan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  attachWedgeKeyListener,
  createWedgeKeyListener,
  type WedgeKeyEvent,
} from './wedge-scan-listener';

function ev(
  key: string,
  extras: Partial<WedgeKeyEvent> = {},
): WedgeKeyEvent & { prevented: boolean } {
  const out = {
    key,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    timeStamp: extras.timeStamp ?? 0,
    target: extras.target ?? null,
    prevented: false,
    preventDefault() {
      out.prevented = true;
    },
    ...extras,
  };
  return out;
}

describe('createWedgeKeyListener — INP contract', () => {
  it('buffers a wedge burst, preventDefaults Enter, and yields before onScan', async () => {
    const scanned: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const idleIds: number[] = [];

    const listener = createWedgeKeyListener({
      onScan: (value) => scanned.push(value),
      yieldToInput: () => gate,
      isEditable: () => false,
      scheduleIdle: (_fn, _ms) => {
        idleIds.push(1);
        return 1;
      },
      cancelIdle: () => {
        idleIds.pop();
      },
    });

    const payload = '1Z999AA10123456784';
    for (let i = 0; i < payload.length; i++) {
      listener.onKeyDown(ev(payload[i]!, { timeStamp: i * 8 }));
    }
    const enter = ev('Enter', { timeStamp: payload.length * 8 });
    listener.onKeyDown(enter);

    assert.equal(enter.prevented, true, 'Enter is owned so a focused row does not submit');
    assert.deepEqual(scanned, [], 'onScan must not run inside the Enter keydown');
    assert.ok(listener.pendingCount() >= 1);

    // Next scan chars must still be accepted while the previous onScan is gated.
    for (let i = 0; i < 6; i++) {
      listener.onKeyDown(ev('B', { timeStamp: 10_000 + i * 8 }));
    }
    listener.onKeyDown(ev('Enter', { timeStamp: 10_050 }));

    release?.();
    await listener.flush();
    assert.deepEqual(scanned, [payload, 'BBBBBB']);
    listener.dispose();
  });

  it('does not hijack keystrokes in an editable field', async () => {
    const scanned: string[] = [];
    const listener = createWedgeKeyListener({
      onScan: (value) => scanned.push(value),
      yieldToInput: async () => undefined,
      isEditable: () => true,
      scheduleIdle: () => 1,
      cancelIdle: () => undefined,
    });
    listener.onKeyDown(ev('A', { timeStamp: 0 }));
    listener.onKeyDown(ev('B', { timeStamp: 8 }));
    listener.onKeyDown(ev('C', { timeStamp: 16 }));
    listener.onKeyDown(ev('Enter', { timeStamp: 24 }));
    await listener.flush();
    assert.deepEqual(scanned, []);
    listener.dispose();
  });

  it('idle flush commits a burst that never sent Enter', async () => {
    const scanned: string[] = [];
    let idleFn: (() => void) | null = null;
    const listener = createWedgeKeyListener({
      onScan: (value) => scanned.push(value),
      yieldToInput: async () => undefined,
      isEditable: () => false,
      scheduleIdle: (fn) => {
        idleFn = fn;
        return 7;
      },
      cancelIdle: () => {
        idleFn = null;
      },
    });
    for (const [i, ch] of ['S', 'K', 'U', '1', '2', '3'].entries()) {
      listener.onKeyDown(ev(ch, { timeStamp: i * 8 }));
    }
    assert.ok(idleFn, 'idle timer must be armed after printable keys');
    idleFn?.();
    await listener.flush();
    assert.deepEqual(scanned, ['SKU123']);
    listener.dispose();
  });

  it('never mutates document focus', async () => {
    const scanned: string[] = [];
    const listener = createWedgeKeyListener({
      onScan: (value) => scanned.push(value),
      yieldToInput: async () => undefined,
      isEditable: () => false,
      scheduleIdle: () => 1,
      cancelIdle: () => undefined,
    });
    const src = listener.onKeyDown.toString();
    assert.doesNotMatch(src, /\.focus\(/);
    assert.doesNotMatch(src, /\.blur\(/);
    listener.onKeyDown(ev('X', { timeStamp: 0 }));
    listener.onKeyDown(ev('Y', { timeStamp: 8 }));
    listener.onKeyDown(ev('Z', { timeStamp: 16 }));
    listener.onKeyDown(ev('1', { timeStamp: 24 }));
    listener.onKeyDown(ev('Enter', { timeStamp: 32 }));
    await listener.flush();
    assert.deepEqual(scanned, ['XYZ1']);
    listener.dispose();
  });
});

describe('attachWedgeKeyListener — native capture binding', () => {
  it('registers capture-phase keydown and removes it on dispose', () => {
    const adds: Array<{ type: string; capture: boolean }> = [];
    const removes: Array<{ type: string; capture: boolean }> = [];
    const target = {
      addEventListener(
        type: string,
        _fn: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) {
        adds.push({ type, capture: opts === true || (typeof opts === 'object' && !!opts.capture) });
      },
      removeEventListener(
        type: string,
        _fn: EventListenerOrEventListenerObject,
        opts?: boolean | EventListenerOptions,
      ) {
        removes.push({
          type,
          capture: opts === true || (typeof opts === 'object' && !!opts.capture),
        });
      },
    };

    const dispose = attachWedgeKeyListener(target, {
      onScan: () => undefined,
      yieldToInput: async () => undefined,
      isEditable: () => false,
      scheduleIdle: () => 1,
      cancelIdle: () => undefined,
    });
    assert.deepEqual(adds, [{ type: 'keydown', capture: true }]);
    dispose();
    assert.deepEqual(removes, [{ type: 'keydown', capture: true }]);
  });
});
