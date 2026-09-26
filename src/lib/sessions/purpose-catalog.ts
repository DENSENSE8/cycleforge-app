/** System purpose seeds — DATA, not a vocabulary. */

import { SCAN_SESSION_TYPES, type SessionKind } from './types';

interface SystemPurposeSeed {
  readonly key: string;
  readonly label: string;
  readonly defaultKind: SessionKind;
  /** SURFACE_REGISTRY key, or null when this purpose has no bench. */
  readonly defaultSurfaceKey: string | null;
  readonly sortOrder: number;
}

/**
 * Starter catalog. Scan keys MUST match `SCAN_SESSION_TYPES` 1:1 so a system
 * Unbox start still lands `kind=scan`, `scan_type=unbox`, armed exclusive.
 * Task keys are org data; they never become a CHECK.
 */
export const SYSTEM_PURPOSES: readonly SystemPurposeSeed[] = [
  /* ── scan benches (L0) ─────────────────────────────────────────────── */
  { key: 'unbox', label: 'Unbox', defaultKind: 'scan', defaultSurfaceKey: 'unbox', sortOrder: 10 },
  { key: 'triage', label: 'Triage', defaultKind: 'scan', defaultSurfaceKey: 'triage', sortOrder: 20 },
  { key: 'pickup', label: 'Pickup', defaultKind: 'scan', defaultSurfaceKey: 'pickup', sortOrder: 30 },
  { key: 'test', label: 'Test', defaultKind: 'scan', defaultSurfaceKey: 'test', sortOrder: 40 },
  { key: 'pack', label: 'Pack', defaultKind: 'scan', defaultSurfaceKey: 'pack', sortOrder: 50 },
  { key: 'outbound', label: 'Outbound', defaultKind: 'scan', defaultSurfaceKey: 'outbound', sortOrder: 60 },
  /* ── task surfaces that already exist ──────────────────────────────── */
  { key: 'repair', label: 'Repair', defaultKind: 'task', defaultSurfaceKey: 'repair', sortOrder: 70 },
  { key: 'support', label: 'Support', defaultKind: 'task', defaultSurfaceKey: 'support', sortOrder: 80 },
  { key: 'incoming', label: 'Inbound', defaultKind: 'task', defaultSurfaceKey: 'incoming', sortOrder: 90 },
  /* ── indirect / counter / marketplace (no bench; Virtual Kiosk shape) */
  { key: 'front-desk', label: 'Front desk', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 100 },
  { key: 'kiosk', label: 'Kiosk', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 110 },
  { key: 'staff-assist', label: 'Staff assist', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 120 },
  { key: 'product-triage', label: 'Product triage', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 130 },
  { key: 'listing', label: 'Listing', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 140 },
  { key: 'exception', label: 'Exception', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 150 },
  { key: 'training', label: 'Training', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 160 },
  { key: 'kitting', label: 'Kitting', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 170 },
  { key: 'cleaning', label: 'Cleaning', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 180 },
  { key: 'inventory', label: 'Inventory', defaultKind: 'task', defaultSurfaceKey: null, sortOrder: 190 },
];

export const SYSTEM_PURPOSE_KEYS: readonly string[] = SYSTEM_PURPOSES.map((p) => p.key);

/** Scan system purposes — the ones that still compete for the wedge. */
export const SYSTEM_SCAN_PURPOSE_KEYS: readonly string[] = SYSTEM_PURPOSES.filter(
  (p) => p.defaultKind === 'scan',
).map((p) => p.key);

/**
 * Compiler-level twin of "seed scan purposes from SCAN_SESSION_TYPES": every
 * scan type has a system purpose, and no system scan purpose invents a type.
 */
const _scanKeysCovered: Record<(typeof SCAN_SESSION_TYPES)[number], true> = {
  unbox: true,
  triage: true,
  pickup: true,
  test: true,
  pack: true,
  outbound: true,
};
void _scanKeysCovered;
