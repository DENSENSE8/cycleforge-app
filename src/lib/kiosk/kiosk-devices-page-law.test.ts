/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: node:test only.
 * Affected API: none. Schemas: KioskDevicesPageView / KIOSK_DEVICES_PAGE_LAW.
 * User instruction: upgrade UI with tabs under title; add laws and routing.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  KIOSK_DEVICES_PAGE_LAW,
  parseKioskDevicesPageView,
} from '@/lib/kiosk/kiosk-devices-page-law';

const REPO = process.cwd();

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8');
}

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

  it('workspace mounts TabSwitch; section never stacks both DataTables', () => {
    const workspace = read(
      'src/components/settings/kiosk-devices/KioskDevicesWorkspace.tsx',
    );
    const section = read('src/components/settings/sections/KioskDevicesSection.tsx');
    assert.match(workspace, /TabSwitch/);
    assert.match(workspace, /solidTone="accent"/);
    assert.match(workspace, /KIOSK_DEVICES_VIEW_PARAM/);
    assert.match(section, /isFleet/);
    assert.match(section, /isFleet \?/);
    assert.match(section, /size="lg"/);
    assert.match(section, /className="h-11 shrink-0"/);
    assert.doesNotMatch(section, /border-t border-border-soft pt-5[\s\S]*historySheet/);
  });
});
