import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { clearsFieldAfter, runScanDockSubmit } from './submit';
import type { ScanDockHandlers, ScanDockHit } from './store';

const HIT: ScanDockHit = { label: '1Z999AA10123456784', status: 'Received' };

function fakes(over: Partial<ScanDockHandlers> = {}) {
  const calls = { submitted: [] as string[], filed: [] as Array<[string, string | null]> };
  const handlers: ScanDockHandlers = {
    onSubmit: (v) => calls.submitted.push(v),
    onInput: (v, t) => { calls.filed.push([v, t]); },
    ...over,
  };
  return { handlers, calls };
}

describe('runScanDockSubmit', () => {
  it('scan mode delegates straight to the surface — no lookup on the hot path', async () => {
    let lookups = 0;
    const { handlers, calls } = fakes({
      lookup: async () => { lookups += 1; return HIT; },
    });

    const out = await runScanDockSubmit({
      mode: 'scan', value: '1Z-ABC', scanType: 'unbox', handlers,
    });

    assert.deepEqual(out, { kind: 'delegated' });
    assert.deepEqual(calls.submitted, ['1Z-ABC']);
    assert.equal(lookups, 0, 'a trigger pull must not wait on a round trip the resolver is about to make');
  });

  it('search: found in system → the record and its status', async () => {
    const { handlers, calls } = fakes({ lookup: async () => HIT });

    const out = await runScanDockSubmit({
      mode: 'search', value: '1Z-ABC', scanType: 'unbox', handlers,
    });

    assert.deepEqual(out, { kind: 'hit', hit: HIT });
    assert.deepEqual(calls.submitted, [], 'search must not run the surface resolver');
    assert.deepEqual(calls.filed, [], 'search must never write');
  });

  it('search: not found → says so, and changes nothing', async () => {
    const { handlers, calls } = fakes({ lookup: async () => null });

    const out = await runScanDockSubmit({
      mode: 'search', value: 'NOPE', scanType: 'unbox', handlers,
    });

    assert.deepEqual(out, { kind: 'miss', value: 'NOPE' });
    assert.deepEqual(calls.filed, []);
    assert.deepEqual(calls.submitted, []);
  });

  it('input: found in system → shows the record, does NOT create a duplicate', async () => {
    const { handlers, calls } = fakes({ lookup: async () => HIT });

    const out = await runScanDockSubmit({
      mode: 'input', value: '1Z-ABC', scanType: 'unbox', handlers,
    });

    assert.deepEqual(out, { kind: 'hit', hit: HIT });
    assert.deepEqual(calls.filed, [], 'a hit is the answer — filing it again is how you get two cartons');
  });

  it('input: not found → files it under the active session type', async () => {
    const { handlers, calls } = fakes({ lookup: async () => null });

    const out = await runScanDockSubmit({
      mode: 'input', value: 'NEW-CARTON', scanType: 'unbox', handlers,
    });

    assert.deepEqual(out, { kind: 'filed', value: 'NEW-CARTON' });
    assert.deepEqual(calls.filed, [['NEW-CARTON', 'unbox']]);
  });

  it('a surface with no lookup falls back to its own resolver, in every mode', async () => {
    for (const mode of ['scan', 'search', 'input'] as const) {
      const { handlers, calls } = fakes();
      const out = await runScanDockSubmit({ mode, value: 'X', scanType: null, handlers });
      assert.deepEqual(out, { kind: 'delegated' }, `${mode} must not report a miss it cannot know about`);
      assert.deepEqual(calls.submitted, ['X']);
    }
  });

  it('input with no onInput degrades to search — a miss is reported, nothing is written', async () => {
    const { handlers, calls } = fakes({ lookup: async () => null, onInput: undefined });

    const out = await runScanDockSubmit({
      mode: 'input', value: 'X', scanType: 'testing', handlers,
    });

    assert.deepEqual(out, { kind: 'miss', value: 'X' });
    assert.deepEqual(calls.submitted, [], 'degrading must not silently run the WRITE path instead');
  });

  it('the field empties only when the value was consumed', () => {
    assert.equal(clearsFieldAfter({ kind: 'delegated' }), true);
    assert.equal(clearsFieldAfter({ kind: 'filed', value: 'x' }), true);
    // A hit and a miss both leave the value up, because the operator is still
    // looking at the answer to the question they typed.
    assert.equal(clearsFieldAfter({ kind: 'hit', hit: HIT }), false);
    assert.equal(clearsFieldAfter({ kind: 'miss', value: 'x' }), false);
  });
});
