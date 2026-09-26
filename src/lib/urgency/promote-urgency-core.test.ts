import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  promoteUrgencyCore,
  type UrgencyDeps,
  type UrgencyWriteArgs,
  type UrgencyWriteOutcome,
} from './promote-urgency-core';

/**
 * Capturing fakes — no database, no helpdesk. What is asserted is BOTH the
 * returned result and what got threaded into the injected deps, per
 * Dependency injection for testability.
 */
function fakes(outcome: UrgencyWriteOutcome = 'updated') {
  const calls: Array<{ method: keyof UrgencyDeps; args: UrgencyWriteArgs }> = [];
  const record =
    (method: keyof UrgencyDeps) =>
    async (args: UrgencyWriteArgs): Promise<UrgencyWriteOutcome> => {
      calls.push({ method, args });
      return outcome;
    };

  const deps: UrgencyDeps = {
    setOrderUrgency: record('setOrderUrgency'),
    setCartonUrgency: record('setCartonUrgency'),
    setTicketUrgency: record('setTicketUrgency'),
  };
  return { deps, calls };
}

test('each record kind routes to its own storage, and only its own', () => {
  const cases = [
    { entityType: 'order', method: 'setOrderUrgency' },
    { entityType: 'receiving', method: 'setCartonUrgency' },
    { entityType: 'support_ticket', method: 'setTicketUrgency' },
  ] as const;

  return Promise.all(
    cases.map(async ({ entityType, method }) => {
      const { deps, calls } = fakes();
      const result = await promoteUrgencyCore({ entityType, entityId: 42 }, deps);

      assert.equal(result.ok, true);
      assert.equal(calls.length, 1, `${entityType} must write exactly one storage`);
      assert.equal(calls[0].method, method);
      assert.deepEqual(calls[0].args, { entityId: 42, level: 'urgent' });
    }),
  );
});

test('urgent is the default intent', async () => {
  const { deps, calls } = fakes();
  await promoteUrgencyCore({ entityType: 'order', entityId: 7 }, deps);
  assert.equal(calls[0].args.level, 'urgent');
});

test('clearing threads through as normal', async () => {
  const { deps, calls } = fakes();
  const result = await promoteUrgencyCore(
    { entityType: 'order', entityId: 7, level: 'normal' },
    deps,
  );
  assert.equal(calls[0].args.level, 'normal');
  assert.deepEqual(result, {
    ok: true,
    entityType: 'order',
    entityId: 7,
    level: 'normal',
    changed: true,
  });
});

/**
 * The idempotency contract. `changed` is what a caller fans a notification out
 * on, so an already-urgent record must report false rather than throwing a
 * second "this is urgent now" at an operator who already saw the first.
 */
test('re-promoting an already-urgent record succeeds but reports changed:false', async () => {
  const { deps } = fakes('unchanged');
  const result = await promoteUrgencyCore({ entityType: 'receiving', entityId: 5 }, deps);
  assert.deepEqual(result, {
    ok: true,
    entityType: 'receiving',
    entityId: 5,
    level: 'urgent',
    changed: false,
  });
});

test('a missing record is a refusal, not a silent success', async () => {
  const { deps } = fakes('not_found');
  const result = await promoteUrgencyCore({ entityType: 'order', entityId: 999 }, deps);
  assert.deepEqual(result, { ok: false, reason: 'not_found' });
});

/** A receiving LINE never paired to a carton has no `receiving` row to carry `priority_tier`, so it is genuinely un-promotable today — a… */
test('an unsupported record kind refuses without touching any storage', async () => {
  for (const entityType of ['receiving_line', 'serial_unit', 'repair', 'carton', null, undefined]) {
    const { deps, calls } = fakes();
    const result = await promoteUrgencyCore({ entityType, entityId: 1 }, deps);
    assert.deepEqual(result, { ok: false, reason: 'unsupported_entity' });
    assert.equal(calls.length, 0, `${String(entityType)} must not reach a storage`);
  }
});

test('a bad id refuses before touching any storage', async () => {
  for (const entityId of [0, -1, 1.5, Number.NaN, 'abc', null, undefined, {}]) {
    const { deps, calls } = fakes();
    const result = await promoteUrgencyCore({ entityType: 'order', entityId }, deps);
    assert.deepEqual(
      result,
      { ok: false, reason: 'invalid_entity_id' },
      `${String(entityId)} must refuse`,
    );
    assert.equal(calls.length, 0, 'no WHERE id = NaN may reach the database');
  }
});

/**
 * Ids arrive from URL params and scan resolution as strings. Coercing here is
 * what keeps every call site from re-typing `Number(...)` — and from disagreeing
 * about whether "42abc" is 42.
 */
test('a numeric string id coerces; a partly-numeric one does not', async () => {
  const { deps, calls } = fakes();
  const ok = await promoteUrgencyCore({ entityType: 'order', entityId: '42' }, deps);
  assert.equal(ok.ok, true);
  assert.deepEqual(calls[0].args, { entityId: 42, level: 'urgent' });

  const bad = await promoteUrgencyCore({ entityType: 'order', entityId: '42abc' }, fakes().deps);
  assert.deepEqual(bad, { ok: false, reason: 'invalid_entity_id' });
});
