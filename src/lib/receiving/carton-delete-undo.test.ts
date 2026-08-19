/**
 * Unit tests for delayed carton-delete undo.
 *
 * Run: `node --test --import tsx src/lib/receiving/carton-delete-undo.test.ts`
 */

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  flushCartonDelete,
  hasPendingCartonDelete,
  resetCartonDeleteUndoForTests,
  scheduleCartonDeleteUndo,
  undoCartonDelete,
  type CartonDeleteUndoClock,
} from './carton-delete-undo';

function fakeClock() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const clock: CartonDeleteUndoClock = {
    setTimeout: (fn) => {
      const id = nextId++;
      timers.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (id) => {
      timers.delete(id as unknown as number);
    },
  };
  return {
    clock,
    fireAll: () => {
      for (const fn of [...timers.values()]) fn();
      timers.clear();
    },
    pendingCount: () => timers.size,
  };
}

afterEach(() => {
  resetCartonDeleteUndoForTests();
});

describe('scheduleCartonDeleteUndo', () => {
  test('undo cancels commit', async () => {
    const { clock } = fakeClock();
    let committed = 0;
    scheduleCartonDeleteUndo(12, () => {
      committed += 1;
    }, { clock, ms: 10_000 });
    assert.equal(hasPendingCartonDelete(12), true);
    assert.equal(undoCartonDelete(12, clock), true);
    assert.equal(hasPendingCartonDelete(12), false);
    assert.equal(committed, 0);
  });

  test('flush runs commit once', async () => {
    const { clock } = fakeClock();
    let committed = 0;
    scheduleCartonDeleteUndo(8, () => {
      committed += 1;
    }, { clock });
    await flushCartonDelete(8);
    assert.equal(committed, 1);
    assert.equal(undoCartonDelete(8, clock), false);
  });

  test('timer fire commits', async () => {
    const { clock, fireAll } = fakeClock();
    let committed = 0;
    scheduleCartonDeleteUndo(3, () => {
      committed += 1;
    }, { clock });
    fireAll();
    await Promise.resolve();
    assert.equal(committed, 1);
  });
});
