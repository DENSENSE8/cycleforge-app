import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { RecordCursor, RecordId } from './cursor-model';
import type { RecordCursorOpen } from './store';
import {
  RECORD_CURSOR_PRIORITY,
  getRecordCursorTop,
  getServerRecordCursorTop,
  publishRecordCursor,
  subscribeRecordCursor,
  updateRecordCursor,
} from './store';

/**
 * A cursor built field-by-field so the equality gate is exercised on a FRESH
 * object every call — which is exactly how a grid produces one (a new
 * `resolveRecordCursor(...)` result per render).
 */
function cursor(overrides: Partial<RecordCursor> = {}): RecordCursor {
  // No `as RecordCursor`:
  return {
    scope: 'record',
    position: 3,
    total: 47,
    prev: { id: 4820, revealFoldKey: null },
    next: { id: 4822, revealFoldKey: null },
    first: { id: 4801, revealFoldKey: null },
    openRevealFoldKey: null,
    ...overrides,
  };
}

const noopOpen: RecordCursorOpen = () => true;

test('a published surface owns its scope, and withdrawing empties it', () => {
  assert.equal(getRecordCursorTop('record'), null, 'the store starts empty');

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
  });

  const top = getRecordCursorTop('record');
  assert.ok(top);
  assert.equal(top.surfaceId, 'orders-grid');
  assert.equal(top.cursor.position, 3);
  assert.equal(top.cursor.total, 47);

  withdraw();
  // Honest absence: no publisher means the panel renders no chevrons at all,
  // rather than enabled buttons that step a list nobody owns.
  assert.equal(getRecordCursorTop('record'), null);
});

test('priority decides the owner; seq only breaks a tie inside a tier', () => {
  // The rail mounts FIRST and the grid second — but mount order is not the rule.
  const withdrawRail = publishRecordCursor({
    surfaceId: 'unbox-recent-rail',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ total: 12 }),
    open: noopOpen,
  });
  const withdrawGrid = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ total: 47 }),
    open: noopOpen,
  });

  assert.equal(getRecordCursorTop('record')?.surfaceId, 'orders-grid');

  // Re-publishing the rail LAST must not steal the scope from the grid: the
  // primary collection is what the operator is reading.
  const withdrawRail2 = publishRecordCursor({
    surfaceId: 'unbox-recent-rail',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ total: 12 }),
    open: noopOpen,
  });
  assert.equal(getRecordCursorTop('record')?.surfaceId, 'orders-grid');

  // Inside one tier, last-published wins (same discipline as right-rail/store).
  const withdrawGridB = publishRecordCursor({
    surfaceId: 'orders-grid-b',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ total: 5 }),
    open: noopOpen,
  });
  assert.equal(getRecordCursorTop('record')?.surfaceId, 'orders-grid-b');

  // …and when it withdraws, the scope falls back to the other grid, not to null.
  withdrawGridB();
  assert.equal(getRecordCursorTop('record')?.surfaceId, 'orders-grid');

  withdrawGrid();
  assert.equal(getRecordCursorTop('record')?.surfaceId, 'unbox-recent-rail');

  withdrawRail2();
  withdrawRail();
  assert.equal(getRecordCursorTop('record'), null);
});

test('a stale withdraw after a re-publish under the same surfaceId is a no-op', () => {
  // React StrictMode double-invokes effects, and a route/mode swap mounts the
  // incoming surface BEFORE the outgoing one unmounts. If the old cleanup could
  // delete the new claim, the panel's chevrons go dead with no error.
  const staleWithdraw = publishRecordCursor({
    surfaceId: 'receiving-lines-table',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ total: 9 }),
    open: noopOpen,
  });
  const liveWithdraw = publishRecordCursor({
    surfaceId: 'receiving-lines-table',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ total: 21 }),
    open: noopOpen,
  });

  staleWithdraw();

  const top = getRecordCursorTop('record');
  assert.ok(top, 'the live publication survived the stale cleanup');
  assert.equal(top.cursor.total, 21);

  // The live owner can still withdraw itself.
  liveWithdraw();
  assert.equal(getRecordCursorTop('record'), null);
});

