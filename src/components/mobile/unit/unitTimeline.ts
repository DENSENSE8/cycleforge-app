import type { SerialUnitEvent } from '@/lib/serial/use-serial-unit';

/** The unit timeline the phone shows — newest first, capped so the screen stays short. */
export function newestUnitEvents(events: readonly SerialUnitEvent[], cap = 25): SerialUnitEvent[] {
  return [...events].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).slice(0, cap);
}

/** `ALLOCATED` → `Allocated`, `QC_PASSED` → `Qc Passed`. */
export function unitEventLabel(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
