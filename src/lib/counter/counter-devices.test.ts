/**
 *   npx tsx --test src/lib/counter/counter-devices.test.ts
 *
 * Phase 0 of `docs/todo/kiosk-counter-consult-PLAN.md`. Pure projection —
 * no DB. The picker must never offer an unpaired or revoked tablet, must
 * not call the current visit's own iPad "busy", and must sort free-and-awake
 * first so a staffer scanning the list hits the tablet in front of them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  COUNTER_DEVICE_ONLINE_WINDOW_MS,
  deviceAvailabilityCopy,
  projectCounterDevices,
  type CounterDevice,
  type CounterDeviceRow,
} from './counter-devices-model';
import { listCounterDevices, type CounterDeviceDeps } from './counter-devices';

const NOW = 1_700_000_000_000;
const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function row(overrides: Partial<CounterDeviceRow> & Pick<CounterDeviceRow, 'id' | 'label'>): CounterDeviceRow {
  return {
    status: 'active',
    lastSeenAtMs: NOW,
    ...overrides,
  };
}

function device(overrides: Partial<CounterDevice> & Pick<CounterDevice, 'id' | 'label'>): CounterDevice {
  return {
    online: true,
    lastSeenAtMs: NOW,
    heldByOtherVisit: false,
    ...overrides,
  };
}

describe('projectCounterDevices', () => {
  it('omits enrolled and revoked tablets — neither can hold a device cookie', () => {
    const projected = projectCounterDevices({
      nowMs: NOW,
      devices: [
        row({ id: 1, label: 'Paired', status: 'active' }),
        row({ id: 2, label: 'Never paired', status: 'enrolled' }),
        row({ id: 3, label: 'Revoked', status: 'revoked' }),
      ],
      bindings: [],
    });
    assert.deepEqual(
      projected.map((d) => d.id),
      [1],
    );
  });

  it('does not report this visit’s own tablet as held by another visit', () => {
    const projected = projectCounterDevices({
      nowMs: NOW,
      sessionId: 7,
      devices: [row({ id: 3, label: 'Front' })],
      bindings: [{ deviceId: 3, sessionId: 7 }],
    });
    assert.equal(projected[0]?.heldByOtherVisit, false);
  });

  it('flags a tablet bound to a different open visit', () => {
    const projected = projectCounterDevices({
      nowMs: NOW,
      sessionId: 7,
      devices: [row({ id: 3, label: 'Front' })],
      bindings: [{ deviceId: 3, sessionId: 99 }],
    });
    assert.equal(projected[0]?.heldByOtherVisit, true);
  });

  it('sorts free-and-awake first, then awake-but-taken, then asleep, each by label', () => {
    const projected = projectCounterDevices({
      nowMs: NOW,
      sessionId: 1,
      devices: [
        row({ id: 1, label: 'Zulu', lastSeenAtMs: NOW - COUNTER_DEVICE_ONLINE_WINDOW_MS - 1 }),
        row({ id: 2, label: 'Beta' }),
        row({ id: 3, label: 'Alpha' }),
        row({ id: 4, label: 'Taken' }),
      ],
      bindings: [{ deviceId: 4, sessionId: 99 }],
    });
    assert.deepEqual(
      projected.map((d) => d.label),
      ['Alpha', 'Beta', 'Taken', 'Zulu'],
    );
  });

  it('treats a tablet unheard inside the window as offline', () => {
    const projected = projectCounterDevices({
      nowMs: NOW,
      devices: [row({ id: 1, label: 'Back', lastSeenAtMs: NOW - COUNTER_DEVICE_ONLINE_WINDOW_MS - 1 })],
      bindings: [],
    });
    assert.equal(projected[0]?.online, false);
  });
});

describe('deviceAvailabilityCopy', () => {
  it('names a busy tablet in words a staffer can say out loud', () => {
    assert.equal(
      deviceAvailabilityCopy(device({ id: 1, label: 'Front', heldByOtherVisit: true }), NOW),
      'On another visit',
    );
  });

  it('says Ready when the tablet has spoken inside the window', () => {
    assert.equal(deviceAvailabilityCopy(device({ id: 1, label: 'Front' }), NOW), 'Ready');
  });

  it('says Never checked in when lastSeen is missing', () => {
    assert.equal(
      deviceAvailabilityCopy(device({ id: 1, label: 'Front', online: false, lastSeenAtMs: null }), NOW),
      'Never checked in',
    );
  });
});

describe('listCounterDevices', () => {
  it('threads sessionId into the projection so this visit’s tablet is not busy', async () => {
    const deps: CounterDeviceDeps = {
      async listDevices() {
        return [row({ id: 3, label: 'Front' })];
      },
      async listOpenBindings() {
        return [{ deviceId: 3, sessionId: 7 }];
      },
      now: () => NOW,
    };
    const devices = await listCounterDevices(ORG, 7, deps);
    assert.equal(devices[0]?.heldByOtherVisit, false);
    const others = await listCounterDevices(ORG, 8, deps);
    assert.equal(others[0]?.heldByOtherVisit, true);
  });
});