test('scopes are independent slots — a table cursor never answers for the sibling cursor', () => {
  // Receiving runs both at once: the grouped carton table AND the PO-scoped
  // lines inside the open carton. One global winner would make the carton
  // header read "3 of 47 cartons" where it must read "2 of 5 lines".
  const withdrawTable = publishRecordCursor({
    surfaceId: 'receiving-lines-table',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ position: 3, total: 47 }),
    open: noopOpen,
  });
  const withdrawLines = publishRecordCursor({
    surfaceId: 'receiving-po-lines',
    scope: 'sibling',
    // Deliberately the LOWER tier: it still owns its own scope outright.
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ scope: 'sibling', position: 2, total: 5 }),
    open: noopOpen,
  });

  assert.equal(getRecordCursorTop('record')?.cursor.total, 47);
  assert.equal(getRecordCursorTop('sibling')?.cursor.total, 5);

  // Withdrawing one scope leaves the other standing.
  withdrawTable();
  assert.equal(getRecordCursorTop('record'), null);
  assert.equal(getRecordCursorTop('sibling')?.cursor.total, 5);

  withdrawLines();
  assert.equal(getRecordCursorTop('sibling'), null);
});

test('an update with an equal cursor keeps snapshot identity and does not emit', () => {
  // A grid re-renders on every keystroke in its filter box and allocates a fresh
  // RecordCursor each time. Without the equality gate, useSyncExternalStore sees
  // a new snapshot on every render and tears (or loops).
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
  });
  assert.equal(notifications, 1, 'publishing emits once');

  const snapshot = getRecordCursorTop('record');
  assert.ok(snapshot);

  for (let i = 0; i < 5; i += 1) {
    updateRecordCursor({
      surfaceId: 'orders-grid',
      scope: 'record',
      priority: RECORD_CURSOR_PRIORITY.grid,
      cursor: cursor(), // structurally equal, referentially new — every time
      open: noopOpen,
    });
  }

  assert.equal(notifications, 1, 'five equal updates emitted nothing');
  assert.equal(
    getRecordCursorTop('record'),
    snapshot,
    'Object.is holds, so useSyncExternalStore sees no change',
  );

  unsubscribe();
  withdraw();
});

test('an update that genuinely changes a field emits a new snapshot in place', () => {
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ position: 3 }),
    open: noopOpen,
  });
  const first = getRecordCursorTop('record');
  assert.ok(first);
  const firstSeq = first.seq;

  // ONE field. An earlier version of this test moved `position` AND `prev.id`
  // together, which attributed to neither: deleting either comparison from the
  // gate left the emit assertion satisfied by the other.
  updateRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ position: 4 }),
    open: noopOpen,
  });

  assert.equal(notifications, 2);
  const second = getRecordCursorTop('record');
  assert.ok(second);
  assert.notEqual(second, first, 'records are immutable snapshots');
  assert.equal(second.cursor.position, 4);
  assert.equal(
    second.seq,
    firstSeq,
    'an update keeps the seq, so it neither loses ownership nor jumps the tie-break',
  );

  unsubscribe();
  withdraw();
});

/** Every field the gate compares, changed ALONE. */
const SINGLE_FIELD_CHANGES: ReadonlyArray<{ what: string; override: Partial<RecordCursor> }> = [
  // The operator stood still and a row landed below them — only `total` moves.
  { what: 'total (a row was appended)', override: { total: 48 } },
  { what: 'position (the operator stepped)', override: { position: 4 } },
  { what: 'prev.id (the order re-sorted around the open record)', override: { prev: { id: 4819, revealFoldKey: null } } },
  { what: 'next.id', override: { next: { id: 4823, revealFoldKey: null } } },
  { what: 'first.id (a new row took the top of the order)', override: { first: { id: 4700, revealFoldKey: null } } },
  {
    what: 'first.revealFoldKey (the top row folded shut)',
    override: { first: { id: 4801, revealFoldKey: '2026-08-01::1234' } },
  },
  { what: 'prev → null (the open record became the first)', override: { prev: null } },
  { what: 'next → null (the open record became the last)', override: { next: null } },
  {
    what: 'openRevealFoldKey (deep link into a folded order)',
    override: { openRevealFoldKey: '2026-08-01::1234' },
  },
];

