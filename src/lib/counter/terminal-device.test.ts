/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/counter/terminal-device.test.ts
 *
 * SQ3. The resolution ORDER is the whole point: a lane that has been configured
 * with no stand must not inherit the deployment's, or a cash-only counter starts
 * prompting a card reader in another room.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  resolveTerminalDeviceId,
  type ResolveTerminalDeviceDeps,
} from './terminal-device';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const SESSION = 42;

function deps(lane: string | null, env = ''): ResolveTerminalDeviceDeps {
  return {
    async findLaneTerminalId() {
      return lane;
    },
    readEnvTerminalId: () => env,
  };
}

describe('resolveTerminalDeviceId', () => {
  it('prefers the lane’s own paired stand', async () => {
    const got = await resolveTerminalDeviceId(ORG, SESSION, undefined, deps('lane-reader', 'env-reader'));
    assert.deepEqual(got, { deviceId: 'lane-reader', source: 'lane' });
  });

  it('falls back to the deployment env only when the lane has none', async () => {
    const got = await resolveTerminalDeviceId(ORG, SESSION, undefined, deps(null, 'env-reader'));
    assert.deepEqual(got, { deviceId: 'env-reader', source: 'env' });
  });

  it('returns null when nothing is paired anywhere', async () => {
    // The caller then says "no Terminal is paired with this counter" instead of
    // prompting a reader somewhere else in the shop.
    assert.equal(await resolveTerminalDeviceId(ORG, SESSION, undefined, deps(null, '')), null);
  });

  it('lets staff standing at the counter name a reader — that outranks config', async () => {
    const got = await resolveTerminalDeviceId(ORG, SESSION, 'held-in-hand', deps('lane-reader', 'env-reader'));
    assert.deepEqual(got, { deviceId: 'held-in-hand', source: 'lane' });
  });

  it('ignores a blank override rather than treating it as "no stand"', async () => {
    for (const override of ['', '   ', null, undefined]) {
      const got = await resolveTerminalDeviceId(ORG, SESSION, override, deps('lane-reader'));
      assert.equal(got?.deviceId, 'lane-reader');
    }
  });

  it('reports WHICH source answered, so an audit can say which reader took the card', async () => {
    const lane = await resolveTerminalDeviceId(ORG, SESSION, undefined, deps('lane-reader'));
    const env = await resolveTerminalDeviceId(ORG, SESSION, undefined, deps(null, 'env-reader'));
    assert.equal(lane?.source, 'lane');
    assert.equal(env?.source, 'env');
  });
});
