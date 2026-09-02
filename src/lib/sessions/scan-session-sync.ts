/**
 * Pure scan-station park / resume / start planner.
 *
 * Switching Unbox → Pack parks Unbox and arms Pack. Switching back resumes the
 * parked Unbox row — it does not mint a new session. Leaving the floor parks
 * whatever is open. Duration lives in intervals, not here.
 */

import type { ScanSessionType, SessionStatus } from './types';

export type LiveScanSession = {
  id: number;
  scanType: ScanSessionType;
  status: Exclude<SessionStatus, 'ended'>;
  startedAt: string;
};

export type ScanSyncPlan =
  | { type: 'idle' }
  | { type: 'park-floor'; parkIds: number[]; currentId: number | null }
  | { type: 'hold'; sessionId: number; parkIds: number[] }
  | { type: 'resume'; sessionId: number; parkIds: number[] }
  | { type: 'start'; parkIds: number[] };

function openIds(live: readonly LiveScanSession[]): number[] {
  return live.filter((s) => s.status === 'open').map((s) => s.id);
}

function pickForType(
  live: readonly LiveScanSession[],
  scanType: ScanSessionType,
): LiveScanSession | null {
  const matches = live.filter((s) => s.scanType === scanType);
  if (matches.length === 0) return null;
  const open = matches.find((s) => s.status === 'open');
  if (open) return open;
  return [...matches].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null;
}

export function planScanSync(
  live: readonly LiveScanSession[],
  scanType: ScanSessionType | null,
): ScanSyncPlan {
  if (scanType == null) {
    const parkIds = openIds(live);
    if (parkIds.length === 0 && live.length === 0) return { type: 'idle' };
    const current =
      live.find((s) => s.status === 'open') ??
      [...live].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ??
      null;
    return { type: 'park-floor', parkIds, currentId: current?.id ?? null };
  }

  const keep = pickForType(live, scanType);
  const parkIds = openIds(live).filter((id) => id !== keep?.id);

  if (!keep) return { type: 'start', parkIds };
  if (keep.status === 'open') return { type: 'hold', sessionId: keep.id, parkIds };
  return { type: 'resume', sessionId: keep.id, parkIds };
}

/** Overlap of [started, ended) with [windowStart, windowEnd). `ended` null uses `now`. */
export function clipActiveMs(args: {
  startedAt: number;
  endedAt: number | null;
  windowStart: number;
  windowEnd: number;
  now: number;
}): number {
  const end = args.endedAt ?? args.now;
  const from = Math.max(args.startedAt, args.windowStart);
  const to = Math.min(end, args.windowEnd);
  return Math.max(0, to - from);
}

export function utcDayWindow(isoDate: string, now: Date): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 86_400_000);
    return { start, end };
  }
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

export function formatCompactDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