test('every compared cursor field emits on its own — no field rides another', () => {
  for (const { what, override } of SINGLE_FIELD_CHANGES) {
    let notifications = 0;
    const unsubscribe = subscribeRecordCursor(() => {
      notifications += 1;
    });

    const withdraw = publishRecordCursor({
      surfaceId: 'orders-grid',
      scope: 'record',
      priority: RECORD_CURSOR_PRIORITY.grid,
      cursor: cursor(),
      open: noopOpen,
    });
    assert.equal(notifications, 1, `${what}: publishing emits once`);

    updateRecordCursor({
      surfaceId: 'orders-grid',
      scope: 'record',
      priority: RECORD_CURSOR_PRIORITY.grid,
      cursor: cursor(override),
      open: noopOpen,
    });
    assert.equal(notifications, 2, `${what}: a real change must emit`);

    unsubscribe();
    withdraw();
  }
});

test('a step id that only changed TYPE is the same record — no emit', () => {
  // pg hands back int8 as a string, so a server refetch after a numeric
  // optimistic write flips 4822 → '4822' for the SAME record. `===` would call
  // that a change; `recordIdKey` (this module's own id SoT) does not.
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ next: { id: 4822, revealFoldKey: null } }),
    open: noopOpen,
  });
  assert.equal(notifications, 1);

  updateRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ next: { id: '4822', revealFoldKey: null } }),
    open: noopOpen,
  });

  assert.equal(notifications, 1, 'a retyped id is not a change');

  unsubscribe();
  withdraw();
});

test('mutating one scope leaves the OTHER scope snapshot identity-stable', () => {
  // This is what stops receiving's two simultaneous cursors from tearing each other:
  const withdrawTable = publishRecordCursor({
    surfaceId: 'receiving-lines-table',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ position: 3, total: 47 }),
    open: noopOpen,
  });
  const withdrawLines = publishRecordCursor({
    surfaceId: 'receiving-po-lines',
    scope: 'sibling',
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ scope: 'sibling', position: 2, total: 5 }),
    open: noopOpen,
  });

  const recordBefore = getRecordCursorTop('record');
  assert.ok(recordBefore);

  // The operator steps a LINE inside the open carton; the carton table did not move.
  updateRecordCursor({
    surfaceId: 'receiving-po-lines',
    scope: 'sibling',
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ scope: 'sibling', position: 3, total: 5 }),
    open: noopOpen,
  });

  assert.equal(getRecordCursorTop('sibling')?.cursor.position, 3);
  assert.equal(
    getRecordCursorTop('record'),
    recordBefore,
    'the record scope handed back the identical snapshot — Object.is holds, so it does not re-render',
  );

  withdrawLines();
  assert.equal(
    getRecordCursorTop('record'),
    recordBefore,
    'and a withdraw in the other scope leaves it identical too',
  );

  withdrawTable();
});

