import type { PomodoroReport, PomodoroReportEvent, PomodoroReportRow } from '@/lib/pomodoro/contract';
import { formatTime12hPST } from '@/utils/date';

export type TaskActivityRow = PomodoroReportRow;
type TaskActivityEvent = PomodoroReportEvent;
type TaskActivityReport = PomodoroReport;

export async function fetchTaskActivityReport(dateKey: string): Promise<TaskActivityReport> {
  const params = new URLSearchParams({ from: dateKey, to: dateKey });
  const response = await fetch(`/api/pomodoro/report?${params}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok || !payload || typeof payload !== 'object' || !('ok' in payload) || payload.ok !== true) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Could not load task activity (${response.status})`;
    throw new Error(message);
  }
  if (!('rows' in payload) || !Array.isArray(payload.rows) || !('events' in payload) || !Array.isArray(payload.events)
    || !('taskLifecycles' in payload) || !Array.isArray(payload.taskLifecycles)) {
    throw new Error('Invalid task activity report');
  }
  return payload as unknown as TaskActivityReport;
}

export function activityRowKey(row: Pick<TaskActivityRow, 'staffId' | 'kind' | 'id' | 'date' | 'checkDate'>): string {
  return `${row.date}:${row.staffId}:${row.kind}:${row.id}:${row.checkDate ?? ''}`;
}

export function eventsByActivityRow(events: readonly TaskActivityEvent[]): Map<string, TaskActivityEvent[]> {
  const grouped = new Map<string, TaskActivityEvent[]>();
  for (const event of events) {
    const key = activityRowKey(event);
    const found = grouped.get(key);
    if (found) found.push(event);
    else grouped.set(key, [event]);
  }
  for (const group of grouped.values()) group.sort((a, b) => a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId));
  return grouped;
}

/** Only measured session time is additive. Lifecycle wall-clock windows may overlap. */
export function activityStaffTotals(rows: readonly TaskActivityRow[]): Array<{
  staffId: number;
  staffName: string | null;
  records: number;
  measuredFocusSeconds: number;
}> {
  const totals = new Map<number, { staffId: number; staffName: string | null; records: number; measuredFocusSeconds: number }>();
  for (const row of rows) {
    const total = totals.get(row.staffId);
    if (total) {
      total.records += 1;
      total.measuredFocusSeconds += row.measuredFocusSeconds;
      if (!total.staffName && row.staffName) total.staffName = row.staffName;
    } else {
      totals.set(row.staffId, { staffId: row.staffId, staffName: row.staffName, records: 1, measuredFocusSeconds: row.measuredFocusSeconds });
    }
  }
  return [...totals.values()].sort((a, b) => a.staffId - b.staffId);
}

/** Keep the stable staff ID visible even when a directory name is available. */
export function activityStaffLabel(staffId: number, name: string | null | undefined): string {
  return name?.trim() ? `${name.trim()} · Staff #${staffId}` : `Staff #${staffId}`;
}

/** A duration, never a timestamp or an estimate. */
export function formatActivityDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours ? `${hours}h ${minutes}m ${remainder}s` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function formatActivityClock(at: string): string {
  return formatTime12hPST(at, { withSeconds: true });
}

/** Existing Daily record sheet supports task/check IDs, including peers with scope=everyone. */
export function activityDetailHref(row: TaskActivityRow): string {
  if (row.kind === 'task') return `/?task=${row.id}&scope=everyone`;
  return `/?check=${row.id}&date=${encodeURIComponent(row.checkDate || row.date)}`;
}
