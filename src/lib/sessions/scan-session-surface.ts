/**
 * Pathname → scan session type. Client-safe (no db).
 *
 * Floor benches start/resume a scan session. Desks, Home, Repair, Incoming
 * park. Repair is a task purpose, not SCAN_SESSION_TYPES — silent recording
 * in this slice is scan-station only.
 */

import { isScanSessionType, type ScanSessionType } from './types';

export type ScanSurfaceBinding = {
  scanType: ScanSessionType;
  surfaceKey: string;
};

function firstSegment(pathname: string): string {
  const path = pathname.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  return parts[0] ?? '';
}

function receivingMode(
  pathname: string,
  search: Pick<URLSearchParams, 'get'> | null | undefined,
): string | null {
  const path = pathname.split('?')[0] ?? '';
  if (path === '/receiving' || path === '/receiving/') {
    return search?.get('mode') ?? 'receive';
  }
  if (path.startsWith('/receiving/history')) return 'history';
  return null;
}

/**
 * Which scan session this location should arm, or `null` to park the floor.
 */
export function scanSurfaceForLocation(
  pathname: string | null,
  search?: Pick<URLSearchParams, 'get'> | null,
): ScanSurfaceBinding | null {
  if (!pathname) return null;
  const path = pathname.split('?')[0] ?? '';
  const head = firstSegment(pathname);

  if (path === '/unbox' || path.startsWith('/unbox/')) {
    return { scanType: 'unbox', surfaceKey: 'unbox' };
  }
  if (path === '/triage' || path.startsWith('/triage/')) {
    return { scanType: 'triage', surfaceKey: 'triage' };
  }
  if (path === '/pickup' || path.startsWith('/pickup/')) {
    return { scanType: 'pickup', surfaceKey: 'pickup' };
  }
  if (path === '/pack' || path.startsWith('/pack/') || path === '/packer' || path.startsWith('/packer/')) {
    return { scanType: 'pack', surfaceKey: 'pack' };
  }
  if (path === '/test' || path.startsWith('/test/') || path === '/tech' || path.startsWith('/tech/')) {
    return { scanType: 'test', surfaceKey: 'test' };
  }
  if (
    path === '/shipping' ||
    path.startsWith('/shipping/') ||
    path === '/outbound' ||
    path.startsWith('/outbound/')
  ) {
    return { scanType: 'outbound', surfaceKey: 'outbound' };
  }

  const mode = receivingMode(path, search);
  if (mode === 'receive' || mode === 'unbox') return { scanType: 'unbox', surfaceKey: 'unbox' };
  if (mode === 'triage') return { scanType: 'triage', surfaceKey: 'triage' };
  if (mode === 'pickup') return { scanType: 'pickup', surfaceKey: 'pickup' };

  if (head === 'repair' || mode === 'repair' || mode === 'incoming' || mode === 'history') {
    return null;
  }

  return null;
}

export function isScanSurfaceBinding(value: unknown): value is ScanSurfaceBinding {
  if (!value || typeof value !== 'object') return false;
  const v = value as ScanSurfaceBinding;
  return isScanSessionType(v.scanType) && typeof v.surfaceKey === 'string';
}
