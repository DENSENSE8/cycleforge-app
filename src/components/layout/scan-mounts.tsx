'use client';

/** The two mount-only scan listeners both shells need. */

import { usePhoneScanBridge } from '@/hooks/usePhoneScanBridge';
import { useGlobalWedgeScanner } from '@/hooks/useGlobalWedgeScanner';
import { useCommandAliasHydration } from '@/hooks/useCommandAliasHydration';

export { StaffPrintBridgeMount } from '@/hooks/useStaffPrintBridgeHost';

/**
 * Subscribes to phone-originated scans on `phone:{staffId}` for the signed-in
 * user and echoes lookups back on `staffstation:{staffId}`. Runs on both desktop
 * and mobile so either side can service a scan from the other.
 */
export function PhoneScanBridgeMount() {
  usePhoneScanBridge();
  return null;
}

/**
 * Listens for HID wedge / Bluetooth ring-scanner keystrokes anywhere in the app.
 * URL-shaped scans navigate; bare codes fire a `wedge-scan` CustomEvent for
 * page-level handlers.
 */
export function GlobalWedgeScannerMount() {
  useGlobalWedgeScanner();
  // Aliases must be resolvable in the same tick a trigger is pulled, so they
  // hydrate here rather than being fetched on the scan path.
  useCommandAliasHydration();
  return null;
}
