/**
 * Unit test for the lookup-po fetch-ladder resolver — DB/React-free.
 *
 * Run: `tsx --test src/lib/receiving/scan/resolvers/lookup-po.test.ts`
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveViaLookupPo } from './lookup-po';
import type { LookupPoData, LookupPoRequest } from '../types';

/** A lookupPo dep that returns queued responses and records call bodies. */
function harness(responses: LookupPoData[]) {
  const bodies: LookupPoRequest[] = [];
  let i = 0;
  return {
    deps: {
      lookupPo: async (body: LookupPoRequest) => {
        bodies.push(body);
        return responses[i++] ?? {};
      },
    },
    bodies,
  };
}

const input = (over: Partial<Parameters<typeof resolveViaLookupPo>[0]> = {}) => ({
  callValue: 'T1',
  callMode: 'tracking' as const,
  originalMode: 'tracking' as const,
  staffId: 1,
  ...over,
});

test('match → matched, localOnly:true, single call', async () => {
  const h = harness([{ success: true, matched: true, lines: [{}] }]);
  const res = await resolveViaLookupPo(input(), h.deps);
  assert.equal(res.kind, 'matched');
  assert.equal(h.bodies[0].localOnly, true);
  assert.equal(h.bodies.length, 1);
});

test('!success → throws', async () => {
  const h = harness([{ success: false, error: 'boom' }]);
  await assert.rejects(() => resolveViaLookupPo(input(), h.deps), /boom/);
});

test('zoho_not_connected → integration-error', async () => {
  const h = harness([{ success: true, integration_error: 'zoho_not_connected', po_ids: ['P1'] }]);
  const res = await resolveViaLookupPo(input(), h.deps);
  assert.equal(res.kind, 'integration-error');
});

test('tracking miss (carton created, no not_found) → unmatched, no Zoho escalation', async () => {
  const h = harness([{ success: true, matched: false, receiving_id: 5 }]);
  const res = await resolveViaLookupPo(input(), h.deps);
  assert.equal(res.kind, 'unmatched');
  assert.equal(h.bodies.length, 1);
});

test('order miss → not_found, never escalates to Zoho', async () => {
  const h = harness([{ success: true, not_found: true, zoho_pending: true }]);
  const res = await resolveViaLookupPo(input({ callMode: 'order', originalMode: 'order' }), h.deps);
  assert.equal(res.kind, 'not_found');
  assert.equal(h.bodies.length, 1);
  assert.equal(h.bodies[0].localOnly, true);
});

test('auto miss with zoho_pending → does NOT escalate to Zoho', async () => {
  const h = harness([{ success: true, matched: false, not_found: true, zoho_pending: true }]);
  const res = await resolveViaLookupPo(input({ callMode: 'auto', originalMode: 'auto' }), h.deps);
  assert.equal(res.kind, 'not_found');
  assert.equal(h.bodies.length, 1);
});

test('auto miss reported not_found (no carton) → not_found', async () => {
  const h = harness([{ success: true, matched: false, not_found: true }]);
  const res = await resolveViaLookupPo(input({ callMode: 'auto', originalMode: 'auto' }), h.deps);
  assert.equal(res.kind, 'not_found');
});

test('ticket miss → not_found, no Zoho escalation', async () => {
  const h = harness([{ success: true, not_found: true }]);
  const res = await resolveViaLookupPo(
    input({ callValue: '4821', callMode: 'ticket', originalMode: 'ticket' }),
    h.deps,
  );
  assert.equal(res.kind, 'not_found');
  assert.equal(h.bodies.length, 1);
});
