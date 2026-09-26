/** Gate preamble (Fact-Forcing): */

/** URL query key — park the active peer so refresh / share keep the triage. */
export const KIOSK_DEVICES_VIEW_PARAM = 'view';

export type KioskDevicesPageView = 'devices' | 'history';

export const KIOSK_DEVICES_PAGE_VIEWS = ['devices', 'history'] as const;

export function parseKioskDevicesPageView(raw: string | null | undefined): KioskDevicesPageView {
  return raw === 'history' ? 'history' : 'devices';
}

/**
 * Settings › Devices hosts TWO PRODUCT_TABLES peers (fleet + history).
 * row heights). Operator 2026-09-11.
 */
export const KIOSK_DEVICES_PAGE_LAW = {
  tabs: 'TabSwitch under title; fit hug; solidTone accent — Apple pill slider only',
  routing: '?view=devices|history parks the active PRODUCT_TABLES peer',
  oneTable: 'Never stack kiosk-devices and kiosk-slot-events DataTables',
  enroll: 'Enroll card only on devices view; TextField + Generate code share h-11 + surface radius',
  revoke: 'Revoke only on devices view / fleet trailing face',
  scope: 'Settings › Devices dual-peer surface — not DeskPageChrome',
} as const;
