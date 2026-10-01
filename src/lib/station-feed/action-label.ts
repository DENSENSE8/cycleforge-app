import type { StationFeedItem } from './types';

/** Exact action copy. Job names stay categories, never node titles. */
export function stationHistoryActionLabel(item: StationFeedItem): string {
  const identifier = item.subject.identifier;
  const title = item.subject.title;
  if (item.job === 'arrival') {
    return identifier ? `Scanned arrival ${identifier}` : `Scanned arrival for ${title}`;
  }
  if (item.job === 'scan_out') {
    return identifier ? `Scanned out tracking ${identifier}` : `Scanned out ${title}`;
  }
  if (item.job === 'identify') {
    return identifier ? `Identified ${identifier}` : `Identified ${title}`;
  }
  return item.message;
}

/**
 * Stable task key. Subject identity wins; otherwise the source event stands alone.
 * Never groups by time or display text.
 */
export function stationHistoryTaskKey(item: StationFeedItem): string {
  if (item.subject.id) return `${item.job}:${item.subject.entityType}:${item.subject.id}`;
  return item.id;
}
