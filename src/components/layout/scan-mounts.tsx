'use client';

/**
 * The two mount-only scan listeners both shells need.
 *
 * They were local components inside `ResponsiveLayout`. Now that the desk and
 * handheld frames are separate modules (so each tree ships only its own chunk —
 * see `MobileRouteShell`), they live here instead of being duplicated or
 * dragging one shell's import graph into the other's.
 */

import { usePhoneScanBridge } from '@/hooks/usePhoneScanBridge';
import { useGlobalWedgeScanner } from '@/hooks/useGlobalWedgeScanner';
import { useCommandAliasHydration } from '@/hooks/useCommandAliasHydration';

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
