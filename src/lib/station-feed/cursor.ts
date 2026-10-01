import { Buffer } from 'node:buffer';
import { stationFeedSourceRank, type StationFeedItem, type StationFeedSort } from './types';

export interface StationFeedCursor {
  occurredAt: string;
  sourceRank: 0 | 1 | 2;
  sourceId: number;
  sort: StationFeedSort;
}

function isCursor(value: unknown): value is StationFeedCursor {
  if (!value || typeof value !== 'object') return false;
  const cursor = value as Partial<StationFeedCursor>;
  return (
    typeof cursor.occurredAt === 'string'
    && Number.isFinite(Date.parse(cursor.occurredAt))
    && (cursor.sourceRank === 0 || cursor.sourceRank === 1 || cursor.sourceRank === 2)
    && Number.isSafeInteger(cursor.sourceId)
    && Number(cursor.sourceId) > 0
    && (cursor.sort === 'newest' || cursor.sort === 'oldest')
  );
}

export function encodeStationFeedCursor(item: StationFeedItem, sort: StationFeedSort): string {
  const cursor: StationFeedCursor = {
    occurredAt: item.occurredAt,
    sourceRank: stationFeedSourceRank(item.source),
    sourceId: item.sourceId,
    sort,
  };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeStationFeedCursor(raw: string | null | undefined): StationFeedCursor | null {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 500) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return isCursor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
