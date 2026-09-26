/** Device → mode resolution for `ModeRegion` (owner 2026-09-26, BRIEF §12: industrial on phones, triage on desktop). */
import type { ModeName } from '@/design-system/modes/registry';
import { isMobileFirstPath } from '@/lib/mobile/mobile-first-surface';

export type ModeDevice = 'desktop' | 'phone';

/** `/m/*` or a coarse (touch) pointer is the phone; everything else is the desk. */
export function modeDeviceOf(pathname: string | null | undefined, coarsePointer: boolean): ModeDevice {
  return coarsePointer || isMobileFirstPath(pathname) ? 'phone' : 'desktop';
}

/**
 * The mode a region paints. `triage` is the desktop system and collapses to
 * `industrial` on a phone. An explicit `industrial` is never lifted: on a phone
 * it is the floor, on a desk it is Mode C — a hardware mirror of a live phone,
 * rendered 1:1. `counter` / `assistant` keep their own identity everywhere.
 */
export function resolveRegionMode(requested: ModeName, device: ModeDevice): ModeName {
  return requested === 'triage' && device === 'phone' ? 'industrial' : requested;
}
