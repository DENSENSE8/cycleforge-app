/**
 * Pure merge for Station Timeline unit journeys — one carton-scoped feed
 * instead of N {@link SerialJourneySection} embeds.
 *
 * Each serial's journey events go through {@link mergeJourney} (same adapters
 * as Operations History), then rows are namespaced, sorted newest-first, and
 * given a serial {@link TimelineRef} so {@link EventTimeline} renders the
 * shared {@link SerialChip} (last-4 via CopyChip SoT).
 */

import { mergeJourney, type JourneyEvent } from '@/lib/timeline/journey';
import { collapseTimeline } from '@/lib/timeline/collapse';
import type { TimelineItem } from '@/lib/timeline/types';

export type SerialJourneyBucket = {
  serial: string;
  events: JourneyEvent[];
};

/**
 * Flatten per-serial journey payloads into one Station-density timeline list.
 * Rows always carry `ref.kind === 'serial'` so the last-4 CopyChip is the unit
 * identity — never a full-serial section header.
 */
export function mergeStationUnitJourneys(buckets: SerialJourneyBucket[]): TimelineItem[] {
  const merged: TimelineItem[] = [];

  for (const { serial, events } of buckets) {
    const sn = serial.trim();
    if (!sn) continue;
    const { items } = mergeJourney(events);
    for (const item of items) {
      merged.push({
        ...item,
        id: `serial:${sn}:${item.id}`,
        ref:
          item.ref?.kind === 'serial' && item.ref.value.trim()
            ? item.ref
            : { kind: 'serial', value: sn },
      });
    }
  }

  merged.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });

  return collapseTimeline(merged);
}
