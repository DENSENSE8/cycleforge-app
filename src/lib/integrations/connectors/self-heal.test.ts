/**
 * Run: npx tsx --test src/lib/integrations/connectors/self-heal.test.ts
 *
 * DB-free: fakes() injects SelfHealDeps and captures collaborator calls.
 *
 * Contract under test: a connection latched to status='error' by a transient
 * provider failure comes back on its own, and a genuinely dead credential does
 * not (it must keep surfacing as "Needs attention").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  runConnectionSelfHeal,
  type LatchedConnection,
  type SelfHealDeps,
} from './self-heal';
import type { HealthResult } from './types';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function latched(provider: 'zoho' | 'ebay' | 'ably'): LatchedConnection {
  return {
    orgId: ORG,
    provider,
    scope: null,
    lastError: 'Zoho token refresh failed: 400 (Access Denied): too many requests',
  };
}

function fakes(rows: LatchedConnection[], health: Record<string, HealthResult>) {
  const calls = { validated: [] as string[], healed: [] as string[] };
  const deps: SelfHealDeps = {
    listLatched: async () => rows,
    validate: async (conn) => {
      calls.validated.push(conn.provider);
      return health[conn.provider] ?? { ok: false, error: 'unknown' };
    },
    heal: async (conn) => {
      calls.healed.push(conn.provider);
      return true;
    },
  };
  return { deps, calls };
}

test('a latched connection that validates clean is un-latched', async () => {
  const { deps, calls } = fakes([latched('zoho')], { zoho: { ok: true } });

  const res = await runConnectionSelfHeal({}, deps);

  assert.equal(res.scanned, 1);
  assert.equal(res.healed, 1);
  assert.equal(res.stillFailing, 0);
  assert.deepEqual(calls.healed, ['zoho']);
});

test('a dead credential stays latched and reports why', async () => {
  const { deps, calls } = fakes([latched('zoho')], {
    zoho: { ok: false, error: 'Zoho token refresh error: invalid_code' },
  });

  const res = await runConnectionSelfHeal({}, deps);

  assert.equal(res.healed, 0);
  assert.equal(res.stillFailing, 1);
  assert.deepEqual(calls.healed, []);
  assert.match(res.attempts[0]?.error ?? '', /invalid_code/);
});

test('a throwing validate degrades to still-failing, never to healed', async () => {
  const { deps, calls } = fakes([latched('zoho')], {});
  deps.validate = async () => {
    throw new Error('boom');
  };

  const res = await runConnectionSelfHeal({}, deps);

  assert.equal(res.healed, 0);
  assert.equal(res.stillFailing, 1);
  assert.deepEqual(calls.healed, []);
  assert.match(res.attempts[0]?.error ?? '', /boom/);
});

test('providers with no validate() are counted unverifiable, not healed', async () => {
  // 'ably' has no validate() in the registry, so the sweep cannot prove it
  // alive — clearing its latch would be a lie.
  const { deps, calls } = fakes([latched('ably')], { ably: { ok: true } });

  const res = await runConnectionSelfHeal({}, deps);

  assert.equal(res.unverifiable, 1);
  assert.equal(res.healed, 0);
  assert.deepEqual(calls.healed, []);
});