test('a cursor whose scope disagrees with the publication is rejected, not seated', () => {
  // The echo is only a safety net if something reads it. Seating a 'record'
  // cursor in the 'sibling' slot is how a carton line header ends up reading
  // "3 of 47 cartons" instead of "2 of 5 lines".
  assert.throws(
    () =>
      publishRecordCursor({
        surfaceId: 'receiving-po-lines',
        scope: 'sibling',
        priority: RECORD_CURSOR_PRIORITY.rail,
        cursor: cursor({ scope: 'record', total: 47 }),
        open: noopOpen,
      }),
    /record.*sibling/s,
  );
  assert.equal(getRecordCursorTop('sibling'), null, 'nothing was seated');

  const withdraw = publishRecordCursor({
    surfaceId: 'receiving-po-lines',
    scope: 'sibling',
    priority: RECORD_CURSOR_PRIORITY.rail,
    cursor: cursor({ scope: 'sibling', position: 2, total: 5 }),
    open: noopOpen,
  });

  // An update cannot smuggle one in either.
  assert.throws(() =>
    updateRecordCursor({
      surfaceId: 'receiving-po-lines',
      scope: 'sibling',
      priority: RECORD_CURSOR_PRIORITY.rail,
      cursor: cursor({ scope: 'record', total: 47 }),
      open: noopOpen,
    }),
  );
  assert.equal(getRecordCursorTop('sibling')?.cursor.total, 5, 'the live cursor is untouched');

  withdraw();
});

test('a step whose revealFoldKey changed is not equal — the fold must still open', () => {
  // Same target id, but now it sits inside a collapsed fold. If the gate treated
  // this as unchanged, stepping would open the record while the grid kept the
  // fold shut and highlighted nothing.
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ next: { id: 4822, revealFoldKey: null } }),
    open: noopOpen,
  });
  assert.equal(notifications, 1);

  updateRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor({ next: { id: 4822, revealFoldKey: '2026-08-01::1234' } }),
    open: noopOpen,
  });

  assert.equal(notifications, 2);
  assert.equal(getRecordCursorTop('record')?.cursor.next?.revealFoldKey, '2026-08-01::1234');

  unsubscribe();
  withdraw();
});

test('a new open/close callback identity re-publishes — the panel must not call a dead closure', () => {
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
    close: () => {},
  });
  assert.equal(notifications, 1);

  const nextClose = () => {};
  updateRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
    close: nextClose,
  });
  assert.equal(notifications, 2);
  assert.equal(getRecordCursorTop('record')?.close, nextClose);

  unsubscribe();
  withdraw();
});

test('updating an id that holds no claim is a no-op, never a back-door publish', () => {
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });

  updateRecordCursor({
    surfaceId: 'never-published',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
  });

  assert.equal(notifications, 0);
  assert.equal(getRecordCursorTop('record'), null);

  unsubscribe();
});

test('the published open callback carries intent and revealFoldKey through untouched', () => {
  // Intent is what lets a step keep `scanMatchedRows` while a click clears it —
  // the fork that minted `receiving-highlight-line`, folded back into a field.
  const calls: Array<{ id: RecordId; intent: string; revealFoldKey: string | null }> = [];
  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: (id, ctx) => {
      calls.push({ id, intent: ctx.intent, revealFoldKey: ctx.revealFoldKey });
      return true;
    },
  });

  const top = getRecordCursorTop('record');
  assert.ok(top);
  top.open(4822, { intent: 'step', revealFoldKey: '2026-08-01::1234' });
  top.open('4830', { intent: 'click', revealFoldKey: null });

  assert.deepEqual(calls, [
    { id: 4822, intent: 'step', revealFoldKey: '2026-08-01::1234' },
    { id: '4830', intent: 'click', revealFoldKey: null },
  ]);

  withdraw();
});

test('a subscriber that unsubscribes stops hearing about publications', () => {
  let notifications = 0;
  const unsubscribe = subscribeRecordCursor(() => {
    notifications += 1;
  });
  unsubscribe();

  const withdraw = publishRecordCursor({
    surfaceId: 'orders-grid',
    scope: 'record',
    priority: RECORD_CURSOR_PRIORITY.grid,
    cursor: cursor(),
    open: noopOpen,
  });
  withdraw();

  assert.equal(notifications, 0);
});

test('the server snapshot is null — a cursor only exists once a client surface renders', () => {
  assert.equal(getServerRecordCursorTop(), null);
});
