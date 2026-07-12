/**
 * enforceMaxConcurrentSessions — DB-free (mocked deps).
 *
 * Proves: unlimited (0) is a no-op; under/at the limit is a no-op; over the
 * limit revokes exactly the OLDEST sessions, keeping the newest `limit`.
 */

import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { enforceMaxConcurrentSessions, type ConcurrencyDeps, type ActiveSid } from '@/lib/auth/session-concurrency';

function fakeDeps(active: ActiveSid[]): { deps: ConcurrencyDeps; revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    deps: {
      async listActiveSids() { return active; },
      async revokeSids(sids) { revoked.push(...sids); },
    },
  };
}

const at = (ms: number): Date => new Date(ms);

test('limit 0 (unlimited) is a no-op', async () => {
  const { deps, revoked } = fakeDeps([{ sid: 'a', lastSeenAt: at(1) }, { sid: 'b', lastSeenAt: at(2) }]);
  deepStrictEqual(await enforceMaxConcurrentSessions(7, 0, deps), []);
  strictEqual(revoked.length, 0);
});

test('at or under the limit is a no-op', async () => {
  const { deps, revoked } = fakeDeps([{ sid: 'a', lastSeenAt: at(1) }, { sid: 'b', lastSeenAt: at(2) }]);
  deepStrictEqual(await enforceMaxConcurrentSessions(7, 2, deps), []);
  strictEqual(revoked.length, 0);
});

test('over the limit revokes the oldest, keeps the newest `limit`', async () => {
  // 4 sessions, limit 2 → keep the 2 newest (t=40, t=30), revoke the 2 oldest (t=10, t=20).
  const active: ActiveSid[] = [
    { sid: 'old1', lastSeenAt: at(10) },
    { sid: 'new2', lastSeenAt: at(40) },
    { sid: 'old2', lastSeenAt: at(20) },
    { sid: 'new1', lastSeenAt: at(30) },
  ];
  const { deps, revoked } = fakeDeps(active);
  const result = await enforceMaxConcurrentSessions(7, 2, deps);
  deepStrictEqual(result.sort(), ['old1', 'old2']);
  deepStrictEqual(revoked.sort(), ['old1', 'old2']);
});
