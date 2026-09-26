/** Gate preamble (Fact-Forcing): */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  KIOSK_DEVICES_PAGE_LAW,
  parseKioskDevicesPageView,
} from '@/lib/kiosk/kiosk-devices-page-law';

describe('kiosk devices page law — dual PRODUCT_TABLES peers', () => {
  it('parks history behind ?view=history; devices is the default', () => {
    assert.equal(parseKioskDevicesPageView(null), 'devices');
    assert.equal(parseKioskDevicesPageView('devices'), 'devices');
    assert.equal(parseKioskDevicesPageView('history'), 'history');
    assert.equal(parseKioskDevicesPageView('nope'), 'devices');
  });

  it('law names TabSwitch, one table, and enroll/revoke scope', () => {
    assert.match(KIOSK_DEVICES_PAGE_LAW.tabs, /TabSwitch/);
    assert.match(KIOSK_DEVICES_PAGE_LAW.oneTable, /Never stack/);
    assert.match(KIOSK_DEVICES_PAGE_LAW.enroll, /devices view/);
    assert.match(KIOSK_DEVICES_PAGE_LAW.revoke, /devices view/);
  });
});
