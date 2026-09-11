/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: KioskDevicesWorkspace, KioskDevicesSection, unit/cohort tests.
 * Affected API: none (URL ?view= only). Data schemas: KioskDevicesPageView.
 * User instruction (verbatim): This display and UI and UX is terrible. You must
 * upgrade… multiple tabs… triage between the tabs… using the impeccable skill.
 */

/** URL query key — park the active peer so refresh / share keep the triage. */
export const KIOSK_DEVICES_VIEW_PARAM = 'view';

export type KioskDevicesPageView = 'devices' | 'history';

export const KIOSK_DEVICES_PAGE_VIEWS = ['devices', 'history'] as const;

export function parseKioskDevicesPageView(raw: string | null | undefined): KioskDevicesPageView {
  return raw === 'history' ? 'history' : 'devices';
}

/**
 * Settings › Devices hosts TWO PRODUCT_TABLES peers (fleet + history). Paint law:
 *
 * - One visible DataTable at a time.
 * - TabSwitch sits under the page title (left) — never stack both tables.
 * - URL `?view=devices|history` routes the peer (`devices` may omit the param).
 * - Enroll chrome mounts only on the fleet tab.
 * - History never gains Revoke (credential verb stays on kiosk-devices).
 * - Do not mount DeskPageChrome here — settings keeps the canvas title row.
 *
 * Impeccable: distill (one peer) + polish (TabSwitch pill + matched enroll
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
