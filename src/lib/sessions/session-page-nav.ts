/**
 * Map a work session onto MasterNav L1 ({@link APP_SIDEBAR_NAV}).
 *
 * Scan-out sessions are Scan out. Shipping desk / outbound scan type (no
 * scan-out surface) is Shipping. Unbox is `receive`; Packing is `packer`;
 * QC is `testing`. Receiving history is Inbound — there is no Receiving L1.
 */

import { getMasterNavItem, type SidebarNavItem } from '@/lib/sidebar-navigation';
import { isSurfaceKey, type SurfaceKey } from '@/lib/stations/surface-keys';
import { isScanSessionType, type ScanSessionType } from './types';

const SCAN_TYPE_PAGE: Record<ScanSessionType, string> = {
  unbox: 'receive',
  triage: 'triage',
  pickup: 'pickup',
  test: 'testing',
  pack: 'packer',
  outbound: 'outbound',
};

const SURFACE_PAGE: Record<SurfaceKey, string> = {
  unbox: 'receive',
  triage: 'triage',
  incoming: 'incoming',
  pickup: 'pickup',
  repair: 'repair',
  history: 'incoming',
  pack: 'packer',
  test: 'testing',
  outbound: 'outbound',
  support: 'support',
};

function pageIdForSession(surfaceKey: string | null | undefined, scanType: string | null | undefined): string | null {
  if (surfaceKey === 'scan-out') return 'scan-out';
  if (surfaceKey && isSurfaceKey(surfaceKey)) return SURFACE_PAGE[surfaceKey];
  if (isScanSessionType(scanType)) return SCAN_TYPE_PAGE[scanType];
  return null;
}

export function masterNavItemForSession(
  surfaceKey?: string | null,
  scanType?: string | null,
): SidebarNavItem | undefined {
  const id = pageIdForSession(surfaceKey, scanType);
  if (!id) return undefined;
  return getMasterNavItem(id);
}

export function sessionStationLabel(
  surfaceKey?: string | null,
  scanType?: string | null,
): string | null {
  return masterNavItemForSession(surfaceKey, scanType)?.label ?? null;
}
