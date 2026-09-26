/**
 * node --require ./scripts/register-server-only-shim.cjs --import tsx \ --test src/lib/realtime/kiosk-capability.test.ts
 * security boundary of a realtime channel — Ably grants exactly what the token
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capabilityLeaksOutsideOrg,
  deskKioskCapability,
  kioskClientId,
  kioskDeviceCapability,
  type AblyCapability,
} from './kiosk-capability';
import { getKioskBridgeChannelName } from './channels';

const ORG = '11111111-2222-4333-8444-555555555555';
const OTHER_ORG = '99999999-2222-4333-8444-555555555555';

describe('getKioskBridgeChannelName', () => {
  it('is org-namespaced and device-keyed', () => {
    assert.equal(getKioskBridgeChannelName(ORG, 7), `org:${ORG}:kiosk:7`);
  });

  it('throws on a non-uuid org, like every other builder in this file', () => {
    assert.throws(() => getKioskBridgeChannelName('not-an-org', 7), /non-uuid org/i);
    assert.throws(() => getKioskBridgeChannelName('', 7), /non-uuid org/i);
  });

  it('strips control characters that Ably would reject', () => {
    assert.equal(getKioskBridgeChannelName(ORG, '7\nx'), `org:${ORG}:kiosk:7x`);
  });
});

describe('kioskDeviceCapability — a tablet reaches its own bridge and nothing else', () => {
  it('grants exactly one channel', () => {
    const cap: AblyCapability = kioskDeviceCapability(ORG, 7);
    assert.deepEqual(Object.keys(cap), [`org:${ORG}:kiosk:7`]);
    assert.deepEqual(cap[`org:${ORG}:kiosk:7`], ['subscribe', 'publish']);
  });

  it('grants no org broadcast feed, no db row stream, no wildcard', () => {
    const keys = Object.keys(kioskDeviceCapability(ORG, 7));
    for (const key of keys) {
      assert.equal(key.includes('*'), false, 'an unattended tablet gets no wildcard');
    }
    assert.equal(keys.some((k) => k.endsWith(':orders:changes')), false);
    assert.equal(keys.some((k) => k.includes(':db:')), false);
    assert.equal(keys.some((k) => k.endsWith(':dashboard:operations')), false);
  });

  it('cannot reach another device’s bridge', () => {
    const cap = kioskDeviceCapability(ORG, 7);
    assert.equal(cap[`org:${ORG}:kiosk:8`], undefined);
  });
});

describe('deskKioskCapability — only the devices the desk actually holds', () => {
  it('grants one channel per claimed device', () => {
    const cap = deskKioskCapability(ORG, [3, 9]);
    assert.deepEqual(Object.keys(cap).sort(), [`org:${ORG}:kiosk:3`, `org:${ORG}:kiosk:9`].sort());
  });

  it('grants nothing when the desk holds no lease', () => {
    assert.deepEqual(deskKioskCapability(ORG, []), {});
  });

  it('never emits a wildcard, however many devices are held', () => {
    const cap = deskKioskCapability(ORG, [1, 2, 3, 4, 5]);
    for (const key of Object.keys(cap)) {
      assert.equal(key.includes('*'), false);
    }
  });
});

describe('capabilityLeaksOutsideOrg — the fail-closed backstop', () => {
  it('passes a well-formed grant', () => {
    assert.equal(capabilityLeaksOutsideOrg(ORG, kioskDeviceCapability(ORG, 7)), null);
  });

  it('names the offending resource when a grant reaches another tenant', () => {
    const leaked = {
      ...kioskDeviceCapability(ORG, 7),
      [getKioskBridgeChannelName(OTHER_ORG, 7)]: ['subscribe'],
    };
    assert.equal(capabilityLeaksOutsideOrg(ORG, leaked), `org:${OTHER_ORG}:kiosk:7`);
  });

  it('catches a bare, un-namespaced channel name', () => {
    assert.equal(capabilityLeaksOutsideOrg(ORG, { 'kiosk:7': ['publish'] }), 'kiosk:7');
  });

  it('is not fooled by an org id that is only a PREFIX of another', () => {
    // `org:{ORG}` must not match `org:{ORG}extra:…` — hence the trailing colon.
    const sneaky = { [`org:${ORG}extra:kiosk:7`]: ['publish'] };
    assert.equal(capabilityLeaksOutsideOrg(ORG, sneaky), `org:${ORG}extra:kiosk:7`);
  });
});

describe('kioskClientId', () => {
  it('stamps the device principal, never a staff id', () => {
    assert.equal(kioskClientId(ORG, 7), `org:${ORG}:kiosk:7`);
    assert.equal(kioskClientId(ORG.toUpperCase(), 7), `org:${ORG}:kiosk:7`);
  });
});
