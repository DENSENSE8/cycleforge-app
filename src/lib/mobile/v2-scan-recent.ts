import type { StationTapeEntry, StationTone } from './station-tape';

/**
 * Platform-neutral row contract for scan history. Keep this flat: the same
 * fields map one-for-one to a SwiftUI `Identifiable` value type.
 */
export interface MobileV2ScanRecent {
  id: string;
  title: string;
  identifier: string | null;
  outcome: string;
  tone: StationTone;
  imageUrl: string | null;
  occurredAt: string;
  isLive: boolean;
  isLatest: boolean;
}

/** Project server/session tape entries into the canonical newest-first V2 list. */
export function projectMobileV2ScanRecents(
  entries: readonly StationTapeEntry[],
  untitledLabel: string,
): MobileV2ScanRecent[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    title: entry.title?.trim() || untitledLabel,
    identifier: entry.identifier?.trim() || entry.recordId?.trim() || null,
    outcome: entry.verb,
    tone: entry.tone,
    imageUrl: entry.imageUrl,
    occurredAt: entry.at,
    isLive: entry.live,
    isLatest: index === 0,
  }));
}
