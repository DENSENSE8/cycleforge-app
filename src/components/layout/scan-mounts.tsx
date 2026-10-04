'use client';

/** The two mount-only scan listeners both shells need. */

import { usePhoneScanBridge } from '@/hooks/usePhoneScanBridge';
import { useGlobalWedgeScanner } from '@/hooks/useGlobalWedgeScanner';

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
 * page-level handlers. The alias book is hydrated by the desk shell and station
 * composers; elsewhere the first unknown `CMD-*` scan loads it.
 */
export function GlobalWedgeScannerMount() {
  useGlobalWedgeScanner();
  return null;
}
