/**
 * Unit tests for kiosk fleet derived freshness (dwell + hardware_status).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveHardwareStatus,
  dwellSecondsFromLastSeen,
  formatDwellFace,
  withKioskDeviceDerived,
} from '@/lib/kiosk/kiosk-device-derived';

describe('kiosk-device-derived', () => {
  const now = Date.parse('2026-09-10T12:00:00.000Z');

  it('dwellSecondsFromLastSeen measures seconds since heartbeat', () => {
    assert.equal(
      dwellSecondsFromLastSeen('2026-09-10T11:59:00.000Z', now),
      60,
    );
    assert.equal(dwellSecondsFromLastSeen(null, now), null);
  });

  it('formatDwellFace uses compact units', () => {
    assert.equal(formatDwellFace(45), '45s');
    assert.equal(formatDwellFace(120), '2m');
    assert.equal(formatDwellFace(7200), '2h');
    assert.equal(formatDwellFace(8 * 86400), '8d');
    assert.equal(formatDwellFace(null), null);
  });

  it('deriveHardwareStatus follows fleet thresholds', () => {
    assert.equal(
      deriveHardwareStatus({
        status: 'active',
        dwellSeconds: 60,
        squareTerminalDeviceId: 'tmr_1',
      }),
      'ok',
    );
    assert.equal(
      deriveHardwareStatus({
        status: 'active',
        dwellSeconds: 20 * 60,
        squareTerminalDeviceId: 'tmr_1',
      }),
      'stale',
    );
    assert.equal(
      deriveHardwareStatus({
        status: 'active',
        dwellSeconds: 2 * 86400,
        squareTerminalDeviceId: 'tmr_1',
      }),
      'offline',
    );
    assert.equal(
      deriveHardwareStatus({
        status: 'active',
        dwellSeconds: 60,
        squareTerminalDeviceId: null,
      }),
      'no_reader',
    );
    assert.equal(
      deriveHardwareStatus({
        status: 'revoked',
        dwellSeconds: 60,
        squareTerminalDeviceId: 'tmr_1',
      }),
      'offline',
    );
  });

  it('withKioskDeviceDerived attaches both fields', () => {
    const out = withKioskDeviceDerived(
      {
        status: 'active' as const,
        lastSeenAt: '2026-09-10T11:59:00.000Z',
        squareTerminalDeviceId: null,
      },
      now,
    );
    assert.equal(out.dwellSeconds, 60);
    assert.equal(out.hardwareStatus, 'no_reader');
  });
});
