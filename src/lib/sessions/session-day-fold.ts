/**
 * Staff × warehouse-day fold — Σ active interval ms only.
 * Pure: no DB. Routes clip SQL windows the same way.
 */

export function clipIntervalMs(
  startedAtMs: number,
  endedAtMs: number | null,
  windowStartMs: number,
  windowEndMs: number,
  nowMs: number,
): number {
  const end = endedAtMs ?? nowMs;
  const lo = Math.max(startedAtMs, windowStartMs);
  const hi = Math.min(end, windowEndMs);
  return Math.max(0, Math.floor(hi - lo));
}

/** Compact duration for a report cell — never a live clock. */
export function formatActiveDuration(activeMs: number): string | null {
  if (!Number.isFinite(activeMs) || activeMs <= 0) return null;
  if (activeMs < 60_000) return '<1m';
  const totalMin = Math.round(activeMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export type SessionDayStatus = 'armed' | 'open' | 'parked' | 'ended';

export const SESSION_DAY_STATUS_LABEL: Record<SessionDayStatus, string> = {
  armed: 'Armed',
  open: 'Open',
  parked: 'Parked',
  ended: 'Ended',
};

/** Duration plus MasterNav station names — the compound note line, never money. */
export function sessionDayNoteLine(
  activeMs: number,
  stationLabels: readonly string[],
): string | null {
  const duration = formatActiveDuration(activeMs);
  const labels = stationLabels.map((s) => s.trim()).filter(Boolean);
  const parts = [duration, ...labels].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function sessionDayStatus(args: {
  armed: boolean;
  hasOpen: boolean;
  hasParked: boolean;
}): SessionDayStatus {
  if (args.armed) return 'armed';
  if (args.hasOpen) return 'open';
  if (args.hasParked) return 'parked';
  return 'ended';
}
