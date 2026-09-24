import type { MobileUnitEvent } from './useMobileUnit';

/** The unit timeline the phone shows — newest first, capped so the screen stays short. */
export function newestUnitEvents(events: readonly MobileUnitEvent[], cap = 25): MobileUnitEvent[] {
  return [...events].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).slice(0, cap);
}

/** `ALLOCATED` → `Allocated`, `QC_PASSED` → `Qc Passed`. */
export function unitEventLabel(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
